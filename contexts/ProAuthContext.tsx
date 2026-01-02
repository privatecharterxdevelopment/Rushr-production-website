'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'

export interface ContractorProfile {
  id: string
  email: string
  name?: string
  business_name?: string
  phone?: string
  license_number?: string
  license_state?: string
  insurance_carrier?: string
  status: 'pending' | 'approved' | 'rejected'
  kyc_status: 'not_started' | 'in_progress' | 'completed' | 'failed'
  subscription_type: 'free' | 'pro'
  service_area_zips?: string[]
  base_zip?: string
  service_radius_miles?: number
  created_at: string
  profile_approved_at?: string
  kyc_completed_at?: string
}

interface ProAuthContextType {
  user: User | null
  contractorProfile: ContractorProfile | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string; success?: boolean }>
  signUp: (email: string, password: string, contractorData: ContractorSignupData) => Promise<{ error?: string; success?: boolean; needsKYC?: boolean }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateKYCStatus: (status: ContractorProfile['kyc_status']) => Promise<void>
  isProUser: boolean
  requiresKYC: boolean
}

interface ContractorSignupData {
  name: string
  businessName: string
  phone: string
  licenseNumber: string
  licenseState: string
  insuranceCarrier: string
  categories: string[]
  baseZip: string
}

const ProAuthContext = createContext<ProAuthContextType | undefined>(undefined)

