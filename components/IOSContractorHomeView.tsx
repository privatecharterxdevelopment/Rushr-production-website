// components/IOSContractorHomeView.tsx
// iOS contractor app main view - Blue themed, matching homeowner structure
'use client'

import React, { useEffect, useMemo, useState, useCallback, Component, ErrorInfo, ReactNode, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useProAuth, ContractorProfile } from '../contexts/ProAuthContext'
import { supabase } from '../lib/supabaseClient'
import IOSContractorRegistration from './IOSContractorRegistration'
import IOSContractorTabBar, { ContractorTabId } from './IOSContractorTabBar'
import { showGlobalToast } from './Toast'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App } from '@capacitor/app'
import dynamic from 'next/dynamic'
import type { FindProMapboxHandle } from './FindProMapbox'
import { Geolocation } from '@capacitor/geolocation'

// Dynamically import map component
const FindProMapbox = dynamic(() => import('./FindProMapbox'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
      <LoadingLogo />
    </div>
  )
})

// Error Boundary
interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class IOSContractorErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('IOSContractorHomeView Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-500 text-center mb-4 text-sm">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-full font-medium active:scale-95 transition-transform"
          >
            Reload App
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Haptic helpers
const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Light) => {
  try { await Haptics.impact({ style }) } catch (e) {}
}

const triggerNotification = async (type: NotificationType) => {
  try { await Haptics.notification({ type }) } catch (e) {}
}

// Simple loading spinner
const LoadingLogo = () => (
  <div className="flex flex-col items-center justify-center">
    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
)

// Native iOS Card component - matching homeowner
const IOSCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`bg-white rounded-xl overflow-hidden ${className}`}
    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
  >
    {children}
  </div>
)

// Native iOS List Item component - matching homeowner
const ListItem = ({
  icon,
  title,
  subtitle,
  href,
  onClick,
  danger = false,
  showChevron = true
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  href?: string
  onClick?: () => void
  danger?: boolean
  showChevron?: boolean
}) => {
  const handlePress = async () => {
    await triggerHaptic()
    onClick?.()
  }

  const content = (
    <div
      className="flex items-center justify-between py-3.5 px-4 active:bg-gray-100"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="flex items-center gap-3">
        <div className={danger ? 'text-red-500' : 'text-gray-500'}>{icon}</div>
        <div>
          <p className={`text-[15px] ${danger ? 'text-red-500' : 'text-gray-900'}`}>{title}</p>
          {subtitle && <p className="text-[13px] text-gray-400">{subtitle}</p>}
        </div>
      </div>
      {showChevron && (
        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} onClick={handlePress}>
        {content}
      </Link>
    )
  }

  return (
    <button onClick={handlePress} className="w-full text-left">
      {content}
    </button>
  )
}

// Divider component
const Divider = () => <div className="h-px bg-gray-100 ml-14" />

// Type for active job tracking
type LatLng = [number, number]

interface ActiveJob {
  id: string
  title: string
  status: string
  address: string | null
  latitude?: number
  longitude?: number
  homeowner_id: string
  homeowner_name?: string
  homeowner_phone?: string
  final_cost?: number
  accepted_bid_id?: string
}

// ============= CONTRACTOR JOB TRACKING VIEW =============
interface ContractorJobTrackingViewProps {
  job: ActiveJob
  contractorId: string
  onBack: () => void
  onJobComplete: () => void
}

