'use client'

import { useState, useEffect } from 'react'
import { Bell, BellDot, X, MessageSquare, DollarSign, Briefcase, CheckCircle } from 'lucide-react'
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

  // Fetch notifications on mount and subscribe to real-time updates
  useEffect(() => {
    if (!user) return

    loadNotifications()

    // Subscribe to real-time notification updates
    const notificationSubscription = supabase
      .channel('user_notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
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

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    return () => {
      supabase.removeChannel(notificationSubscription)
    }
  }, [user])

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

  const handleNotificationClick = async (notification: WelcomeNotification) => {
    // Mark as read
    if (!notification.read) {
      await markAsRead(notification.id)
    }

    // Determine if user is contractor or homeowner based on user profile role
    const isContractor = userProfile?.role === 'contractor'

    // Navigate based on notification type
    if (notification.type === 'welcome') {
      // Welcome notification - go to messages page
      if (isContractor) {
        router.push('/dashboard/contractor/messages')
      } else {
        router.push('/dashboard/homeowner/messages')
      }
      setIsOpen(false)
    } else if (notification.type === 'new_message' && notification.conversation_id) {
      // New message notification - go to specific conversation
      if (isContractor) {
        router.push(`/dashboard/contractor/messages?id=${notification.conversation_id}`)
      } else {
        router.push(`/dashboard/homeowner/messages?id=${notification.conversation_id}`)
      }
      setIsOpen(false)
    } else if (notification.type === 'payment_completed' && notification.job_id) {
      // Navigate to job details
      router.push(`/dashboard/homeowner/jobs/${notification.job_id}`)
      setIsOpen(false)
    } else if ((notification.type === 'bid_received' || notification.type === 'bid_accepted') && notification.job_id) {
      // Navigate to job or bids page
      router.push(`/dashboard/homeowner/bids`)
      setIsOpen(false)
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
        return <DollarSign className="h-5 w-5 text-green-500" />
      case 'bid_received':
        return <Briefcase className="h-5 w-5 text-purple-500" />
      case 'bid_accepted':
        return <CheckCircle className="h-5 w-5 text-emerald-500" />
      case 'welcome':
        return '🎉'
      case 'success':
        return '✅'
      case 'warning':
        return '⚠️'
      case 'info':
      default:
        return 'ℹ️'
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
            {notifications.length > 0 && (
              <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                <button
                  onClick={loadNotifications}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  Refresh notifications
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
