// app/post-job/page.tsx
'use client'

import { useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useRouter } from 'next/navigation'
import PostJobInner from './page.client'

export default function PostJobPage() {
  const { user, userProfile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Wait for auth to finish loading
    if (loading) return

    // If user is logged in as contractor, redirect them
    if (user && userProfile && userProfile.role === 'contractor') {
      console.log('User is a contractor, redirecting to pro dashboard')
      router.push('/dashboard/contractor')
      return
    }
  }, [user, userProfile, loading, router])

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center">
          <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
            <div className="absolute inset-0 rounded-full border-emerald-200 border-t-emerald-600 animate-spin" style={{ borderWidth: 3 }} />
            <img
              src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg"
              alt="Rushr"
              style={{ width: 44, height: 44 }}
              className="object-contain"
            />
          </div>
          <p className="text-slate-600 text-sm mt-3">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render the form if user is a contractor (redirect handled in useEffect)
  if (userProfile && userProfile.role === 'contractor') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center">
          <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
            <div className="absolute inset-0 rounded-full border-emerald-200 border-t-emerald-600 animate-spin" style={{ borderWidth: 3 }} />
            <img
              src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg"
              alt="Rushr"
              style={{ width: 44, height: 44 }}
              className="object-contain"
            />
          </div>
          <p className="text-slate-600 text-sm mt-3">Redirecting...</p>
        </div>
      </div>
    )
  }

  // Render the form - pass userId only if user is logged in
  return <PostJobInner userId={user?.id || null} />
}