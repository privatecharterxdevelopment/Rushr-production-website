'use client'

import React, { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useProAuth } from '../../../contexts/ProAuthContext'
import { supabase } from '../../../lib/supabaseClient'
import dynamic from 'next/dynamic'

const PaymentHistory = dynamic(() => import('../../../components/PaymentHistory'), { ssr: false })
import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  LineChart,
  MapPin,
  MessageSquare,
  Target,
  Users,
  CalendarDays,
  ChevronRight,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Mail,
  Phone,
  Star,
  Siren,
  Zap,
  Battery,
  Settings,
  Bell,
  Power,
  PowerOff,
} from 'lucide-react'

/* ----------------------------- helpers ----------------------------- */
function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-ink dark:text-white">{children}</h2>
      {action}
    </div>
  )
}
function StatCard({
  label, value, hint, icon, tone='blue'
}: { label:string; value:string|number; hint?:string; icon?:React.ReactNode; tone?:'blue'|'emerald'|'amber'|'rose' }) {
  const ring = tone==='blue' ? 'border-blue-200' : tone==='emerald' ? 'border-emerald-200' : tone==='amber' ? 'border-amber-200' : 'border-rose-200'
  const dot  = tone==='blue' ? 'bg-blue-500' : tone==='emerald' ? 'bg-emerald-500' : tone==='amber' ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className={`rounded-2xl border ${ring} bg-white dark:bg-slate-900 p-4 shadow-sm`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        {icon ? <span className="ml-auto text-slate-400">{icon}</span> : null}
      </div>
      <div className="mt-1 text-2xl font-semibold text-ink dark:text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}
function Badge({ children }:{children:React.ReactNode}) {
  return <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200">{children}</span>
}
function Chip({ children }:{children:React.ReactNode}) {
  return <span className="rounded-md border px-1.5 py-0.5 text-[11px] text-slate-600">{children}</span>
}

/* --------------------- types + mock data --------------------- */
type EmergencyJob = {
  id:string
  title:string
  location:string
  priority: 'Emergency' | 'Urgent' | 'Standard'
  hourlyRate:number
  estimatedDuration:string
  distance:number
  requestedMins:number
  status:'Available'|'Accepted'|'En Route'|'In Progress'|'Completed'
  customerName:string
  category: 'Plumbing'|'Electrical'|'HVAC'|'Locksmith'|'Auto'
}
type Availability = 'online' | 'busy' | 'offline'
type Appt = { id:string; job:string; at:string; window:string; addr:string; customerName:string }
type Earning = { date:string; amount:number; hours:number; jobTitle:string }
type CompletenessField = { key:string; label:string; weight:number; done:boolean; href:string; icon:React.ReactNode }

export default function ContractorDashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, contractorProfile, loading: authLoading } = useProAuth()
  const [availability, setAvailability] = useState<Availability>('online')
  const [contractorData, setContractorData] = useState<any>(null)
  const [stripeConnectStatus, setStripeConnectStatus] = useState<any>(null)
  const [loadingStripe, setLoadingStripe] = useState(true)
  const [realJobs, setRealJobs] = useState<EmergencyJob[]>([])
  const [contractorStats, setContractorStats] = useState({
    todayJobs: 0,
    weekEarnings: 0,
    avgResponse: 0,
    rating: 0,
    completedJobs: 0,
    availableJobs: 0
  })
  const [contractorZips, setContractorZips] = useState<string[]>([])
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [showApprovalToast, setShowApprovalToast] = useState(false)
  const [directOffers, setDirectOffers] = useState<any[]>([])

  // Redirect homeowners immediately
  useEffect(() => {
    if (!authLoading && user && !contractorProfile) {
      router.push('/dashboard/homeowner')
    }
  }, [authLoading, user, contractorProfile, router])

  // Show success toast if login=success in URL
  useEffect(() => {
    if (searchParams.get('login') === 'success') {
      setShowSuccessToast(true)
      // Remove the query param from URL
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)
      // Auto-hide after 5 seconds
      setTimeout(() => setShowSuccessToast(false), 5000)
    }
  }, [searchParams])

  // Show approval toast ONCE when contractor is first approved
  useEffect(() => {
    if (contractorData?.status === 'approved' && user?.id) {
      const approvalSeenKey = `approval_toast_seen_${user.id}`
      const hasSeenApproval = localStorage.getItem(approvalSeenKey)
      if (!hasSeenApproval) {
        setShowApprovalToast(true)
        localStorage.setItem(approvalSeenKey, 'true')
        // Auto-hide after 8 seconds
        setTimeout(() => setShowApprovalToast(false), 8000)
      }
    }
  }, [contractorData?.status, user?.id])

  // Load contractor data from database
  useEffect(() => {
    const loadContractorData = async () => {
      if (user) {
        try {
          // Parallelize all queries to reduce load time
          const [contractorResult, myBidsResult, availableJobsResult] = await Promise.all([
            supabase
              .from('pro_contractors')
              .select('*')
              .eq('id', user.id)
              .single(),
            supabase
              .from('job_bids')
              .select(`
                *,
                homeowner_jobs!inner(*)
              `)
              .eq('contractor_id', user.id),
            supabase
              .from('homeowner_jobs')
              .select('*')
              .in('status', ['pending', 'bidding'])
          ])

          const contractor = contractorResult.data
          const myBids = myBidsResult.data
          const availableJobsData = availableJobsResult.data

          // Check if wizard is completed - redirect if not
          if (!contractor || !contractor.base_zip || !contractor.categories?.length) {
            console.log('[DASHBOARD] Wizard not completed, redirecting to wizard')
            router.push('/pro/wizard')
            return
          }

          if (contractor) {
            setContractorData(contractor)
            setContractorZips(contractor.service_area_zips || [contractor.base_zip || ''].filter(Boolean))
            // Set initial availability from the availability field (not status field)
            setAvailability(contractor.availability || 'offline')
          }

          if (myBids) {
            const acceptedBids = myBids.filter(bid => bid.status === 'accepted')
            const completedJobs = acceptedBids.filter(bid => bid.homeowner_jobs?.status === 'completed')
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            const completedThisWeek = completedJobs.filter(bid =>
              bid.homeowner_jobs?.completed_date && new Date(bid.homeowner_jobs.completed_date) > weekAgo
            )
            const weekEarnings = completedThisWeek.reduce((sum, bid) => sum + (bid.homeowner_jobs?.final_cost || 0), 0)

            setContractorStats({
              todayJobs: acceptedBids.filter(bid =>
                bid.homeowner_jobs?.status === 'in_progress' &&
                new Date(bid.homeowner_jobs.created_at).toDateString() === new Date().toDateString()
              ).length,
              weekEarnings,
              avgResponse: 8, // Default for now
              rating: contractor?.rating || 4.5,
              completedJobs: completedJobs.length,
              availableJobs: availableJobsData?.length || 0
            })
          }
        } catch (error) {
          console.error('Error loading contractor data:', error)
        }
      }
    }

    loadContractorData()
  }, [user])

  // Check Stripe Connect status
  useEffect(() => {
    const checkStripeStatus = async () => {
      if (user) {
        try {
          const response = await fetch('/api/stripe/connect/check-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contractorId: user.id })
          })

          if (response.ok) {
            const data = await response.json()
            setStripeConnectStatus(data)
          }
        } catch (error) {
          console.error('Error checking Stripe status:', error)
        } finally {
          setLoadingStripe(false)
        }
      }
    }

    checkStripeStatus()
  }, [user])

  // Load available jobs in contractor's ZIP areas
  useEffect(() => {
    const loadNearbyJobs = async () => {
      // Only load jobs if contractor is verified (approved + KYC completed)
      const contractorVerified = contractorData?.status === 'approved' && contractorData?.kyc_status === 'completed'
      if (contractorZips.length > 0 && contractorVerified) {
        try {
          const { data: jobs } = await supabase
            .from('homeowner_jobs')
            .select('*')
            .in('zip_code', contractorZips)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(10)

          if (jobs) {
            const formattedJobs: EmergencyJob[] = jobs.map(job => ({
              id: job.id,
              title: job.title || 'Service Request',
              location: `${job.address || job.zip_code || 'Unknown location'}`,
              priority: (job.priority || 'Standard') as 'Emergency' | 'Urgent' | 'Standard',
              hourlyRate: 100, // Default rate, could be calculated from budget
              estimatedDuration: '1-2 hours',
              distance: Math.round(Math.random() * 10), // Mock distance for now
              requestedMins: Math.floor((new Date().getTime() - new Date(job.created_at).getTime()) / (1000 * 60)),
              status: 'Available' as const,
              customerName: 'Homeowner',
              category: (job.category || 'Plumbing') as any
            }))

            setRealJobs(formattedJobs)
            setContractorStats(prev => ({ ...prev, availableJobs: formattedJobs.length }))
          }
        } catch (error) {
          console.error('Error loading nearby jobs:', error)
        }
      } else {
        // Clear jobs if not verified
        setRealJobs([])
      }
    }

    loadNearbyJobs()
  }, [contractorZips, contractorData?.status, contractorData?.kyc_status])

  // Load direct offers for this contractor
  useEffect(() => {
    const loadDirectOffers = async () => {
      if (!user) return

      try {
        const { data: offers, error } = await supabase
          .from('direct_offers')
          .select(`
            *,
            homeowner_jobs (
              id,
              job_number,
              title,
              description,
              category,
              address,
              phone,
              created_at,
              homeowner_id
            )
          `)
          .eq('contractor_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })

        if (!error && offers) {
          setDirectOffers(offers)
        }
      } catch (error) {
        console.error('Error loading direct offers:', error)
      }
    }

    loadDirectOffers()

    // Set up real-time subscription for new direct offers
    const channel = supabase
      .channel('direct-offers-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'direct_offers',
          filter: `contractor_id=eq.${user?.id}`
        },
        () => {
          loadDirectOffers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const handleStartKYC = () => {
    // Navigate to the comprehensive onboarding wizard
    router.push('/pro/wizard')
  }

  const handleCompleteStripeSetup = async () => {
    try {
      const response = await fetch('/api/stripe/connect/onboarding-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractorId: user?.id })
      })

      const data = await response.json()

      if (data.success && data.url) {
        // Redirect to Stripe hosted onboarding
        window.location.href = data.url
      } else {
        alert('Failed to generate onboarding link. Please try again.')
      }
    } catch (error) {
      console.error('Error generating Stripe link:', error)
      alert('An error occurred. Please try again.')
    }
  }

  // Check if contractor can go online
  const canGoOnline = contractorData?.status === 'approved' &&
                      contractorData?.kyc_status === 'completed' &&
                      stripeConnectStatus?.payoutsEnabled === true

  // Handle availability change
  const handleAvailabilityChange = async (newStatus: Availability) => {
    if (newStatus === 'online' && !canGoOnline) {
      alert('You must complete payment setup before going online.')
      return
    }

    setAvailability(newStatus)

    // Update database - ONLY update availability, NOT status
    // status field should ONLY be managed by: wizard (pending_approval) and admin (approved)
    // availability field tracks online/busy/offline state
    try {
      await supabase
        .from('pro_contractors')
        .update({
          availability: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', user?.id)
    } catch (error) {
      console.error('Error updating availability:', error)
    }
  }

  // All emergency job data now comes from the real database
  const emergencyJobs: EmergencyJob[] = []
  const currentJobs: EmergencyJob[] = []

  // All schedule and earnings data now comes from the real database
  const todaySchedule: Appt[] = []
  const recentEarnings: Earning[] = []

  const completeness: CompletenessField[] = [
    { key:'license', label:'Upload license', weight:25, done:!!contractorData?.license_number && contractorData?.license_number !== 'pending',  href:'/dashboard/contractor/settings', icon:<BadgeCheck className="h-4 w-4" /> },
    { key:'insurance', label:'Verify insurance', weight:25, done:!!contractorData?.insurance_carrier && contractorData?.insurance_carrier !== 'pending', href:'/dashboard/contractor/settings', icon:<ShieldIcon /> },
    { key:'coverage', label:'Emergency service area', weight:20, done:contractorZips.length > 0, href:'/dashboard/contractor/settings', icon:<MapPin className="h-4 w-4" /> },
    { key:'hours', label:'Emergency availability', weight:15, done:!!contractorData?.emergency_services, href:'/dashboard/contractor/settings', icon:<Clock className="h-4 w-4" /> },
    { key:'rates', label:'Set hourly rates', weight:15, done:!!contractorData?.hourly_rate, href:'/dashboard/contractor/settings', icon:<DollarSign className="h-4 w-4" /> },
  ]

  // Use real contractor stats
  const kpis = contractorStats

  const completenessPct = useMemo(()=>{
    const total = completeness.reduce((a,b)=>a+b.weight,0)
    const done = completeness.filter(f=>f.done).reduce((a,b)=>a+b.weight,0)
    return Math.round((done/total)*100)
  },[completeness.length])

  // Use real jobs from database instead of mock data
  const availableJobs = realJobs.length > 0 ? realJobs : emergencyJobs.filter(j => j.status === 'Available').sort((a,b) => a.requestedMins - b.requestedMins)
  const nextJob = availableJobs[0]

  const nextAction = currentJobs.length > 0 ? {
    title: 'Service in progress',
    desc: `Continue work on "${currentJobs[0].title}" for ${currentJobs[0].customerName}`,
    href: `/jobs/${currentJobs[0].id}`,
    urgent: true,
  } : nextJob ? {
    title: 'Emergency job available',
    desc: `${nextJob.title} • $${nextJob.hourlyRate}/hr • ${nextJob.distance}mi away`,
    href: `/dashboard/contractor/jobs/${nextJob.id}`,
    urgent: nextJob.priority === 'Emergency',
  } : {
    title: 'Ready for emergency calls',
    desc: 'You are online and available. Emergency jobs will appear here.',
    href: '/dashboard/contractor/jobs',
    urgent: false,
  }

  const getAvailabilityIcon = (status: Availability) => {
    switch (status) {
      case 'online': return <Power className="h-4 w-4 text-emerald-600" />
      case 'busy': return <Clock className="h-4 w-4 text-amber-600" />
      case 'offline': return <PowerOff className="h-4 w-4 text-slate-400" />
    }
  }

  const getAvailabilityColor = (status: Availability) => {
    switch (status) {
      case 'online': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      case 'busy': return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'offline': return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  // Show overlay if KYC is required but not started
  const showKYCOverlay = contractorData && !contractorData.kyc_status

  // Check if contractor is verified (approved by admin) - for navigation
  const isVerified = contractorData?.status === 'approved'

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    // Redirect handled by useEffect above
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!contractorProfile) {
    // Redirect handled by useEffect above
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Homeowner Account Detected</h2>
            <p className="text-slate-600 mb-6">Redirecting to homeowner dashboard...</p>
          </div>
          <div className="space-y-3">
            <a href="/dashboard/homeowner" className="block w-full bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 transition-colors font-medium">
              Go to Homeowner Dashboard
            </a>
            <a href="/pro/contractor-signup" className="block w-full bg-slate-100 text-slate-700 px-6 py-3 rounded-lg hover:bg-slate-200 transition-colors font-medium">
              Create Contractor Account
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-8 ${showKYCOverlay ? 'relative' : ''}`}>
      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
          <div className="bg-emerald-50 border-2 border-emerald-500 rounded-lg shadow-lg p-4 flex items-center gap-3 max-w-md">
            <div className="flex-shrink-0">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-900">Successfully logged in!</p>
              <p className="text-xs text-emerald-700 mt-0.5">Welcome back to Rushr Pro</p>
            </div>
            <button
              onClick={() => setShowSuccessToast(false)}
              className="flex-shrink-0 text-emerald-600 hover:text-emerald-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Approval Toast - Shows ONCE when contractor is first approved */}
      {showApprovalToast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
          <div className="bg-emerald-50 border-2 border-emerald-500 rounded-lg shadow-lg p-4 flex items-center gap-3 max-w-md">
            <div className="flex-shrink-0">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-900">You're Online! 🎉</p>
              <p className="text-xs text-emerald-700 mt-0.5">Your profile is live and you're receiving job notifications</p>
            </div>
            <button
              onClick={() => setShowApprovalToast(false)}
              className="flex-shrink-0 text-emerald-600 hover:text-emerald-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* KYC Status Banners - Only show if not yet approved */}

      {/* NOT STARTED - Need to complete wizard */}
      {contractorData && contractorData.kyc_status === 'not_started' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-medium text-blue-800">Complete KYC Verification</h3>
              <p className="text-blue-700 mt-1">
                Please complete the KYC verification wizard to start accepting jobs.
              </p>
            </div>
            <div className="ml-4">
              <Link
                href="/pro/wizard"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
              >
                Start KYC Verification
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* IN PROGRESS / PENDING APPROVAL - Waiting for admin */}
      {contractorData && (contractorData.kyc_status === 'in_progress' || contractorData.status === 'pending_approval') && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-medium text-yellow-800">Pending Approval</h3>
              <p className="text-yellow-700 mt-1">
                Your KYC verification is under review. We'll notify you once approved (typically 1-2 business days).
              </p>
              {contractorZips.length > 0 && (
                <p className="text-yellow-600 text-sm mt-2">
                  Service areas: {contractorZips.join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* header */}
      <div className="mb-2 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="text-xl lg:text-2xl font-semibold text-ink dark:text-white flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span>Dashboard</span>
            <Badge>Pro</Badge>
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Welcome back, {contractorData?.name || contractorProfile?.name || user?.email || 'Contractor'}!
          </p>
        </div>

        {/* Availability Toggle - Mobile friendly */}
        <div className="flex items-center gap-2 lg:hidden">
          <span className="text-sm text-slate-600">Status:</span>
          <select
            value={availability}
            onChange={(e) => handleAvailabilityChange(e.target.value as Availability)}
            className={`px-3 py-1 rounded-full text-sm font-medium border ${getAvailabilityColor(availability)}`}
          >
            <option value="online" disabled={!canGoOnline}>Online</option>
            <option value="busy">Busy</option>
            <option value="offline">Offline</option>
          </select>
        </div>

        {/* Action buttons - horizontal scroll on mobile, flex on desktop */}
        <div className="flex gap-2 items-center overflow-x-auto pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0">
          {/* Availability Toggle - Desktop */}
          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            <span className="text-sm text-slate-600">Status:</span>
            <select
              value={availability}
              onChange={(e) => handleAvailabilityChange(e.target.value as Availability)}
              className={`px-3 py-1 rounded-full text-sm font-medium border ${getAvailabilityColor(availability)}`}
            >
              <option value="online" disabled={!canGoOnline}>Online</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
            </select>
          </div>
          <Link
            href="/dashboard/contractor/jobs"
            className="btn-primary whitespace-nowrap flex-shrink-0"
          >
            Browse Jobs
          </Link>
          <Link
            href={isVerified ? "/dashboard/contractor/jobs?tab=my-jobs" : "#"}
            className={`btn whitespace-nowrap flex-shrink-0 ${!isVerified ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
            onClick={(e) => !isVerified && e.preventDefault()}
          >
            My Jobs
          </Link>
          <Link
            href={isVerified ? "/dashboard/contractor/calendar" : "#"}
            className={`btn whitespace-nowrap flex-shrink-0 ${!isVerified ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
            onClick={(e) => !isVerified && e.preventDefault()}
          >
            Calendar
          </Link>
          <Link
            href={isVerified ? "/dashboard/contractor/messages" : "#"}
            className={`btn whitespace-nowrap flex-shrink-0 ${!isVerified ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
            onClick={(e) => !isVerified && e.preventDefault()}
          >
            Messages
          </Link>
          <Link
            href={isVerified ? "/dashboard/contractor/billing" : "#"}
            className={`btn whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${!isVerified ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
            onClick={(e) => !isVerified && e.preventDefault()}
          >
            <DollarSign className="w-4 h-4" />
            Billing
          </Link>
          <Link
            href="/dashboard/contractor/settings"
            className="btn whitespace-nowrap flex-shrink-0"
          >
            Settings
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <section className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6 ${showKYCOverlay ? 'opacity-50 pointer-events-none' : ''}`}>
        <StatCard label="Today&apos;s Jobs" value={kpis.todayJobs} icon={<Siren className="h-4 w-4" />} />
        <StatCard label="Week Earnings" value={`$${kpis.weekEarnings}`} tone="emerald" icon={<DollarSign className="h-4 w-4" />} />
        <StatCard label="Avg Response" value={`${kpis.avgResponse}m`} hint="Emergency calls" tone="amber" icon={<Zap className="h-4 w-4" />} />
        <StatCard label="Rating" value={kpis.rating || 'New'} tone="rose" icon={<Star className="h-4 w-4" />} />
        <StatCard label="Completed Jobs" value={kpis.completedJobs} icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Available Jobs" value={kpis.availableJobs} tone="amber" icon={<Bell className="h-4 w-4" />} />
      </section>

      {/* Next action + Current job + Today schedule */}
      <section className={`grid grid-cols-1 gap-4 xl:grid-cols-3 ${showKYCOverlay ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Next action */}
        <div className={`rounded-2xl border p-4 shadow-sm ${nextAction.urgent ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-white'}`}>
          <SectionTitle>
            {nextAction.urgent ? (
              <span className="flex items-center gap-2">
                <Siren className="h-4 w-4 text-red-600" />
                Urgent Action
              </span>
            ) : (
              'Next Step'
            )}
          </SectionTitle>
          <Link
            href={nextAction.href}
            className={`flex items-center justify-between rounded-xl border p-4 transition ${
              nextAction.urgent
                ? 'border-red-200 bg-red-100 hover:bg-red-200'
                : 'border-blue-200 bg-blue-50 hover:bg-blue-100'
            }`}
          >
            <div>
              <div className="font-semibold text-ink dark:text-white">{nextAction.title}</div>
              <div className="text-sm text-slate-600">{nextAction.desc}</div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-500" />
          </Link>

          {/* Availability status */}
          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink dark:text-white">
              {getAvailabilityIcon(availability)}
              Emergency availability
            </div>
            <div className={`text-sm px-3 py-2 rounded-lg ${getAvailabilityColor(availability)}`}>
              {availability === 'online' && 'Ready to receive emergency job alerts'}
              {availability === 'busy' && 'Currently on a job - limited availability'}
              {availability === 'offline' && 'Not receiving emergency job alerts'}
            </div>
          </div>
        </div>

        {/* Direct Offers */}
        <div className="rounded-2xl border border-slate-200 p-4">
          <SectionTitle action={directOffers.length > 0 ? <Link href="/dashboard/contractor/jobs?tab=my-jobs" className="text-brand underline text-sm">See all</Link> : null}>
            Direct Offers
          </SectionTitle>
          {!(contractorData?.status === 'approved' && contractorData?.kyc_status === 'completed') ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-amber-900 mb-1">Verification Required</p>
              <p className="text-xs text-amber-700">Complete your profile verification to receive direct job offers</p>
            </div>
          ) : directOffers.length > 0 ? (
            <ul className="space-y-2 max-h-[300px] overflow-y-auto">
              {directOffers.slice(0,3).map(offer=>(
                <li key={offer.id} className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div>
                    <div className="font-medium text-ink dark:text-white flex items-center gap-2">
                      {offer.homeowner_jobs?.title || 'Direct Job Offer'}
                      <span className="text-emerald-600 text-xs">🎯 Direct</span>
                    </div>
                    <div className="text-xs text-slate-600 flex items-center gap-2">
                      <span>{offer.homeowner_jobs?.address || 'Location TBD'}</span>
                      <span className="text-slate-400">•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {Math.floor((new Date().getTime() - new Date(offer.created_at).getTime()) / (1000 * 60))}m ago
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/contractor/jobs?tab=my-jobs`} className="btn-primary text-sm px-4 py-2 rounded-lg">
                      View Offer
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-600 text-center py-4">No direct offers at the moment.</div>
          )}
        </div>

        {/* Today schedule */}
        <div className="rounded-2xl border border-slate-200 p-4">
          <SectionTitle action={<Link href="/dashboard/contractor/calendar" className="text-brand underline text-sm">Calendar</Link>}>
            Today&apos;s Schedule
          </SectionTitle>
          {currentJobs.length > 0 && (
            <div className="mb-3">
              <div className="font-medium text-purple-700 text-sm mb-2">🔄 In Progress</div>
              {currentJobs.map(job => (
                <div key={job.id} className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                  <div className="font-medium text-ink dark:text-white">{job.title}</div>
                  <div className="text-xs text-slate-600">{job.customerName} • {job.location}</div>
                  <Link href={`/jobs/${job.id}`} className="btn btn-outline text-sm mt-2">Continue</Link>
                </div>
              ))}
            </div>
          )}

          {todaySchedule.length === 0 ? (
            <div className="text-sm text-slate-600">No scheduled appointments today.</div>
          ) : (
            <ul className="space-y-2">
              {todaySchedule.map(a=>(
                <li key={a.id} className="flex items-center justify-between rounded-lg border bg-white p-3">
                  <div>
                    <div className="font-medium text-ink dark:text-white">{a.job}</div>
                    <div className="text-xs text-slate-600 flex items-center gap-2">
                      <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5"/>{a.window}</span>
                      <span className="text-slate-400">•</span>
                      <span>{a.customerName}</span>
                    </div>
                  </div>
                  <Link href={`/jobs/${a.id}`} className="btn btn-outline text-sm">Details</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Earnings + Completeness + Performance */}
      <section className={`grid grid-cols-1 gap-4 xl:grid-cols-3 ${showKYCOverlay ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Recent earnings */}
        <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <SectionTitle action={<Link href="/dashboard/contractor" className="text-brand underline text-sm">View all</Link>}>
            Recent earnings
          </SectionTitle>
          {recentEarnings.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-600">No earnings yet</p>
              <p className="text-xs text-slate-500 mt-1">Complete jobs to start earning</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {recentEarnings.slice(0,4).map(earning=>(
                <li key={earning.date} className="flex items-center justify-between rounded-lg border bg-emerald-50 p-3">
                  <div>
                    <div className="font-medium text-ink dark:text-white">{earning.jobTitle}</div>
                    <div className="text-xs text-slate-600">{new Date(earning.date).toLocaleDateString()} • {earning.hours}h</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-emerald-700">${earning.amount}</div>
                    <div className="text-xs text-slate-500">${(earning.amount/earning.hours).toFixed(0)}/hr</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 text-center">
            <div className="text-sm font-medium text-emerald-700">
              Week total: ${kpis.weekEarnings.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Profile completeness */}
        <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
          <SectionTitle action={<Link href="/dashboard/contractor/settings" className="text-brand underline text-sm">Edit profile</Link>}>
            Emergency readiness
          </SectionTitle>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center justify-between text-sm font-medium text-blue-900">
              <span>Setup complete</span><span>{completenessPct}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-blue-100">
              <div className="h-2 rounded-full bg-blue-600" style={{width:`${completenessPct}%`}} />
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {completeness.map(f=>(
              <Link key={f.key} href={f.href} className={`flex items-center justify-between rounded-lg border p-3 text-sm transition ${f.done?'border-slate-200 bg-white':'border-amber-200 bg-amber-50 hover:bg-amber-100'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{f.icon}</span>
                  <span className="text-ink dark:text-white">{f.label}</span>
                </div>
                {f.done ? <CheckCircle2 className="h-5 w-5 text-emerald-600"/> : <Circle className="h-5 w-5 text-slate-400"/>}
              </Link>
            ))}
          </div>
        </div>

        {/* Performance metrics */}
        <div className="rounded-2xl border border-slate-200 p-4">
          <SectionTitle>Performance this week</SectionTitle>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>Response time</span>
                <span>{kpis.avgResponse}m avg</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full">
                <div className="h-2 bg-emerald-500 rounded-full" style={{ width: '85%' }} />
              </div>
              <div className="text-xs text-slate-500 mt-1">Goal: &lt;10 minutes</div>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>Customer rating</span>
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-amber-500" />
                  {kpis.rating.toFixed(1)}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full">
                <div className="h-2 bg-amber-500 rounded-full" style={{ width: `${(kpis.rating / 5) * 100}%` }} />
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {kpis.completedJobs > 0 ? `Based on ${kpis.completedJobs} completed ${kpis.completedJobs === 1 ? 'job' : 'jobs'}` : 'Complete jobs to receive ratings'}
              </div>
            </div>

            <div className="pt-2 border-t">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-lg font-semibold text-ink dark:text-white">{kpis.completedJobs}</div>
                  <div className="text-xs text-slate-500">Jobs completed</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-ink dark:text-white">{Math.round(kpis.completedJobs * 2.5)}h</div>
                  <div className="text-xs text-slate-500">Hours worked</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${showKYCOverlay ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="rounded-2xl border border-slate-200 p-4">
          <h3 className="mb-2 font-semibold text-ink dark:text-white">Emergency services</h3>
          <p className="text-sm text-slate-600 mb-3">Manage your emergency service offerings and rates.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/contractor/settings" className="btn">Service Types & Rates</Link>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <h3 className="mb-2 font-semibold text-ink dark:text-white">Coverage & availability</h3>
          <p className="text-sm text-slate-600">Set your service area and emergency availability hours.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/dashboard/contractor/settings" className="btn">Service Area</Link>
            <Link href="/dashboard/contractor/calendar" className="btn btn-outline">Availability</Link>
          </div>
        </div>
      </section>

      {/* Payment History / Earnings Section */}
      <section>
        <SectionTitle>Earnings History</SectionTitle>
        <PaymentHistory userType="contractor" />
      </section>

    </div>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10Z"/>
    </svg>
  )
}