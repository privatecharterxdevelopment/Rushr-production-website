'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../../../../contexts/AuthContext'
import { supabase } from '../../../../lib/supabaseClient'
import { Capacitor } from '@capacitor/core'
import { showGlobalToast } from '../../../../components/Toast'
import {
  CheckCircle,
  Clock,
  DollarSign,
  Bell,
  ArrowRight,
  Users,
  Star,
  ChevronLeft,
  MessageCircle
} from 'lucide-react'

interface Bid {
  id: string
  contractor_id: string
  bid_amount: number
  message: string
  status: string
  created_at: string
  contractor_name?: string
  contractor_rating?: number
}

interface Job {
  id: string
  job_number?: number
  title: string
  category: string
  status: string
  created_at: string
}

export default function JobSuccessPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<Job | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [secondsWaiting, setSecondsWaiting] = useState(0)
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(true)

  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

  // iOS Native: Show success overlay for 2.5 seconds then redirect to home
  useEffect(() => {
    if (!isNative) return

    const timer = setTimeout(() => {
      setShowSuccessOverlay(false)
      showGlobalToast('Job posted successfully! Waiting for contractor bids...', 'success')
      router.push('/')
    }, 2500)

    return () => clearTimeout(timer)
  }, [isNative, router])

  // Timer for waiting animation
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsWaiting(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch job details
  useEffect(() => {
    async function fetchJob() {
      if (!id) return

      try {
        const isJobNumber = /^\d+$/.test(id)
        const { data, error } = await supabase
          .from('homeowner_jobs')
          .select('*')
          .eq(isJobNumber ? 'job_number' : 'id', id)
          .single()

        if (!error && data) {
          setJob(data)
        }
      } catch (err) {
        console.error('Error fetching job:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchJob()
  }, [id])

  // Subscribe to real-time bids
  useEffect(() => {
    if (!job?.id) return

    // Initial fetch of existing bids
    async function fetchBids() {
      const { data, error } = await supabase
        .from('job_bids')
        .select(`
          *,
          pro_contractors:contractor_id (
            name,
            business_name,
            rating
          )
        `)
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })

      if (!error && data) {
        const enrichedBids = data.map(bid => ({
          ...bid,
          contractor_name: bid.pro_contractors?.business_name || bid.pro_contractors?.name || 'Contractor',
          contractor_rating: bid.pro_contractors?.rating || 4.5
        }))
        setBids(enrichedBids)
      }
    }

    fetchBids()

    // Subscribe to new bids
    const subscription = supabase
      .channel(`job_bids_${job.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_bids',
          filter: `job_id=eq.${job.id}`
        },
        async (payload) => {
          console.log('[SUCCESS] New bid received:', payload)

          // Fetch contractor details
          const { data: contractor } = await supabase
            .from('pro_contractors')
            .select('name, business_name, rating')
            .eq('id', payload.new.contractor_id)
            .single()

          const newBid: Bid = {
            ...payload.new as Bid,
            contractor_name: contractor?.business_name || contractor?.name || 'Contractor',
            contractor_rating: contractor?.rating || 4.5
          }

          setBids(prev => [newBid, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [job?.id])

  // Format time waiting
  const formatWaitTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) {
      return `${mins}m ${secs}s`
    }
    return `${secs}s`
  }

  // iOS Native: Show full-screen success overlay
  if (isNative && showSuccessOverlay) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #10b981 0%, #059669 50%, #047857 100%)' }}
      >
        {/* Success Animation */}
        <div className="relative mb-6">
          <div
            className="absolute inset-0 w-28 h-28 rounded-full"
            style={{
              background: 'rgba(255,255,255,0.2)',
              animation: 'successPing 1s ease-out'
            }}
          />
          <div className="relative w-28 h-28 bg-white rounded-full flex items-center justify-center shadow-2xl">
            <CheckCircle className="w-16 h-16 text-emerald-500" />
          </div>
        </div>

        <h1 className="text-white text-2xl font-bold text-center px-6 mb-2">
          Job Posted Successfully!
        </h1>
        <p className="text-white/80 text-center px-8 mb-6">
          Contractors in your area are being notified
        </p>

        {/* Loading dots */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>

        <p className="text-white/60 text-sm mt-4">Redirecting to home...</p>

        <style jsx>{`
          @keyframes successPing {
            0% { transform: scale(1); opacity: 0.8; }
            100% { transform: scale(1.5); opacity: 0; }
          }
        `}</style>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
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

  const jobNumber = job?.job_number || id

  // Web version - full success page experience
  return (
    <div
      className={`min-h-screen bg-gradient-to-b from-emerald-50 to-white ${isNative ? 'fixed inset-0 flex flex-col' : ''}`}
      style={isNative ? { paddingTop: 'env(safe-area-inset-top, 44px)' } : {}}
    >
      {/* iOS Native Header */}
      {isNative && (
        <div
          className="relative z-50 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
          }}
        >
          <div className="flex items-center px-4 py-3">
            <button
              onClick={() => router.push('/')}
              className="flex items-center text-white active:opacity-60"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <ChevronLeft className="w-6 h-6" />
              <span className="ml-1 font-medium">Home</span>
            </button>
            <h1 className="flex-1 text-center text-white font-semibold text-lg pr-12">
              Job Submitted
            </h1>
          </div>
        </div>
      )}

      <div
        className={`${isNative ? 'flex-1 overflow-auto' : ''}`}
        style={isNative ? { paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 34px))' } : {}}
      >
        <div className="container-max py-8 px-4">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
              Job Posted Successfully!
            </h1>
            <p className="text-slate-600 max-w-md mx-auto">
              {job?.title || 'Your job'} is now live. Contractors in your area are being notified.
            </p>
            {jobNumber && (
              <p className="text-sm text-slate-500 mt-2">
                Job #{jobNumber}
              </p>
            )}
          </div>

          {/* Waiting for Bids Section */}
          <div className="card p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" />
                Contractor Bids
              </h2>
              <span className="text-sm text-slate-500 flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Waiting {formatWaitTime(secondsWaiting)}
              </span>
            </div>

            {bids.length === 0 ? (
              /* No bids yet - waiting state */
              <div className="text-center py-8">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  {/* Pulsing animation */}
                  <div className="absolute inset-0 bg-emerald-200 rounded-full animate-ping opacity-50" />
                  <div className="relative w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Bell className="h-8 w-8 text-emerald-600" />
                  </div>
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  Waiting for Bids...
                </h3>
                <p className="text-slate-500 text-sm max-w-sm mx-auto">
                  Contractors are being notified. You'll see their bids appear here in real-time.
                </p>

                {/* Animated dots */}
                <div className="flex items-center justify-center gap-1 mt-4">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            ) : (
              /* Bids list */
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-600 mb-4">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">{bids.length} bid{bids.length !== 1 ? 's' : ''} received!</span>
                </div>

                {bids.map((bid) => (
                  <div
                    key={bid.id}
                    className="border border-slate-200 rounded-xl p-4 hover:border-emerald-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-900">
                            {bid.contractor_name}
                          </span>
                          {bid.contractor_rating && (
                            <span className="flex items-center gap-1 text-sm text-slate-500">
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              {bid.contractor_rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        {bid.message && (
                          <p className="text-sm text-slate-600 line-clamp-2">
                            {bid.message}
                          </p>
                        )}
                        <p className="text-xs text-slate-400 mt-2">
                          {new Date(bid.created_at).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-emerald-600">
                          ${bid.bid_amount?.toLocaleString()}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          bid.status === 'accepted'
                            ? 'bg-emerald-100 text-emerald-700'
                            : bid.status === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {bid.status === 'accepted' ? 'Accepted' : bid.status === 'rejected' ? 'Declined' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {bids.length > 0 ? (
              <Link
                href={`/jobs/${jobNumber}/compare`}
                className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-lg"
              >
                <DollarSign className="h-5 w-5" />
                Compare & Accept Bids
                <ArrowRight className="h-5 w-5" />
              </Link>
            ) : (
              <Link
                href={`/jobs/${jobNumber}`}
                className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-lg"
              >
                View Job Details
                <ArrowRight className="h-5 w-5" />
              </Link>
            )}

            <Link
              href="/"
              className="w-full btn btn-outline flex items-center justify-center gap-2 py-4"
            >
              <Bell className="h-5 w-5" />
              Check Back Later
            </Link>

            <p className="text-center text-sm text-slate-500 mt-4">
              <MessageCircle className="h-4 w-4 inline mr-1" />
              You'll receive a notification when contractors submit bids
            </p>
          </div>

          {/* What's Next Section */}
          <div className="mt-8 p-6 bg-slate-50 rounded-xl">
            <h3 className="font-semibold text-slate-900 mb-4">What happens next?</h3>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                <div>
                  <p className="font-medium text-slate-900">Contractors receive your job</p>
                  <p className="text-sm text-slate-500">Local pros matching your category are notified</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                <div>
                  <p className="font-medium text-slate-900">Compare bids & profiles</p>
                  <p className="text-sm text-slate-500">Review pricing, ratings, and contractor messages</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                <div>
                  <p className="font-medium text-slate-900">Accept & get started</p>
                  <p className="text-sm text-slate-500">Choose the best pro and begin your project</p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
