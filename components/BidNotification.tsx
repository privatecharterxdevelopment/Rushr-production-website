'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import {
  CheckCircle2,
  MessageSquare,
  X,
  Bell,
  DollarSign,
  Clock,
  TrendingUp
} from 'lucide-react'

interface BidNotification {
  id: string
  type: 'new_bid' | 'bid_accepted' | 'bid_rejected' | 'job_completed' | 'welcome' | 'new_message'
  title: string
  message: string
  job_id?: string
  job_title?: string
  bid_id?: string
  contractor_name?: string
  homeowner_name?: string
  amount?: number
  created_at: string
  read: boolean
  link?: string
  conversation_id?: string
  sender_name?: string
}

export default function BidNotificationSystem() {
  const { user, userProfile } = useAuth()
  const [notifications, setNotifications] = useState<BidNotification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)

  // Add welcome notification for new homeowners and create welcome conversation
  useEffect(() => {
    if (!user || !userProfile) return

    // Check if this is a new homeowner user and show welcome notification
    if (userProfile.role === 'homeowner') {
      const hasSeenWelcome = localStorage.getItem(`welcome_seen_${user.id}`)
      if (!hasSeenWelcome) {
        const welcomeNotification: BidNotification = {
          id: `welcome_${user.id}`,
          type: 'welcome',
          title: 'Welcome to Rushr! 🎉',
          message: 'Welcome to Rushr! We\'re excited to help you get your projects done quickly and reliably. Check your messages for more info!',
          created_at: new Date().toISOString(),
          read: false,
          link: '/messages'
        }

        setNotifications(prev => [welcomeNotification, ...prev])
        localStorage.setItem(`welcome_seen_${user.id}`, 'true')

        // Also create a welcome conversation in the messages
        // createWelcomeConversation(user.id)
      }
    }
  }, [user, userProfile])

  // Create welcome conversation with Rushr support
  const createWelcomeConversation = async (homeownerId: string) => {
    try {
      // First, check if we already have a welcome conversation
      console.log('Creating welcome conversation for homeowner:', homeownerId)
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('homeowner_id', homeownerId)
        .eq('title', 'Welcome to Rushr!')
        .single()

      console.log('existingConv:', existingConv)

      if (existingConv) return // Already exists

      // Create conversation with Rushr as the "pro" (using a special system user ID)
      const rushrSystemId = 'ece671fd-4e5a-44bc-aed1-d5a5aa3be66f' // Special system user ID

      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          homeowner_id: homeownerId,
          pro_id: rushrSystemId,
          title: 'Welcome to Rushr!',
          status: 'active'
        })
        .select()

        console.log('existingConv', conversation)

      if (convError) {
        // Suppressed: Database connection disabled
        return
      }

      // Send welcome message
      const welcomeMessage = `Welcome to Rushr! 🎉

We're excited to help you get your home projects done quickly and reliably. Here's how it works:

1. **Post a job** - Describe what you need help with
2. **Get matched** - We'll connect you with qualified professionals
3. **Get quotes** - Receive competitive quotes from verified pros
4. **Choose & hire** - Select the best pro and get your project started

If you have any questions or need help, just reply to this message and our support team will assist you.

Thanks for choosing Rushr!
The Rushr Team`

      await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          sender_id: rushrSystemId,
          message_type: 'system',
          content: welcomeMessage
        })

    } catch (error) {
      console.error('Error creating welcome conversation:', error)
    }
  }

  // Subscribe to real-time messages for notifications
  useEffect(() => {
    if (!user || !userProfile) return

    // Subscribe to new messages for this user
    const messageSubscription = supabase
      .channel('user_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=in.(select id from conversations where homeowner_id=eq.${user.id} or pro_id=eq.${user.id})`
        },
        async (payload) => {
          // Only show notifications for messages from others (not self)
          if (payload.new.sender_id !== user.id) {
            // Get conversation details to show sender name
            const { data: conversation } = await supabase
              .from('conversation_details')
              .select('*')
              .eq('id', payload.new.conversation_id)
              .single()

            if (conversation) {
              const isHomeowner = conversation.homeowner_id === user.id
              const senderName = isHomeowner
                ? (conversation.pro_id === '00000000-0000-0000-0000-000000000000' ? 'Rushr Support' : conversation.pro_name)
                : conversation.homeowner_name

              const messageNotification: BidNotification = {
                id: `message_${payload.new.id}`,
                type: 'new_message',
                title: `New message from ${senderName || 'Unknown'}`,
                message: payload.new.content || 'New message received',
                created_at: payload.new.created_at,
                read: false,
                link: `/messages/${conversation.id}`,
                conversation_id: conversation.id,
                sender_name: senderName || 'Unknown'
              }

              setNotifications(prev => [messageNotification, ...prev])
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messageSubscription)
    }
  }, [user, userProfile])

  useEffect(() => {
    if (!user || !userProfile) return

    // Set up real-time subscriptions based on user role
    let subscription: any

    if (userProfile.role === 'homeowner') {
      // Listen for new bids on homeowner's jobs
      subscription = supabase
        .channel('homeowner_bid_notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'job_bids',
            filter: `homeowner_id=eq.${user.id}`
          },
          async (payload) => {
            // Fetch job and contractor details
            const { data: jobData } = await supabase
              .from('homeowner_jobs')
              .select('title')
              .eq('id', payload.new.job_id)
              .single()

            const { data: contractorData } = await supabase
              .from('user_profiles')
              .select('name')
              .eq('id', payload.new.contractor_id)
              .single()

            const notification: BidNotification = {
              id: `bid_${payload.new.id}`,
              type: 'new_bid',
              title: 'New Bid Received',
              message: `${contractorData?.name || 'A contractor'} submitted a bid of $${payload.new.bid_amount} for "${jobData?.title || 'your job'}"`,
              job_id: payload.new.job_id,
              job_title: jobData?.title || 'Unknown Job',
              bid_id: payload.new.id,
              contractor_name: contractorData?.name,
              amount: payload.new.bid_amount,
              created_at: new Date().toISOString(),
              read: false
            }

            setNotifications(prev => [notification, ...prev])
          }
        )
        .subscribe()
    } else if (userProfile.role === 'contractor') {
      // Listen for bid status updates for contractor's bids
      subscription = supabase
        .channel('contractor_bid_notifications')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'job_bids',
            filter: `contractor_id=eq.${user.id}`
          },
          async (payload) => {
            if (payload.old.status !== payload.new.status) {
              // Fetch job and homeowner details
              const { data: jobData } = await supabase
                .from('homeowner_jobs')
                .select('title')
                .eq('id', payload.new.job_id)
                .single()

              const { data: homeownerData } = await supabase
                .from('user_profiles')
                .select('name')
                .eq('id', payload.new.homeowner_id)
                .single()

              let notification: BidNotification

              if (payload.new.status === 'accepted') {
                notification = {
                  id: `bid_accepted_${payload.new.id}`,
                  type: 'bid_accepted',
                  title: 'Bid Accepted!',
                  message: `Your bid of $${payload.new.bid_amount} for "${jobData?.title || 'the job'}" has been accepted by ${homeownerData?.name || 'the homeowner'}`,
                  job_id: payload.new.job_id,
                  job_title: jobData?.title || 'Unknown Job',
                  bid_id: payload.new.id,
                  homeowner_name: homeownerData?.name,
                  amount: payload.new.bid_amount,
                  created_at: new Date().toISOString(),
                  read: false
                }
              } else if (payload.new.status === 'rejected') {
                notification = {
                  id: `bid_rejected_${payload.new.id}`,
                  type: 'bid_rejected',
                  title: 'Bid Not Selected',
                  message: `Your bid for "${jobData?.title || 'the job'}" was not selected. Keep bidding on other opportunities!`,
                  job_id: payload.new.job_id,
                  job_title: jobData?.title || 'Unknown Job',
                  bid_id: payload.new.id,
                  homeowner_name: homeownerData?.name,
                  amount: payload.new.bid_amount,
                  created_at: new Date().toISOString(),
                  read: false
                }
              } else {
                return // Don't create notification for other status changes
              }

              setNotifications(prev => [notification, ...prev])
            }
          }
        )
        .subscribe()
    }

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription)
      }
    }
  }, [user, userProfile])

  const markAsRead = (notificationId: string) => {
    setNotifications(prev =>
      prev.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      )
    )
  }

  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    )
  }

  const removeNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
  }

  const unreadCount = notifications.filter(n => !n.read).length

  const getNotificationIcon = (type: BidNotification['type']) => {
    switch (type) {
      case 'new_bid':
        return <DollarSign className="h-4 w-4 text-green-600" />
      case 'bid_accepted':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'bid_rejected':
        return <X className="h-4 w-4 text-red-600" />
      case 'job_completed':
        return <TrendingUp className="h-4 w-4 text-blue-600" />
      case 'welcome':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      case 'new_message':
        return <MessageSquare className="h-4 w-4 text-blue-600" />
      default:
        return <Bell className="h-4 w-4 text-gray-600" />
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }

  if (!user || !userProfile) return null

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      {showNotifications && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border rounded-lg shadow-lg z-50">
          <div className="p-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer ${!notification.read ? 'bg-blue-50' : ''
                    }`}
                  onClick={() => {
                    markAsRead(notification.id)
                    // Handle link clicks for welcome notifications
                    if (notification.link) {
                      window.location.href = notification.link
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {notification.title}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeNotification(notification.id)
                          }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 mb-1">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                        {!notification.read && (
                          <span className="h-2 w-2 bg-blue-500 rounded-full"></span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-3 border-t">
              <button
                onClick={() => {
                  setShowNotifications(false)
                  // Navigate to appropriate page based on user role
                  if (userProfile.role === 'homeowner') {
                    window.location.href = '/dashboard/homeowner/bids'
                  } else {
                    window.location.href = '/jobs'
                  }
                }}
                className="w-full text-center text-sm text-blue-600 hover:text-blue-800"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {showNotifications && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowNotifications(false)}
        />
      )}
    </div>
  )
}