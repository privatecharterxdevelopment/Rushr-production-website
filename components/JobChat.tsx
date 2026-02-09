'use client'

import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useProAuth } from '../contexts/ProAuthContext'

interface ChatMessage {
  id: string
  job_id: string
  sender_id: string
  sender_role: 'homeowner' | 'contractor'
  message: string
  read_at: string | null
  created_at: string
}

interface JobChatProps {
  jobId: string
  contractorName?: string
  homeownerName?: string
  jobStatus?: string
  recipientId?: string
}

export default function JobChat({ jobId, contractorName, homeownerName, jobStatus, recipientId }: JobChatProps) {
  const { user: homeownerUser } = useAuth()
  const { user: contractorUser } = useProAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const user = homeownerUser || contractorUser
  const userRole = homeownerUser ? 'homeowner' : 'contractor'
  const isChatEnded = jobStatus === 'completed' || jobStatus === 'cancelled'

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Fetch messages
  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('job_chat_messages')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })

    if (data && !error) {
      setMessages(data)
      scrollToBottom()

      // Mark unread messages as read
      const unreadMessages = data.filter(m => m.sender_id !== user?.id && !m.read_at)
      if (unreadMessages.length > 0) {
        await supabase
          .from('job_chat_messages')
          .update({ read_at: new Date().toISOString() })
          .in('id', unreadMessages.map(m => m.id))
      }
    }
  }

  // Subscribe to real-time messages
  useEffect(() => {
    fetchMessages()

    const channel = supabase
      .channel(`job-chat-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_chat_messages',
          filter: `job_id=eq.${jobId}`
        },
        (payload) => {
          console.log('[CHAT] New message:', payload)
          const newMsg = payload.new as ChatMessage
          setMessages(prev => [...prev, newMsg])
          scrollToBottom()

          // Mark as read if not sent by current user
          if (newMsg.sender_id !== user?.id) {
            supabase
              .from('job_chat_messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', newMsg.id)
              .then(() => console.log('[CHAT] Marked message as read'))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobId, user?.id])

  // Send message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !user || isChatEnded) return

    setSending(true)
    const msgText = newMessage.trim()

    const { error } = await supabase
      .from('job_chat_messages')
      .insert({
        job_id: jobId,
        sender_id: user.id,
        sender_role: userRole,
        message: msgText,
        created_at: new Date().toISOString()
      })

    if (!error) {
      setNewMessage('')

      // Send push notification to recipient (fire-and-forget)
      if (recipientId) {
        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId,
            title: userRole === 'contractor' ? (contractorName || 'Contractor') : (homeownerName || 'Homeowner'),
            body: msgText.length > 100 ? msgText.substring(0, 100) + '...' : msgText,
            data: { jobId, type: 'chat_message' }
          })
        }).catch(() => {}) // Don't block on push failure
      }
    } else {
      console.error('[CHAT] Error sending message:', error)
      alert('Failed to send message')
    }

    setSending(false)
  }

  return (
    <div className="flex flex-col h-[500px] bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Chat Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-semibold">
            {userRole === 'homeowner' ? (contractorName?.[0] || 'C') : (homeownerName?.[0] || 'H')}
          </div>
          <div>
            <div className="font-semibold text-slate-900">
              {userRole === 'homeowner' ? contractorName : homeownerName}
            </div>
            <div className="text-xs text-slate-500">
              {userRole === 'homeowner' ? 'Contractor' : 'Homeowner'}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Start a conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwnMessage = msg.sender_id === user?.id
            return (
              <div
                key={msg.id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    isOwnMessage
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                  <div
                    className={`text-xs mt-1 ${
                      isOwnMessage ? 'text-emerald-100' : 'text-slate-500'
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input or Chat Ended */}
      {isChatEnded ? (
        <div className="p-3 bg-slate-50 border-t border-slate-200">
          <div className="flex items-center justify-center gap-2 py-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-slate-400 text-sm">This conversation has ended</span>
          </div>
        </div>
      ) : (
        <form onSubmit={sendMessage} className="p-3 bg-slate-50 border-t border-slate-200">
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