function ContractorJobTrackingView({ job, contractorId, onBack, onJobComplete }: ContractorJobTrackingViewProps) {
  const mapRef = useRef<FindProMapboxHandle>(null)
  const [contractorLocation, setContractorLocation] = useState<LatLng | null>(null)
  const [jobStatus, setJobStatus] = useState(job.status)
  const [eta, setEta] = useState<number | null>(null)
  const [distance, setDistance] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [contractorConfirmed, setContractorConfirmed] = useState(false)

  // Completion flow states
  type CompletionStep = 'none' | 'price_review' | 'waiting' | 'success'
  const [completionStep, setCompletionStep] = useState<CompletionStep>('none')
  const [finalPrice, setFinalPrice] = useState(String(job.final_cost || ''))
  const [priceReason, setPriceReason] = useState('')
  const [earnedAmount, setEarnedAmount] = useState(0)

  // Get contractor's current location
  useEffect(() => {
    const watchLocation = async () => {
      try {
        const watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true },
          (position) => {
            if (position) {
              const newLocation: LatLng = [position.coords.latitude, position.coords.longitude]
              setContractorLocation(newLocation)

              // Update location in database for homeowner to track
              updateLocationInDatabase(newLocation)
            }
          }
        )

        return () => {
          Geolocation.clearWatch({ id: watchId })
        }
      } catch (err) {
        console.error('Error watching location:', err)
        // Fallback to single position
        try {
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
          setContractorLocation([pos.coords.latitude, pos.coords.longitude])
        } catch (e) {
          console.error('Fallback location error:', e)
        }
      }
    }

    watchLocation()
  }, [])

  // Update contractor location in database
  const updateLocationInDatabase = async (location: LatLng) => {
    try {
      await supabase
        .from('contractor_location_tracking')
        .upsert({
          job_id: job.id,
          contractor_id: contractorId,
          latitude: location[0],
          longitude: location[1],
          last_update_at: new Date().toISOString()
        }, {
          onConflict: 'job_id,contractor_id'
        })
    } catch (err) {
      console.error('Error updating location:', err)
    }
  }

  // Calculate ETA to job location
  useEffect(() => {
    const calculateETA = async () => {
      if (!contractorLocation || !job.latitude || !job.longitude) return

      try {
        const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (!MAPBOX_TOKEN) return

        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${contractorLocation[1]},${contractorLocation[0]};${job.longitude},${job.latitude}?overview=full&geometries=geojson&access_token=${MAPBOX_TOKEN}`
        )
        const data = await response.json()
        if (data.routes?.[0]?.duration) {
          const minutes = Math.ceil(data.routes[0].duration / 60)
          setEta(minutes)

          // Update ETA in database
          await supabase
            .from('contractor_location_tracking')
            .update({ eta_minutes: minutes })
            .eq('job_id', job.id)
            .eq('contractor_id', contractorId)
        }
        if (data.routes?.[0]?.distance) {
          const miles = (data.routes[0].distance / 1609.34).toFixed(1)
          setDistance(`${miles} mi`)
        }
      } catch (err) {
        console.error('Error calculating ETA:', err)
      }
    }

    if (jobStatus === 'confirmed') {
      calculateETA()
      const interval = setInterval(calculateETA, 30000)
      return () => clearInterval(interval)
    }
  }, [contractorLocation, job.latitude, job.longitude, jobStatus, job.id, contractorId])

  // Show route on map
  useEffect(() => {
    if (contractorLocation && job.latitude && job.longitude && mapRef.current && jobStatus === 'confirmed') {
      mapRef.current.showRoute(
        contractorLocation[0],
        contractorLocation[1],
        job.latitude,
        job.longitude
      )
    }
  }, [contractorLocation, job.latitude, job.longitude, jobStatus])

  // Subscribe to job status updates
  useEffect(() => {
    const channel = supabase
      .channel(`contractor-job-status-${job.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'homeowner_jobs',
          filter: `id=eq.${job.id}`
        },
        (payload) => {
          if (payload.new) {
            const updatedJob = payload.new as any
            setJobStatus(updatedJob.status)

            // Job marked completed by confirm-complete API (both parties confirmed, payment released)
            if (updatedJob.status === 'completed') {
              triggerNotification(NotificationType.Success)
              const price = updatedJob.final_price || parseFloat(finalPrice) || job.final_cost || 0
              const platformFee = price * 0.10
              setEarnedAmount(price - platformFee)
              setCompletionStep('success')
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [job.id, onJobComplete])

  // Handle arrival confirmation
  const handleConfirmArrival = async () => {
    setSubmitting(true)
    try {
      const response = await fetch('/api/jobs/confirm-arrival', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          contractorId
        })
      })

      const data = await response.json()
      if (data.success) {
        await triggerNotification(NotificationType.Success)
        setJobStatus('in_progress')
        showGlobalToast('Arrival confirmed! Job is now in progress.', 'success')
      } else {
        showGlobalToast(data.error || 'Failed to confirm arrival', 'error')
      }
    } catch (err) {
      console.error('Error confirming arrival:', err)
      showGlobalToast('Failed to confirm arrival', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle job completion — propose final price
  const handleProposeFinalPrice = async () => {
    setSubmitting(true)
    try {
      const price = parseFloat(finalPrice)
      if (isNaN(price) || price <= 0) {
        showGlobalToast('Please enter a valid price', 'error')
        setSubmitting(false)
        return
      }

      const response = await fetch('/api/jobs/propose-final-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          contractorId,
          finalPrice: price,
          reason: priceReason || undefined
        })
      })

      const data = await response.json()
      if (data.success) {
        await triggerNotification(NotificationType.Success)
        setContractorConfirmed(true)
        const platformFee = price * 0.10
        setEarnedAmount(price - platformFee)
        setCompletionStep('waiting')
        showGlobalToast(
          data.priceChanged
            ? 'Price proposal sent. Waiting for homeowner approval.'
            : 'Job marked complete. Waiting for homeowner confirmation.',
          'success'
        )
      } else {
        showGlobalToast(data.error || 'Failed to submit completion', 'error')
      }
    } catch (err) {
      console.error('Error proposing final price:', err)
      showGlobalToast('Failed to submit completion', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Build map items
  const mapItems = useMemo(() => {
    if (!job.latitude || !job.longitude) return []
    return [{
      id: 'destination',
      name: 'Job Location',
      latitude: job.latitude,
      longitude: job.longitude,
      services: ['Destination'],
    }]
  }, [job.latitude, job.longitude])

  // Status display info
  const getStatusInfo = () => {
    switch (jobStatus) {
      case 'confirmed':
        return { text: 'Navigate to Job', color: 'blue', icon: '🚗' }
      case 'in_progress':
        return { text: 'Job In Progress', color: 'emerald', icon: '🔧' }
      default:
        return { text: 'Active Job', color: 'gray', icon: '📍' }
    }
  }

  const statusInfo = getStatusInfo()

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Map Section - Full screen */}
      <div className="flex-1 relative">
        <FindProMapbox
          ref={mapRef}
          items={mapItems}
          radiusMiles={10}
          searchCenter={contractorLocation || undefined}
          fullscreen={true}
          hideSearchButton={true}
          hideControls={true}
        />

        {/* Back Button */}
        <button
          onClick={onBack}
          className="absolute top-4 left-4 w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center z-10 active:scale-95 transition-transform"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
        >
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Status Badge - Top center */}
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
        >
          <div className={`bg-${statusInfo.color}-600 rounded-full px-5 py-2.5 shadow-lg flex items-center gap-2`}
               style={{ background: jobStatus === 'confirmed' ? '#2563eb' : '#059669' }}>
            <span className="text-lg">{statusInfo.icon}</span>
            <span className="text-white font-bold text-[16px]">
              {jobStatus === 'confirmed' && eta ? `${eta} min away` : statusInfo.text}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Card - Job Info */}
      <div
        className="bg-white rounded-t-3xl shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-4 pb-4">
          {/* Job Title */}
          <div className="mb-4">
            <h2 className="text-[20px] font-bold text-gray-900">{job.title}</h2>
            {job.homeowner_name && (
              <p className="text-[14px] text-gray-500 mt-1">for {job.homeowner_name}</p>
            )}
          </div>

          {/* Address */}
          {job.address && (
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-1">Destination</p>
              <p className="text-gray-900 font-semibold text-[15px]">{job.address}</p>
            </div>
          )}

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-1">ETA</p>
              <p className="text-blue-700 font-bold text-[20px]">
                {jobStatus === 'in_progress' ? '—' : eta ? `${eta}m` : '...'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-1">Distance</p>
              <p className="text-gray-700 font-bold text-[20px]">
                {jobStatus === 'in_progress' ? '—' : distance || '...'}
              </p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 text-center">
              <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-1">Earnings</p>
              <p className="text-emerald-700 font-bold text-[20px]">
                ${job.final_cost?.toFixed(0) || '—'}
              </p>
            </div>
          </div>

          {/* Action Buttons based on status */}
          {jobStatus === 'confirmed' && (
            <button
              onClick={handleConfirmArrival}
              disabled={submitting}
              className="w-full py-4 rounded-xl font-bold text-[16px] text-white active:scale-98 transition-transform disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
            >
              {submitting ? 'Confirming...' : 'Confirm Arrival'}
            </button>
          )}

          {jobStatus === 'in_progress' && !contractorConfirmed && completionStep === 'none' && (
            <button
              onClick={() => setCompletionStep('price_review')}
              className="w-full py-4 rounded-xl font-bold text-[16px] text-white active:scale-98 transition-transform"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              Close Job - Work Complete
            </button>
          )}

          {completionStep === 'waiting' && (
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-amber-700 font-semibold">Waiting for homeowner</p>
              </div>
              <p className="text-amber-600 text-[13px]">The homeowner needs to confirm completion before payment is released.</p>
            </div>
          )}
        </div>
      </div>

      {/* Price Review Step */}
      {completionStep === 'price_review' && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setCompletionStep('none')} />
          <div
            className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl z-[60] max-h-[85vh] overflow-y-auto"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="px-5 pb-6">
              <h3 className="text-[22px] font-bold text-gray-900 mb-1">Review Final Price</h3>
              <p className="text-gray-500 text-[14px] mb-6">
                Confirm or adjust the final price before completing this job.
              </p>

              {/* Original Price */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <p className="text-gray-500 text-[12px] uppercase tracking-wide mb-1">Original Price</p>
                <p className="text-gray-900 font-bold text-[24px]">${(job.final_cost || 0).toFixed(2)}</p>
              </div>

              {/* Final Price Input */}
              <div className="mb-4">
                <label className="text-gray-700 text-[14px] font-medium mb-2 block">Final Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-[18px] font-semibold">$</span>
                  <input
                    type="number"
                    value={finalPrice}
                    onChange={(e) => setFinalPrice(e.target.value)}
                    className="w-full pl-9 pr-4 py-4 rounded-xl border-2 border-gray-200 text-[18px] font-semibold text-gray-900 focus:border-blue-500 focus:outline-none"
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </div>
              </div>

              {/* Reason — only show if price changed */}
              {parseFloat(finalPrice) !== (job.final_cost || 0) && (
                <div className="mb-6">
                  <label className="text-gray-700 text-[14px] font-medium mb-2 block">
                    Reason for price change <span className="text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    value={priceReason}
                    onChange={(e) => setPriceReason(e.target.value)}
                    className="w-full p-4 rounded-xl border-2 border-gray-200 text-[15px] text-gray-900 focus:border-blue-500 focus:outline-none resize-none"
                    rows={3}
                    placeholder="e.g., Additional work required, materials cost..."
                  />
                </div>
              )}

              {/* Earnings Preview */}
              <div className="bg-emerald-50 rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 text-[14px]">Job Price</span>
                  <span className="text-gray-900 font-semibold">${(parseFloat(finalPrice) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 text-[14px]">Platform Fee (10%)</span>
                  <span className="text-red-500 font-semibold">-${((parseFloat(finalPrice) || 0) * 0.10).toFixed(2)}</span>
                </div>
                <div className="border-t border-emerald-200 my-2" />
                <div className="flex justify-between items-center">
                  <span className="text-emerald-800 font-bold text-[16px]">Your Earnings</span>
                  <span className="text-emerald-700 font-bold text-[20px]">${((parseFloat(finalPrice) || 0) * 0.90).toFixed(2)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setCompletionStep('none')}
                  className="flex-1 py-4 rounded-xl font-semibold text-gray-700 bg-gray-100 active:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProposeFinalPrice}
                  disabled={submitting || !finalPrice || parseFloat(finalPrice) <= 0}
                  className="flex-1 py-4 rounded-xl font-bold text-white disabled:opacity-50 active:opacity-80"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  {submitting ? 'Submitting...' : 'Submit & Complete'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Success Screen */}
      {completionStep === 'success' && (
        <div className="fixed inset-0 bg-white z-[70] flex flex-col items-center justify-center px-6">
          {/* Checkmark Circle */}
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center mb-6"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
          >
            <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-[28px] font-bold text-gray-900 mb-2 text-center">Job Complete!</h2>
          <p className="text-gray-500 text-[16px] text-center mb-8">Payment has been released to your account.</p>

          {/* Earnings Card */}
          <div className="w-full max-w-sm bg-emerald-50 rounded-2xl p-5 mb-8">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-600 text-[14px]">Job Price</span>
              <span className="text-gray-900 font-semibold">${(parseFloat(finalPrice) || job.final_cost || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-600 text-[14px]">Platform Fee (10%)</span>
              <span className="text-red-500 font-semibold">-${((parseFloat(finalPrice) || job.final_cost || 0) * 0.10).toFixed(2)}</span>
            </div>
            <div className="border-t border-emerald-200 my-3" />
            <div className="flex justify-between items-center">
              <span className="text-emerald-800 font-bold text-[18px]">You Earned</span>
              <span className="text-emerald-700 font-bold text-[26px]">${earnedAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Job Summary */}
          <div className="w-full max-w-sm bg-gray-50 rounded-xl p-4 mb-10">
            <p className="text-gray-500 text-[12px] uppercase tracking-wide mb-1">Job</p>
            <p className="text-gray-900 font-semibold text-[16px]">{job.title}</p>
            {job.homeowner_name && (
              <p className="text-gray-500 text-[13px] mt-1">for {job.homeowner_name}</p>
            )}
          </div>

          {/* Back to Home Button */}
          <button
            onClick={onJobComplete}
            className="w-full max-w-sm py-4 rounded-xl font-bold text-[16px] text-white active:opacity-80 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
          >
            Back to Home
          </button>
        </div>
      )}
    </div>
  )
}

// Verification Banner Component for iOS
interface VerificationBannerProps {
  contractorProfile: ContractorProfile
  stripeConnectStatus: { hasAccount: boolean; payoutsEnabled: boolean; chargesEnabled: boolean } | null
  loadingStripe: boolean
  onCompleteStripe: () => void
  onStartVerification: () => void
}

function VerificationBanner({ contractorProfile, stripeConnectStatus, loadingStripe, onCompleteStripe, onStartVerification }: VerificationBannerProps) {
  const kycStatus = contractorProfile.kyc_status
  const status = contractorProfile.status

  // 1. KYC Not Started - Need to complete verification
  if (kycStatus === 'not_started' || !kycStatus) {
    return (
      <div className="mx-4 mb-4 p-4 bg-blue-50 rounded-2xl border border-blue-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-[16px] font-semibold text-blue-900">Complete Verification</h3>
            <p className="text-[13px] text-blue-700 mt-1">
              Complete identity verification to start accepting jobs.
            </p>
            <button
              onClick={onStartVerification}
              className="mt-3 px-4 py-2 bg-blue-600 text-white text-[14px] font-medium rounded-xl active:scale-[0.98] transition-transform"
            >
              Start Verification
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 2. KYC In Progress / Pending Approval
  if (kycStatus === 'in_progress' || status === 'pending' || status === 'pending_approval') {
    return (
      <div className="mx-4 mb-4 p-4 bg-amber-50 rounded-2xl border border-amber-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-[16px] font-semibold text-amber-900">Pending Approval</h3>
            <p className="text-[13px] text-amber-700 mt-1">
              Your verification is under review. We'll notify you once approved (1-2 business days).
            </p>
          </div>
        </div>
      </div>
    )
  }

  // 3. KYC Completed but Stripe not set up
  if (kycStatus === 'completed' && status === 'approved' && !loadingStripe && !stripeConnectStatus?.payoutsEnabled) {
    return (
      <div className="mx-4 mb-4 p-4 bg-amber-50 rounded-2xl border border-amber-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-[16px] font-semibold text-amber-900">Payment Setup Required</h3>
            <p className="text-[13px] text-amber-700 mt-1">
              Complete payment setup to receive payments and go online.
            </p>
            <button
              onClick={onCompleteStripe}
              className="mt-3 px-4 py-2 bg-amber-600 text-white text-[14px] font-medium rounded-xl active:scale-[0.98] transition-transform"
            >
              Complete Setup
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 4. Fully Verified - No banner needed, contractor can use the app normally
  // The banner disappears once verified so they can focus on jobs
  return null
}

// Job interface
interface Job {
  id: string
  title: string
  description: string
  category: string
  address: string
  city: string
  state: string
  zip_code: string
  priority: string
  status: string
  created_at: string
  homeowner_id: string
  budget_min?: number
  budget_max?: number
  latitude?: number
  longitude?: number
}

// Bid interface
interface Bid {
  id: string
  job_id: string
  contractor_id: string
  bid_amount: number
  message?: string
  status: string
  created_at: string
  homeowner_jobs?: Job
}

// ============= HOME TAB =============
function HomeTab({
  contractorProfile,
  jobs,
  jobsLoading,
  myBids,
  stats,
  onBidJob,
  onViewJob,
  directOffers,
  onViewOffer,
  stripeConnectStatus,
  loadingStripe,
  onCompleteStripe,
  onStartVerification
}: {
  contractorProfile: ContractorProfile
  jobs: Job[]
  jobsLoading: boolean
  myBids: Bid[]
  stats: any
  onBidJob: (job: Job) => void
  onViewJob: (job: Job) => void
  directOffers: DirectOffer[]
  onViewOffer: (offer: DirectOffer) => void
  stripeConnectStatus: { hasAccount: boolean; payoutsEnabled: boolean; chargesEnabled: boolean } | null
  loadingStripe: boolean
  onCompleteStripe: () => void
  onStartVerification: () => void
}) {
  const mapRef = useRef<FindProMapboxHandle>(null)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [sheetMinimized, setSheetMinimized] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [currentTranslate, setCurrentTranslate] = useState(0)

  // Handle sheet dragging - same as homeowner
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true)
    setStartY(e.touches[0].clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const diff = startY - e.touches[0].clientY
    const maxUp = 200
    const maxDown = 200
    let clampedDiff: number

    if (sheetMinimized) {
      clampedDiff = Math.max(0, Math.min(maxUp, diff))
    } else if (sheetExpanded) {
      clampedDiff = Math.max(-maxDown, Math.min(0, diff))
    } else {
      clampedDiff = Math.max(-maxDown, Math.min(maxUp, diff))
    }
    setCurrentTranslate(clampedDiff)
  }

  const handleTouchEnd = async () => {
    setIsDragging(false)
    const threshold = 60

    if (sheetMinimized) {
      if (currentTranslate > threshold) {
        await triggerHaptic()
        setSheetMinimized(false)
      }
    } else if (sheetExpanded) {
      if (currentTranslate < -threshold) {
        await triggerHaptic()
        setSheetExpanded(false)
      }
    } else {
      if (currentTranslate > threshold) {
        await triggerHaptic()
        setSheetExpanded(true)
      } else if (currentTranslate < -threshold) {
        await triggerHaptic()
        setSheetMinimized(true)
      }
    }
    setCurrentTranslate(0)
  }

  // Get accepted jobs (jobs where contractor's bid was accepted)
  const acceptedJobs = useMemo(() =>
    myBids.filter(b => b.status === 'accepted').map(b => b.homeowner_jobs).filter(Boolean),
    [myBids]
  )

  const pendingBids = useMemo(() =>
    myBids.filter(b => b.status === 'pending'),
    [myBids]
  )

  // Check if contractor is fully verified (KYC completed + approved + Stripe enabled)
  const isFullyVerified = contractorProfile.kyc_status === 'completed' &&
                          contractorProfile.status === 'approved' &&
                          stripeConnectStatus?.payoutsEnabled === true

  // Check if functionality should be disabled
  const isDisabled = !isFullyVerified

  // Build map items from available jobs
  const mapItems = useMemo(() => {
    return jobs
      .filter(j => j.latitude && j.longitude)
      .map(j => ({
        id: j.id,
        name: j.title,
        latitude: j.latitude!,
        longitude: j.longitude!,
        services: [j.category],
      }))
  }, [jobs])

  // Map center: contractor's location or first job
  const mapCenter = useMemo<[number, number]>(() => {
    if (contractorProfile.latitude && contractorProfile.longitude) {
      return [contractorProfile.latitude, contractorProfile.longitude]
    }
    if (jobs.length > 0 && jobs[0].latitude && jobs[0].longitude) {
      return [jobs[0].latitude, jobs[0].longitude]
    }
    return [39.8283, -98.5795] // US center fallback
  }, [contractorProfile.latitude, contractorProfile.longitude, jobs])

  // Sheet height calculation
  let sheetHeight = '45%'
  if (sheetExpanded) sheetHeight = '70%'
  if (sheetMinimized) sheetHeight = '60px'

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Map Background - Real Mapbox with job pins */}
      <div className="absolute inset-0">
        <FindProMapbox
          ref={mapRef}
          items={mapItems}
          radiusMiles={contractorProfile.radius_miles || 25}
          searchCenter={mapCenter}
          fullscreen={true}
          hideSearchButton={true}
          hideControls={true}
        />
      </div>

      {/* Blue Header - matching homeowner green header */}
      <div
        className="relative z-20"
        style={{
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
        }}
      >
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-[13px]">Welcome back,</p>
              <h1 className="text-white text-[20px] font-bold">
                {contractorProfile.name?.split(' ')[0] || 'Pro'}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {/* Availability toggle */}
              <div className="px-3 py-1.5 bg-white/20 rounded-full">
                <span className="text-white text-[13px] font-medium">Online</span>
              </div>
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-white font-bold">
                  {(contractorProfile.name || 'P')[0].toUpperCase()}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Verification Banner - shows different states based on KYC/Stripe status */}
      <VerificationBanner
        contractorProfile={contractorProfile}
        stripeConnectStatus={stripeConnectStatus}
        loadingStripe={loadingStripe}
        onCompleteStripe={onCompleteStripe}
        onStartVerification={onStartVerification}
      />

      {/* Bottom Sheet - matching homeowner structure */}
      <div
        className="absolute left-0 right-0 bg-white z-30"
        style={{
          bottom: 'calc(65px + env(safe-area-inset-bottom, 20px))',
          height: sheetHeight,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
          transform: isDragging ? `translateY(${-currentTranslate}px)` : 'translateY(0)',
          transition: isDragging ? 'none' : 'all 0.3s ease-out'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Sheet Content */}
        <div className={`px-4 overflow-y-auto ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`} style={{ height: 'calc(100% - 20px)' }}>
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-[24px] font-bold text-blue-600">{jobs.length}</p>
              <p className="text-[11px] text-gray-500">Available</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-[24px] font-bold text-amber-600">{pendingBids.length}</p>
              <p className="text-[11px] text-gray-500">Active Bids</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-[24px] font-bold text-green-600">{acceptedJobs.length}</p>
              <p className="text-[11px] text-gray-500">Won</p>
            </div>
          </div>

          {/* Direct Offers Section */}
          {directOffers.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[17px] font-semibold text-gray-900">Direct Offers</h2>
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[12px] font-semibold">{directOffers.length} new</span>
              </div>
              <div className="space-y-3">
                {directOffers.map((offer) => (
                  <IOSCard key={offer.id} className="p-4 border-l-4 border-purple-500">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[11px] font-semibold">DIRECT</span>
                        </div>
                        <h3 className="text-[16px] font-semibold text-gray-900">{offer.title}</h3>
                        <p className="text-[13px] text-gray-500">{offer.category}</p>
                      </div>
                      <p className="text-[18px] font-bold text-green-600">${offer.offered_amount}</p>
                    </div>
                    {offer.homeowner_name && (
                      <p className="text-[13px] text-gray-500 mb-2">From {offer.homeowner_name}</p>
                    )}
                    <p className="text-[13px] text-gray-500 mb-3">{offer.address}, {offer.city}</p>
                    <button
                      onClick={() => onViewOffer(offer)}
                      className="w-full py-2.5 rounded-xl text-[14px] font-semibold text-white active:scale-[0.98] transition-transform"
                      style={{ background: 'linear-gradient(135deg, #9333ea, #7c3aed)' }}
                    >
                      View Offer
                    </button>
                  </IOSCard>
                ))}
              </div>
            </div>
          )}

          {/* Available Jobs Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[17px] font-semibold text-gray-900">Available Jobs</h2>
              <span className="text-blue-600 text-[14px] font-medium">{jobs.length} nearby</span>
            </div>

            {jobsLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingLogo />
              </div>
            ) : jobs.length === 0 ? (
              <IOSCard className="p-6 text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-[14px]">No jobs in your area right now</p>
                <p className="text-gray-400 text-[12px] mt-1">Check back later for new opportunities</p>
              </IOSCard>
            ) : (
              <div className="space-y-3">
                {jobs.slice(0, 5).map((job) => (
                  <JobCard key={job.id} job={job} onBid={onBidJob} onView={onViewJob} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Job Card Component
function JobCard({ job, onBid, onView }: { job: Job; onBid: (job: Job) => void; onView: (job: Job) => void }) {

  const timeAgo = useMemo(() => {
    const now = new Date()
    const created = new Date(job.created_at)
    const diff = Math.floor((now.getTime() - created.getTime()) / 1000 / 60)
    if (diff < 60) return `${diff}m ago`
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
    return `${Math.floor(diff / 1440)}d ago`
  }, [job.created_at])

  const priorityColors: Record<string, string> = {
    emergency: 'bg-red-100 text-red-700',
    urgent: 'bg-orange-100 text-orange-700',
    normal: 'bg-gray-100 text-gray-700'
  }

  return (
    <IOSCard className="p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${priorityColors[job.priority] || priorityColors.normal}`}>
              {job.priority?.toUpperCase() || 'NORMAL'}
            </span>
            <span className="text-gray-400 text-[12px]">{timeAgo}</span>
          </div>
          <h3 className="text-[16px] font-semibold text-gray-900">{job.title}</h3>
          <p className="text-[13px] text-gray-500">{job.category}</p>
        </div>
      </div>

      <p className="text-[14px] text-gray-600 mb-3 line-clamp-2">{job.description}</p>

      <div className="flex items-center gap-2 text-[13px] text-gray-500 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span>{job.city}, {job.state} {job.zip_code}</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onView(job)}
          className="flex-1 py-2.5 rounded-xl text-[14px] font-medium bg-gray-100 text-gray-700 active:bg-gray-200 transition-colors"
        >
          View Details
        </button>
        <button
          onClick={() => onBid(job)}
          className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-white active:scale-[0.98] transition-transform"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
        >
          Place Bid
        </button>
      </div>
    </IOSCard>
  )
}

// ============= JOBS TAB =============
function JobsTab({ jobs, loading, onBidJob, onViewJob }: { jobs: Job[]; loading: boolean; onBidJob: (job: Job) => void; onViewJob: (job: Job) => void }) {
  return (
    <div
      className="absolute inset-0 flex flex-col bg-gray-50"
      style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
    >
      {/* Blue Header */}
      <div
        className="relative z-20"
        style={{
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
        }}
      >
        <div className="px-4 pb-4">
          <h1 className="text-white text-[20px] font-bold">Find Jobs</h1>
          <p className="text-blue-100 text-[14px]">{jobs.length} jobs in your area</p>
        </div>
      </div>

      {/* Job List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingLogo />
          </div>
        ) : jobs.length === 0 ? (
          <IOSCard className="p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-[16px] font-semibold text-gray-900 mb-1">No jobs available</h3>
            <p className="text-[14px] text-gray-500">Check back later for new opportunities</p>
          </IOSCard>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onBid={onBidJob} onView={onViewJob} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============= MESSAGES TAB =============
function MessagesTab({ conversations, loading }: { conversations: any[]; loading: boolean }) {
  return (
    <div
      className="absolute inset-0 flex flex-col bg-gray-50"
      style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
    >
      {/* Blue Header */}
      <div
        className="relative z-20"
        style={{
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
        }}
      >
        <div className="px-4 pb-4">
          <h1 className="text-white text-[20px] font-bold">Messages</h1>
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingLogo />
          </div>
        ) : conversations.length === 0 ? (
          <IOSCard className="p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-[16px] font-semibold text-gray-900 mb-1">No messages yet</h3>
            <p className="text-[14px] text-gray-500">Messages from homeowners will appear here</p>
          </IOSCard>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <Link key={conv.id} href={`/messages/${conv.id}`}>
                <IOSCard className="p-4 active:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-semibold">
                        {(conv.other_user_name || 'H')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-gray-900 truncate">
                        {conv.other_user_name || 'Homeowner'}
                      </p>
                      <p className="text-[13px] text-gray-500 truncate">{conv.last_message}</p>
                    </div>
                    {conv.unread_count > 0 && (
                      <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-[11px] font-bold">{conv.unread_count}</span>
                      </div>
                    )}
                  </div>
                </IOSCard>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============= EARNINGS TAB =============
function EarningsTab({ myBids, stats }: { myBids: Bid[]; stats: any }) {
  const wonBids = useMemo(() => myBids.filter(b => b.status === 'accepted'), [myBids])
  const pendingBids = useMemo(() => myBids.filter(b => b.status === 'pending'), [myBids])

  return (
    <div
      className="absolute inset-0 flex flex-col bg-gray-50"
      style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
    >
      {/* Blue Header */}
      <div
        className="relative z-20"
        style={{
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
        }}
      >
        <div className="px-4 pb-4">
          <h1 className="text-white text-[20px] font-bold">Earnings</h1>
          <div className="mt-4 p-4 bg-white/20 rounded-xl">
            <p className="text-blue-100 text-[13px]">Total Earnings</p>
            <p className="text-white text-[32px] font-bold">${stats?.earnings?.toFixed(2) || '0.00'}</p>
          </div>
        </div>
      </div>

      {/* Earnings Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <IOSCard className="p-4 text-center">
            <p className="text-[28px] font-bold text-green-600">{wonBids.length}</p>
            <p className="text-[12px] text-gray-500">Jobs Won</p>
          </IOSCard>
          <IOSCard className="p-4 text-center">
            <p className="text-[28px] font-bold text-blue-600">{pendingBids.length}</p>
            <p className="text-[12px] text-gray-500">Active Bids</p>
          </IOSCard>
        </div>

        {/* My Bids Section */}
        <h3 className="text-[15px] font-semibold text-gray-900 mb-3">My Bids</h3>
        {myBids.length === 0 ? (
          <IOSCard className="p-6 text-center">
            <p className="text-gray-500 text-[14px]">No bids yet</p>
          </IOSCard>
        ) : (
          <div className="space-y-2">
            {myBids.slice(0, 10).map((bid) => (
              <IOSCard key={bid.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[14px] font-medium text-gray-900">
                      {bid.homeowner_jobs?.title || 'Job'}
                    </p>
                    <p className="text-[12px] text-gray-500">
                      ${bid.bid_amount}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-[11px] font-medium ${
                    bid.status === 'accepted' ? 'bg-green-100 text-green-700' :
                    bid.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {bid.status}
                  </span>
                </div>
              </IOSCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============= PROFILE TAB =============
function ProfileTab({
  contractorProfile,
  user,
  stats,
  onSignOut,
  onSwitchToHomeowner,
  onOpenSubView
}: {
  contractorProfile: ContractorProfile
  user: any
  stats: any
  onSignOut: () => void
  onSwitchToHomeowner?: () => void
  onOpenSubView: (view: string) => void
}) {
  const handleSignOut = async () => {
    await triggerHaptic(ImpactStyle.Medium)
    onSignOut()
  }

  return (
    <div
      className="absolute inset-0 flex flex-col bg-gray-50"
      style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
    >
      {/* Blue Header with Profile Info */}
      <div
        className="relative z-20"
        style={{
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
        }}
      >
        <div className="px-4 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-2xl">
                {(contractorProfile.name || 'P')[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <h1 className="text-white text-[20px] font-bold">{contractorProfile.name}</h1>
              <p className="text-blue-100 text-[14px]">{contractorProfile.business_name}</p>
              <div className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                contractorProfile.status === 'approved' ? 'bg-green-400/30 text-white' : 'bg-amber-400/30 text-white'
              }`}>
                {contractorProfile.status === 'approved' ? 'Verified Pro' : 'Pending Approval'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <IOSCard className="p-3 text-center">
            <p className="text-[20px] font-bold text-gray-900">{stats?.completed_jobs || 0}</p>
            <p className="text-[11px] text-gray-500">Completed</p>
          </IOSCard>
          <IOSCard className="p-3 text-center">
            <p className="text-[20px] font-bold text-gray-900">{stats?.rating || '5.0'}</p>
            <p className="text-[11px] text-gray-500">Rating</p>
          </IOSCard>
          <IOSCard className="p-3 text-center">
            <p className="text-[20px] font-bold text-gray-900">{stats?.response_time || '<1h'}</p>
            <p className="text-[11px] text-gray-500">Response</p>
          </IOSCard>
        </div>

        {/* Menu Items */}
        <IOSCard>
          <ListItem
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            title="Settings"
            subtitle="Profile, service area, rates"
            onClick={() => onOpenSubView('settings')}
          />
          <Divider />
          <ListItem
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>}
            title="Billing"
            subtitle="Payment history, payouts"
            onClick={() => onOpenSubView('billing')}
          />
          <Divider />
          <ListItem
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            title="Help & Support"
            onClick={() => onOpenSubView('help')}
          />
        </IOSCard>

        {/* Sign Out */}
        <IOSCard>
          <ListItem
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>}
            title="Sign Out"
            danger
            showChevron={false}
            onClick={handleSignOut}
          />
        </IOSCard>

        {/* Switch to Homeowner */}
        {onSwitchToHomeowner && (
          <button
            onClick={onSwitchToHomeowner}
            className="w-full text-center text-gray-500 text-[14px] py-4"
          >
            Switch to Homeowner Mode
          </button>
        )}
      </div>
    </div>
  )
}

// ============= NATIVE SUB-VIEW WRAPPER =============
function NativeSubView({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
      {/* Blue Header with back button */}
      <div
        style={{
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
        }}
      >
        <div className="px-4 pb-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-white text-[20px] font-bold">{title}</h1>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
        {children}
      </div>
    </div>
  )
}

// ============= SETTINGS SUB-VIEW =============
function SettingsSubView({ contractorProfile, onBack }: { contractorProfile: ContractorProfile; onBack: () => void }) {
  return (
    <NativeSubView title="Settings" onBack={onBack}>
      <div className="p-4 space-y-4">
        {/* Profile Info */}
        <IOSCard>
          <div className="p-4">
            <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Profile</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-gray-500 text-[14px]">Name</span><span className="text-gray-900 text-[14px] font-medium">{contractorProfile.name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 text-[14px]">Business</span><span className="text-gray-900 text-[14px] font-medium">{contractorProfile.business_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 text-[14px]">Phone</span><span className="text-gray-900 text-[14px] font-medium">{contractorProfile.phone || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 text-[14px]">Email</span><span className="text-gray-900 text-[14px] font-medium">{contractorProfile.email}</span></div>
            </div>
          </div>
        </IOSCard>

        {/* Service Area */}
        <IOSCard>
          <div className="p-4">
            <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Service Area</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-gray-500 text-[14px]">Base ZIP</span><span className="text-gray-900 text-[14px] font-medium">{contractorProfile.base_zip || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 text-[14px]">Radius</span><span className="text-gray-900 text-[14px] font-medium">{contractorProfile.radius_miles || contractorProfile.service_radius_miles || 25} miles</span></div>
              {contractorProfile.categories && contractorProfile.categories.length > 0 && (
                <div>
                  <p className="text-gray-500 text-[14px] mb-2">Categories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {contractorProfile.categories.map((cat: string) => (
                      <span key={cat} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-[12px] font-medium">{cat}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </IOSCard>

        {/* Credentials */}
        <IOSCard>
          <div className="p-4">
            <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Credentials</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-gray-500 text-[14px]">License</span><span className="text-gray-900 text-[14px] font-medium">{contractorProfile.license_number || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 text-[14px]">State</span><span className="text-gray-900 text-[14px] font-medium">{contractorProfile.license_state || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 text-[14px]">Insurance</span><span className="text-gray-900 text-[14px] font-medium">{contractorProfile.insurance_carrier || '—'}</span></div>
            </div>
          </div>
        </IOSCard>
      </div>
    </NativeSubView>
  )
}

// ============= BILLING SUB-VIEW =============
function BillingSubView({ stats, onBack }: { stats: any; onBack: () => void }) {
  return (
    <NativeSubView title="Billing" onBack={onBack}>
      <div className="p-4 space-y-4">
        {/* Earnings Summary */}
        <IOSCard>
          <div className="p-4">
            <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Earnings Summary</h3>
            <div className="text-center py-4">
              <p className="text-[36px] font-bold text-green-600">${stats?.earnings?.toFixed(2) || '0.00'}</p>
              <p className="text-gray-500 text-[14px] mt-1">Total Earnings</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[20px] font-bold text-gray-900">{stats?.completed_jobs || 0}</p>
                <p className="text-[11px] text-gray-500">Jobs Completed</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[20px] font-bold text-gray-900">{stats?.rating || '5.0'}</p>
                <p className="text-[11px] text-gray-500">Rating</p>
              </div>
            </div>
          </div>
        </IOSCard>

        <IOSCard>
          <div className="p-4 text-center">
            <p className="text-gray-500 text-[14px]">Payouts are processed through Stripe Connect. Check your Stripe dashboard for detailed transaction history.</p>
          </div>
        </IOSCard>
      </div>
    </NativeSubView>
  )
}

// ============= HELP SUB-VIEW =============
function HelpSubView({ onBack }: { onBack: () => void }) {
  return (
    <NativeSubView title="Help & Support" onBack={onBack}>
      <div className="p-4 space-y-4">
        <IOSCard>
          <div className="p-4">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-3">How It Works</h3>
            <div className="space-y-3 text-[14px] text-gray-600 leading-relaxed">
              <p>1. Browse available jobs in your service area</p>
              <p>2. Place competitive bids on jobs you want</p>
              <p>3. Get selected by homeowners and start working</p>
              <p>4. Complete the job and get paid through Stripe</p>
            </div>
          </div>
        </IOSCard>

        <IOSCard>
          <div className="p-4">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-3">Direct Offers</h3>
            <p className="text-[14px] text-gray-600 leading-relaxed">
              Homeowners can send you direct job offers. You can accept, decline, or counter-bid with different terms. Once agreed, the job starts and you navigate to the location.
            </p>
          </div>
        </IOSCard>

        <IOSCard>
          <div className="p-4">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-3">Contact Support</h3>
            <p className="text-[14px] text-gray-600">Email: support@userushr.com</p>
          </div>
        </IOSCard>
      </div>
    </NativeSubView>
  )
}

// ============= DIRECT OFFER INTERFACE =============
interface DirectOffer {
  id: string
  homeowner_id: string
  contractor_id: string
  title: string
  description: string
  category: string
  priority: string
  offered_amount: number
  estimated_duration_hours: number
  address: string
  city: string
  state: string
  zip: string
  latitude?: number
  longitude?: number
  status: string
  contractor_response: string
  counter_bid_amount?: number
  counter_bid_message?: string
  created_at: string
  homeowner_name?: string
}

// ============= DIRECT OFFER DETAIL MODAL =============
function DirectOfferModal({
  offer,
  onClose,
  onRespond
}: {
  offer: DirectOffer | null
  onClose: () => void
  onRespond: (offerId: string, action: 'accepted' | 'rejected' | 'counter_bid', counterAmount?: number, counterMessage?: string) => Promise<void>
}) {
  const [action, setAction] = useState<'view' | 'counter'>('view')
  const [counterAmount, setCounterAmount] = useState('')
  const [counterMessage, setCounterMessage] = useState('')
  const [loading, setLoading] = useState(false)

  if (!offer) return null

  const handleRespond = async (responseAction: 'accepted' | 'rejected' | 'counter_bid') => {
    setLoading(true)
    try {
      await onRespond(
        offer.id,
        responseAction,
        responseAction === 'counter_bid' ? parseFloat(counterAmount) : undefined,
        responseAction === 'counter_bid' ? counterMessage : undefined
      )
      await triggerNotification(NotificationType.Success)
      onClose()
    } catch (err: any) {
      showGlobalToast(err.message || 'Failed to respond', 'error')
      await triggerNotification(NotificationType.Error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[90vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 16px)' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-6 pb-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg text-[12px] font-semibold">DIRECT OFFER</span>
              </div>
              <h2 className="text-[22px] font-bold text-gray-900">{offer.title}</h2>
              <p className="text-blue-600 text-[15px] font-medium mt-1">{offer.category}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Offered Amount */}
          <div className="bg-green-50 rounded-xl p-4 mb-4">
            <p className="text-green-700 text-[13px] font-medium">Offered Amount</p>
            <p className="text-green-800 text-[28px] font-bold">${offer.offered_amount}</p>
            {offer.estimated_duration_hours > 0 && (
              <p className="text-green-600 text-[13px]">Est. {offer.estimated_duration_hours}h duration</p>
            )}
          </div>

          {/* Description */}
          <div className="mb-4">
            <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</h3>
            <p className="text-[15px] text-gray-700 leading-relaxed">{offer.description}</p>
          </div>

          {/* Location */}
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div>
                <p className="text-[15px] font-semibold text-gray-900">{offer.address}</p>
                <p className="text-[13px] text-gray-500">{offer.city}, {offer.state} {offer.zip}</p>
              </div>
            </div>
          </div>

          {/* From Homeowner */}
          {offer.homeowner_name && (
            <div className="bg-blue-50 rounded-xl p-4 mb-6">
              <p className="text-blue-600 text-[13px] font-medium">From</p>
              <p className="text-blue-900 text-[16px] font-semibold">{offer.homeowner_name}</p>
            </div>
          )}

          {/* Counter Bid Form */}
          {action === 'counter' ? (
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-gray-600 text-[13px] font-medium mb-2">Your Counter Amount ($)</label>
                <input
                  type="number"
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  placeholder="Enter amount"
                  inputMode="decimal"
                  className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-600 text-[13px] font-medium mb-2">Message (optional)</label>
                <textarea
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                  placeholder="Explain your counter offer..."
                  rows={2}
                  className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAction('view')} className="flex-1 py-3.5 rounded-xl font-medium text-gray-700 bg-gray-100">
                  Back
                </button>
                <button
                  onClick={() => handleRespond('counter_bid')}
                  disabled={loading || !counterAmount}
                  className="flex-1 py-3.5 rounded-xl font-semibold text-white bg-purple-600 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Counter'}
                </button>
              </div>
            </div>
          ) : (
            /* Action Buttons */
            <div className="space-y-3">
              <button
                onClick={() => handleRespond('accepted')}
                disabled={loading}
                className="w-full py-4 rounded-xl font-bold text-[16px] text-white active:scale-[0.98] transition-transform disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                {loading ? 'Accepting...' : `Accept Offer - $${offer.offered_amount}`}
              </button>
              <button
                onClick={() => setAction('counter')}
                className="w-full py-4 rounded-xl font-bold text-[16px] text-purple-700 bg-purple-50 active:bg-purple-100 transition-colors"
              >
                Counter Bid
              </button>
              <button
                onClick={() => handleRespond('rejected')}
                disabled={loading}
                className="w-full py-3 rounded-xl font-medium text-[14px] text-red-600 active:bg-red-50 transition-colors disabled:opacity-50"
              >
                {loading ? 'Declining...' : 'Decline Offer'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ============= JOB DETAIL MODAL =============
function JobDetailModal({
  job,
  onClose,
  onBid
}: {
  job: Job | null
  onClose: () => void
  onBid: (job: Job) => void
}) {
  if (!job) return null

  const timeAgo = (() => {
    const now = new Date()
    const created = new Date(job.created_at)
    const diff = Math.floor((now.getTime() - created.getTime()) / 1000 / 60)
    if (diff < 60) return `${diff}m ago`
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
    return `${Math.floor(diff / 1440)}d ago`
  })()

  const priorityColors: Record<string, { bg: string; text: string }> = {
    emergency: { bg: 'bg-red-100', text: 'text-red-700' },
    urgent: { bg: 'bg-orange-100', text: 'text-orange-700' },
    normal: { bg: 'bg-gray-100', text: 'text-gray-700' }
  }
  const priority = priorityColors[job.priority] || priorityColors.normal

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 16px)' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-6 pb-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold ${priority.bg} ${priority.text}`}>
                  {job.priority?.toUpperCase() || 'NORMAL'}
                </span>
                <span className="text-gray-400 text-[13px]">{timeAgo}</span>
              </div>
              <h2 className="text-[22px] font-bold text-gray-900">{job.title}</h2>
              <p className="text-blue-600 text-[15px] font-medium mt-1">{job.category}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Description */}
          <div className="mb-4">
            <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</h3>
            <p className="text-[15px] text-gray-700 leading-relaxed">{job.description}</p>
          </div>

          {/* Location */}
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div>
                <p className="text-[15px] font-semibold text-gray-900">{job.address}</p>
                <p className="text-[13px] text-gray-500">{job.city}, {job.state} {job.zip_code}</p>
              </div>
            </div>
          </div>

          {/* Budget */}
          {(job.budget_min || job.budget_max) && (
            <div className="bg-green-50 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-[13px] text-green-700 font-medium">Budget Range</p>
                  <p className="text-[18px] font-bold text-green-800">
                    ${job.budget_min || 0} - ${job.budget_max || '?'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={() => {
              onClose()
              onBid(job)
            }}
            className="w-full py-4 rounded-xl font-bold text-[16px] text-white active:scale-[0.98] transition-transform"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
          >
            Place Bid
          </button>
        </div>
      </div>
    </>
  )
}

// ============= BID MODAL =============
function BidModal({
  job,
  onClose,
  onSubmit
}: {
  job: Job | null
  onClose: () => void
  onSubmit: (jobId: string, amount: number, message: string) => Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!job) return null

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid bid amount')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await onSubmit(job.id, parseFloat(amount), message)
      await triggerNotification(NotificationType.Success)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to submit bid')
      await triggerNotification(NotificationType.Error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 16px)' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-6 pb-4">
          <h2 className="text-[20px] font-bold text-gray-900 mb-2">Place Your Bid</h2>
          <p className="text-[14px] text-gray-500 mb-6">{job.title}</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 rounded-xl">
              <p className="text-red-600 text-[13px]">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-gray-600 text-[13px] font-medium mb-2">Bid Amount ($) *</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter your bid"
                inputMode="decimal"
                className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-gray-600 text-[13px] font-medium mb-2">Message (Optional)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Introduce yourself..."
                rows={3}
                className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 py-4 rounded-xl font-medium text-[16px] bg-gray-100 text-gray-700 active:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-4 rounded-xl font-semibold text-[16px] text-white active:scale-[0.98] transition-transform disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
            >
              {loading ? 'Submitting...' : 'Submit Bid'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ============= MAIN VIEW =============
interface Props {
  onSwitchToHomeowner?: () => void
}

export default function IOSContractorHomeView({ onSwitchToHomeowner }: Props) {
  const router = useRouter()
  const { user, contractorProfile, loading: authLoading, signOut, refreshProfile } = useProAuth()

  const [activeTab, setActiveTab] = useState<ContractorTabId>('home')
  const [jobs, setJobs] = useState<Job[]>([])
  const [myBids, setMyBids] = useState<Bid[]>([])
  const [conversations, setConversations] = useState<any[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [showBidModal, setShowBidModal] = useState(false)
  const [showJobDetail, setShowJobDetail] = useState(false)
  const [selectedDetailJob, setSelectedDetailJob] = useState<Job | null>(null)
  const [directOffers, setDirectOffers] = useState<DirectOffer[]>([])
  const [selectedOffer, setSelectedOffer] = useState<DirectOffer | null>(null)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [subView, setSubView] = useState<string | null>(null)
  const [stats, setStats] = useState({
    earnings: 0,
    completed_jobs: 0,
    rating: '5.0',
    response_time: '<1h'
  })
  const [stripeConnectStatus, setStripeConnectStatus] = useState<{
    hasAccount: boolean
    payoutsEnabled: boolean
    chargesEnabled: boolean
  } | null>(null)
  const [loadingStripe, setLoadingStripe] = useState(true)
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null)
  const [showJobTracking, setShowJobTracking] = useState(false)

  // Fetch active job (accepted bid OR directly assigned contractor_id)
  const fetchActiveJob = useCallback(async () => {
    if (!user) return

    try {
      // 1. Check via accepted bids
      const { data: acceptedBids, error: bidError } = await supabase
        .from('job_bids')
        .select(`
          id,
          job_id,
          bid_amount,
          homeowner_jobs (
            id,
            title,
            status,
            address,
            latitude,
            longitude,
            homeowner_id,
            final_cost
          )
        `)
        .eq('contractor_id', user.id)
        .eq('status', 'accepted')

      if (bidError) {
        console.error('Error fetching accepted bids:', bidError)
      }

      // Find an active job from bids (confirmed or in_progress)
      const activeJobFromBid = acceptedBids?.find(bid => {
        const job = bid.homeowner_jobs as any
        return job && (job.status === 'confirmed' || job.status === 'in_progress')
      })

      if (activeJobFromBid) {
        const jobData = activeJobFromBid.homeowner_jobs as any
        const { data: homeowner } = await supabase
          .from('user_profiles')
          .select('name, phone')
          .eq('id', jobData.homeowner_id)
          .single()

        setActiveJob({
          id: jobData.id,
          title: jobData.title,
          status: jobData.status,
          address: jobData.address,
          latitude: jobData.latitude,
          longitude: jobData.longitude,
          homeowner_id: jobData.homeowner_id,
          homeowner_name: homeowner?.name,
          homeowner_phone: homeowner?.phone,
          final_cost: jobData.final_cost || activeJobFromBid.bid_amount,
          accepted_bid_id: activeJobFromBid.id
        })
        return
      }

      // 2. Fallback: check jobs assigned directly via contractor_id (no bid)
      const { data: directJobs, error: directError } = await supabase
        .from('homeowner_jobs')
        .select('id, title, status, address, latitude, longitude, homeowner_id, final_cost')
        .eq('contractor_id', user.id)
        .in('status', ['confirmed', 'in_progress'])
        .limit(1)
        .single()

      if (!directError && directJobs) {
        const { data: homeowner } = await supabase
          .from('user_profiles')
          .select('name, phone')
          .eq('id', directJobs.homeowner_id)
          .single()

        setActiveJob({
          id: directJobs.id,
          title: directJobs.title,
          status: directJobs.status,
          address: directJobs.address,
          latitude: directJobs.latitude,
          longitude: directJobs.longitude,
          homeowner_id: directJobs.homeowner_id,
          homeowner_name: homeowner?.name,
          homeowner_phone: homeowner?.phone,
          final_cost: directJobs.final_cost
        })
        return
      }

      // No active job found
      setActiveJob(null)
      setShowJobTracking(false)
    } catch (err) {
      console.error('Failed to fetch active job:', err)
    }
  }, [user])

  // Fetch available jobs - use location bounding box when possible, fallback to ZIP
  const fetchJobs = useCallback(async () => {
    if (!contractorProfile) return
    setLoadingJobs(true)
    try {
      const lat = contractorProfile.latitude
      const lng = contractorProfile.longitude
      const radiusMiles = contractorProfile.radius_miles || contractorProfile.service_radius_miles || 25

      let query = supabase
        .from('homeowner_jobs')
        .select('*')
        .in('status', ['pending', 'bidding'])
        .order('created_at', { ascending: false })
        .limit(50)

      if (lat && lng) {
        // Bounding box: ~69 mi/deg lat, ~55 mi/deg lng at mid-latitudes
        const latDelta = radiusMiles / 69
        const lngDelta = radiusMiles / 55
        query = query
          .gte('latitude', lat - latDelta)
          .lte('latitude', lat + latDelta)
          .gte('longitude', lng - lngDelta)
          .lte('longitude', lng + lngDelta)
      } else {
        // Fallback to ZIP-based
        const serviceZips = contractorProfile.service_area_zips || [contractorProfile.base_zip]
        const validZips = serviceZips.filter(Boolean) as string[]
        if (validZips.length > 0) {
          query = query.in('zip_code', validZips)
        }
      }

      const { data, error } = await query
      if (!error) setJobs(data || [])
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    } finally {
      setLoadingJobs(false)
    }
  }, [contractorProfile])

  // Fetch my bids
  const fetchMyBids = useCallback(async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('job_bids')
        .select('*, homeowner_jobs(*)')
        .eq('contractor_id', user.id)
        .order('created_at', { ascending: false })

      if (!error) setMyBids(data || [])
    } catch (err) {
      console.error('Failed to fetch bids:', err)
    }
  }, [user])

  // Fetch conversations for this contractor
  const fetchConversations = useCallback(async () => {
    if (!user) return
    setLoadingConversations(true)
    try {
      // Get conversations where this contractor is a participant
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .order('updated_at', { ascending: false })

      if (!error && data) {
        // Enrich with other user's name and last message
        const enriched = await Promise.all(data.map(async (conv: any) => {
          const otherUserId = conv.participant_1 === user.id ? conv.participant_2 : conv.participant_1
          // Get other user name
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('name')
            .eq('id', otherUserId)
            .single()
          // Get last message
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('content, created_at')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
          // Get unread count
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .neq('sender_id', user.id)
            .eq('is_read', false)

          return {
            ...conv,
            other_user_name: profile?.name || 'Homeowner',
            last_message: lastMsg?.content || 'Start a conversation',
            unread_count: count || 0
          }
        }))
        setConversations(enriched)
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoadingConversations(false)
    }
  }, [user])

  // Fetch direct offers for this contractor
  const fetchDirectOffers = useCallback(async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('direct_offers')
        .select('*')
        .eq('contractor_id', user.id)
        .in('status', ['pending', 'counter_bid'])
        .order('created_at', { ascending: false })

      if (!error && data) {
        // Enrich with homeowner names
        const enriched = await Promise.all(data.map(async (offer: any) => {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('name')
            .eq('id', offer.homeowner_id)
            .single()
          return { ...offer, homeowner_name: profile?.name || 'Homeowner' }
        }))
        setDirectOffers(enriched)
      }
    } catch (err) {
      console.error('Failed to fetch direct offers:', err)
    }
  }, [user])

  // Initial load
  useEffect(() => {
    if (user && contractorProfile) {
      fetchJobs()
      fetchMyBids()
      fetchActiveJob()
      fetchConversations()
      fetchDirectOffers()
    }
  }, [user, contractorProfile, fetchJobs, fetchMyBids, fetchActiveJob, fetchConversations, fetchDirectOffers])

  // Auto-show tracking view when there's an active job
  useEffect(() => {
    if (activeJob && (activeJob.status === 'confirmed' || activeJob.status === 'in_progress')) {
      setShowJobTracking(true)
    }
  }, [activeJob])

  // Configure status bar
  useEffect(() => {
    const configureStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Light })
      } catch (e) {}
    }
    configureStatusBar()
  }, [])

  // Reset to home tab on app launch
  useEffect(() => {
    try {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) setActiveTab('home')
      })
    } catch (e) {}
  }, [])

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
      } else {
        setLoadingStripe(false)
      }
    }

    checkStripeStatus()
  }, [user])

  // Subscribe to contractor profile changes (for admin approval notifications)
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('contractor-profile-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pro_contractors',
          filter: `id=eq.${user.id}`
        },
        async (payload) => {
          console.log('Contractor profile updated:', payload)
          // Refresh the profile to get latest status
          await refreshProfile()

          // Check if status changed to approved
          const newStatus = payload.new?.status
          const oldStatus = payload.old?.status
          if (newStatus === 'approved' && oldStatus !== 'approved') {
            // Show success haptic and toast notification
            await triggerNotification(NotificationType.Success)
            showGlobalToast('Your account has been approved! You can now accept jobs.', 'success', 5000)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, refreshProfile])

  // Subscribe to notifications for this contractor
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('contractor-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          console.log('New notification:', payload)
          // Trigger haptic feedback for new notification
          await triggerNotification(NotificationType.Success)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // Real-time subscription for new jobs (INSERT + UPDATE on homeowner_jobs)
  useEffect(() => {
    if (!user || !contractorProfile) return

    const channel = supabase
      .channel('contractor-new-jobs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'homeowner_jobs'
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            // Re-fetch jobs to pick up new/updated listings
            fetchJobs()
            // If a job was assigned to this contractor, refresh active job
            const newJob = payload.new as any
            if (newJob?.contractor_id === user.id) {
              fetchActiveJob()
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, contractorProfile, fetchJobs, fetchActiveJob])

  // Real-time subscription for messages (new messages refresh conversations list)
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('contractor-messages-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { fetchConversations() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, fetchConversations])

  // Real-time subscription for direct offers
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('contractor-direct-offers-rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'direct_offers',
          filter: `contractor_id=eq.${user.id}`
        },
        (payload) => {
          fetchDirectOffers()
          if (payload.eventType === 'INSERT') {
            triggerNotification(NotificationType.Success)
            showGlobalToast('New direct offer received!', 'success')
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, fetchDirectOffers])

  // Handle Stripe Connect setup
  const handleCompleteStripeSetup = async () => {
    if (!user) return
    try {
      const response = await fetch('/api/stripe/connect/onboarding-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractorId: user.id })
      })

      const data = await response.json()

      if (data.success && data.url) {
        // Open Stripe hosted onboarding in external browser
        window.open(data.url, '_blank')
      } else {
        await triggerNotification(NotificationType.Error)
        console.error('Failed to generate onboarding link')
      }
    } catch (error) {
      console.error('Error generating Stripe link:', error)
      await triggerNotification(NotificationType.Error)
    }
  }

  // Handle bid submission
  const handleSubmitBid = async (jobId: string, amount: number, message: string) => {
    if (!user || !contractorProfile) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('job_bids')
      .insert({
        job_id: jobId,
        contractor_id: user.id,
        bid_amount: amount,
        message: message,
        status: 'pending'
      })

    if (error) throw error

    await supabase
      .from('homeowner_jobs')
      .update({ status: 'bidding' })
      .eq('id', jobId)

    await fetchJobs()
    await fetchMyBids()
  }

  const handleBidJob = (job: Job) => {
    setSelectedJob(job)
    setShowBidModal(true)
  }

  const handleViewJob = (job: Job) => {
    setSelectedDetailJob(job)
    setShowJobDetail(true)
  }

  // Handle direct offer response (accept/reject/counter)
  const handleRespondToOffer = async (offerId: string, action: 'accepted' | 'rejected' | 'counter_bid', counterAmount?: number, counterMessage?: string) => {
    const response = await fetch('/api/direct-offers/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offerId,
        contractorId: user!.id,
        action,
        counter_amount: counterAmount,
        counter_message: counterMessage
      })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Failed to respond')

    await fetchDirectOffers()

    // If accepted, refresh active job (offer may convert to job)
    if (action === 'accepted') {
      showGlobalToast('Offer accepted! Job will start soon.', 'success')
      setTimeout(() => {
        fetchActiveJob()
        fetchJobs()
      }, 1500)
    }
  }

  // Handle KYC verification start (native - update status)
  const handleStartVerification = async () => {
    if (!user) return
    try {
      await supabase
        .from('pro_contractors')
        .update({ kyc_status: 'in_progress' })
        .eq('id', user.id)
      await refreshProfile()
      showGlobalToast('Verification submitted! We\'ll review your profile within 1-2 business days.', 'success', 5000)
    } catch (err) {
      showGlobalToast('Failed to start verification', 'error')
    }
  }

  // Show loading state
  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <LoadingLogo />
      </div>
    )
  }

  // Show registration if not logged in
  if (!user || !contractorProfile) {
    return <IOSContractorRegistration onSwitchToHomeowner={onSwitchToHomeowner} />
  }

  // Handle job completion - refresh data
  const handleJobComplete = () => {
    setShowJobTracking(false)
    setActiveJob(null)
    fetchMyBids()
    fetchActiveJob()
  }

  return (
    <IOSContractorErrorBoundary>
      {/* Active Job Tracking View */}
      {showJobTracking && activeJob && user && (
        <ContractorJobTrackingView
          job={activeJob}
          contractorId={user.id}
          onBack={() => setShowJobTracking(false)}
          onJobComplete={handleJobComplete}
        />
      )}

      <div className="fixed inset-0 bg-gray-50 flex flex-col">
        {/* Active Job Banner - show when tracking is hidden but job is active */}
        {!showJobTracking && activeJob && (
          <button
            onClick={() => setShowJobTracking(true)}
            className="fixed top-0 left-0 right-0 z-40 py-3 px-4 flex items-center justify-between"
            style={{
              background: activeJob.status === 'confirmed' ? '#2563eb' : '#059669',
              paddingTop: 'calc(env(safe-area-inset-top) + 12px)'
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-white font-semibold">
                {activeJob.status === 'confirmed' ? 'Navigate to Job' : 'Job In Progress'}
              </span>
            </div>
            <span className="text-white/80 text-sm">Tap to view</span>
          </button>
        )}

        {/* Tab Content */}
        {activeTab === 'home' && (
          <HomeTab
            contractorProfile={contractorProfile}
            jobs={jobs}
            jobsLoading={loadingJobs}
            myBids={myBids}
            stats={stats}
            onBidJob={handleBidJob}
            onViewJob={handleViewJob}
            directOffers={directOffers}
            onViewOffer={(offer) => {
              setSelectedOffer(offer)
              setShowOfferModal(true)
            }}
            stripeConnectStatus={stripeConnectStatus}
            loadingStripe={loadingStripe}
            onCompleteStripe={handleCompleteStripeSetup}
            onStartVerification={handleStartVerification}
          />
        )}
        {activeTab === 'jobs' && (
          <JobsTab jobs={jobs} loading={loadingJobs} onBidJob={handleBidJob} onViewJob={handleViewJob} />
        )}
        {activeTab === 'messages' && (
          <MessagesTab conversations={conversations} loading={loadingConversations} />
        )}
        {activeTab === 'earnings' && (
          <EarningsTab myBids={myBids} stats={stats} />
        )}
        {activeTab === 'profile' && (
          <ProfileTab
            contractorProfile={contractorProfile}
            user={user}
            stats={stats}
            onSignOut={signOut}
            onSwitchToHomeowner={onSwitchToHomeowner}
            onOpenSubView={setSubView}
          />
        )}

        {/* Bottom Tab Bar */}
        <IOSContractorTabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          unreadMessages={conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)}
          newJobs={jobs.length + directOffers.length}
        />

        {/* Native Sub-Views (Settings, Billing, Help) */}
        {subView === 'settings' && (
          <SettingsSubView contractorProfile={contractorProfile} onBack={() => setSubView(null)} />
        )}
        {subView === 'billing' && (
          <BillingSubView stats={stats} onBack={() => setSubView(null)} />
        )}
        {subView === 'help' && (
          <HelpSubView onBack={() => setSubView(null)} />
        )}

        {/* Job Detail Modal */}
        {showJobDetail && (
          <JobDetailModal
            job={selectedDetailJob}
            onClose={() => {
              setShowJobDetail(false)
              setSelectedDetailJob(null)
            }}
            onBid={handleBidJob}
          />
        )}

        {/* Direct Offer Modal */}
        {showOfferModal && (
          <DirectOfferModal
            offer={selectedOffer}
            onClose={() => {
              setShowOfferModal(false)
              setSelectedOffer(null)
            }}
            onRespond={handleRespondToOffer}
          />
        )}

        {/* Bid Modal */}
        {showBidModal && (
          <BidModal
            job={selectedJob}
            onClose={() => {
              setShowBidModal(false)
              setSelectedJob(null)
            }}
            onSubmit={handleSubmitBid}
          />
        )}
      </div>
    </IOSContractorErrorBoundary>
  )
}
