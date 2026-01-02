'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../../components/LoadingSpinner'
import { Search, Filter, Download } from 'lucide-react'

type Transaction = {
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
  stripe_payment_intent_id: string
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    fetchTransactions()
  }, [statusFilter])

  const fetchTransactions = async () => {
    try {
      let query = supabase.from('payment_holds').select('*').order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query

      if (error) throw error

      const txnsWithDetails = await Promise.all(
        (data || []).map(async (txn) => {
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

      setTransactions(txnsWithDetails)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredTransactions = transactions.filter(
    (txn) =>
      txn.homeowner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.contractor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.job_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.stripe_payment_intent_id.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
      case 'disputed':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300'
    }
  }

  const exportToCSV = () => {
    const headers = ['Date', 'Job', 'Homeowner', 'Contractor', 'Amount', 'Platform Fee', 'Contractor Payout', 'Status']
    const rows = filteredTransactions.map((txn) => [
      new Date(txn.created_at).toLocaleDateString(),
      txn.job_title,
      txn.homeowner_name,
      txn.contractor_name,
      txn.amount,
      txn.platform_fee,
      txn.contractor_payout,
      txn.status,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers, ...rows].map((row) => row.join(',')).join('\n')

    const link = document.createElement('a')
    link.setAttribute('href', encodeURI(csvContent))
    link.setAttribute('download', `transactions_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg"  />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">All Transactions</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          Search and filter payment transactions
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, job, or Stripe ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
        >
          <option value="all">All Status</option>
          <option value="captured">Captured (In Escrow)</option>
          <option value="released">Released</option>
          <option value="refunded">Refunded</option>
          <option value="disputed">Disputed</option>
        </select>

        <button
          onClick={exportToCSV}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 text-sm font-medium"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600 dark:text-slate-400">
        Showing {filteredTransactions.length} of {transactions.length} transactions
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                  Job
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                  Parties
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                  Platform Fee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                  Stripe ID
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                    No transactions found
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                      {new Date(txn.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{txn.job_title}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                      <div>{txn.homeowner_name}</div>
                      <div className="text-xs">→ {txn.contractor_name}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                      {formatCurrency(txn.amount)}
                    </td>
                    <td className="px-6 py-4 font-medium text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(txn.platform_fee)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(txn.status)}`}>
                        {txn.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 dark:text-slate-400 font-mono">
                      {txn.stripe_payment_intent_id?.substring(0, 20)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
