// app/auth/callback/page.client.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LoadingSpinner from '../../../components/LoadingSpinner'
import { supabase } from '../../../lib/supabaseClient'

export default function AuthCallbackClient() {
  const router = useRouter()
  const sp = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get custom callback URL if provided
        const customCallback = sp.get('callbackUrl')

        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('Session error:', sessionError)
          setError('Authentication failed')
          router.replace('/')
          return
        }

        if (!session?.user) {
          console.log('No session found, redirecting to home')
          router.replace('/')
          return
        }

        // If custom callback provided, use it
        if (customCallback) {
          router.replace(customCallback)
          return
        }

        // Check if user has a profile to determine where to redirect
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle()

        const { data: contractorProfile } = await supabase
          .from('pro_contractors')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle()

        // Redirect based on profile type
        if (contractorProfile) {
          router.replace('/dashboard/contractor')
        } else if (userProfile?.role === 'homeowner') {
          router.replace('/dashboard/homeowner')
        } else {
          // New user without profile - redirect to home
          router.replace('/')
        }
      } catch (err) {
        console.error('Callback error:', err)
        setError('Something went wrong')
        router.replace('/')
      }
    }

    handleCallback()
  }, [router, sp])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <a href="/" className="text-blue-600 hover:underline">Go to Home</a>
        </div>
      </div>
    )
  }

  return <LoadingSpinner size="lg" text="Finishing sign-in..." />
}
