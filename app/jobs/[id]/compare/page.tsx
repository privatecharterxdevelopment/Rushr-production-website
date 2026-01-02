'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '../../../../contexts/AuthContext'
import { supabase } from '../../../../lib/supabaseClient'
import PaymentModal from '../../../../components/PaymentModal'
import { Capacitor } from '@capacitor/core'
import { ArrowLeft, DollarSign, Clock, CheckCircle } from 'lucide-react'

interface Bid {
  id: string
  job_id: string
  contractor_id: string
  bid_amount: number | null
  message: string | null
  status: string
  created_at: string
  contractor_name?: string
  contractor_business_name?: string
}

interface Job {
  id: string
  title: string
  description: string
}

export default function CompareBids() {
  const { user } = useAuth()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [bids, setBids] = useState<Bid[]>([])
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedBid, setSelectedBid] = useState<Bid | null>(null)

  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !id) return

      try {
        // Check if ID is a number (job_number) or UUID
        const isJobNumber = /^\d+$/.test(id)

        // Fetch job details
        const { data: jobData, error: jobError } = await supabase
          .from('homeowner_jobs')
          .select('id, title, description')
          .eq(isJobNumber ? 'job_number' : 'id', id)
          .eq('homeowner_id', user.id)
          .single()

        if (jobError) {
          setError('Job not found or access denied')
          setLoading(false)
          return
        }

        setJob(jobData)

        // Fetch all bids for this job (use the actual UUID from jobData.id)
        const { data: bidsData, error: bidsError } = await supabase
          .from('job_bids')
          .select('*')
          .eq('job_id', jobData.id)
          .eq('homeowner_id', user.id)
          .order('bid_amount', { ascending: true })

        if (bidsError) {
          setError(bidsError.message)
          setLoading(false)
          return
        }

        // Enrich bids with contractor info
        const enrichedBids = await Promise.all(
          (bidsData || []).map(async (bid) => {
            const { data: contractorData } = await supabase
              .from('pro_contractors')
              .select('name, business_name')
              .eq('id', bid.contractor_id)
              .single()

            return {
              ...bid,
              contractor_name: contractorData?.name,
              contractor_business_name: contractorData?.business_name
            }
          })
        )

        setBids(enrichedBids)
      } catch (err: any) {
        setError(err.message || 'Failed to load bids')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user, id])

  if (loading) {
    return (
      <div
        className="min-h-screen bg-slate-50"
        style={{
          paddingTop: isNative ? 'env(safe-area-inset-top)' : undefined
        }}
      >
        {isNative && (
          <div className="bg-gradient-to-b from-emerald-600 to-emerald-500 text-white">
            <div className="px-4 py-4" style={{ paddingTop: 'max(calc(12px + env(safe-area-inset-top)), 59px)' }}>
              <div className="flex items-center justify-between">
                <button onClick={() => router.push('/')} className="p-2 -ml-2 rounded-full hover:bg-white/20 flex items-center">
                  <ArrowLeft className="h-6 w-6" />
                  <span className="ml-1">Home</span>
                </button>
                <h1 className="text-lg font-bold flex-1 text-center">Compare Bids</h1>
                <div className="w-10" />
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center">
            <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
              <div className="absolute inset-0 rounded-full border-emerald-200 border-t-emerald-600 animate-spin" style={{ borderWidth: 3 }} />
              <img
                src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg"
                alt="Rushr"
                style={{ width: 32, height: 32 }}
                className="object-contain"
              />
            </div>
            <p className="text-slate-600 text-sm mt-3">Loading bids...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <section className="section">
        <div className="card p-6 bg-red-50 border-red-200">
          <p className="text-red-700">Error: {error}</p>
        </div>
      </section>
    )
  }

  const handleAcceptBid = async (bidId: string) => {
    console.log('bidId', bidId)
    console.log('bids', bids)
    if (!user || accepting) return

    const bid = bids.find(b => b.id === bidId)
    if (!bid || bid.bid_amount == null) {
      alert('Invalid bid')
      return
    }

    setAccepting(bidId)

    try {
      // Update bid status
      const { error: bidError } = await supabase
        .from('job_bids')
        .update({ status: 'accepted' })
        .eq('id', bidId)

        console.log('bidError',bidError)

      if (bidError) {
        alert('Error accepting bid: ' + bidError.message)
        setAccepting(null)
        return
      }

      // Update job status and final cost
      const { error: jobError } = await supabase
        .from('homeowner_jobs')
        .update({
          status: 'in_progress',
          final_cost: bid.bid_amount
        })
        .eq('id', id)

      if (jobError) {
        console.error('Error updating job:', jobError)
      }

      // Open payment modal
      setSelectedBid(bid)
      setShowPaymentModal(true)
      setAccepting(null)
    } catch (err) {
      console.error('Error accepting bid:', err)
      alert('Failed to accept bid')
      setAccepting(null)
    }
  }

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false)
    // Redirect to tracking page
    router.push(`/jobs/${id}/track`)
  }

  if (bids.length === 0) {
    return (
      <div
        className="min-h-screen bg-slate-50"
        style={{
          paddingTop: isNative ? 'env(safe-area-inset-top)' : undefined,
          paddingBottom: isNative ? 'calc(80px + env(safe-area-inset-bottom))' : undefined
        }}
      >
        {isNative && (
          <div className="bg-gradient-to-b from-emerald-600 to-emerald-500 text-white">
            <div className="px-4 py-4" style={{ paddingTop: 'max(calc(12px + env(safe-area-inset-top)), 59px)' }}>
              <div className="flex items-center justify-between">
                <button onClick={() => router.push('/')} className="p-2 -ml-2 rounded-full hover:bg-white/20 flex items-center">
                  <ArrowLeft className="h-6 w-6" />
                  <span className="ml-1">Home</span>
                </button>
                <h1 className="text-lg font-bold flex-1 text-center">Compare Bids</h1>
                <div className="w-10" />
              </div>
            </div>
          </div>
        )}
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {!isNative && (
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-slate-900">See Bids</h1>
              <Link href="/" className="px-4 py-2 text-emerald-600 hover:text-emerald-700 font-medium">
                Back to Home
              </Link>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
              <Clock className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">No bids yet</h3>
            <p className="text-slate-600">Contractors are reviewing your job. Check back soon!</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className="min-h-screen bg-slate-50"
        style={{
          paddingTop: isNative ? 'env(safe-area-inset-top)' : undefined,
          paddingBottom: isNative ? 'calc(80px + env(safe-area-inset-bottom))' : undefined
        }}
      >
        {/* iOS Native Header */}
        {isNative && (
          <div className="bg-gradient-to-b from-emerald-600 to-emerald-500 text-white sticky top-0 z-50">
            <div className="px-4 py-4" style={{ paddingTop: 'max(calc(12px + env(safe-area-inset-top)), 59px)' }}>
              <div className="flex items-center justify-between">
                <button onClick={() => router.push('/')} className="p-2 -ml-2 rounded-full hover:bg-white/20 active:bg-white/30 flex items-center">
                  <ArrowLeft className="h-6 w-6" />
                  <span className="ml-1">Home</span>
                </button>
                <div className="flex-1 text-center">
                  <h1 className="text-lg font-bold">Compare Bids</h1>
                  <p className="text-xs text-emerald-200 truncate">{job?.title}</p>
                </div>
                <div className="w-10" />
              </div>
            </div>
          </div>
        )}

        <div className="container mx-auto px-4 py-6 max-w-6xl">
          {/* Web Header */}
          {!isNative && (
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">See Bids</h1>
                <p className="text-slate-600 mt-1">{job?.title}</p>
              </div>
              <Link href="/dashboard/homeowner" className="px-4 py-2 text-emerald-600 hover:text-emerald-700 font-medium">
                Back to Dashboard
              </Link>
            </div>
          )}

          {/* Bids Summary - Mobile */}
          {isNative && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{bids.length} bid{bids.length !== 1 ? 's' : ''}</p>
                    <p className="font-semibold text-slate-900">
                      ${Math.min(...bids.map(b => b.bid_amount || 0)).toFixed(0)} - ${Math.max(...bids.map(b => b.bid_amount || 0)).toFixed(0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {bids.map((bid) => (
              <div key={bid.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {(bid.contractor_name || bid.contractor_business_name || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {bid.contractor_business_name || bid.contractor_name || `Contractor`}
                      </h3>
                      <p className="text-sm text-slate-500">Submitted {new Date(bid.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-emerald-600">
                      ${bid.bid_amount != null ? bid.bid_amount.toFixed(0) : '0'}
                    </p>
                    <p className="text-xs text-slate-500">Bid Amount</p>
                  </div>
                </div>

                {bid.message && (
                  <div className="mb-4 p-4 bg-slate-50 rounded-xl">
                    <p className="text-sm font-medium text-slate-700 mb-1">Message:</p>
                    <p className="text-slate-600 text-sm">{bid.message}</p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 ${
                      bid.status === 'accepted' ? 'bg-green-100 text-green-700' :
                      bid.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {bid.status === 'accepted' && <CheckCircle className="h-4 w-4" />}
                      {bid.status === 'pending' && <Clock className="h-4 w-4" />}
                      {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                    </span>
                  </div>

                  {bid.status === 'pending' && (
                    <button
                      onClick={() => handleAcceptBid(bid.id)}
                      disabled={accepting === bid.id}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {accepting === bid.id ? 'Accepting...' : 'Accept Bid'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedBid && user && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          bidId={selectedBid.id}
          jobId={id}
          amount={selectedBid.bid_amount || 0}
          contractorName={selectedBid.contractor_business_name || selectedBid.contractor_name || 'Contractor'}
          jobTitle={job?.title || 'Job'}
          homeownerId={user.id}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </>
  )
}
