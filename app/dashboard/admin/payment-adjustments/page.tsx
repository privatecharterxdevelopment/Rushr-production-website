'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import {
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Eye,
  X,
  User,
  Calendar,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'

type PaymentAdjustment = {
  id: string
  booking_id: string | null
  requested_by: 'homeowner' | 'contractor'
  requester_id: string
  requester_name: string
  homeowner_id: string
  contractor_id: string
  original_amount: number
  new_amount: number
  difference: number
  reason: string
  category: string | null
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  stripe_payment_link_id: string | null
  stripe_payment_link_url: string | null
  payment_intent_id: string | null
  responded_by_id: string | null
  responded_by_name: string | null
  response_note: string | null
  responded_at: string | null
  expires_at: string
  created_at: string
  // Joined data
  homeowner?: {
    id: string
    name: string
    email: string
    phone: string
  }
  contractor?: {
    id: string
    name: string
    business_name: string
    email: string
    phone: string
  }
}

type TabType = 'pending' | 'accepted' | 'declined' | 'all'

function StatCard({
  label,
  value,
  icon,
  tone = 'blue',
  onClick,
  active,
  hint,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  tone?: 'blue' | 'emerald' | 'amber' | 'rose'
  onClick?: () => void
  active?: boolean
  hint?: string
}) {
  const ring =
    tone === 'blue'
      ? 'border-blue-200'
      : tone === 'emerald'
      ? 'border-emerald-200'
      : tone === 'amber'
      ? 'border-amber-200'
      : 'border-rose-200'

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
      className={`w-full text-left rounded-2xl border ${ring} bg-white p-4 shadow-sm transition-all ${
        onClick ? 'hover:shadow-md cursor-pointer' : ''
      } ${active ? 'ring-2 ring-blue-500' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <span className="ml-auto text-slate-400">{icon}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    accepted: 'bg-emerald-100 text-emerald-800',
    declined: 'bg-red-100 text-red-800',
    cancelled: 'bg-slate-100 text-slate-700',
  }

  const icons: Record<string, React.ReactNode> = {
    pending: <Clock className="h-3 w-3" />,
    accepted: <CheckCircle className="h-3 w-3" />,
    declined: <XCircle className="h-3 w-3" />,
    cancelled: <AlertCircle className="h-3 w-3" />,
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function RequestedByBadge({ requestedBy }: { requestedBy: string }) {
  const styles: Record<string, string> = {
    homeowner: 'bg-blue-100 text-blue-800',
    contractor: 'bg-purple-100 text-purple-800',
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[requestedBy] || 'bg-slate-100 text-slate-700'}`}>
      {requestedBy}
    </span>
  )
}

