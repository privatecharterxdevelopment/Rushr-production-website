'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Eye,
  X,
  User,
  DollarSign,
  Calendar,
  Phone,
  Mail,
  Briefcase,
  MessageSquare,
  ArrowRight,
} from 'lucide-react'

type Dispute = {
  id: string
  job_id: string
  filed_by_id: string
  filed_by_type: 'homeowner' | 'contractor'
  reason: string
  description: string | null
  status: 'open' | 'under_review' | 'resolved' | 'dismissed'
  resolution: string | null
  resolution_action: string | null
  contractor_amount: number | null
  homeowner_refund: number | null
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  job?: {
    id: string
    title: string
    category: string
    status: string
    final_cost: number
    homeowner_id: string
    homeowner?: {
      name: string
      email: string
      phone: string
    }
  }
  filed_by_user?: {
    name: string
    email: string
  }
  payment_hold?: {
    id: string
    status: string
    amount: number
    contractor_payout: number
    platform_fee: number
  }
  contractor?: {
    id: string
    name: string
    business_name: string
    email: string
    phone: string
  }
}

type TabType = 'open' | 'under_review' | 'resolved' | 'all'

function StatCard({
  label,
  value,
  icon,
  tone = 'blue',
  onClick,
  active,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone?: 'blue' | 'emerald' | 'amber' | 'rose'
  onClick?: () => void
  active?: boolean
}) {
  const ring =
    tone === 'blue'
      ? 'border-blue-200 dark:border-blue-900'
      : tone === 'emerald'
      ? 'border-emerald-200 dark:border-emerald-900'
      : tone === 'amber'
      ? 'border-amber-200 dark:border-amber-900'
      : 'border-rose-200 dark:border-rose-900'

  const dot =
    tone === 'blue'
      ? 'bg-blue-500'
      : tone === 'emerald'
      ? 'bg-emerald-500'
      : tone === 'amber'
      ? 'bg-amber-500'
      : 'bg-rose-500'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border ${ring} bg-white dark:bg-slate-900 p-4 shadow-sm transition-all ${
        onClick ? 'hover:shadow-md cursor-pointer' : ''
      } ${active ? 'ring-2 ring-blue-500' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        <span className="ml-auto text-slate-400">{icon}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{value}</div>
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    under_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    resolved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    dismissed: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.open}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('open')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolutionForm, setResolutionForm] = useState({
    action: 'release_to_contractor',
    resolution: '',
    contractorAmount: '',
    homeownerRefund: '',
    adminNotes: ''
  })
  const [stats, setStats] = useState({
    open: 0,
    under_review: 0,
    resolved: 0,
    all: 0,
  })

  const fetchDisputes = async () => {
    try {
      let query = supabase
        .from('job_disputes')
        .select(`
          *,
          job:homeowner_jobs(
            id, title, category, status, final_cost, homeowner_id,
            homeowner:user_profiles!homeowner_jobs_homeowner_id_fkey(name, email, phone),
            accepted_bid:job_bids!homeowner_jobs_accepted_bid_id_fkey(contractor_id)
          )
        `)
        .order('created_at', { ascending: false })

      if (activeTab !== 'all') {
        query = query.eq('status', activeTab)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching disputes:', error)
        return
      }

      // Fetch additional data for each dispute
      const enrichedDisputes = await Promise.all((data || []).map(async (dispute) => {
        // Get contractor info
        const contractorId = dispute.job?.accepted_bid?.contractor_id
        let contractor = null
        if (contractorId) {
          const { data: contractorData } = await supabase
            .from('pro_contractors')
            .select('id, name, business_name, email, phone')
            .eq('id', contractorId)
            .single()
          contractor = contractorData
        }

        // Get payment hold
        const { data: paymentHold } = await supabase
          .from('payment_holds')
          .select('id, status, amount, contractor_payout, platform_fee')
          .eq('job_id', dispute.job_id)
          .single()

        // Get filer info
        let filedByUser = null
        if (dispute.filed_by_type === 'homeowner') {
          filedByUser = dispute.job?.homeowner
        } else if (contractor) {
          filedByUser = { name: contractor.business_name || contractor.name, email: contractor.email }
        }

        return {
          ...dispute,
          contractor,
          payment_hold: paymentHold,
          filed_by_user: filedByUser
        }
      }))

      setDisputes(enrichedDisputes)

      // Fetch stats
      const [openRes, reviewRes, resolvedRes, allRes] = await Promise.all([
        supabase.from('job_disputes').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('job_disputes').select('id', { count: 'exact', head: true }).eq('status', 'under_review'),
        supabase.from('job_disputes').select('id', { count: 'exact', head: true }).in('status', ['resolved', 'dismissed']),
        supabase.from('job_disputes').select('id', { count: 'exact', head: true }),
      ])

      setStats({
        open: openRes.count || 0,
        under_review: reviewRes.count || 0,
        resolved: resolvedRes.count || 0,
        all: allRes.count || 0,
      })
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Debounce real-time updates
  const fetchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchDisputes()
  }, [activeTab])

  // Separate effect for real-time subscription (only setup once)
  useEffect(() => {
    const subscription = supabase
      .channel('admin-disputes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_disputes' }, () => {
        // Debounce: wait 1 second before refetching
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current)
        }
        fetchTimeoutRef.current = setTimeout(() => {
          fetchDisputes()
        }, 1000)
      })
      .subscribe()

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
      }
      supabase.removeChannel(subscription)
    }
  }, [])

  const handleResolve = async () => {
    if (!selectedDispute || !resolutionForm.resolution) {
      alert('Please provide a resolution explanation')
      return
    }

    setResolving(true)

    try {
      const response = await fetch('/api/disputes/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disputeId: selectedDispute.id,
          action: resolutionForm.action,
          resolution: resolutionForm.resolution,
          contractorAmount: resolutionForm.action === 'partial_refund' ? parseFloat(resolutionForm.contractorAmount) : undefined,
          homeownerRefund: resolutionForm.action === 'partial_refund' ? parseFloat(resolutionForm.homeownerRefund) : undefined,
          adminNotes: resolutionForm.adminNotes || undefined
        })
      })

      const data = await response.json()

      if (!response.ok) {
        alert(`Error: ${data.error}`)
        return
      }

      alert('Dispute resolved successfully!')
      setSelectedDispute(null)
      setResolutionForm({
        action: 'release_to_contractor',
        resolution: '',
        contractorAmount: '',
        homeownerRefund: '',
        adminNotes: ''
      })
      fetchDisputes()
    } catch (err) {
      console.error('Error resolving dispute:', err)
      alert('Failed to resolve dispute')
    } finally {
      setResolving(false)
    }
  }

  const filteredDisputes = disputes.filter(dispute => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      dispute.reason?.toLowerCase().includes(q) ||
      dispute.job?.title?.toLowerCase().includes(q) ||
      dispute.filed_by_user?.name?.toLowerCase().includes(q) ||
      dispute.contractor?.business_name?.toLowerCase().includes(q)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Disputes Management</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          Review and resolve job disputes between homeowners and contractors
        </p>
      </div>

      {/* Alert for open disputes */}
      {stats.open > 0 && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-medium text-red-900 dark:text-red-100">
                {stats.open} dispute{stats.open !== 1 ? 's' : ''} require{stats.open === 1 ? 's' : ''} attention
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                Payments are on hold until disputes are resolved
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open"
          value={stats.open}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="rose"
          onClick={() => setActiveTab('open')}
          active={activeTab === 'open'}
        />
        <StatCard
          label="Under Review"
          value={stats.under_review}
          icon={<Clock className="h-4 w-4" />}
          tone="amber"
          onClick={() => setActiveTab('under_review')}
          active={activeTab === 'under_review'}
        />
        <StatCard
          label="Resolved"
          value={stats.resolved}
          icon={<CheckCircle className="h-4 w-4" />}
          tone="emerald"
          onClick={() => setActiveTab('resolved')}
          active={activeTab === 'resolved'}
        />
        <StatCard
          label="All Disputes"
          value={stats.all}
          icon={<MessageSquare className="h-4 w-4" />}
          tone="blue"
          onClick={() => setActiveTab('all')}
          active={activeTab === 'all'}
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by reason, job title, or party name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Disputes Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Job</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Filed By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Amount at Stake</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Filed</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
              {filteredDisputes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">
                    No disputes found
                  </td>
                </tr>
              ) : (
                filteredDisputes.map((dispute) => (
                  <tr key={dispute.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white truncate max-w-[180px]">
                          {dispute.job?.title}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">{dispute.job?.category}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm text-gray-900 dark:text-white">{dispute.filed_by_user?.name || '-'}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 capitalize">{dispute.filed_by_type}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900 dark:text-white truncate max-w-[150px]">{dispute.reason}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        ${dispute.payment_hold?.amount || dispute.job?.final_cost || 0}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={dispute.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                      {new Date(dispute.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedDispute(dispute)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dispute Detail & Resolution Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Dispute Details</h2>
              <button onClick={() => setSelectedDispute(null)} className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Dispute Summary */}
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <StatusBadge status={selectedDispute.status} />
                </div>
                <h3 className="font-medium text-red-900 dark:text-red-100 mb-1">Reason: {selectedDispute.reason}</h3>
                {selectedDispute.description && (
                  <p className="text-sm text-red-800 dark:text-red-200">{selectedDispute.description}</p>
                )}
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                  Filed by {selectedDispute.filed_by_type}: {selectedDispute.filed_by_user?.name} on {new Date(selectedDispute.created_at).toLocaleString()}
                </p>
              </div>

              {/* Job Info */}
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">Job: {selectedDispute.job?.title}</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-slate-400">Category</p>
                    <p className="text-gray-900 dark:text-white">{selectedDispute.job?.category}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-slate-400">Job Status</p>
                    <p className="text-gray-900 dark:text-white">{selectedDispute.job?.status}</p>
                  </div>
                </div>
              </div>

              {/* Parties */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-4 w-4 text-gray-500" />
                    <h4 className="font-medium text-gray-900 dark:text-white">Homeowner</h4>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="text-gray-900 dark:text-white">{selectedDispute.job?.homeowner?.name || '-'}</p>
                    <p className="text-gray-500 dark:text-slate-400 flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {selectedDispute.job?.homeowner?.email}
                    </p>
                    <p className="text-gray-500 dark:text-slate-400 flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {selectedDispute.job?.homeowner?.phone || '-'}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="h-4 w-4 text-gray-500" />
                    <h4 className="font-medium text-gray-900 dark:text-white">Contractor</h4>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="text-gray-900 dark:text-white">{selectedDispute.contractor?.business_name || selectedDispute.contractor?.name || '-'}</p>
                    <p className="text-gray-500 dark:text-slate-400 flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {selectedDispute.contractor?.email || '-'}
                    </p>
                    <p className="text-gray-500 dark:text-slate-400 flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {selectedDispute.contractor?.phone || '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-gray-500" />
                  <h4 className="font-medium text-gray-900 dark:text-white">Payment on Hold</h4>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-slate-400">Total Amount</p>
                    <p className="text-gray-900 dark:text-white font-medium text-lg">${selectedDispute.payment_hold?.amount || selectedDispute.job?.final_cost || 0}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-slate-400">Contractor Payout</p>
                    <p className="text-gray-900 dark:text-white">${selectedDispute.payment_hold?.contractor_payout || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-slate-400">Platform Fee</p>
                    <p className="text-gray-900 dark:text-white">${selectedDispute.payment_hold?.platform_fee || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Resolution Form - only for open/under_review disputes */}
              {['open', 'under_review'].includes(selectedDispute.status) && (
                <div className="border-t border-gray-200 dark:border-slate-800 pt-6">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-4">Resolve Dispute</h4>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Resolution Action
                      </label>
                      <select
                        value={resolutionForm.action}
                        onChange={(e) => setResolutionForm(prev => ({ ...prev, action: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      >
                        <option value="release_to_contractor">Release Full Payment to Contractor</option>
                        <option value="refund_homeowner">Full Refund to Homeowner</option>
                        <option value="partial_refund">Partial Refund (Custom Split)</option>
                        <option value="dismissed">Dismiss Dispute (Job Continues)</option>
                      </select>
                    </div>

                    {resolutionForm.action === 'partial_refund' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                            Amount to Contractor ($)
                          </label>
                          <input
                            type="number"
                            value={resolutionForm.contractorAmount}
                            onChange={(e) => setResolutionForm(prev => ({ ...prev, contractorAmount: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                            Refund to Homeowner ($)
                          </label>
                          <input
                            type="number"
                            value={resolutionForm.homeownerRefund}
                            onChange={(e) => setResolutionForm(prev => ({ ...prev, homeownerRefund: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Resolution Explanation (will be sent to both parties) *
                      </label>
                      <textarea
                        value={resolutionForm.resolution}
                        onChange={(e) => setResolutionForm(prev => ({ ...prev, resolution: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                        placeholder="Explain the reason for this resolution..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Admin Notes (internal only)
                      </label>
                      <textarea
                        value={resolutionForm.adminNotes}
                        onChange={(e) => setResolutionForm(prev => ({ ...prev, adminNotes: e.target.value }))}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                        placeholder="Internal notes about this dispute..."
                      />
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setSelectedDispute(null)}
                        className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleResolve}
                        disabled={resolving || !resolutionForm.resolution}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg flex items-center gap-2"
                      >
                        {resolving ? 'Resolving...' : 'Resolve Dispute'}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Resolution Info for resolved disputes */}
              {selectedDispute.status === 'resolved' && selectedDispute.resolution && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <h4 className="font-medium text-green-900 dark:text-green-100">Resolution</h4>
                  </div>
                  <p className="text-sm text-green-800 dark:text-green-200">{selectedDispute.resolution}</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                    Action: {selectedDispute.resolution_action?.replace(/_/g, ' ')} | Resolved: {selectedDispute.resolved_at ? new Date(selectedDispute.resolved_at).toLocaleString() : '-'}
                  </p>
                  {selectedDispute.admin_notes && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Admin notes: {selectedDispute.admin_notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
