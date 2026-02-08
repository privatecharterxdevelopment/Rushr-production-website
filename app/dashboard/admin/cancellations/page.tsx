'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import {
  XCircle,
  Clock,
  CheckCircle,
  Search,
  Eye,
  X,
  User,
  DollarSign,
  Calendar,
  Phone,
  Mail,
  Briefcase,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'

type Cancellation = {
  id: string
  booking_id: string
  payment_hold_id: string | null
  cancelled_by: 'homeowner' | 'contractor' | 'admin' | 'system'
  cancelled_by_id: string
  cancelled_by_name: string | null
  contractor_id: string
  homeowner_id: string
  reason: string
  amount: number
  category: string
  refund_processed: boolean
  admin_reviewed: boolean
  admin_notes: string | null
  created_at: string
  reviewed_at: string | null
  // Joined data
  booking?: {
    id: string
    title: string
    status: string
  }
  contractor?: {
    id: string
    name: string
    business_name: string
    email: string
    phone: string
  }
  homeowner?: {
    id: string
    name: string
    email: string
    phone: string
  }
}

type TabType = 'pending' | 'reviewed' | 'all'

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

function CancelledByBadge({ cancelledBy }: { cancelledBy: string }) {
  const styles: Record<string, string> = {
    homeowner: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    contractor: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    system: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[cancelledBy] || styles.system}`}>
      {cancelledBy}
    </span>
  )
}

export default function AdminCancellationsPage() {
  const [cancellations, setCancellations] = useState<Cancellation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCancellation, setSelectedCancellation] = useState<Cancellation | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [stats, setStats] = useState({
    pending: 0,
    reviewed: 0,
    all: 0,
    totalAmount: 0,
  })

  const fetchCancellations = async () => {
    try {
      let query = supabase
        .from('job_cancellations')
        .select('*')
        .order('created_at', { ascending: false })

      if (activeTab === 'pending') {
        query = query.eq('admin_reviewed', false)
      } else if (activeTab === 'reviewed') {
        query = query.eq('admin_reviewed', true)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching cancellations:', error)
        // Table might not exist yet
        setCancellations([])
        return
      }

      // Enrich with related data
      const enrichedCancellations = await Promise.all((data || []).map(async (cancellation) => {
        // Get booking info
        let booking = null
        if (cancellation.booking_id) {
          const { data: bookingData } = await supabase
            .from('direct_offers')
            .select('id, title, status')
            .eq('id', cancellation.booking_id)
            .single()
          booking = bookingData
        }

        // Get contractor info
        let contractor = null
        if (cancellation.contractor_id) {
          const { data: contractorData } = await supabase
            .from('pro_contractors')
            .select('id, name, business_name, email, phone')
            .eq('id', cancellation.contractor_id)
            .single()
          contractor = contractorData
        }

        // Get homeowner info
        let homeowner = null
        if (cancellation.homeowner_id) {
          const { data: homeownerData } = await supabase
            .from('user_profiles')
            .select('id, name, email, phone')
            .eq('id', cancellation.homeowner_id)
            .single()
          homeowner = homeownerData
        }

        return {
          ...cancellation,
          booking,
          contractor,
          homeowner
        }
      }))

      setCancellations(enrichedCancellations)

      // Fetch stats
      const [pendingRes, reviewedRes, allRes] = await Promise.all([
        supabase.from('job_cancellations').select('id', { count: 'exact', head: true }).eq('admin_reviewed', false),
        supabase.from('job_cancellations').select('id', { count: 'exact', head: true }).eq('admin_reviewed', true),
        supabase.from('job_cancellations').select('amount'),
      ])

      const totalAmount = (allRes.data || []).reduce((sum, c) => sum + (c.amount || 0), 0)

      setStats({
        pending: pendingRes.count || 0,
        reviewed: reviewedRes.count || 0,
        all: (pendingRes.count || 0) + (reviewedRes.count || 0),
        totalAmount,
      })
    } catch (err) {
      console.error('Error:', err)
      setCancellations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCancellations()
  }, [activeTab])

  const handleMarkReviewed = async () => {
    if (!selectedCancellation) return

    setReviewing(true)

    try {
      const { error } = await supabase
        .from('job_cancellations')
        .update({
          admin_reviewed: true,
          admin_notes: adminNotes || null,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', selectedCancellation.id)

      if (error) {
        console.error('Error updating cancellation:', error)
        alert('Failed to update cancellation')
        return
      }

      alert('Cancellation marked as reviewed')
      setSelectedCancellation(null)
      setAdminNotes('')
      fetchCancellations()
    } catch (err) {
      console.error('Error:', err)
      alert('Failed to update cancellation')
    } finally {
      setReviewing(false)
    }
  }

  const filteredCancellations = cancellations.filter(c => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      c.reason?.toLowerCase().includes(q) ||
      c.category?.toLowerCase().includes(q) ||
      c.cancelled_by_name?.toLowerCase().includes(q) ||
      c.contractor?.business_name?.toLowerCase().includes(q) ||
      c.homeowner?.name?.toLowerCase().includes(q)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Job Cancellations</h1>
          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
            Track cancelled jobs and review cancellation reasons
          </p>
        </div>
        <button
          onClick={fetchCancellations}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Alert for pending reviews */}
      {stats.pending > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-100">
                {stats.pending} cancellation{stats.pending !== 1 ? 's' : ''} pending review
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Review cancellation reasons and add admin notes if needed
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pending Review"
          value={stats.pending}
          icon={<Clock className="h-4 w-4" />}
          tone="amber"
          onClick={() => setActiveTab('pending')}
          active={activeTab === 'pending'}
        />
        <StatCard
          label="Reviewed"
          value={stats.reviewed}
          icon={<CheckCircle className="h-4 w-4" />}
          tone="emerald"
          onClick={() => setActiveTab('reviewed')}
          active={activeTab === 'reviewed'}
        />
        <StatCard
          label="Total Cancellations"
          value={stats.all}
          icon={<XCircle className="h-4 w-4" />}
          tone="rose"
          onClick={() => setActiveTab('all')}
          active={activeTab === 'all'}
        />
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Amount</div>
            <span className="ml-auto text-slate-400"><DollarSign className="h-4 w-4" /></span>
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
            ${stats.totalAmount.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by reason, category, or party name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Cancellations Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Cancelled By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
              {filteredCancellations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">
                    {cancellations.length === 0 ? 'No cancellations recorded yet' : 'No cancellations found'}
                  </td>
                </tr>
              ) : (
                filteredCancellations.map((cancellation) => (
                  <tr key={cancellation.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {cancellation.category || 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <CancelledByBadge cancelledBy={cancellation.cancelled_by} />
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                          {cancellation.cancelled_by_name || 'Unknown'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900 dark:text-white truncate max-w-[200px]">
                        {cancellation.reason}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        ${(cancellation.amount || 0).toFixed(2)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {cancellation.admin_reviewed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          <CheckCircle className="h-3 w-3" />
                          Reviewed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          <Clock className="h-3 w-3" />
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                      {new Date(cancellation.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          setSelectedCancellation(cancellation)
                          setAdminNotes(cancellation.admin_notes || '')
                        }}
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

      {/* Cancellation Detail Modal */}
      {selectedCancellation && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Cancellation Details</h2>
              <button onClick={() => setSelectedCancellation(null)} className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Cancellation Reason */}
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <CancelledByBadge cancelledBy={selectedCancellation.cancelled_by} />
                </div>
                <h3 className="font-medium text-red-900 dark:text-red-100 mb-2">Reason for Cancellation:</h3>
                <p className="text-sm text-red-800 dark:text-red-200">{selectedCancellation.reason}</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-3">
                  Cancelled by: {selectedCancellation.cancelled_by_name || 'Unknown'} on {new Date(selectedCancellation.created_at).toLocaleString()}
                </p>
              </div>

              {/* Job Info */}
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">Job Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-slate-400">Category</p>
                    <p className="text-gray-900 dark:text-white">{selectedCancellation.category || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-slate-400">Amount</p>
                    <p className="text-gray-900 dark:text-white font-medium">${(selectedCancellation.amount || 0).toFixed(2)}</p>
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
                    <p className="text-gray-900 dark:text-white">{selectedCancellation.homeowner?.name || '-'}</p>
                    <p className="text-gray-500 dark:text-slate-400 flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {selectedCancellation.homeowner?.email || '-'}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="h-4 w-4 text-gray-500" />
                    <h4 className="font-medium text-gray-900 dark:text-white">Contractor</h4>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="text-gray-900 dark:text-white">{selectedCancellation.contractor?.business_name || selectedCancellation.contractor?.name || '-'}</p>
                    <p className="text-gray-500 dark:text-slate-400 flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {selectedCancellation.contractor?.email || '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Admin Notes & Review */}
              <div className="border-t border-gray-200 dark:border-slate-800 pt-6">
                <h4 className="font-medium text-gray-900 dark:text-white mb-4">Admin Review</h4>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Admin Notes
                    </label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      placeholder="Add any notes about this cancellation..."
                      disabled={selectedCancellation.admin_reviewed}
                    />
                  </div>

                  {selectedCancellation.admin_reviewed ? (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm">Reviewed on {selectedCancellation.reviewed_at ? new Date(selectedCancellation.reviewed_at).toLocaleString() : 'Unknown'}</span>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setSelectedCancellation(null)}
                        className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                      >
                        Close
                      </button>
                      <button
                        onClick={handleMarkReviewed}
                        disabled={reviewing}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg flex items-center gap-2"
                      >
                        {reviewing ? 'Saving...' : 'Mark as Reviewed'}
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