export function ProAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [contractorProfile, setContractorProfile] = useState<ContractorProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchContractorProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('pro_contractors')
        .select('*')
        .eq('id', userId)
        .maybeSingle() // Use maybeSingle instead of single to avoid PGRST116 error

      if (error) {
        if (typeof window !== 'undefined') {
          console.error('Error fetching contractor profile:', error)
        }

        // Handle specific error cases
        if (error.code === 'PGRST116') {
          // Profile doesn't exist - user needs to complete contractor signup
          console.log('No contractor profile found - user needs to complete signup')
          setContractorProfile(null)
          return null
        } else if (error.code === 'PGRST301' || error.code === 'PGRST204') {
          // Permission denied or no rows returned due to RLS - user needs to complete signup
          console.log('No contractor profile found - user needs to complete signup')
          setContractorProfile(null)
          return null
        } else if (error.code === '42P01') {
          // Table doesn't exist
          if (typeof window !== 'undefined') {
            console.error('SETUP ERROR: pro_contractors table does not exist. Please run the Pro database setup SQL.')
          }
          setContractorProfile(null)
          return null
        } else if (error.code === 'PGRST301') {
          // Permission denied or RLS policy issue
          if (typeof window !== 'undefined') {
            console.error('Permission denied accessing pro_contractors table. Check RLS policies.')
          }
          setContractorProfile(null)
          return null
        }

        // For other errors, still return null but log details
        if (typeof window !== 'undefined') {
          console.error('Database error details:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          })
        }
        setContractorProfile(null)
        return null
      }

      // Handle the case where no data is returned (no contractor profile exists)
      if (!data) {
        console.log('No contractor profile found - user needs to complete signup')
        setContractorProfile(null)
        return null
      }

      // Map database fields to ContractorProfile interface
      const mappedProfile: ContractorProfile = {
        id: data.id, // Primary key is just id
        email: data.email,
        name: data.name,
        business_name: data.business_name,
        phone: data.phone,
        license_number: data.license_number,
        license_state: data.license_state,
        insurance_carrier: data.insurance_carrier,
        status: data.status || 'pending', // Default status
        kyc_status: data.kyc_status || 'not_started', // Default KYC status
        subscription_type: 'pro', // All contractors are pro users
        created_at: data.created_at,
        profile_approved_at: data.profile_approved_at,
        kyc_completed_at: data.kyc_completed_at
      }

      setContractorProfile(mappedProfile)
      return mappedProfile
    } catch (err) {
      if (typeof window !== 'undefined') {
        console.error('Failed to fetch contractor profile:', err)
      }
      setContractorProfile(null)
      return null
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchContractorProfile(user.id)
    }
  }

  const updateKYCStatus = async (status: ContractorProfile['kyc_status']) => {
    if (!user) return

    try {
      const updateData: any = { kyc_status: status }
      if (status === 'completed') {
        updateData.kyc_completed_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('pro_contractors')
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single()

      if (error) {
        if (typeof window !== 'undefined') {
          console.error('Error updating KYC status:', error)
        }
      } else if (data) {
        setContractorProfile(data)
      }
    } catch (err) {
      if (typeof window !== 'undefined') {
        console.error('Failed to update KYC status:', err)
      }
    }
  }


  useEffect(() => {
    let mounted = true

    // Safety timeout: force loading to false after 3 seconds to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (mounted) {
        console.log('[PRO-AUTH] Loading timeout - forcing loading to false')
        setLoading(false)
      }
    }, 3000)

    // Get initial session state
    const getInitialSession = async () => {
      try {
        setLoading(true)
        const { data: { session }, error } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) {
          console.error('Error getting session:', error)
          setSession(null)
          setUser(null)
          setContractorProfile(null)
          return
        }

        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user && session.user.user_metadata?.role === 'contractor') {
          await fetchContractorProfile(session.user.id)
        } else {
          setContractorProfile(null)
        }
      } catch (err) {
        console.error('Failed to get initial session:', err)
        if (mounted) {
          setSession(null)
          setUser(null)
          setContractorProfile(null)
        }
      } finally {
        clearTimeout(loadingTimeout)
        // CRITICAL: Always clear loading, even if unmounted
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          console.log('[PRO-AUTH] Event:', event, 'User:', session?.user?.id?.substring(0, 8))

          // Handle SIGNED_OUT immediately
          if (event === 'SIGNED_OUT') {
            setSession(null)
            setUser(null)
            setContractorProfile(null)
            setLoading(false)
            return
          }

          setSession(session)
          setUser(session?.user ?? null)

          if (session?.user) {
            // Check if this user is actually a contractor by checking pro_contractors table
            const { data: profile, error: profileError } = await supabase
              .from('pro_contractors')
              .select('*')
              .eq('id', session.user.id)
              .single()

            // Only update state if component is still mounted
            if (mounted) {
              if (!profileError && profile) {
                // This is a contractor
                setContractorProfile(profile)
                console.log('[PRO-AUTH] Contractor profile loaded')
              } else {
                // Not a contractor, don't set profile
                setContractorProfile(null)
                console.log('[PRO-AUTH] Not a contractor, skipping profile')
              }
            }
          } else {
            if (mounted) {
              setContractorProfile(null)
            }
          }
        } catch (err) {
          console.error('[PRO-AUTH] Error:', err)
          if (mounted) {
            setContractorProfile(null)
          }
        } finally {
          // CRITICAL: Always clear loading, even if unmounted - prevents stuck loading state
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      supabase.removeChannel(subscription)
    }
  }, [])

  // Real-time subscription for contractor profile updates
  useEffect(() => {
    if (!user?.id) return

    console.log('[PRO-AUTH] Setting up real-time subscription for contractor profile')

    // Subscribe to changes in pro_contractors table for this specific contractor
    const contractorSubscription = supabase
      .channel(`contractor-profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pro_contractors',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[PRO-AUTH] Contractor profile updated:', payload)

          // Update the contractor profile immediately with the new data
          if (payload.new) {
            const mappedProfile: ContractorProfile = {
              id: payload.new.id,
              email: payload.new.email,
              name: payload.new.name,
              business_name: payload.new.business_name,
              phone: payload.new.phone,
              license_number: payload.new.license_number,
              license_state: payload.new.license_state,
              insurance_carrier: payload.new.insurance_carrier,
              status: payload.new.status || 'pending',
              kyc_status: payload.new.kyc_status || 'not_started',
              subscription_type: 'pro',
              created_at: payload.new.created_at,
              profile_approved_at: payload.new.profile_approved_at,
              kyc_completed_at: payload.new.kyc_completed_at
            }

            setContractorProfile(mappedProfile)
            console.log('[PRO-AUTH] Contractor profile updated to:', mappedProfile.status)
          }
        }
      )
      .subscribe()

    return () => {
      console.log('[PRO-AUTH] Cleaning up contractor profile subscription')
      supabase.removeChannel(contractorSubscription)
    }
  }, [user?.id])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return { error: error.message }
    }

    // Profile fetching and routing will be handled by auth state change listener
    return { success: true }
  }

  const signUp = async (email: string, password: string, contractorData: ContractorSignupData) => {
    // First, create the auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: contractorData.name,
          role: 'contractor'
        },
        // DISABLE email confirmation for development
        emailRedirectTo: undefined
      }
    })

    if (authError) {
      return { error: authError.message }
    }

    if (authData.user) {
      console.log('[SIGNUP] Creating contractor profile for user:', authData.user.id)

      // Create contractor profile - use minimal fields to avoid ambiguous column errors
      const { error: profileError } = await supabase
        .from('pro_contractors')
        .insert([{
          id: authData.user.id,
          email: email,
          name: contractorData.name,
          business_name: contractorData.businessName,
          phone: contractorData.phone || '',
          license_number: contractorData.licenseNumber || 'pending',
          license_state: contractorData.licenseState || 'pending',
          insurance_carrier: contractorData.insuranceCarrier || 'pending',
          categories: contractorData.categories || ['General'],
          base_zip: contractorData.baseZip || '00000',
          status: 'pending',
          kyc_status: 'not_started'
        }])

      if (profileError) {
        console.error('[SIGNUP] Error creating contractor profile:', profileError)
        console.error('[SIGNUP] Full error details:', JSON.stringify(profileError, null, 2))
        return { error: `Database error: ${profileError.message}. Check if pro_contractors table has triggers or policies causing conflicts.` }
      }

      console.log('[SIGNUP] Contractor profile created successfully')

      // Auto-approve for now and require KYC
      const { error: approveError } = await supabase
        .from('pro_contractors')
        .update({
          status: 'approved',
          profile_approved_at: new Date().toISOString()
        })
        .eq('id', authData.user.id)

      if (approveError) {
        console.error('[SIGNUP] Error approving contractor:', approveError)
      } else {
        console.log('[SIGNUP] Contractor auto-approved')
      }

      // Fetch the created profile to set it in context
      await fetchContractorProfile(authData.user.id)

      // Send welcome email via API (non-blocking - don't fail signup if email fails)
      try {
        await fetch('/api/send-welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            name: contractorData.name,
            businessName: contractorData.businessName,
            type: 'contractor'
          })
        })
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError)
        // Don't fail signup if email fails
      }

      // Check if running on iOS native app
      const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

      // iOS native: User is already logged in after signUp, set state immediately
      if (isNative && authData.user && authData.session) {
        setUser(authData.user)
        setSession(authData.session)
      }

      console.log('[SIGNUP] Signup complete, redirecting to dashboard')

      return {
        success: true,
        needsKYC: false, // Changed to false so they can access dashboard immediately
        message: "Account created successfully! Redirecting to your dashboard..."
      }
    }

    return { error: 'Failed to create account' }
  }

  const signOut = async () => {
    console.log('[PRO-AUTH] Signing out contractor')

    try {
      // 1️⃣ Reset React state FIRST (prevent UI flicker)
      setUser(null)
      setContractorProfile(null)
      setSession(null)

      // 2️⃣ Supabase sign-out (clears auth tokens only)
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('[PRO-AUTH] Supabase signOut error:', error.message)
        return
      }

      // 3️⃣ Supabase.auth.signOut() already clears session from localStorage
      // No need to manually clear - it handles it automatically

      // 4️⃣ Redirect cleanly using Next.js router
      router.push('/pro')
    } catch (err) {
      console.error('[PRO-AUTH] Fatal logout error:', err)
    }
  }

  const isProUser = contractorProfile?.subscription_type === 'pro' || false
  const requiresKYC = contractorProfile?.status === 'approved' &&
    (contractorProfile?.kyc_status === 'not_started' ||
      contractorProfile?.kyc_status === 'failed')

  const value = {
    user,
    contractorProfile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    updateKYCStatus,
    isProUser,
    requiresKYC
  }

  return <ProAuthContext.Provider value={value}>{children}</ProAuthContext.Provider>
}

export function useProAuth() {
  const context = useContext(ProAuthContext)
  if (context === undefined) {
    throw new Error('useProAuth must be used within a ProAuthProvider')
  }
  return context
}