'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Bid {
  id: string
  contractor_id: string
  bid_amount: number
  message: string | null
  status: string
  created_at: string
  contractor?: {
    name: string
    business_name: string | null
    avatar_url: string | null
    rating: number | null
    reviews_count: number | null
    categories: string[]
  }
}

interface BidsWaitingOverlayProps {
  isOpen: boolean
  onClose: () => void
  jobId: string
  jobTitle: string
  homeownerId: string
  onBidAccepted: (bid: Bid) => void
}

const MAX_WAIT_SECONDS = 300 // 5 minutes

export default function BidsWaitingOverlay({
  isOpen,
  onClose,
  jobId,
  jobTitle,
  homeownerId,
  onBidAccepted
}: BidsWaitingOverlayProps) {
  const [bids, setBids] = useState<Bid[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Timer: count up from 0 to MAX_WAIT_SECONDS
  useEffect(() => {
    if (!isOpen) return
    setElapsed(0)
    setExpired(false)

    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev + 1 >= MAX_WAIT_SECONDS) {
          setExpired(true)
          if (timerRef.current) clearInterval(timerRef.current)
          return MAX_WAIT_SECONDS
        }
        return prev + 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isOpen])

  // Format elapsed time as MM:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Fetch existing bids on mount
  useEffect(() => {
    if (!isOpen || !jobId) return

    const fetchBids = async () => {
      const { data } = await supabase
        .from('job_bids')
        .select('*')
        .eq('job_id', jobId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (data && data.length > 0) {
        // Enrich with contractor info
        const enriched = await enrichBids(data)
        setBids(enriched)
      }
    }

    fetchBids()
  }, [isOpen, jobId])

  // Real-time subscription for new bids
  useEffect(() => {
    if (!isOpen || !jobId) return

    const channel = supabase
      .channel(`bids_overlay_${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_bids',
          filter: `job_id=eq.${jobId}`
        },
        async (payload) => {
          const newBid = payload.new as any
          const enriched = await enrichBids([newBid])
          setBids(prev => {
            // Don't add duplicates
            if (prev.some(b => b.id === newBid.id)) return prev
            return [...prev, ...enriched]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isOpen, jobId])

  // Enrich bids with contractor data
  const enrichBids = useCallback(async (rawBids: any[]): Promise<Bid[]> => {
    const contractorIds = rawBids.map(b => b.contractor_id)
    const { data: contractors } = await supabase
      .from('pro_contractors')
      .select('id, name, business_name, avatar_url, rating, reviews_count, categories')
      .in('id', contractorIds)

    return rawBids.map(bid => ({
      ...bid,
      contractor: contractors?.find(c => c.id === bid.contractor_id) || undefined
    }))
  }, [])

  // Accept a bid → create escrow via start-direct, assign contractor
  const handleAcceptBid = async (bid: Bid) => {
    setAcceptingBidId(bid.id)
    setError(null)

    try {
      // Call start-direct to create escrow and assign contractor
      const res = await fetch('/api/jobs/start-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          contractorId: bid.contractor_id,
          bidId: bid.id,
          amount: bid.bid_amount,
          homeownerId
        })
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to accept bid')
      }

      // Stop timer
      if (timerRef.current) clearInterval(timerRef.current)

      onBidAccepted(bid)
    } catch (err: any) {
      console.error('[BidsOverlay] Accept bid error:', err)
      setError(err.message || 'Failed to accept bid. Please try again.')
    } finally {
      setAcceptingBidId(null)
    }
  }

  if (!isOpen) return null

  const progressPct = Math.min((elapsed / MAX_WAIT_SECONDS) * 100, 100)

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 md:p-6">
      <div className="flex flex-col bg-white w-full h-full md:w-[520px] md:h-auto md:max-h-[85vh] md:rounded-2xl md:shadow-2xl overflow-hidden">
      {/* Header */}
      <div
        className="relative z-10"
        style={{
          background: 'linear-gradient(135deg, #10b981, #059669)',
          paddingTop: 'env(safe-area-inset-top, 0px)'
        }}
      >
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-white font-bold text-[18px]">Waiting for Bids</h2>
              <p className="text-white/70 text-[13px] mt-0.5">{jobTitle}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Timer + Progress */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-all duration-1000"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <span className="text-white font-mono text-[14px] font-semibold tabular-nums">
              {formatTime(elapsed)}
            </span>
          </div>

          {/* Bid count */}
          <div className="flex items-center justify-between mt-2">
            <p className="text-white/80 text-[12px]">
              {bids.length === 0
                ? 'Notifying contractors in your area...'
                : `${bids.length} bid${bids.length > 1 ? 's' : ''} received`}
            </p>
            <p className="text-white/60 text-[11px]">Max 5 min</p>
          </div>
        </div>
      </div>

      {/* Bids List */}
      <div className="flex-1 overflow-auto bg-gray-50">
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        {bids.length === 0 && !expired ? (
          /* Searching animation */
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full border-4 border-emerald-100 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin" />
              </div>
            </div>
            <p className="text-gray-900 font-semibold text-[16px] mb-1">Looking for contractors</p>
            <p className="text-gray-500 text-[13px] text-center">
              Contractors in your area are being notified. Bids will appear here in real-time.
            </p>
          </div>
        ) : bids.length === 0 && expired ? (
          /* No bids after timeout */
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-900 font-semibold text-[16px] mb-1">No bids received</p>
            <p className="text-gray-500 text-[13px] text-center mb-6">
              No contractors bid on this job within 5 minutes. Try posting again or adjusting your request.
            </p>
            <button
              onClick={onClose}
              className="px-8 py-3 rounded-xl font-semibold text-[15px] text-white"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              Post a New Job
            </button>
          </div>
        ) : (
          /* Bid cards */
          <div className="p-4 space-y-3">
            {bids.map((bid) => {
              const contractor = bid.contractor
              const name = contractor?.business_name || contractor?.name || 'Contractor'
              const isAccepting = acceptingBidId === bid.id

              return (
                <div
                  key={bid.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                  style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {contractor?.avatar_url ? (
                          <img src={contractor.avatar_url} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-emerald-700 font-bold text-[16px]">
                            {name[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-[15px]">{name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {contractor?.rating && (
                                <span className="text-[12px] text-amber-600 font-medium flex items-center gap-0.5">
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                  {contractor.rating.toFixed(1)}
                                  {contractor.reviews_count ? ` (${contractor.reviews_count})` : ''}
                                </span>
                              )}
                              {contractor?.categories?.[0] && (
                                <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                  {contractor.categories[0]}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Bid Amount */}
                          <div className="text-right flex-shrink-0">
                            <p className="text-[20px] font-bold text-emerald-600">
                              ${bid.bid_amount.toFixed(0)}
                            </p>
                            <p className="text-[11px] text-gray-500">bid amount</p>
                          </div>
                        </div>

                        {/* Message */}
                        {bid.message && (
                          <p className="text-[13px] text-gray-600 mt-2 line-clamp-2">
                            "{bid.message}"
                          </p>
                        )}

                        {/* Time */}
                        <p className="text-[11px] text-gray-400 mt-1.5">
                          {new Date(bid.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Accept Button */}
                  <div className="border-t border-gray-100 p-3">
                    <button
                      onClick={() => handleAcceptBid(bid)}
                      disabled={!!acceptingBidId}
                      className="w-full py-2.5 rounded-lg font-semibold text-[14px] text-white disabled:opacity-60 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                      style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    >
                      {isAccepting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Accepting...
                        </>
                      ) : (
                        <>
                          Accept Bid — ${bid.bid_amount.toFixed(0)}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
