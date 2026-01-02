'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabaseClient'
import LoadingSpinner from '../../../components/LoadingSpinner'
import {
  Users,
  UserCheck,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  DollarSign,
  AlertTriangle,
} from 'lucide-react'

type DashboardStats = {
  pendingContractors: number
  totalContractors: number
  approvedContractors: number
  rejectedContractors: number
  totalHomeowners: number
  newSupportTickets: number
  totalSupportTickets: number
  activeJobs: number
  completedJobs: number
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'blue',
  href,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: React.ReactNode
  tone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple'
  href?: string
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
    <div className={`rounded-2xl border ${ring} bg-white dark:bg-slate-900 p-4 shadow-sm ${href ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        {icon ? <span className="ml-auto text-slate-400">{icon}</span> : null}
      </div>
      <div className="mt-1 text-2xl font-semibold text-ink dark:text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [realtimeUpdate, setRealtimeUpdate] = useState(0)

  const fetchStats = async () => {
    try {
      // Run ALL queries in parallel for much faster loading
      const [
        pendingRes,
        totalRes,
        approvedRes,
        rejectedRes,
        homeownersRes,
        activeJobsRes,
        completedJobsRes,
      ] = await Promise.all([
        supabase.from('pro_contractors').select('*', { count: 'exact', head: true }).eq('status', 'pending_approval'),
        supabase.from('pro_contractors').select('*', { count: 'exact', head: true }),
        supabase.from('pro_contractors').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('pro_contractors').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('role', 'homeowner'),
        supabase.from('homeowner_jobs').select('*', { count: 'exact', head: true }).in('status', ['pending', 'bid_accepted', 'confirmed', 'in_progress']),
        supabase.from('homeowner_jobs').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      ])

      // Fetch support tickets separately (table might not exist)
      let totalTickets = 0
      let newTickets = 0
      const ticketsRes = await supabase.from('support_messages').select('*', { count: 'exact', head: true })
      if (!ticketsRes.error) {
        totalTickets = ticketsRes.count || 0
        const newTicketsRes = await supabase.from('support_messages').select('*', { count: 'exact', head: true }).eq('status', 'new')
        newTickets = newTicketsRes.count || 0
      }

      setStats({
        pendingContractors: pendingRes.count || 0,
        totalContractors: totalRes.count || 0,
        approvedContractors: approvedRes.count || 0,
        rejectedContractors: rejectedRes.count || 0,
        totalHomeowners: homeownersRes.count || 0,
        newSupportTickets: newTickets,
        totalSupportTickets: totalTickets,
        activeJobs: activeJobsRes.count || 0,
        completedJobs: completedJobsRes.count || 0,
      })
    } catch (error) {
      console.error('Error fetching admin stats:', error)
    } finally {
      setLoading(false)
    }
  }

  // Debounce real-time updates
  const fetchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  const debouncedFetch = () => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current)
    }
    fetchTimeoutRef.current = setTimeout(() => {
      setRealtimeUpdate((prev) => prev + 1)
      fetchStats()
    }, 1000)
  }

  useEffect(() => {
    fetchStats()

    // Subscribe to real-time updates for contractors
    const contractorSubscription = supabase
      .channel('admin-contractors')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pro_contractors',
        },
        debouncedFetch
      )
      .subscribe()

    // Subscribe to support messages
    const supportSubscription = supabase
      .channel('admin-support')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_messages',
        },
        debouncedFetch
      )
      .subscribe()

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
      }
      supabase.removeChannel(contractorSubscription)
      supabase.removeChannel(supportSubscription)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg"  />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          Manage contractors, users, and support tickets
        </p>
      </div>

      {/* Contractor Stats */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Contractor Management</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Pending Approval"
            value={stats?.pendingContractors || 0}
            hint="Requires action"
            icon={<Clock className="h-4 w-4" />}
            tone="amber"
            href="/dashboard/admin/contractors"
          />
          <StatCard
            label="Approved"
            value={stats?.approvedContractors || 0}
            hint="Active contractors"
            icon={<CheckCircle className="h-4 w-4" />}
            tone="emerald"
          />
          <StatCard
            label="Total Contractors"
            value={stats?.totalContractors || 0}
            hint="All time"
            icon={<UserCheck className="h-4 w-4" />}
            tone="blue"
            href="/dashboard/admin/contractors/all"
          />
          <StatCard
            label="Rejected"
            value={stats?.rejectedContractors || 0}
            hint="Declined applications"
            icon={<XCircle className="h-4 w-4" />}
            tone="rose"
          />
        </div>
      </div>

      {/* User Stats */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">User Management</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Total Homeowners"
            value={stats?.totalHomeowners || 0}
            hint="Registered users"
            icon={<Users className="h-4 w-4" />}
            tone="purple"
            href="/dashboard/admin/homeowners"
          />
          <StatCard
            label="Support Tickets"
            value={stats?.newSupportTickets || 0}
            hint={`${stats?.totalSupportTickets || 0} total`}
            icon={<MessageSquare className="h-4 w-4" />}
            tone={stats?.newSupportTickets && stats.newSupportTickets > 0 ? 'amber' : 'blue'}
            href="/dashboard/admin/support"
          />
          <StatCard
            label="Active Jobs"
            value={stats?.activeJobs || 0}
            hint={`${stats?.completedJobs || 0} completed`}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="emerald"
          />
        </div>
      </div>

      {/* Quick Actions */}
      {stats && stats.pendingContractors > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                Action Required
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                You have {stats.pendingContractors} contractor{stats.pendingContractors !== 1 ? 's' : ''} waiting for approval.
              </p>
              <Link
                href="/dashboard/admin/contractors"
                className="mt-3 inline-block bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Review Contractors
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Real-time indicator */}
      {realtimeUpdate > 0 && (
        <div className="text-xs text-gray-500 dark:text-slate-400 text-center">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live updates active
          </span>
        </div>
      )}
    </div>
  )
}
