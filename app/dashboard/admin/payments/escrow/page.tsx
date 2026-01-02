'use client'

import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../../components/LoadingSpinner'
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  DollarSign,
  User,
  Briefcase,
  Send,
  RefreshCw,
} from 'lucide-react'

type EscrowHold = {
  id: string
  amount: number
  platform_fee: number
  contractor_payout: number
  status: string
  created_at: string
  homeowner_confirmed_complete: boolean | null
  contractor_confirmed_complete: boolean | null
  homeowner_confirmed_at: string | null
  contractor_confirmed_at: string | null
  stripe_payment_intent_id: string
  homeowner_id: string
  contractor_id: string
  job_id: string | null
  homeowner_name: string
  contractor_name: string
  job_title: string
  days_in_escrow: number
}

export default function EscrowManagementPage() {
  const searchParams = useSearchParams()
  const filterParam = searchParams?.get('filter')

  const [escrowHolds, setEscrowHolds] = useState<EscrowHold[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'stuck'>((filterParam as any) || 'active')
  const [selectedHold, setSelectedHold] = useState<EscrowHold | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchEscrowHolds = async () => {
    try {
      let query = supabase
        .from('payment_holds')
        .select('*')
        .order('created_at', { ascending: false })

      if (filter === 'active') {
        query = query.eq('status', 'captured')
      } else if (filter === 'stuck') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        query = query
          .eq('status', 'captured')
          .lt('created_at', sevenDaysAgo.toISOString())
      }

      const { data, error } = await query

      if (error) throw error

      // Fetch names and calculate days
      const holdsWithDetails = await Promise.all(
        (data || []).map(async (hold) => {
          const [{ data: homeowner }, { data: contractor }, { data: job }] = await Promise.all([
            supabase.from('user_profiles').select('name').eq('id', hold.homeowner_id).single(),
            supabase.from('pro_contractors').select('name').eq('id', hold.contractor_id).single(),
            hold.job_id
              ? supabase.from('homeowner_jobs').select('title').eq('id', hold.job_id).single()
              : Promise.resolve({ data: null }),
          ])

          const daysInEscrow = Math.floor(
            (Date.now() - new Date(hold.created_at).getTime()) / (1000 * 60 * 60 * 24)
          )

          return {
            ...hold,
            homeowner_name: homeowner?.name || 'Unknown',
            contractor_name: contractor?.name || 'Unknown',
            job_title: job?.title || 'Direct Offer',
            days_in_escrow: daysInEscrow,
          }
        })
      )

      setEscrowHolds(holdsWithDetails)
    } catch (error) {
      console.error('Error fetching escrow holds:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEscrowHolds()

    const subscription = supabase
      .channel('escrow-holds')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_holds' }, () => {
        fetchEscrowHolds()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [filter])

  const handleForceRelease = async (holdId: string) => {
    if (!confirm('Are you sure you want to force release this payment? This action cannot be undone.')) {
      return
    }

    setActionLoading(true)
    try {
      // First update the hold to mark both as confirmed
      const { error: updateError } = await supabase
        .from('payment_holds')
        .update({
          homeowner_confirmed_complete: true,
          contractor_confirmed_complete: true,
          homeowner_confirmed_at: new Date().toISOString(),
          contractor_confirmed_at: new Date().toISOString(),
        })
        .eq('id', holdId)

      if (updateError) throw updateError

      // The database trigger will automatically set status to 'released'
      // Then call the release API
      const response = await fetch('/api/payments/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentHoldId: holdId }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to release payment')
      }

      alert('Payment released successfully!')
      setSelectedHold(null)
      await fetchEscrowHolds()
    } catch (error: any) {
      console.error('Error releasing payment:', error)
      alert(`Failed to release payment: ${error.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRefund = async (holdId: string) => {
    const reason = prompt('Enter refund reason:')
    if (!reason) return

    setActionLoading(true)
    try {
      // For now, just update status - full refund implementation needs Stripe API call
      const { error } = await supabase
        .from('payment_holds')
        .update({
          status: 'refunded',
          refund_reason: reason,
          refunded_at: new Date().toISOString(),
        })
        .eq('id', holdId)

      if (error) throw error

      alert('Payment marked as refunded. Note: Stripe refund must be processed separately.')
      setSelectedHold(null)
      await fetchEscrowHolds()
    } catch (error: any) {
      console.error('Error refunding payment:', error)
      alert(`Failed to refund: ${error.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'captured':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      case 'released':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      case 'refunded':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="Loading escrow holds..." />
      </div>
    )
  }

  const totalEscrow = escrowHolds
    .filter((h) => h.status === 'captured')
    .reduce((sum, hold) => sum + hold.amount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Escrow Management</h1>
          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
            Monitor and manage payments held in escrow
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('active')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'active'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            Active ({escrowHolds.filter((h) => h.status === 'captured').length})
          </button>
          <button
            onClick={() => setFilter('stuck')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'stuck'
                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                : 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            Stuck (&gt;7 days)
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                : 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            All History
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">Total in Escrow</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {formatCurrency(totalEscrow)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">Active Holds</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {escrowHolds.filter((h) => h.status === 'captured').length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">Avg. Days in Escrow</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {escrowHolds.length > 0
              ? Math.round(escrowHolds.reduce((sum, h) => sum + h.days_in_escrow, 0) / escrowHolds.length)
              : 0}
          </div>
        </div>
      </div>

      {/* Escrow Holds List */}
      {escrowHolds.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-12 text-center">
          <Clock className="h-12 w-12 text-gray-400 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No {filter === 'stuck' ? 'stuck' : filter} escrow holds
          </h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {filter === 'active' ? 'All payments have been released or there are no active escrow holds.' : 'Change filter to see more.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {escrowHolds.map((hold) => (
            <div
              key={hold.id}
              className={`bg-white dark:bg-slate-900 rounded-2xl border p-6 hover:shadow-md transition-shadow ${
                hold.days_in_escrow > 7
                  ? 'border-rose-200 dark:border-rose-900'
                  : 'border-gray-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{hold.job_title}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(hold.status)}`}>
                      {hold.status}
                    </span>
                    {hold.days_in_escrow > 7 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {hold.days_in_escrow} days in escrow
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Homeowner:
                      </span>
                      <p className="font-medium text-gray-900 dark:text-white">{hold.homeowner_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        Contractor:
                      </span>
                      <p className="font-medium text-gray-900 dark:text-white">{hold.contractor_name}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Total Amount:</span>
                      <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(hold.amount)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Platform Fee (10%):</span>
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(hold.platform_fee)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Contractor Payout:</span>
                      <p className="font-semibold text-blue-600 dark:text-blue-400">
                        {formatCurrency(hold.contractor_payout)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      {hold.homeowner_confirmed_complete ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-400" />
                      )}
                      <span className="text-gray-700 dark:text-slate-300">
                        Homeowner {hold.homeowner_confirmed_complete ? 'confirmed' : 'pending'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hold.contractor_confirmed_complete ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-400" />
                      )}
                      <span className="text-gray-700 dark:text-slate-300">
                        Contractor {hold.contractor_confirmed_complete ? 'confirmed' : 'pending'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-500 dark:text-slate-500">
                    Created: {new Date(hold.created_at).toLocaleString()} • {hold.days_in_escrow} days ago
                  </div>
                </div>

                {/* Actions */}
                {hold.status === 'captured' && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => setSelectedHold(hold)}
                      className="px-3 py-2 bg-blue-100 hover:bg-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium transition-colors"
                    >
                      Details
                    </button>
                    {hold.days_in_escrow > 7 && (
                      <button
                        onClick={() => handleForceRelease(hold.id)}
                        disabled={actionLoading}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                      >
                        <Send className="h-4 w-4" />
                        Force Release
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedHold && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Escrow Hold Details</h2>
              <button
                onClick={() => setSelectedHold(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Job Information</h3>
                <p className="text-sm text-gray-700 dark:text-slate-300">{selectedHold.job_title}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Homeowner</h3>
                  <p className="text-sm text-gray-700 dark:text-slate-300">{selectedHold.homeowner_name}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Contractor</h3>
                  <p className="text-sm text-gray-700 dark:text-slate-300">{selectedHold.contractor_name}</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Payment Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-slate-400">Total Amount:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatCurrency(selectedHold.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-slate-400">Platform Fee (10%):</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      -{formatCurrency(selectedHold.platform_fee)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-slate-700">
                    <span className="text-gray-600 dark:text-slate-400">Contractor Receives:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {formatCurrency(selectedHold.contractor_payout)}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Stripe Information</h3>
                <p className="text-xs text-gray-600 dark:text-slate-400 font-mono">
                  {selectedHold.stripe_payment_intent_id}
                </p>
              </div>

              {selectedHold.status === 'captured' && (
                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
                  <button
                    onClick={() => handleForceRelease(selectedHold.id)}
                    disabled={actionLoading}
                    className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {actionLoading ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <>
                        <Send className="h-5 w-5" />
                        Force Release Payment
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleRefund(selectedHold.id)}
                    disabled={actionLoading}
                    className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="h-5 w-5" />
                    Issue Refund
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