export default function AdminPaymentAdjustmentsPage() {
  const [adjustments, setAdjustments] = useState<PaymentAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAdjustment, setSelectedAdjustment] = useState<PaymentAdjustment | null>(null)
  const [stats, setStats] = useState({
    pending: 0,
    accepted: 0,
    declined: 0,
    all: 0,
    totalDifference: 0,
    increasesCount: 0,
    decreasesCount: 0,
  })

  const fetchAdjustments = async () => {
    try {
      let query = supabase
        .from('payment_adjustments')
        .select('*')
        .order('created_at', { ascending: false })

      if (activeTab !== 'all') {
        query = query.eq('status', activeTab)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching adjustments:', error)
        setAdjustments([])
        return
      }

      // Enrich with related data
      const enrichedAdjustments = await Promise.all((data || []).map(async (adjustment) => {
        // Get homeowner info
        let homeowner = null
        if (adjustment.homeowner_id) {
          const { data: homeownerData } = await supabase
            .from('user_profiles')
            .select('id, name, email, phone')
            .eq('id', adjustment.homeowner_id)
            .single()
          homeowner = homeownerData
        }

        // Get contractor info
        let contractor = null
        if (adjustment.contractor_id) {
          const { data: contractorData } = await supabase
            .from('pro_contractors')
            .select('id, name, business_name, email, phone')
            .eq('id', adjustment.contractor_id)
            .single()
          contractor = contractorData
        }

        return {
          ...adjustment,
          homeowner,
          contractor,
        }
      }))

      setAdjustments(enrichedAdjustments)
    } catch (error) {
      console.error('Error:', error)
      setAdjustments([])
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      // Get all adjustments for stats
      const { data: allData } = await supabase
        .from('payment_adjustments')
        .select('status, difference')

      if (allData) {
        const pending = allData.filter(a => a.status === 'pending').length
        const accepted = allData.filter(a => a.status === 'accepted').length
        const declined = allData.filter(a => a.status === 'declined').length
        const totalDifference = allData
          .filter(a => a.status === 'accepted')
          .reduce((sum, a) => sum + (a.difference || 0), 0)
        const increasesCount = allData.filter(a => a.difference > 0).length
        const decreasesCount = allData.filter(a => a.difference < 0).length

        setStats({
          pending,
          accepted,
          declined,
          all: allData.length,
          totalDifference,
          increasesCount,
          decreasesCount,
        })
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  useEffect(() => {
    fetchAdjustments()
    fetchStats()
  }, [activeTab])

  // Filter adjustments based on search
  const filteredAdjustments = adjustments.filter(adjustment => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      adjustment.requester_name?.toLowerCase().includes(query) ||
      adjustment.reason?.toLowerCase().includes(query) ||
      adjustment.homeowner?.name?.toLowerCase().includes(query) ||
      adjustment.contractor?.name?.toLowerCase().includes(query) ||
      adjustment.contractor?.business_name?.toLowerCase().includes(query)
    )
  })

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date()

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Adjustments</h1>
          <p className="text-slate-600">Track and manage payment adjustment requests</p>
        </div>
        <button
          onClick={() => {
            setLoading(true)
            fetchAdjustments()
            fetchStats()
          }}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={<Clock className="h-4 w-4" />}
          tone="amber"
          onClick={() => setActiveTab('pending')}
          active={activeTab === 'pending'}
        />
        <StatCard
          label="Accepted"
          value={stats.accepted}
          icon={<CheckCircle className="h-4 w-4" />}
          tone="emerald"
          onClick={() => setActiveTab('accepted')}
          active={activeTab === 'accepted'}
        />
        <StatCard
          label="Declined"
          value={stats.declined}
          icon={<XCircle className="h-4 w-4" />}
          tone="rose"
          onClick={() => setActiveTab('declined')}
          active={activeTab === 'declined'}
        />
        <StatCard
          label="Total"
          value={stats.all}
          icon={<DollarSign className="h-4 w-4" />}
          tone="blue"
          onClick={() => setActiveTab('all')}
          active={activeTab === 'all'}
        />
        <StatCard
          label="Increases"
          value={stats.increasesCount}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="emerald"
        />
        <StatCard
          label="Decreases"
          value={stats.decreasesCount}
          icon={<TrendingDown className="h-4 w-4" />}
          tone="rose"
        />
        <StatCard
          label="Net Change"
          value={`$${stats.totalDifference.toFixed(2)}`}
          icon={<DollarSign className="h-4 w-4" />}
          tone={stats.totalDifference >= 0 ? 'emerald' : 'rose'}
          hint="From accepted adjustments"
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, reason..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Adjustments Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Requester</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Parties</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount Change</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAdjustments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    No payment adjustments found
                  </td>
                </tr>
              ) : (
                filteredAdjustments.map((adjustment) => (
                  <tr key={adjustment.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-900">
                        {new Date(adjustment.created_at).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(adjustment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">{adjustment.requester_name}</div>
                      <RequestedByBadge requestedBy={adjustment.requested_by} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <div className="text-blue-600">H: {adjustment.homeowner?.name || 'Unknown'}</div>
                        <div className="text-purple-600">C: {adjustment.contractor?.business_name || adjustment.contractor?.name || 'Unknown'}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 line-through text-sm">${adjustment.original_amount.toFixed(2)}</span>
                        <span className="font-medium text-slate-900">${adjustment.new_amount.toFixed(2)}</span>
                      </div>
                      <div className={`text-xs font-medium ${adjustment.difference > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {adjustment.difference > 0 ? '+' : ''}${adjustment.difference.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-600 capitalize">
                        {adjustment.category?.replace('_', ' ') || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={adjustment.status} />
                      {adjustment.status === 'pending' && isExpired(adjustment.expires_at) && (
                        <div className="text-xs text-red-600 mt-1">Expired</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedAdjustment(adjustment)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        title="View details"
                      >
                        <Eye className="h-4 w-4 text-slate-600" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedAdjustment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Payment Adjustment Details</h3>
                  <p className="text-sm text-slate-500">ID: {selectedAdjustment.id.slice(0, 8)}...</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAdjustment(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Status and Amount */}
              <div className="flex items-center justify-between">
                <StatusBadge status={selectedAdjustment.status} />
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 line-through">${selectedAdjustment.original_amount.toFixed(2)}</span>
                    <span className="text-2xl font-bold text-blue-600">${selectedAdjustment.new_amount.toFixed(2)}</span>
                  </div>
                  <div className={`text-sm font-medium ${selectedAdjustment.difference > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {selectedAdjustment.difference > 0 ? '+' : ''}${selectedAdjustment.difference.toFixed(2)}
                    {selectedAdjustment.difference > 0 ? ' increase' : ' decrease'}
                  </div>
                </div>
              </div>

              {/* Requester Info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-slate-700 mb-2">Requested By</h4>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-full">
                    <User className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">{selectedAdjustment.requester_name}</div>
                    <RequestedByBadge requestedBy={selectedAdjustment.requested_by} />
                  </div>
                </div>
              </div>

              {/* Parties */}
              <div className="grid grid-cols-2 gap-4">
                {/* Homeowner */}
                <div className="border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-700 mb-2">Homeowner</h4>
                  <div className="text-sm text-slate-900 font-medium">{selectedAdjustment.homeowner?.name || 'Unknown'}</div>
                  {selectedAdjustment.homeowner?.email && (
                    <div className="text-xs text-slate-600">{selectedAdjustment.homeowner.email}</div>
                  )}
                  {selectedAdjustment.homeowner?.phone && (
                    <div className="text-xs text-slate-600">{selectedAdjustment.homeowner.phone}</div>
                  )}
                </div>

                {/* Contractor */}
                <div className="border border-purple-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-purple-700 mb-2">Contractor</h4>
                  <div className="text-sm text-slate-900 font-medium">
                    {selectedAdjustment.contractor?.business_name || selectedAdjustment.contractor?.name || 'Unknown'}
                  </div>
                  {selectedAdjustment.contractor?.email && (
                    <div className="text-xs text-slate-600">{selectedAdjustment.contractor.email}</div>
                  )}
                  {selectedAdjustment.contractor?.phone && (
                    <div className="text-xs text-slate-600">{selectedAdjustment.contractor.phone}</div>
                  )}
                </div>
              </div>

              {/* Reason */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2">Reason for Adjustment</h4>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <p className="text-slate-700">{selectedAdjustment.reason}</p>
                </div>
                {selectedAdjustment.category && (
                  <div className="mt-2 text-sm text-slate-500">
                    Category: <span className="font-medium capitalize">{selectedAdjustment.category.replace('_', ' ')}</span>
                  </div>
                )}
              </div>

              {/* Response */}
              {selectedAdjustment.responded_at && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Response</h4>
                  <div className={`border rounded-lg p-4 ${
                    selectedAdjustment.status === 'accepted' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{selectedAdjustment.responded_by_name || 'Unknown'}</span>
                      <span className="text-xs text-slate-500">{formatDate(selectedAdjustment.responded_at)}</span>
                    </div>
                    {selectedAdjustment.response_note && (
                      <p className="text-sm text-slate-700">{selectedAdjustment.response_note}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Payment Link */}
              {selectedAdjustment.stripe_payment_link_url && selectedAdjustment.status === 'accepted' && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Payment Link</h4>
                  <a
                    href={selectedAdjustment.stripe_payment_link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Stripe Payment Link
                  </a>
                </div>
              )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Created:</span>
                  <div className="font-medium">{formatDate(selectedAdjustment.created_at)}</div>
                </div>
                <div>
                  <span className="text-slate-500">Expires:</span>
                  <div className={`font-medium ${isExpired(selectedAdjustment.expires_at) ? 'text-red-600' : ''}`}>
                    {formatDate(selectedAdjustment.expires_at)}
                    {isExpired(selectedAdjustment.expires_at) && ' (Expired)'}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4">
              <button
                onClick={() => setSelectedAdjustment(null)}
                className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
