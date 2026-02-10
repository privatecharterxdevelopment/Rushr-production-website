'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../contexts/AuthContext'
import { supabase } from '../../../../lib/supabaseClient'
import { ArrowLeft, DollarSign, ChevronRight, Clock, CheckCircle2 } from 'lucide-react'
import { FullScreenLoading } from '../../../../components/LoadingSpinner'
import { Capacitor } from '@capacitor/core'
import { safeBack } from '../../../../lib/safeBack'

// Hook to safely check if running in native app (avoids hydration mismatch)
function useIsNative() {
  const [isNative, setIsNative] = useState(false)
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])
  return isNative
}

interface Transaction {
  id: string
  job_id: string | null
  job_title: string
  contractor_name: string
  amount: number
  status: 'pending' | 'completed' | 'refunded' | 'failed'
  payment_method: string
  created_at: string
  completed_at: string | null
  stripe_payment_intent_id?: string
  receipt_url?: string
}

export default function TransactionsPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const isNative = useIsNative()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [showLoadingScreen, setShowLoadingScreen] = useState(false)

  // Only show loading screen if loading takes longer than 500ms, with 8s safety timeout
  useEffect(() => {
    if (authLoading || loading) {
      const showTimer = setTimeout(() => setShowLoadingScreen(true), 500)
      const safetyTimer = setTimeout(() => {
        setLoading(false)
        setShowLoadingScreen(false)
      }, 8000)
      return () => { clearTimeout(showTimer); clearTimeout(safetyTimer) }
    } else {
      setShowLoadingScreen(false)
    }
  }, [authLoading, loading])

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        // Fetch all jobs that have a payment (completed, confirmed, in_progress, cancelled)
        const { data: jobs, error: jobsError } = await supabase
          .from('homeowner_jobs')
          .select(`
            id,
            job_number,
            title,
            final_cost,
            estimated_cost,
            status,
            completed_date,
            created_at,
            contractor_id,
            stripe_payment_intent_id
          `)
          .eq('homeowner_id', user.id)
          .in('status', ['completed', 'confirmed', 'in_progress', 'cancelled'])
          .order('created_at', { ascending: false })
          .limit(50)

        if (jobsError) {
          console.error('Error fetching jobs:', jobsError)
          setLoading(false)
          return
        }

        // Also fetch payment holds for active escrows
        const { data: holds } = await supabase
          .from('payment_holds')
          .select('job_id, status, amount')
          .eq('homeowner_id', user.id)

        const holdMap = new Map(
          (holds || []).map(h => [h.job_id, h])
        )

        // Get all unique contractor IDs
        const contractorIds = [...new Set((jobs || []).map(j => j.contractor_id).filter(Boolean))]

        // Fetch all contractors in one query
        let contractorMap = new Map()
        if (contractorIds.length > 0) {
          const { data: contractors } = await supabase
            .from('pro_contractors')
            .select('id, business_name, name')
            .in('id', contractorIds)

          contractorMap = new Map(
            (contractors || []).map(c => [c.id, c])
          )
        }

        // Map job status to transaction status
        const mapStatus = (job: any): Transaction['status'] => {
          if (job.status === 'completed') return 'completed'
          if (job.status === 'cancelled') {
            const hold = holdMap.get(job.id)
            return hold?.status === 'refunded' ? 'refunded' : 'failed'
          }
          return 'pending' // confirmed or in_progress = escrow held
        }

        // Create transactions from jobs
        const enrichedTransactions: Transaction[] = (jobs || [])
          .filter((job: any) => {
            // Only show jobs that have a cost or an active hold
            return job.final_cost || job.estimated_cost || holdMap.has(job.id)
          })
          .map((job: any) => {
            const contractor = job.contractor_id ? contractorMap.get(job.contractor_id) : null
            const contractorName = contractor?.business_name || contractor?.name || 'Contractor'
            const hold = holdMap.get(job.id)

            return {
              id: job.id,
              job_id: job.job_number || job.id,
              job_title: job.title,
              contractor_name: contractorName,
              amount: job.final_cost || hold?.amount || job.estimated_cost || 0,
              status: mapStatus(job),
              payment_method: 'Credit Card',
              created_at: job.created_at,
              completed_at: job.completed_date,
              stripe_payment_intent_id: job.stripe_payment_intent_id,
              receipt_url: null
            }
          })

        setTransactions(enrichedTransactions)

        // Fetch Stripe receipts in background (non-blocking, 10s timeout)
        const controller = new AbortController()
        const stripeTimeout = setTimeout(() => controller.abort(), 10000)
        fetch(`/api/stripe/transactions?userId=${user.id}`, { signal: controller.signal })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.charges) {
              const updatedTransactions = enrichedTransactions.map(tx => {
                const stripeCharge = data.charges.find((c: any) =>
                  c.payment_intent === tx.stripe_payment_intent_id ||
                  (typeof c.payment_intent === 'object' && c.payment_intent?.id === tx.stripe_payment_intent_id)
                )
                if (stripeCharge) {
                  return {
                    ...tx,
                    receipt_url: stripeCharge.receipt_url,
                    payment_method: stripeCharge.payment_method_details?.type === 'card'
                      ? `${stripeCharge.payment_method_details.card.brand.toUpperCase()} •••• ${stripeCharge.payment_method_details.card.last4}`
                      : tx.payment_method
                  }
                }
                return tx
              })
              setTransactions(updatedTransactions)
            }
          })
          .catch(err => {
            if (err.name !== 'AbortError') console.error('Failed to fetch Stripe data:', err)
          })
          .finally(() => clearTimeout(stripeTimeout))
      } catch (error) {
        console.error('Failed to fetch transactions:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTransactions()
  }, [user])

  // Show full-screen loading only if loading takes too long
  if ((authLoading || loading) && showLoadingScreen) {
    return <FullScreenLoading />
  }

  // Redirect to login if not authenticated
  if (!authLoading && !loading && (!user || !userProfile)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Please sign in to view transactions</h2>
          <Link href="/?auth=signin" className="btn-primary">Sign In</Link>
        </div>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700 border-green-200'
      case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'refunded': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'failed': return 'bg-red-100 text-red-700 border-red-200'
      default: return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Paid'
      case 'pending': return 'Held'
      case 'refunded': return 'Refunded'
      case 'failed': return 'Cancelled'
      default: return status.charAt(0).toUpperCase() + status.slice(1)
    }
  }

  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-slate-950"
      style={{
        paddingTop: isNative ? 'env(safe-area-inset-top)' : undefined,
        paddingBottom: isNative ? 'calc(80px + env(safe-area-inset-bottom))' : undefined
      }}
    >
      {/* iOS Native Header */}
      {isNative && (
        <div
          className="sticky top-0 z-50"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
          }}
        >
          <div className="flex items-center px-4 py-3">
            <button
              onClick={() => safeBack(router, '/dashboard')}
              className="flex items-center text-white active:opacity-60"
            >
              <ArrowLeft className="w-6 h-6" />
              <span className="ml-1 font-medium">Back</span>
            </button>
            <h1 className="flex-1 text-center text-white font-semibold text-lg pr-12">
              Transactions
            </h1>
          </div>
        </div>
      )}

      {/* Web Header */}
      {!isNative && (
        <div
          className="relative z-20"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)'
          }}
        >
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-3">
              <Link
                href="/dashboard/homeowner"
                className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
              >
                <ArrowLeft className="h-5 w-5 text-white" />
              </Link>
              <h1 className="text-xl font-semibold text-white">Transactions</h1>
            </div>
            <p className="text-white/80 text-sm">View your payment history and receipts</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <section className="mb-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
            <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Transaction History</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  All payments and escrow holds
                </p>
              </div>
              <span className="text-sm text-slate-400">{transactions.length} total</span>
            </div>

            <div className="p-6">
              {transactions.length > 0 ? (
                <div className="space-y-3">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-start gap-3">
                            {transaction.status === 'completed' ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                            ) : transaction.status === 'pending' ? (
                              <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                            ) : (
                              <DollarSign className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-slate-900 dark:text-white mb-1">
                                {transaction.job_title}
                              </h4>
                              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                <span className="flex items-center gap-1">
                                  Contractor: <span className="font-medium">{transaction.contractor_name}</span>
                                </span>
                                <span className="text-slate-400">•</span>
                                <span>{transaction.payment_method}</span>
                                {transaction.completed_at && (
                                  <>
                                    <span className="text-slate-400">•</span>
                                    <span>{new Date(transaction.completed_at).toLocaleDateString()}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(transaction.status)}`}>
                            {getStatusLabel(transaction.status)}
                          </span>
                          <div className="text-right">
                            <div className="text-lg font-bold text-slate-900 dark:text-white">
                              ${transaction.amount.toFixed(2)}
                            </div>
                          </div>
                          {transaction.receipt_url && (
                            <a
                              href={transaction.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-outline text-sm"
                            >
                              Receipt
                            </a>
                          )}
                          {transaction.job_id && (
                            <Link
                              href={`/jobs/${transaction.job_id}`}
                              className="btn btn-outline text-sm"
                            >
                              View Job
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-8 w-8 text-slate-400" />
                  </div>
                  <h4 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                    No Completed Jobs Yet
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400 mb-4">
                    Your completed emergency services will appear here
                  </p>
                  <Link
                    href="/post-job"
                    className="btn-primary"
                  >
                    Post Your First Emergency
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
