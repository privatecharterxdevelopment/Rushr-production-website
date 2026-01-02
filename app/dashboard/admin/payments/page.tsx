'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowUpRight,
  Wallet,
  CreditCard,
  Banknote,
  AlertCircle,
} from 'lucide-react'

type FinancialStats = {
  totalEscrowBalance: number
  platformRevenueToday: number
  platformRevenueMonth: number
  platformRevenueAllTime: number
  completedPayoutsMonth: number
  pendingPayouts: number
  activeEscrowCount: number
  stuckPaymentsCount: number
  disputedPaymentsCount: number
}

type RecentTransaction = {
  id: string
  amount: number
  platform_fee: number
  contractor_payout: number
  status: string
  created_at: string
  released_at: string | null
  homeowner_name: string
  contractor_name: string
  job_title: string
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'blue',
  href,
  trend,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: React.ReactNode
  tone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple'
  href?: string
  trend?: string
}) {
  const ring =
    tone === 'blue'
      ? 'border-blue-200 dark:border-blue-900'
      : tone === 'emerald'
      ? 'border-emerald-200 dark:border-emerald-900'
      : tone === 'amber'
      ? 'border-amber-200 dark:border-amber-900'
      : tone === 'purple'
      ? 'border-purple-200 dark:border-purple-900'
      : 'border-rose-200 dark:border-rose-900'
  const dot =
    tone === 'blue'
      ? 'bg-blue-500'
      : tone === 'emerald'
      ? 'bg-emerald-500'
      : tone === 'amber'
      ? 'bg-amber-500'
      : tone === 'purple'
      ? 'bg-purple-500'
      : 'bg-rose-500'

  const content = (
    <div
      className={`rounded-2xl border ${ring} bg-white dark:bg-slate-900 p-4 shadow-sm ${
        href ? 'hover:shadow-md transition-shadow cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        {icon ? <span className="ml-auto text-slate-400">{icon}</span> : null}
      </div>
      <div className="mt-1 text-2xl font-semibold text-ink dark:text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
      {trend && (
        <div className="mt-2 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <TrendingUp className="h-3 w-3" />
          {trend}
        </div>
      )}
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

export default function PaymentsOverviewPage() {
  const [stats, setStats] = useState<FinancialStats | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFinancialData = async () => {
    try {
      // Fetch escrow balance (captured but not released)
      const { data: escrowHolds, error: escrowError } = await supabase
        .from('payment_holds')
        .select('amount, platform_fee, contractor_payout, created_at')
        .eq('status', 'captured')

      const totalEscrow = escrowHolds?.reduce((sum, hold) => sum + Number(hold.amount), 0) || 0
      const activeEscrowCount = escrowHolds?.length || 0

      // Fetch platform revenue (released payments = completed transactions)
      const { data: released, error: releasedError } = await supabase
        .from('payment_holds')
        .select('platform_fee, released_at')
        .eq('status', 'released')

      const allTimeRevenue = released?.reduce((sum, hold) => sum + Number(hold.platform_fee), 0) || 0

      // Today's revenue
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayRevenue =
        released
          ?.filter((h) => h.released_at && new Date(h.released_at) >= today)
          .reduce((sum, hold) => sum + Number(hold.platform_fee), 0) || 0

      // This month's revenue
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const monthRevenue =
        released
          ?.filter((h) => h.released_at && new Date(h.released_at) >= monthStart)
          .reduce((sum, hold) => sum + Number(hold.platform_fee), 0) || 0

      const monthPayouts =
        released
          ?.filter((h) => h.released_at && new Date(h.released_at) >= monthStart)
          .reduce((sum, hold) => sum + Number(hold.contractor_payout), 0) || 0

      // Stuck payments (in escrow > 7 days, not confirmed by both parties)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const { data: stuckPayments } = await supabase
        .from('payment_holds')
        .select('id')
        .eq('status', 'captured')
        .lt('created_at', sevenDaysAgo.toISOString())
        .or(
          'homeowner_confirmed_complete.is.null,contractor_confirmed_complete.is.null,homeowner_confirmed_complete.eq.false,contractor_confirmed_complete.eq.false'
        )

      const stuckCount = stuckPayments?.length || 0

      // Disputed payments
      const { count: disputedCount } = await supabase
        .from('payment_holds')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'disputed')

      // Recent transactions with job details
      const { data: recent } = await supabase
        .from('payment_holds')
        .select(
          `
          id,
          amount,
          platform_fee,
          contractor_payout,
          status,
          created_at,
          released_at,
          homeowner_id,
          contractor_id,
          job_id
        `
        )
        .order('created_at', { ascending: false })
        .limit(10)

      // Fetch homeowner and contractor names
      const recentWithNames = await Promise.all(
        (recent || []).map(async (txn) => {
          const [{ data: homeowner }, { data: contractor }, { data: job }] = await Promise.all([
            supabase.from('user_profiles').select('name').eq('id', txn.homeowner_id).single(),
            supabase.from('pro_contractors').select('name').eq('id', txn.contractor_id).single(),
            txn.job_id
              ? supabase.from('homeowner_jobs').select('title').eq('id', txn.job_id).single()
              : Promise.resolve({ data: null }),
          ])

          return {
            ...txn,
            homeowner_name: homeowner?.name || 'Unknown',
            contractor_name: contractor?.name || 'Unknown',
            job_title: job?.title || 'Direct Offer',
          }
        })
      )

      setStats({
        totalEscrowBalance: totalEscrow,
        platformRevenueToday: todayRevenue,
        platformRevenueMonth: monthRevenue,
        platformRevenueAllTime: allTimeRevenue,
        completedPayoutsMonth: monthPayouts,
        pendingPayouts: totalEscrow,
        activeEscrowCount,
        stuckPaymentsCount: stuckCount,
        disputedPaymentsCount: disputedCount || 0,
      })

      setRecentTransactions(recentWithNames)
    } catch (error) {
      console.error('Error fetching financial data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFinancialData()

    // Real-time subscription
    const subscription = supabase
      .channel('admin-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_holds' }, () => {
        fetchFinancialData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'captured':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      case 'released':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      case 'refunded':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
      case 'disputed':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="Loading financial data..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payments & Escrow</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          Financial oversight and transaction monitoring
        </p>
      </div>

      {/* Revenue Stats */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Platform Revenue</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Today's Revenue"
            value={formatCurrency(stats?.platformRevenueToday || 0)}
            hint="Platform fees (10%)"
            icon={<DollarSign className="h-4 w-4" />}
            tone="emerald"
          />
          <StatCard
            label="This Month"
            value={formatCurrency(stats?.platformRevenueMonth || 0)}
            hint="Platform fees collected"
            icon={<TrendingUp className="h-4 w-4" />}
            tone="emerald"
          />
          <StatCard
            label="All Time Revenue"
            value={formatCurrency(stats?.platformRevenueAllTime || 0)}
            hint="Total platform fees"
            icon={<Banknote className="h-4 w-4" />}
            tone="purple"
          />
          <StatCard
            label="Contractor Payouts"
            value={formatCurrency(stats?.completedPayoutsMonth || 0)}
            hint="This month"
            icon={<Wallet className="h-4 w-4" />}
            tone="blue"
          />
        </div>
      </div>

      {/* Escrow Stats */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Escrow Management</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active Escrow"
            value={formatCurrency(stats?.totalEscrowBalance || 0)}
            hint={`${stats?.activeEscrowCount || 0} payments held`}
            icon={<Clock className="h-4 w-4" />}
            tone="amber"
            href="/dashboard/admin/payments/escrow"
          />
          <StatCard
            label="Stuck Payments"
            value={stats?.stuckPaymentsCount || 0}
            hint="&gt;7 days in escrow"
            icon={<AlertTriangle className="h-4 w-4" />}
            tone={stats && stats.stuckPaymentsCount > 0 ? 'rose' : 'blue'}
            href="/dashboard/admin/payments/escrow?filter=stuck"
          />
          <StatCard
            label="Disputed"
            value={stats?.disputedPaymentsCount || 0}
            hint="Requires resolution"
            icon={<AlertCircle className="h-4 w-4" />}
            tone={stats && stats.disputedPaymentsCount > 0 ? 'rose' : 'blue'}
          />
          <StatCard
            label="Completed"
            value={stats?.activeEscrowCount || 0}
            hint="Awaiting confirmation"
            icon={<CheckCircle className="h-4 w-4" />}
            tone="blue"
          />
        </div>
      </div>

      {/* Alerts */}
      {stats && stats.stuckPaymentsCount > 0 && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-rose-900 dark:text-rose-100">
                Stuck Payments Detected
              </h3>
              <p className="text-sm text-rose-700 dark:text-rose-300 mt-1">
                {stats.stuckPaymentsCount} payment{stats.stuckPaymentsCount !== 1 ? 's have' : ' has'} been in
                escrow for more than 7 days without both parties confirming completion.
              </p>
              <Link
                href="/dashboard/admin/payments/escrow?filter=stuck"
                className="mt-3 inline-flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Review Stuck Payments
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Transactions</h2>
          <Link
            href="/dashboard/admin/payments/transactions"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            View All
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Job
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Parties
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Platform Fee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
              {recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                    No transactions yet
                  </td>
                </tr>
              ) : (
                recentTransactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{txn.job_title}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                      <div>{txn.homeowner_name}</div>
                      <div className="text-xs">→ {txn.contractor_name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(txn.amount)}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(txn.platform_fee)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(txn.status)}`}>
                        {txn.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                      {new Date(txn.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/dashboard/admin/payments/escrow"
          className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 hover:shadow-md transition-shadow"
        >
          <CreditCard className="h-8 w-8 text-blue-600 mb-3" />
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Manage Escrow</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            View and manage active escrow holds
          </p>
        </Link>

        <Link
          href="/dashboard/admin/payments/payouts"
          className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 hover:shadow-md transition-shadow"
        >
          <Wallet className="h-8 w-8 text-emerald-600 mb-3" />
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Contractor Payouts</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Monitor contractor payout status
          </p>
        </Link>

        <Link
          href="/dashboard/admin/payments/analytics"
          className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 hover:shadow-md transition-shadow"
        >
          <TrendingUp className="h-8 w-8 text-purple-600 mb-3" />
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Revenue Analytics</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            View detailed revenue reports
          </p>
        </Link>
      </div>
    </div>
  )
}
