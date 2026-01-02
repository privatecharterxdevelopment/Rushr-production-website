'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useAuth } from '../../../../contexts/AuthContext'
import { supabase } from '../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import {
  ArrowLeft,
  DollarSign,
  Clock,
  User,
  CheckCircle2,
  MessageSquare,
  Star,
  XCircle
} from 'lucide-react'

const PaymentModal = dynamic(() => import('../../../../components/PaymentModal'), { ssr: false })

interface Bid {
  id: string
  job_id: string
  contractor_id: string
  bid_amount: number | null
  message: string | null
  status: string
  created_at: string
  job_title?: string
  contractor_name?: string
}

export default function HomeownerBidsPage() {
  const { user, userProfile } = useAuth()
  const [bids, setBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [acceptingBid, setAcceptingBid] = useState<string | null>(null)
  const [rejectingBid, setRejectingBid] = useState<string | null>(null)
  const [selectedBid, setSelectedBid] = useState<Bid | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'pending' | 'accepted' | 'rejected'>('pending')

  // Filter bids by status
  const pendingBids = bids.filter(b => b.status === 'pending')
  const acceptedBids = bids.filter(b => b.status === 'accepted')
  const rejectedBids = bids.filter(b => b.status === 'rejected')

  const fetchBids = async () => {
    if (!user) return
    try {
      // Fetch bids with job and contractor details
      const { data: bidsData, error } = await supabase
        .from('job_bids')
        .select('*')
        .eq('homeowner_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching bids:', error)
        setLoading(false)
        return
      }

      // Fetch related job and contractor info for each bid
      const enrichedBids = await Promise.all(
        (bidsData || []).map(async (bid) => {
          // Get job title
          const { data: jobData, error: jobError } = await supabase
            .from('homeowner_jobs')
            .select('title')
            .eq('id', bid.job_id)
            .single()

          if (jobError) {
            console.error('Error fetching job for bid:', bid.id, jobError)
          }

          // Get contractor name - contractor_id is the auth user id, which maps to pro_contractors.id
          const { data: contractorData, error: contractorError } = await supabase
            .from('pro_contractors')
            .select('name, business_name')
            .eq('id', bid.contractor_id)
            .single()

          if (contractorError) {
            console.error('Error fetching contractor for bid:', bid.id, bid.contractor_id, contractorError)
          }

          // Determine contractor display name
          let contractorName = 'Unknown Contractor'
          if (contractorData) {
            contractorName = contractorData.business_name || contractorData.name || `Contractor ${bid.contractor_id.substring(0, 8)}`
          } else {
            // If no profile found, show partial ID
            contractorName = `Contractor ${bid.contractor_id.substring(0, 8)}`
          }

          return {
            ...bid,
            job_title: jobData?.title || 'Unknown Job',
            contractor_name: contractorName
          }
        })
      )

      setBids(enrichedBids)
    } catch (err) {
      console.error('Error fetching bids:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    fetchBids()
  }, [user])

  const handleAcceptBid = async (bid: Bid) => {
    if (!user || acceptingBid || bid.bid_amount == null) return

    setAcceptingBid(bid.id)

    try {
      // Update bid status to accepted
      const { error: bidError } = await supabase
        .from('job_bids')
        .update({ status: 'accepted' })
        .eq('id', bid.id)

      if (bidError) {
        alert('Error accepting bid: ' + bidError.message)
        setAcceptingBid(null)
        return
      }

      // Update job status to bid_accepted
      const { error: jobError } = await supabase
        .from('homeowner_jobs')
        .update({
          status: 'bid_accepted',
          final_cost: bid.bid_amount,
          contractor_id: bid.contractor_id
        })
        .eq('id', bid.job_id)

      if (jobError) {
        console.error('Error updating job status:', jobError)
      }

      alert('✅ Bid accepted! You will receive a notification to proceed with payment.')

      // Refresh bids to show updated status
      fetchBids()
      setAcceptingBid(null)
    } catch (err) {
      console.error('Error accepting bid:', err)
      alert('Error accepting bid')
      setAcceptingBid(null)
    }
  }

  const handleRejectBid = async (bid: Bid) => {
    if (!user || rejectingBid) return

    if (!confirm('Are you sure you want to reject this bid? This action cannot be undone.')) {
      return
    }

    setRejectingBid(bid.id)

    try {
      // Call API to reject bid and send notifications
      const response = await fetch('/api/bids/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bidId: bid.id,
          jobTitle: bid.job_title,
          homeownerId: user.id
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        alert('Error rejecting bid: ' + (data.error || 'Unknown error'))
        setRejectingBid(null)
        return
      }

      alert('Bid rejected. The contractor has been notified.')

      // Refresh bids to show updated status
      fetchBids()
      setRejectingBid(null)
    } catch (err) {
      console.error('Error rejecting bid:', err)
      alert('Error rejecting bid')
      setRejectingBid(null)
    }
  }

  const handleOpenPayment = (bid: Bid) => {
    setSelectedBid(bid)
    setShowPaymentModal(true)
  }

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false)
    alert('Payment secured in escrow! The contractor has been notified.')
    // Refresh bids
    fetchBids()
  }

  const getBidStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'accepted':
        return 'bg-green-100 text-green-700 border-green-200'
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    )
  }

  // Get current tab's bids
  const currentBids = activeTab === 'pending' ? pendingBids : activeTab === 'accepted' ? acceptedBids : rejectedBids

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/homeowner"
          className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">Bids on Your Jobs</h1>
        <p className="text-slate-600 mt-1">Review and accept bids from contractors</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'pending'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending ({pendingBids.length})
        </button>
        <button
          onClick={() => setActiveTab('accepted')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'accepted'
              ? 'border-emerald-500 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Accepted ({acceptedBids.length})
        </button>
        <button
          onClick={() => setActiveTab('rejected')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'rejected'
              ? 'border-red-500 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Rejected ({rejectedBids.length})
        </button>
      </div>

      {/* Bids List */}
      {currentBids.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <MessageSquare className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600">
            {activeTab === 'pending' && 'No pending bids'}
            {activeTab === 'accepted' && 'No accepted bids yet'}
            {activeTab === 'rejected' && 'No rejected bids'}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {activeTab === 'pending' && 'Contractors will bid on your posted jobs'}
            {activeTab === 'accepted' && 'Accept a bid to see it here'}
            {activeTab === 'rejected' && 'Rejected bids will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {currentBids.map((bid) => (
            <div key={bid.id} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              {/* Bid Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-slate-900 mb-1">
                    {bid.job_title}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <User className="h-4 w-4" />
                    <span>Bid by: {bid.contractor_name}</span>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getBidStatusColor(bid.status)}`}>
                  {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                </span>
              </div>

              {/* Bid Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-sm text-slate-500">Bid Amount</p>
                    <p className="text-lg font-semibold text-slate-900">
                      ${bid.bid_amount != null ? bid.bid_amount.toFixed(2) : '0.00'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-slate-500">Submitted</p>
                    <p className="text-sm text-slate-700">{new Date(bid.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Bid Message */}
              {bid.message && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-700 mb-1">Message from Contractor:</p>
                  <p className="text-slate-600 bg-slate-50 p-3 rounded-lg">{bid.message}</p>
                </div>
              )}

              {/* Actions */}
              {bid.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptBid(bid)}
                    disabled={acceptingBid === bid.id || rejectingBid === bid.id}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {acceptingBid === bid.id ? (
                      <>
                        <img
                          src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
                          alt="Loading..."
                          className="w-4 h-4 object-contain"
                        />
                        Accepting...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Accept Bid
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleRejectBid(bid)}
                    disabled={acceptingBid === bid.id || rejectingBid === bid.id}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {rejectingBid === bid.id ? (
                      <>
                        <img
                          src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
                          alt="Loading..."
                          className="w-4 h-4 object-contain"
                        />
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" />
                        Reject
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Show Payment Button for Accepted Bids */}
              {bid.status === 'accepted' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-900 mb-1">💳 Payment Required</p>
                      <p className="text-sm text-blue-700">Secure payment in escrow to start the job</p>
                    </div>
                    <button
                      onClick={() => handleOpenPayment(bid)}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-lg"
                    >
                      <DollarSign className="h-5 w-5" />
                      Place Payment
                    </button>
                  </div>
                </div>
              )}

              {/* Show Message Button for Rejected Bids */}
              {bid.status === 'rejected' && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Changed your mind?</p>
                      <p className="text-sm text-gray-500">You can still message this contractor</p>
                    </div>
                    <Link
                      href={`/messages?to=${bid.contractor_id}`}
                      className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Message
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Payment Modal */}
      {selectedBid && selectedBid.bid_amount != null && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          bidId={selectedBid.id}
          jobId={selectedBid.job_id}
          amount={selectedBid.bid_amount}
          contractorName={selectedBid.contractor_name || 'Contractor'}
          jobTitle={selectedBid.job_title || 'Job'}
          homeownerId={user?.id || ''}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  )
}
