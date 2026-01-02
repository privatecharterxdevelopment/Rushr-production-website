'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import {
  MessageSquare,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  User,
} from 'lucide-react'

type SupportTicket = {
  id: string
  user_id: string | null
  user_email: string
  user_name: string
  message: string
  status: 'new' | 'read' | 'responded' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  created_at: string
  admin_reply: string | null
  admin_reply_timestamp: string | null
}

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [replyText, setReplyText] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'new' | 'read' | 'responded'>('new')

  useEffect(() => {
    fetchTickets()

    const subscription = supabase
      .channel('support-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, () => {
        fetchTickets()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [filter])

  const fetchTickets = async () => {
    try {
      let query = supabase
        .from('support_messages')
        .select('*')
        .order('created_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query

      if (error) {
        // Only log if it's not a "table doesn't exist" error
        if (error.code !== '42P01' && error.code !== 'PGRST116') {
          console.error('Error fetching tickets:', error)
        }
        setTickets([])
        return
      }
      setTickets(data || [])
    } catch (error: any) {
      // Only log actual errors
      if (error?.code !== '42P01' && error?.code !== 'PGRST116') {
        console.error('Error fetching tickets:', error)
      }
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  const handleMarkAsRead = async (ticketId: string) => {
    try {
      const { error } = await supabase
        .from('support_messages')
        .update({ status: 'read' })
        .eq('id', ticketId)

      if (error) throw error
      await fetchTickets()
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }

  const handleReply = async () => {
    if (!selectedTicket || !replyText.trim()) return

    setActionLoading(true)
    try {
      const { error } = await supabase
        .from('support_messages')
        .update({
          admin_reply: replyText.trim(),
          admin_reply_timestamp: new Date().toISOString(),
          status: 'responded',
        })
        .eq('id', selectedTicket.id)

      if (error) throw error

      setReplyText('')
      setSelectedTicket(null)
      await fetchTickets()
    } catch (error) {
      console.error('Error sending reply:', error)
      alert('Failed to send reply. Check console for details.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleClose = async (ticketId: string) => {
    try {
      const { error } = await supabase
        .from('support_messages')
        .update({ status: 'closed' })
        .eq('id', ticketId)

      if (error) throw error
      await fetchTickets()
    } catch (error) {
      console.error('Error closing ticket:', error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
      case 'read':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
      case 'responded':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      case 'closed':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300'
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
      case 'medium':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="Loading support tickets..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Support Tickets</h1>
          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
            Manage customer support requests
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {(['all', 'new', 'read', 'responded'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {status !== 'all' && (
                <span className="ml-2">
                  ({tickets.filter((t) => t.status === status).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets List */}
      {tickets.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-12 text-center">
          <MessageSquare className="h-12 w-12 text-gray-400 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No {filter !== 'all' ? filter : ''} tickets
          </h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {filter === 'new' ? 'All caught up! New tickets will appear here.' : 'Change filter to see more tickets.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="h-5 w-5 text-gray-400" />
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {ticket.user_name}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-slate-400">
                      ({ticket.user_email})
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                      {ticket.status}
                    </span>
                    {ticket.priority && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-700 dark:text-slate-300 mb-2">{ticket.message}</p>

                  {ticket.admin_reply && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Send className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs font-medium text-blue-900 dark:text-blue-300">
                          Your Reply:
                        </span>
                      </div>
                      <p className="text-sm text-blue-900 dark:text-blue-300">{ticket.admin_reply}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {new Date(ticket.admin_reply_timestamp!).toLocaleString()}
                      </p>
                    </div>
                  )}

                  <div className="mt-2 text-xs text-gray-500 dark:text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(ticket.created_at).toLocaleString()}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  {ticket.status === 'new' && (
                    <button
                      onClick={() => handleMarkAsRead(ticket.id)}
                      className="px-3 py-2 bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-950 dark:hover:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-lg text-sm font-medium transition-colors"
                    >
                      Mark Read
                    </button>
                  )}
                  {!ticket.admin_reply && (
                    <button
                      onClick={() => setSelectedTicket(ticket)}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                    >
                      <Send className="h-4 w-4" />
                      Reply
                    </button>
                  )}
                  {ticket.status !== 'closed' && (
                    <button
                      onClick={() => handleClose(ticket.id)}
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full">
            <div className="border-b border-gray-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Reply to {selectedTicket.user_name}
              </h2>
              <button
                onClick={() => {
                  setSelectedTicket(null)
                  setReplyText('')
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">
                  Original Message:
                </p>
                <p className="text-sm text-gray-900 dark:text-white">{selectedTicket.message}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Your Reply:
                </label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  className="w-full p-3 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={6}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleReply}
                  disabled={!replyText.trim() || actionLoading}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      Send Reply
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setSelectedTicket(null)
                    setReplyText('')
                  }}
                  className="px-4 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
