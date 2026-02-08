'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { useProAuth } from '../contexts/ProAuthContext'
import LoadingSpinner from './LoadingSpinner'

export default function HomeownerRouteGuard({ children }: { children: React.ReactNode }) {
  const { user: homeownerUser, loading: homeownerLoading } = useAuth()
  const { contractorProfile } = useProAuth()
  const router = useRouter()

  useEffect(() => {
    // If contractor is logged in, redirect them away from homeowner routes
    if (contractorProfile) {
      router.push('/dashboard/contractor')
      return
    }

    // If not loading and no user, redirect to sign-in
    if (!homeownerLoading && !homeownerUser) {
      router.push('/sign-in')
    }
  }, [contractorProfile, homeownerUser, homeownerLoading, router])

  // Show loading while checking auth
  if (homeownerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // Block contractors from accessing homeowner content
  if (contractorProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50">
        <div className="text-center max-w-md bg-white p-8 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-red-600">Access Restricted</h2>
          <p className="mb-4">This area is for homeowners only.</p>
          <p className="text-sm text-gray-600 mb-6">You are logged in as a contractor.</p>
          <a href="/dashboard/contractor" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 inline-block">
            Go to Pro Dashboard
          </a>
        </div>
      </div>
    )
  }

  // Allow access to homeowners
  return <>{children}</>
}