'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import {
  CheckCircle2,
  Clock,
  DollarSign,
  Lock,
  Unlock,
  AlertCircle,
  Loader2
} from 'lucide-react'

interface PaymentHold {
  id: string
  job_id: string
  bid_id: string
  amount: number
  contractor_payout: number
  status: string
  homeowner_confirmed_complete: boolean
  contractor_confirmed_complete: boolean
  homeowner_confirmed_at?: string
  contractor_confirmed_at?: string
  released_at?: string
  created_at: string
}

interface EscrowStatusProps {
  jobId: string
  bidId: string
  userType: 'homeowner' | 'contractor'
  onConfirmComplete?: () => void
}

export default function EscrowStatus({
  jobId,
  bidId,
  userType,
  onConfirmComplete
}: EscrowStatusProps) {
  const { user } = useAuth()
  const [paymentHold, setPaymentHold] = useState<PaymentHold | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    fetchPaymentHold()

    // Subscribe to real-time updates
    const subscription = supabase
      .channel(`payment_hold_${bidId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_holds',
          filter: `bid_id=eq.${bidId}`
        },
        (payload) => {
          if (payload.new) {
            setPaymentHold(payload.new as PaymentHold)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [user, bidId])

  async function fetchPaymentHold() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('payment_holds')
        .select('*')
        .eq('bid_id', bidId)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      setPaymentHold(data)
    } catch (err: any) {
      console.error('Error fetching payment hold:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmComplete() {
    if (!user || !paymentHold) return

    setConfirming(true)
    setError(null)

    try {
      const response = await fetch('/api/payments/confirm-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentHoldId: paymentHold.id,
          userId: user.id,
          userType
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to confirm completion')
      }

      // Refresh payment hold
      await fetchPaymentHold()

      if (onConfirmComplete) {
        onConfirmComplete()
      }

    } catch (err: any) {
      setError(err.message)
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center">
          <img
            src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
            alt="Loading..."
            className="w-6 h-6 object-contain"
          />
        </div>
      </div>
    )
  }

  if (!paymentHold) {
    return null // No payment hold yet
  }

  const myConfirmation = userType === 'homeowner'
    ? paymentHold.homeowner_confirmed_complete
    : paymentHold.contractor_confirmed_complete

  const otherPartyConfirmation = userType === 'homeowner'
    ? paymentHold.contractor_confirmed_complete
    : paymentHold.homeowner_confirmed_complete

  const bothConfirmed = paymentHold.homeowner_confirmed_complete && paymentHold.contractor_confirmed_complete

  // Payment captured - show "let's get to work" message
  if (paymentHold.status === 'captured' && !bothConfirmed) {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg border-2 border-emerald-200 p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}

        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-emerald-600 text-white">
            <DollarSign className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-emerald-900 mb-2">
              💰 Payment Secured - Let's Get to Work!
            </h3>
            <p className="text-emerald-800 mb-4">
              ${paymentHold.amount.toFixed(2)} is being held in escrow.{' '}
              {userType === 'contractor'
                ? `You'll receive $${paymentHold.contractor_payout.toFixed(2)} after job completion.`
                : 'Payment will be released to contractor when job is complete.'
              }
            </p>

            <div className="bg-white rounded-lg p-4 mb-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Job Completion Status</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {paymentHold.homeowner_confirmed_complete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Clock className="h-5 w-5 text-gray-400" />
                    )}
                    <span className="text-sm text-gray-700">Homeowner confirmed</span>
                  </div>
                  {paymentHold.homeowner_confirmed_at && (
                    <span className="text-xs text-gray-500">
                      {new Date(paymentHold.homeowner_confirmed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {paymentHold.contractor_confirmed_complete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Clock className="h-5 w-5 text-gray-400" />
                    )}
                    <span className="text-sm text-gray-700">Contractor confirmed</span>
                  </div>
                  {paymentHold.contractor_confirmed_at && (
                    <span className="text-xs text-gray-500">
                      {new Date(paymentHold.contractor_confirmed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {myConfirmation ? (
              <div className="bg-emerald-100 border border-emerald-300 rounded-lg p-3">
                <div className="flex items-center gap-2 text-emerald-800">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">You've confirmed job completion</span>
                </div>
                {!otherPartyConfirmation && (
                  <p className="text-sm text-emerald-700 mt-1">
                    Waiting for {userType === 'homeowner' ? 'contractor' : 'homeowner'} to confirm...
                  </p>
                )}
              </div>
            ) : (
              <button
                onClick={handleConfirmComplete}
                disabled={confirming}
                className="w-full bg-emerald-600 text-white py-3 px-4 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
              >
                {confirming ? (
                  <>
                    <img
                      src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
                      alt="Loading..."
                      className="w-5 h-5 object-contain"
                    />
                    Confirming...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Confirm Job Complete
                  </>
                )}
              </button>
            )}

            <p className="text-xs text-gray-600 mt-3 text-center">
              <Lock className="h-3 w-3 inline mr-1" />
              Payment will be automatically released when both parties confirm completion
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Payment released
  if (paymentHold.status === 'released') {
    return (
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-green-600 text-white">
            <Unlock className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-green-900 mb-2">
              ✅ Payment Released!
            </h3>
            <p className="text-green-800 mb-2">
              {userType === 'contractor'
                ? `$${paymentHold.contractor_payout.toFixed(2)} has been transferred to your account.`
                : `Payment of $${paymentHold.amount.toFixed(2)} has been released to the contractor.`
              }
            </p>
            {paymentHold.released_at && (
              <p className="text-sm text-green-700">
                Released on {new Date(paymentHold.released_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Payment pending/authorized
  if (paymentHold.status === 'pending' || paymentHold.status === 'authorized') {
    return (
      <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-yellow-100">
            <Clock className="h-6 w-6 text-yellow-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-yellow-900 mb-2">
              Payment Pending
            </h3>
            <p className="text-yellow-800">
              {userType === 'homeowner'
                ? 'Complete payment to secure this contractor and hold funds in escrow.'
                : 'Waiting for homeowner to complete payment authorization.'
              }
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
