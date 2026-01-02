'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import { useProAuth } from '../../contexts/ProAuthContext'
import Link from 'next/link'
import { FullScreenLoading } from '../../components/LoadingSpinner'

export default function DashboardChooser() {
  const { user: homeownerUser, userProfile, loading: homeownerLoading } = useAuth()
  const { user: contractorUser, contractorProfile, loading: contractorLoading } = useProAuth()
  const router = useRouter()

  // Consider loading if either context is still loading
  const loading = homeownerLoading || contractorLoading
  const user = homeownerUser || contractorUser

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/?auth=signin')
        return
      }

      // CRITICAL: Contractor profile takes ABSOLUTE PRIORITY
      // If user has contractor profile, ALWAYS go to contractor dashboard
      if (contractorProfile) {
        console.log('[DASHBOARD CHOOSER] Contractor profile found - forcing redirect to /dashboard/contractor')
        router.replace('/dashboard/contractor')
        return
      }

      // Only check homeowner profile if NOT a contractor
      if (userProfile && !contractorProfile) {
        console.log('[DASHBOARD CHOOSER] Homeowner profile found (no contractor) - redirecting to /dashboard/homeowner')
        router.replace('/dashboard/homeowner')
        return
      }

      // If no profile found in either table, show chooser
      console.log('[DASHBOARD CHOOSER] No profile found - showing manual chooser')
    }
  }, [user, userProfile, contractorProfile, loading, router])

  if (loading) {
    return <FullScreenLoading />
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-4">Please sign in</h1>
          <Link href="/sign-in" className="text-green-600 hover:text-green-500">
            Go to sign in
          </Link>
        </div>
      </div>
    )
  }

  // Show manual chooser if user profile is not yet available or has unknown role
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold text-ink dark:text-white">Dashboard</h1>
        <p className="text-slate-600 dark:text-slate-300">Access your Rushr emergency services dashboard.</p>
        {userProfile && (
          <p className="text-sm text-slate-500 mt-2">
            Welcome back, {userProfile.name}! ({userProfile.subscription_type} plan)
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/homeowner"
          className="rounded-2xl border border-emerald-200 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow transition"
        >
          <div className="text-sm font-semibold text-emerald-700">Homeowner</div>
          <div className="mt-1 text-ink dark:text-white text-lg">Emergency service history & active jobs</div>
          <ul className="mt-3 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>Active emergency services</li>
            <li>Service history & receipts</li>
            <li>Preferred pros</li>
          </ul>
        </Link>

        <Link
          href="/dashboard/contractor"
          className="rounded-2xl border border-blue-200 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow transition"
        >
          <div className="text-sm font-semibold text-blue-700">Pro</div>
          <div className="mt-1 text-ink dark:text-white text-lg">Emergency jobs & availability</div>
          <ul className="mt-3 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>Emergency job alerts</li>
            <li>Availability status</li>
            <li>Earnings & ratings</li>
          </ul>
        </Link>
      </div>
    </div>
  )
}
