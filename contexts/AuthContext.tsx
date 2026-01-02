'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { showGlobalToast } from '../components/Toast'
import { WelcomeService } from '../lib/welcomeService'
import { Capacitor } from '@capacitor/core'

export type SubscriptionType = 'free' | 'pro' | 'signals'

export interface UserProfile {
  id: string
  email: string
  name?: string
  subscription_type: SubscriptionType
  role: 'homeowner' | 'contractor'
  created_at: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  additional_zip_codes?: string[]
  emergency_contact?: string
  emergency_phone?: string
  avatar_url?: string
  kyc_verified?: boolean
  first_job_completed?: boolean
  notification_preferences?: {
    email: boolean
    sms: boolean
    push: boolean
  }
}

interface AuthContextType {
  user: User | null
  userProfile: UserProfile | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string; success?: boolean }>
  signUp: (email: string, password: string, name: string, role: 'homeowner' | 'contractor') => Promise<{ error?: string; success?: boolean; needsConfirmation?: boolean; message?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        // Only log actual errors, not "no rows" scenarios
        if (error.code !== 'PGRST116') {
          console.error('[AuthContext] Error fetching user profile:', error)
        }
        setUserProfile(null)
        return
      }

      if (data) {
        // Set profile for homeowners OR admins (admins might not have role set)
        setUserProfile(data)
        console.log('[AuthContext] Profile loaded successfully, role:', data.role)
      }
    } catch (err) {
      console.error('[AuthContext] Failed to fetch user profile:', err)
      setUserProfile(null)
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.id)
    }
  }


  useEffect(() => {
    let mounted = true

    // VERCEL FIX: Timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('[AuthContext] Loading timeout - forcing loading to false')
        setLoading(false)
      }
    }, 5000) // 5 second timeout

    const initializeAuth = async () => {
      try {
        // Get current session
        const { data: { session }, error } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) {
          console.error('Error getting session:', {
            message: error.message,
            status: error.status
          })
          clearTimeout(loadingTimeout)
          setLoading(false)
          return
        }

        // Set initial auth state
        setSession(session)
        setUser(session?.user ?? null)

        // Fetch profile if user exists
        if (session?.user) {
          await fetchUserProfile(session.user.id)
        }

        clearTimeout(loadingTimeout)
        setLoading(false)
      } catch (err) {
        console.error('Auth initialization error:', err)
        if (mounted) {
          clearTimeout(loadingTimeout)
          setLoading(false)
        }
      }
    }

    // Initialize auth state
    initializeAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[HOMEOWNER-AUTH] Event:', event, 'User:', session?.user?.id?.substring(0, 8))

        // Handle SIGNED_OUT event immediately
        if (event === 'SIGNED_OUT') {
          setSession(null)
          setUser(null)
          setUserProfile(null)
          setLoading(false)
          return
        }

        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          // Fetch profile and check if it's a homeowner
          const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()

          // Only update state if component is still mounted
          if (mounted) {
            if (!profileError && profile) {
              // Only set profile if user is a homeowner
              if (profile.role === 'homeowner') {
                setUserProfile(profile)
                console.log('[AuthContext] Homeowner profile loaded')
              } else {
                // This is a contractor, don't set homeowner profile
                setUserProfile(null)
                console.log('[AuthContext] Contractor detected, skipping homeowner profile')
              }
            } else {
              setUserProfile(null)
            }
          }
        } else {
          if (mounted) {
            setUserProfile(null)
          }
        }

        // CRITICAL: Always clear loading, even if unmounted - prevents stuck loading state
        setLoading(false)
      }
    )

    return () => {
      mounted = false
      clearTimeout(loadingTimeout)
      supabase.removeChannel(subscription)
    }
  }, [router])

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        return { error: error.message }
      }

      // Check if this user is a contractor - homeowner login should reject contractors
      if (data.user) {
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', data.user.id)
          .single()

        if (!profileError && profile && profile.role === 'contractor') {
          // Sign out the contractor immediately
          await supabase.auth.signOut()
          return {
            error: 'This is a contractor account. Please use the contractor login at /pro/sign-in instead.'
          }
        }
      }

      showGlobalToast('Signed in successfully!', 'success')
      return { success: true }
    } catch (err: any) {
      return { error: err?.message || 'Sign in failed' }
    }
  }

  const signUp = async (email: string, password: string, name: string, role: 'homeowner' | 'contractor') => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role
          }
        }
      })

      if (error) {
        return { error: error.message }
      }

      // Create homeowner profile immediately (contractors handled by ProAuthContext)
      if (data.user && role === 'homeowner') {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            id: data.user.id,
            email: data.user.email!,
            name,
            role: 'homeowner',
            subscription_type: 'free',
            created_at: new Date().toISOString()
          })

        if (profileError) {
          console.error('Error creating homeowner profile:', profileError)
        }

        // Send welcome email via API (non-blocking - don't fail signup if email fails)
        fetch('/api/send-welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: data.user.email!,
            name,
            type: 'homeowner'
          })
        }).catch(emailError => {
          console.error('Failed to send welcome email:', emailError)
          // Don't fail signup if email fails
        })
      }

      // Check if running on iOS native app
      const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

      // On iOS: Skip email confirmation - user is logged in immediately
      // On Web: Still require email confirmation for security
      if (data.user && !data.user.email_confirmed_at && !isNative) {
        return {
          success: true,
          needsConfirmation: true,
          message: "Please check your email and click the confirmation link to complete your registration."
        }
      }

      // iOS native: User is already logged in after signUp, set state immediately
      if (isNative && data.user && data.session) {
        setUser(data.user)
        setSession(data.session)
        if (role === 'homeowner') {
          // Wait a moment for the profile to be created in the database
          await new Promise(resolve => setTimeout(resolve, 500))
          await fetchUserProfile(data.user.id)

          // If profile still doesn't have name, set it directly
          // This handles race condition where profile was fetched before insert completed
          if (!userProfile?.name) {
            setUserProfile({
              id: data.user.id,
              email: data.user.email!,
              name,
              role: 'homeowner',
              subscription_type: 'free',
              created_at: new Date().toISOString()
            })
          }
        }
      }

      showGlobalToast('Account created successfully!', 'success')
      return { success: true }
    } catch (err: any) {
      return { error: err?.message || 'Registration failed' }
    }
  }

  const signOut = async () => {
    console.log('[HOMEOWNER-AUTH] Signing out user')

    try {
      // 1. Reset in-memory state FIRST (prevent UI flicker)
      setUser(null)
      setUserProfile(null)
      setSession(null)

      // 2. Sign out from Supabase (clears auth tokens only)
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('[HOMEOWNER-AUTH] Supabase signOut error:', error.message)
        showGlobalToast('Logout failed. Please try again.', 'error')
        return
      }

      // 3. Supabase.auth.signOut() already clears session from localStorage
      // No need to manually clear - it handles it automatically

      // 4. Toast feedback
      showGlobalToast('You have been logged out successfully.', 'success')

      // 5. Redirect cleanly using Next.js router
      router.push('/')
    } catch (err) {
      console.error('[HOMEOWNER-AUTH] Fatal logout error:', err)
      showGlobalToast('Logout failed. Please try again.', 'error')
    }
  }

  const value = {
    user,
    userProfile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}