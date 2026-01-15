'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { useProAuth } from '../contexts/ProAuthContext'

export default function ProRouteGuard({ children }: { children: React.ReactNode }) {
  const { userProfile: homeownerProfile, loading: homeOwnerLoading } = useAuth()
  const { user: contractorUser, contractorProfile, loading: contractorLoading } = useProAuth()
  const router = useRouter()

  useEffect(() => {
    // If homeowner is logged in, redirect them away from contractor routes
    if (homeownerProfile?.role === 'homeowner' && !contractorProfile) {
      router.push('/dashboard/homeowner')
      return
    }

    // Don't auto-redirect to sign-in - let the page handle it
    // This prevents annoying redirects when users are already on /pro pages
  }, [homeownerProfile?.role, contractorProfile, router])

  // Show loading while checking auth - BLUE for contractor
  if (contractorLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-lg font-medium text-slate-800 mb-1">Welcome to Rushr Pro</div>
          <div className="text-sm text-slate-600">Loading your dashboard...</div>
        </div>
      </div>
    )
  }

  if (homeOwnerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-lg font-medium text-slate-800 mb-1">Welcome to Rushr Pro</div>
          <div className="text-sm text-slate-600">Loading your dashboard...</div>
        </div>
      </div>
    )
  }

  // Block homeowners from accessing pro content
  if (homeownerProfile?.role === 'homeowner' && !contractorProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <div className="text-center max-w-md bg-white p-8 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-red-600">Access Restricted</h2>
          <p className="mb-4">This area is for contractors only.</p>
          <p className="text-sm text-gray-600 mb-6">You are logged in as a homeowner.</p>
          <a href="/dashboard/homeowner" className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 inline-block">
            Go to Homeowner Dashboard
          </a>
        </div>
      </div>
    )
  }

  // CRITICAL: Block unauthenticated users from accessing contractor dashboard
  if (!contractorUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <div className="text-center max-w-md bg-white p-8 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-blue-600">Sign In Required</h2>
          <p className="mb-4">Please sign in to access the contractor dashboard.</p>
          <p className="text-sm text-gray-600 mb-6">You need to be logged in as a contractor.</p>
          <a href="/pro/sign-in" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 inline-block">
            Sign In to Pro
          </a>
        </div>
      </div>
    )
  }

  // Allow access to contractors
  return <>{children}</>
}