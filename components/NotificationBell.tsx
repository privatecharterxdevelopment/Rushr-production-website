'use client'

import { useState, useEffect } from 'react'
import { Bell, BellDot, X, MessageSquare, DollarSign, Briefcase, CheckCircle, XCircle, CreditCard, ArrowRightLeft, Star, ShieldCheck, ShieldX, Hammer } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { WelcomeService, WelcomeNotification } from '../lib/welcomeService'
import { supabase } from '../lib/supabaseClient'

interface NotificationBellProps {
  className?: string
}

export default function NotificationBell({ className = '' }: NotificationBellProps) {
  const { user, userProfile } = useAuth()
  const router = useRouter()
  const [notifications, setNotifications] = useState<WelcomeNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const userId = user?.id

  // Request notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Fetch notifications on mount and subscribe to real-time updates
  useEffect(() => {
    if (!userId) return

    loadNotifications()

    // Subscribe to real-time notification updates
    const notificationSubscription = supabase
      .channel(`user_notifications_${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        // Add new notification to the list
        const newNotification = payload.new as WelcomeNotification
        setNotifications(prev => [newNotification, ...prev])
        setUnreadCount(prev => prev + 1)

        // Show browser notification if permitted
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(newNotification.title, {
            body: newNotification.message,
            icon: '/favicon.ico',
            badge: '/favicon.ico'
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(notificationSubscription)
    }
  }, [userId])

  const loadNotifications = async () => {
    if (!user) return

    try {
      setLoading(true)
      const [allNotifications, count] = await Promise.all([
        WelcomeService.getNotifications(user.id),
        WelcomeService.getUnreadNotificationCount(user.id)
      ])

      setNotifications(allNotifications)
      setUnreadCount(count)
    } catch (error) {
      console.error('Error loading notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      await WelcomeService.markNotificationAsRead(notificationId)

      // Update local state
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, read: true } : n
        )
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    if (!user) return
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false)

      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const handleNotificationClick = async (notification: WelcomeNotification) => {
    if (!notification.read) {
      await markAsRead(notification.id)
    }

    const isContractor = userProfile?.role === 'contractor'
    const dashboardBase = isContractor ? '/dashboard/contractor' : '/dashboard/homeowner'

    setIsOpen(false)

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
      case 'adjustment_declined':
      case 'payment_adjustment':
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

  const toggleNotifications = () => {
    setIsOpen(!isOpen)
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

  if (!user) return null

  return (
    <div className={`relative ${className}`}>
      {/* Bell Button */}
      <button
        onClick={toggleNotifications}
        className="relative p-2 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors"
        aria-label="Notifications"
      >
        {unreadCount > 0 ? (
          <BellDot className="h-6 w-6" />
        ) : (
          <Bell className="h-6 w-6" />
        )}

        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Notifications
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-slate-500">
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-4 text-center text-slate-500">
                  No notifications yet
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors ${
                        !notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getTypeIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-slate-900 dark:text-white text-sm">
                              {notification.title}
                            </h4>
                            {!notification.read && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                            {notification.message}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                            {formatTime(notification.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between">
              <button
                onClick={() => {
                  setIsOpen(false)
                  router.push('/dashboard/notifications')
                }}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                View all
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
