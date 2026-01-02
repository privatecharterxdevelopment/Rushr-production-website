'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import {
  Briefcase,
  Clock,
  CheckCircle,
  AlertTriangle,
  Search,
  Eye,
  X,
  User,
  DollarSign,
  MapPin,
  Calendar,
  Phone,
  Mail,
  ArrowUpRight,
} from 'lucide-react'

type Job = {
  id: string
  title: string
  description: string
  category: string
  priority: string
  status: string
  address: string
  zip_code: string
  phone: string
  final_cost: number | null
  payment_status: string | null
  created_at: string
  completed_date: string | null
  homeowner_id: string
  contractor_id: string | null
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
  accepted_bid?: {
    id: string
    bid_amount: number
    message: string
  }
  payment_hold?: {
    id: string
    status: string
    amount: number
    platform_fee: number
    contractor_payout: number
  }
  dispute?: {
    id: string
    reason: string
    status: string
    filed_by_type: string
    created_at: string
  }
}

type TabType = 'ongoing' | 'completed' | 'on_hold' | 'all'

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
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    bidding: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    bid_received: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    bid_accepted: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    confirmed: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    expired: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    on_hold: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function PaymentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400 text-xs">-</span>

  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    authorized: 'bg-blue-100 text-blue-800',
    captured: 'bg-purple-100 text-purple-800',
    released: 'bg-green-100 text-green-800',
    refunded: 'bg-gray-100 text-gray-800',
    disputed: 'bg-red-100 text-red-800',
    failed: 'bg-red-100 text-red-800',
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  )
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('ongoing')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [stats, setStats] = useState({
    ongoing: 0,
    completed: 0,
    on_hold: 0,
    all: 0,
  })

  const fetchJobs = async () => {
    try {
      // Build the query based on active tab
      let query = supabase
        .from('homeowner_jobs')
        .select(`
          *,
          homeowner:user_profiles!homeowner_jobs_homeowner_id_fkey(id, name, email, phone),
          contractor:pro_contractors!homeowner_jobs_contractor_id_fkey(id, name, business_name, email, phone),
          accepted_bid:job_bids!homeowner_jobs_accepted_bid_id_fkey(id, bid_amount, message),
          payment_hold:payment_holds!payment_holds_job_id_fkey(id, status, amount, platform_fee, contractor_payout)
        `)
        .order('created_at', { ascending: false })

      // Filter by tab
      if (activeTab === 'ongoing') {
        query = query.in('status', ['in_progress', 'confirmed', 'bid_accepted'])
      } else if (activeTab === 'completed') {
        query = query.eq('status', 'completed')
      } else if (activeTab === 'on_hold') {
        query = query.eq('status', 'on_hold')
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching jobs:', error)
        return
      }

      // For on_hold jobs, fetch associated disputes
      if (activeTab === 'on_hold' && data) {
        const jobIds = data.map(j => j.id)
        const { data: disputes } = await supabase
          .from('job_disputes')
          .select('*')
          .in('job_id', jobIds)

        // Attach disputes to jobs
        const jobsWithDisputes = data.map(job => ({
          ...job,
          dispute: disputes?.find(d => d.job_id === job.id)
        }))
        setJobs(jobsWithDisputes)
      } else {
        setJobs(data || [])
      }

      // Fetch stats
      const [ongoingRes, completedRes, onHoldRes, allRes] = await Promise.all([
        supabase.from('homeowner_jobs').select('id', { count: 'exact', head: true }).in('status', ['in_progress', 'confirmed', 'bid_accepted']),
        supabase.from('homeowner_jobs').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('homeowner_jobs').select('id', { count: 'exact', head: true }).eq('status', 'on_hold'),
        supabase.from('homeowner_jobs').select('id', { count: 'exact', head: true }),
      ])

      setStats({
        ongoing: ongoingRes.count || 0,
        completed: completedRes.count || 0,
        on_hold: onHoldRes.count || 0,
        all: allRes.count || 0,
      })
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Debounce real-time updates to prevent excessive refetching
  const fetchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchJobs()
  }, [activeTab])

  // Separate effect for real-time subscription (only setup once)
  useEffect(() => {
    const subscription = supabase
      .channel('admin-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'homeowner_jobs' }, () => {
        // Debounce: wait 1 second before refetching to batch rapid updates
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current)
        }
        fetchTimeoutRef.current = setTimeout(() => {
          fetchJobs()
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

  const filteredJobs = jobs.filter(job => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      job.title?.toLowerCase().includes(q) ||
      job.category?.toLowerCase().includes(q) ||
      job.homeowner?.name?.toLowerCase().includes(q) ||
      job.homeowner?.email?.toLowerCase().includes(q) ||
      job.contractor?.name?.toLowerCase().includes(q) ||
      job.contractor?.business_name?.toLowerCase().includes(q) ||
      job.id.toLowerCase().includes(q)
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Jobs Management</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          View and manage all jobs on the platform
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ongoing"
          value={stats.ongoing}
          icon={<Clock className="h-4 w-4" />}
          tone="blue"
          onClick={() => setActiveTab('ongoing')}
          active={activeTab === 'ongoing'}
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          icon={<CheckCircle className="h-4 w-4" />}
          tone="emerald"
          onClick={() => setActiveTab('completed')}
          active={activeTab === 'completed'}
        />
        <StatCard
          label="On Hold (Disputed)"
          value={stats.on_hold}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="rose"
          onClick={() => setActiveTab('on_hold')}
          active={activeTab === 'on_hold'}
        />
        <StatCard
          label="All Jobs"
          value={stats.all}
          icon={<Briefcase className="h-4 w-4" />}
          tone="amber"
          onClick={() => setActiveTab('all')}
          active={activeTab === 'all'}
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by title, category, homeowner, contractor..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Jobs Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Job</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Homeowner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Contractor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">
                    No jobs found
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{job.title}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">{job.category}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm text-gray-900 dark:text-white">{job.homeowner?.name || '-'}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">{job.homeowner?.email}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm text-gray-900 dark:text-white">{job.contractor?.business_name || job.contractor?.name || '-'}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">{job.contractor?.email || '-'}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                      {job.dispute && (
                        <div className="mt-1">
                          <span className="text-xs text-red-600 dark:text-red-400">Dispute: {job.dispute.reason}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {job.final_cost ? `$${job.final_cost.toFixed(2)}` : job.accepted_bid?.bid_amount ? `$${job.accepted_bid.bid_amount.toFixed(2)}` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PaymentBadge status={job.payment_hold?.status || job.payment_status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                      {new Date(job.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedJob(job)}
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

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Job Details</h2>
              <button onClick={() => setSelectedJob(null)} className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Job Info */}
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-3">{selectedJob.title}</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  <StatusBadge status={selectedJob.status} />
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-gray-200">
                    {selectedJob.category}
                  </span>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-gray-200">
                    {selectedJob.priority} priority
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-slate-400">{selectedJob.description}</p>
              </div>

              {/* Location */}
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                <div className="text-sm text-gray-600 dark:text-slate-400">
                  {selectedJob.address || 'No address'} {selectedJob.zip_code}
                </div>
              </div>

              {/* Homeowner */}
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-4 w-4 text-gray-500" />
                  <h4 className="font-medium text-gray-900 dark:text-white">Homeowner</h4>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-gray-900 dark:text-white">{selectedJob.homeowner?.name || '-'}</p>
                  <p className="text-gray-500 dark:text-slate-400 flex items-center gap-2">
                    <Mail className="h-3 w-3" /> {selectedJob.homeowner?.email}
                  </p>
                  <p className="text-gray-500 dark:text-slate-400 flex items-center gap-2">
                    <Phone className="h-3 w-3" /> {selectedJob.homeowner?.phone || selectedJob.phone || '-'}
                  </p>
                </div>
              </div>

              {/* Contractor */}
              {selectedJob.contractor && (
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="h-4 w-4 text-gray-500" />
                    <h4 className="font-medium text-gray-900 dark:text-white">Contractor</h4>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p className="text-gray-900 dark:text-white">{selectedJob.contractor.business_name || selectedJob.contractor.name}</p>
                    <p className="text-gray-500 dark:text-slate-400 flex items-center gap-2">
                      <Mail className="h-3 w-3" /> {selectedJob.contractor.email}
                    </p>
                    <p className="text-gray-500 dark:text-slate-400 flex items-center gap-2">
                      <Phone className="h-3 w-3" /> {selectedJob.contractor.phone || '-'}
                    </p>
                  </div>
                </div>
              )}

              {/* Payment Info */}
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-gray-500" />
                  <h4 className="font-medium text-gray-900 dark:text-white">Payment</h4>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-slate-400">Amount</p>
                    <p className="text-gray-900 dark:text-white font-medium">
                      ${selectedJob.payment_hold?.amount || selectedJob.final_cost || selectedJob.accepted_bid?.bid_amount || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-slate-400">Status</p>
                    <PaymentBadge status={selectedJob.payment_hold?.status || selectedJob.payment_status} />
                  </div>
                  {selectedJob.payment_hold && (
                    <>
                      <div>
                        <p className="text-gray-500 dark:text-slate-400">Platform Fee (10%)</p>
                        <p className="text-gray-900 dark:text-white">${selectedJob.payment_hold.platform_fee}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-slate-400">Contractor Payout</p>
                        <p className="text-gray-900 dark:text-white">${selectedJob.payment_hold.contractor_payout}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Dispute Info */}
              {selectedJob.dispute && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <h4 className="font-medium text-red-900 dark:text-red-100">Active Dispute</h4>
                  </div>
                  <div className="text-sm space-y-2">
                    <p className="text-red-800 dark:text-red-200">
                      <strong>Reason:</strong> {selectedJob.dispute.reason}
                    </p>
                    <p className="text-red-700 dark:text-red-300">
                      <strong>Filed by:</strong> {selectedJob.dispute.filed_by_type}
                    </p>
                    <p className="text-red-700 dark:text-red-300">
                      <strong>Status:</strong> {selectedJob.dispute.status}
                    </p>
                    <a
                      href={`/dashboard/admin/disputes?job=${selectedJob.id}`}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 mt-2"
                    >
                      View Dispute <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                <Calendar className="h-3 w-3" />
                Created: {new Date(selectedJob.created_at).toLocaleString()}
                {selectedJob.completed_date && (
                  <span className="ml-4">
                    Completed: {new Date(selectedJob.completed_date).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
