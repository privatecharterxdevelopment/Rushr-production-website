'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../../components/LoadingSpinner'
import { TrendingUp, DollarSign, Calendar } from 'lucide-react'

type MonthlyRevenue = {
  month: string
  platform_fees: number
  contractor_payouts: number
  transaction_count: number
}

export default function RevenueAnalyticsPage() {
  const [monthlyData, setMonthlyData] = useState<MonthlyRevenue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_holds')
        .select('platform_fee, contractor_payout, released_at')
        .eq('status', 'released')
        .not('released_at', 'is', null)
        .order('released_at', { ascending: false })

      if (error) throw error

      // Group by month
      const monthlyMap = new Map<string, MonthlyRevenue>()

      data?.forEach((payment) => {
        const date = new Date(payment.released_at!)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            month: monthKey,
            platform_fees: 0,
            contractor_payouts: 0,
            transaction_count: 0,
          })
        }

        const monthData = monthlyMap.get(monthKey)!
        monthData.platform_fees += Number(payment.platform_fee)
        monthData.contractor_payouts += Number(payment.contractor_payout)
        monthData.transaction_count += 1
      })

      setMonthlyData(Array.from(monthlyMap.values()).sort((a, b) => b.month.localeCompare(a.month)))
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg"  />
      </div>
    )
  }

  const totalRevenue = monthlyData.reduce((sum, m) => sum + m.platform_fees, 0)
  const totalPayouts = monthlyData.reduce((sum, m) => sum + m.contractor_payouts, 0)
  const totalTransactions = monthlyData.reduce((sum, m) => sum + m.transaction_count, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Revenue Analytics</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          Platform revenue and transaction trends
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="h-6 w-6 text-emerald-600" />
            <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">Total Platform Revenue</div>
          </div>
          <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">All time (10% fees)</div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-6 w-6 text-blue-600" />
            <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">Total Payouts</div>
          </div>
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            {formatCurrency(totalPayouts)}
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Paid to contractors</div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="h-6 w-6 text-purple-600" />
            <div className="text-xs text-gray-500 dark:text-slate-400 uppercase">Transactions</div>
          </div>
          <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {totalTransactions}
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Completed jobs</div>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Monthly Breakdown</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Month
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Transactions
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Platform Revenue
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Contractor Payouts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Avg. Per Transaction
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
            {monthlyData.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                  No completed transactions yet
                </td>
              </tr>
            ) : (
              monthlyData.map((month) => (
                <tr key={month.month} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                    {formatMonth(month.month)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                    {month.transaction_count}
                  </td>
                  <td className="px-6 py-4 font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(month.platform_fees)}
                  </td>
                  <td className="px-6 py-4 font-medium text-blue-600 dark:text-blue-400">
                    {formatCurrency(month.contractor_payouts)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                    {formatCurrency(month.platform_fees / month.transaction_count)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950 rounded-2xl border border-blue-200 dark:border-blue-900 p-6">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Revenue Model</h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Platform Fee: <strong>10%</strong> of job amount (deducted from contractor payout)</li>
          <li>• Stripe Processing Fee: <strong>2.9% + $0.30</strong> (absorbed by platform)</li>
          <li>• Net Revenue: Platform fee minus Stripe fees</li>
        </ul>
      </div>
    </div>
  )
}
