'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../contexts/AuthContext'
import { supabase } from '../../../lib/supabaseClient'
import LoadingSpinner from '../../../components/LoadingSpinner'
import {
  Bell,
  BellOff,
  CheckCircle,
  CheckCheck,
  MessageSquare,
  DollarSign,
  Briefcase,
  Star,
  Trash2,
  XCircle,
  CreditCard,
  ArrowRightLeft,
  Hammer,
  ThumbsUp,
  ShieldCheck,
  ShieldX,
  Megaphone,
  Clock
} from 'lucide-react'

interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: string
  read: boolean
  created_at: string
  job_id?: string
  bid_id?: string
  conversation_id?: string
  data?: Record<string, any>
}

export default function NotificationsPage() {
  const { user, userProfile, loading } = useAuth()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [fetching, setFetching] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const isContractor = userProfile?.role === 'contractor'
  const dashboardBase = isContractor ? '/dashboard/contractor' : '/dashboard/homeowner'

  useEffect(() => {
    if (!user) return

    fetchNotifications()

    const channel = supabase
      .channel(`all_notifications_${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, () => {
        fetchNotifications()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  const fetchNotifications = async () => {
    if (!user) return

    setFetching(true)
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setNotifications(data || [])
    } catch (err) {
      console.error('Error fetching notifications:', err)
    } finally {
      setFetching(false)
    }
  }

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)

    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
  }

  const markAllAsRead = async () => {
    if (!user) return

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)

    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    )
  }

  const deleteNotification = async (id: string) => {
    await supabase
      .from('notifications')
      .delete()
      .eq('id', id)

    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id)
    }

    switch (notification.type) {
      case 'new_message':
        if (notification.conversation_id) {
          router.push(`${dashboardBase}/messages?id=${notification.conversation_id}`)
        } else {
          router.push(`${dashboardBase}/messages`)
        }
        break
      case 'bid_received':
      case 'bid_response':
      case 'bid_accepted':
      case 'bid_rejected':
      case 'bid_withdrawn':
      case 'job_accepted':
        if (notification.job_id) {
          router.push(isContractor
            ? `${dashboardBase}/jobs/${notification.job_id}`
            : `${dashboardBase}/bids`)
        } else {
          router.push(dashboardBase)
        }
        break
      case 'payment_completed':
      case 'adjustment_accepted':
        router.push(`${dashboardBase}/transactions`)
        break
      case 'job_filled':
      case 'job_request_received':
      case 'work_started':
      case 'work_completed':
        if (notification.job_id) {
          router.push(isContractor
            ? `${dashboardBase}/jobs/${notification.job_id}`
            : dashboardBase)
        } else {
          router.push(dashboardBase)
        }
        break
      case 'new_job_posted':
        if (notification.job_id) {
          router.push(`/dashboard/contractor/jobs/${notification.job_id}`)
        } else {
          router.push('/dashboard/contractor/jobs')
        }
        break
      case 'payment_required':
      case 'bid_accepted_payment_required':
        router.push('/dashboard/homeowner/billing')
        break
      case 'job_cancelled':
      case 'booking_accepted':
      case 'booking_declined':
      case 'booking_request':
      case 'payment_adjustment':
      case 'adjustment_declined':
      case 'approval':
      case 'rejection':
      case 'profile_approved':
      case 'profile_rejected':
      case 'review_received':
      case 'welcome':
      default:
        router.push(dashboardBase)
        break
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'new_message':
        return <MessageSquare className="h-5 w-5 text-blue-500" />
      case 'payment_completed':
      case 'adjustment_accepted':
        return <DollarSign className="h-5 w-5 text-green-500" />
      case 'bid_received':
      case 'bid_response':
      case 'job_accepted':
      case 'booking_request':
      case 'job_request_received':
      case 'new_job_posted':
        return <Briefcase className="h-5 w-5 text-purple-500" />
      case 'bid_accepted':
      case 'booking_accepted':
        return <CheckCircle className="h-5 w-5 text-emerald-500" />
      case 'job_filled':
      case 'work_completed':
        return <CheckCircle className="h-5 w-5 text-blue-500" />
      case 'work_started':
        return <Hammer className="h-5 w-5 text-blue-500" />
      case 'job_cancelled':
      case 'booking_declined':
      case 'adjustment_declined':
      case 'bid_rejected':
      case 'bid_withdrawn':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'payment_required':
      case 'bid_accepted_payment_required':
        return <CreditCard className="h-5 w-5 text-amber-500" />
      case 'payment_adjustment':
        return <ArrowRightLeft className="h-5 w-5 text-amber-500" />
      case 'approval':
      case 'profile_approved':
        return <ShieldCheck className="h-5 w-5 text-emerald-500" />
      case 'rejection':
      case 'profile_rejected':
        return <ShieldX className="h-5 w-5 text-red-500" />
      case 'review_received':
        return <Star className="h-5 w-5 text-amber-500" />
      case 'welcome':
        return <Bell className="h-5 w-5 text-emerald-500" />
      default:
        return <Bell className="h-5 w-5 text-slate-400" />
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications

  const unreadCount = notifications.filter(n => !n.read).length

  // Show loading while auth is being determined
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Please sign in to view notifications</h2>
          <Link href="/?auth=signin" className="btn-primary">Sign In</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container section-spacing space-y-6">
      {/* Page title + actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold text-ink dark:text-white">Notifications</h1>
          <p className="text-sm text-slate-500 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-emerald-600 text-white'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filter === 'unread'
              ? 'bg-emerald-600 text-white'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notifications list */}
      {fetching && notifications.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="md" text="Loading notifications..." />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-16 text-center">
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <BellOff className="h-7 w-7 text-slate-300 dark:text-slate-600" />
          </div>
          <h4 className="text-lg font-medium text-slate-900 dark:text-white mb-1">
            {filter === 'unread' ? 'No Unread Notifications' : 'No Notifications Yet'}
          </h4>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {filter === 'unread'
              ? 'You\'re all caught up!'
              : 'Notifications about jobs, bids, and messages will appear here.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map(notification => (
            <div
              key={notification.id}
              className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors ${
                !notification.read
                  ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getTypeIcon(notification.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm ${!notification.read ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                    {notification.title}
                  </h4>
                  {!notification.read && (
                    <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                  {notification.message}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {formatTime(notification.created_at)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteNotification(notification.id)
                }}
                className="flex-shrink-0 p-1.5 text-slate-300 hover:text-red-500 transition-colors rounded-md hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
