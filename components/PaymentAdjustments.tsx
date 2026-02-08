'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'
import {
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  ExternalLink
} from 'lucide-react'

type PaymentAdjustment = {
  id: string
  booking_id: string
  requested_by: 'homeowner' | 'contractor'
  requester_id: string
  requester_name: string
  original_amount: number
  new_amount: number
  difference: number
  reason: string
  category: string | null
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  stripe_payment_link_url: string | null
  responded_by_name: string | null
  response_note: string | null
  responded_at: string | null
  expires_at: string
  created_at: string
}

type Props = {
  userId: string
  userType: 'homeowner' | 'contractor'
  limit?: number
}

export default function PaymentAdjustments({ userId, userType, limit = 5 }: Props) {
  const [adjustments, setAdjustments] = useState<PaymentAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState<string | null>(null)
  const [responseNote, setResponseNote] = useState('')

  useEffect(() => {
    fetchAdjustments()

    // Set up real-time subscription
    const channel = supabase
      .channel('payment-adjustments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_adjustments'
        },
        () => {
          fetchAdjustments()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, userType])

  const fetchAdjustments = async () => {
    try {
      const column = userType === 'homeowner' ? 'homeowner_id' : 'contractor_id'

      const { data, error } = await supabase
        .from('payment_adjustments')
        .select('*')
        .eq(column, userId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      setAdjustments(data || [])
    } catch (error) {
      console.error('Error fetching adjustments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRespond = async (adjustmentId: string, action: 'accept' | 'decline') => {
    setResponding(adjustmentId)

    try {
      const adjustment = adjustments.find(a => a.id === adjustmentId)
      if (!adjustment) return

      const response = await fetch('/api/payments/respond-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustmentId,
          action,
          respondedById: userId,
          respondedByName: userType === 'homeowner' ? 'Homeowner' : 'Contractor',
          responseNote: responseNote || undefined
        })
      })

      const data = await response.json()

      if (data.success) {
        if (action === 'accept' && data.paymentLink) {
          // Redirect to payment link for additional amount
          window.open(data.paymentLink, '_blank')
        }
        fetchAdjustments()
        setResponseNote('')
      } else {
        alert(data.error || 'Failed to respond')
      }
    } catch (error) {
      console.error('Error responding:', error)
      alert('Failed to respond to adjustment')
    } finally {
      setResponding(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'accepted': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      case 'declined': return 'bg-red-100 text-red-700 border-red-200'
      case 'cancelled': return 'bg-slate-100 text-slate-600 border-slate-200'
      default: return 'bg-slate-100 text-slate-600 border-slate-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4" />
      case 'accepted': return <CheckCircle2 className="h-4 w-4" />
      case 'declined': return <XCircle className="h-4 w-4" />
      case 'cancelled': return <AlertCircle className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date()

  const canRespond = (adjustment: PaymentAdjustment) => {
    if (adjustment.status !== 'pending') return false
    if (isExpired(adjustment.expires_at)) return false

    // Can only respond if you're the counterparty (not the requester)
    if (adjustment.requested_by === 'homeowner' && userType === 'contractor') return true
    if (adjustment.requested_by === 'contractor' && userType === 'homeowner') return true
    return false
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-white p-6">
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-white shadow-sm">
      <div className="border-b border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <DollarSign className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-blue-900">Payment Adjustments</h3>
            <p className="text-sm text-blue-700">
              {adjustments.length > 0
                ? `${adjustments.filter(a => a.status === 'pending').length} pending`
                : 'No adjustment requests'}
            </p>
          </div>
        </div>
        <Link
          href={`/dashboard/${userType}/transactions`}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          View All
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="p-4">
        {adjustments.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-8 w-8 text-blue-300" />
            </div>
            <h4 className="text-lg font-medium text-slate-900 mb-2">No Adjustments Yet</h4>
            <p className="text-slate-600 text-sm">
              Payment adjustment requests will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {adjustments.map(adjustment => (
              <div
                key={adjustment.id}
                className={`border rounded-lg p-4 ${
                  adjustment.status === 'pending' && canRespond(adjustment)
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(adjustment.status)}`}>
                        {getStatusIcon(adjustment.status)}
                        {adjustment.status.charAt(0).toUpperCase() + adjustment.status.slice(1)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(adjustment.created_at).toLocaleDateString()}
                      </span>
                      {adjustment.status === 'pending' && isExpired(adjustment.expires_at) && (
                        <span className="text-xs text-red-600 font-medium">Expired</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      Requested by: <span className="font-medium">{adjustment.requester_name}</span>
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 line-through text-sm">
                        ${adjustment.original_amount.toFixed(2)}
                      </span>
                      <span className="text-lg font-bold text-blue-600">
                        ${adjustment.new_amount.toFixed(2)}
                      </span>
                    </div>
                    <div className={`text-xs font-medium ${
                      adjustment.difference > 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {adjustment.difference > 0 ? '+' : ''}${adjustment.difference.toFixed(2)}
                    </div>
                  </div>
                </div>

                {adjustment.category && (
                  <div className="text-xs text-slate-500 mb-2">
                    Category: <span className="font-medium capitalize">{adjustment.category.replace('_', ' ')}</span>
                  </div>
                )}

                <div className="bg-white border border-slate-200 rounded-lg p-3 mb-3">
                  <p className="text-sm text-slate-700">{adjustment.reason}</p>
                </div>

                {adjustment.response_note && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3">
                    <p className="text-xs text-slate-500 mb-1">Response:</p>
                    <p className="text-sm text-slate-700">{adjustment.response_note}</p>
                  </div>
                )}

                {/* Action buttons for pending adjustments */}
                {canRespond(adjustment) && (
                  <div className="mt-3 pt-3 border-t border-amber-200">
                    <div className="mb-2">
                      <input
                        type="text"
                        placeholder="Add a note (optional)"
                        value={responseNote}
                        onChange={e => setResponseNote(e.target.value)}
                        className="w-full text-sm rounded-md border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRespond(adjustment.id, 'accept')}
                        disabled={responding === adjustment.id}
                        className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {responding === adjustment.id ? 'Processing...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleRespond(adjustment.id, 'decline')}
                        disabled={responding === adjustment.id}
                        className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        Decline
                      </button>
                    </div>
                  </div>
                )}

                {/* Payment link for accepted adjustments */}
                {adjustment.status === 'accepted' && adjustment.stripe_payment_link_url && adjustment.difference > 0 && (
                  <div className="mt-3 pt-3 border-t border-emerald-200">
                    <a
                      href={adjustment.stripe_payment_link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Pay Additional ${adjustment.difference.toFixed(2)}
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
