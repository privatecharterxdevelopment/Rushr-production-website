'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { RequireSignedIn } from '../../../lib/guards'
import { useAuth } from '../../../lib/guards'
import { useConversations, useConversation, useTypingIndicator } from '../../../lib/hooks/useMessaging'
import type { Conversation, Message as DBMessage, MessageOffer } from '../../../lib/messaging'
import { MessagingAPI } from '../../../lib/messaging'

/* ======================== Types ======================== */
type Role = 'homeowner' | 'pro'
type OfferStatus = 'pending' | 'accepted' | 'declined' | 'countered'
type Attachment = {
  id: string
  kind: 'image' | 'file'
  name: string
  url: string
  mime?: string
  size?: number
}
type MessageKind = 'text' | 'offer' | 'system' | 'file'
type Message = {
  id: string
  kind: MessageKind
  fromMe: boolean
  time: string
  status?: 'sent' | 'delivered' | 'seen'
  text?: string
  attachments?: Attachment[]
  offerTitle?: string
  offerPrice?: number
  offerDays?: number
  offerNotes?: string
  offerStatus?: OfferStatus
  counterPrice?: number
  counterDays?: number
  counterNotes?: string
  isDeleted?: boolean
  canDelete?: boolean
}

// Transform database message to UI message
function transformMessage(dbMessage: DBMessage, currentUserId: string): Message {
  const isFromMe = dbMessage.sender_id === currentUserId
  const isDeleted = dbMessage.metadata?.deleted || false
  const canDelete = MessagingAPI.canDeleteMessage(dbMessage, currentUserId, 24 * 60 * 60 * 1000) // 24 hours
  const attachments: Attachment[] = (dbMessage.attachments || []).map(att => ({
    id: att.id,
    kind: att.file_type.startsWith('image/') ? 'image' : 'file',
    name: att.file_name,
    url: att.file_url,
    mime: att.file_type,
    size: att.file_size
  }))

  const offer = dbMessage.offer
  return {
    id: dbMessage.id,
    kind: dbMessage.message_type as MessageKind,
    fromMe: isFromMe,
    time: new Date(dbMessage.created_at).toLocaleDateString() + ' ' + new Date(dbMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text: isDeleted ? '[Message deleted]' : (dbMessage.content || undefined),
    attachments: isDeleted ? undefined : (attachments.length > 0 ? attachments : undefined),
    offerTitle: offer?.title,
    offerPrice: offer?.price,
    offerDays: offer?.delivery_days,
    offerNotes: offer?.notes,
    offerStatus: offer?.status as OfferStatus,
    counterPrice: offer?.counter_price,
    counterDays: offer?.counter_days,
    counterNotes: offer?.counter_notes,
    isDeleted,
    canDelete
  }
}

// Transform database conversation to UI thread
function transformConversation(conversation: Conversation, currentUserId: string): Thread {
  const isHomeowner = conversation.homeowner_id === currentUserId
  const counterpartName = isHomeowner ? conversation.pro_name : conversation.homeowner_name

  return {
    id: conversation.id,
    title: conversation.title,
    counterpart: counterpartName || 'Unknown User',
    role: isHomeowner ? 'homeowner' : 'pro',
    lastMessage: 'Loading...',
    lastTime: new Date(conversation.last_message_at).toLocaleDateString() + ' ' + new Date(conversation.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    unread: conversation.unread_count || 0,
    messages: []
  }
}

type Thread = {
  id: string
  title: string
  counterpart: string
  role: Role
  avatar?: string
  lastMessage: string
  lastTime: string
  unread: number
  tags?: string[]
  labels?: string[]
  pinned?: boolean
  hot?: boolean
  avgResponseMins?: number
  lastActive?: string
  messages: Message[]
}

/* ======================== Constants ======================== */
const LABELS = ['Quote sent', 'Scheduling', 'In progress', 'Awaiting parts', 'Closed'] as const

const QUICK_HOMEOWNER = [
  'Can you send me a quote?',
  'When can you start?',
  "What's included?",
  'Can we do a quick call?'
]
const QUICK_PRO = [
  "I'm available tomorrow 2–4pm",
  'Can you share a photo?',
  "Here's my quote.",
  "What's the address?"
]

/* ======================== Icons (inline) ======================== */
function PaperclipIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        d="M21.44 11.05l-8.49 8.49a5.5 5.5 0 01-7.78-7.78l8.49-8.49a3.5 3.5 0 014.95 4.95l-8.49 8.49a1.5 1.5 0 11-2.12-2.12l7.07-7.07" />
    </svg>
  )
}
function FileTextIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6"/>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M16 13H8"/>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M16 17H8"/>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M10 9H8"/>
    </svg>
  )
}

/* ======================== Fallback Data ======================== */
const EMPTY_THREAD: Thread = {
  id: '',
  title: 'No conversation selected',
  counterpart: '',
  role: 'homeowner',
  lastMessage: '',
  lastTime: '',
  unread: 0,
  messages: []
}

/* ======================== Helpers ======================== */
function classNames(...c: Array<string | boolean | undefined>) {
  return c.filter(Boolean).join(' ')
}
function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(s => s[0]?.toUpperCase() ?? '').slice(0, 2).join('')
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-semibold">
      {initials || 'A'}
    </div>
  )
}
function useAutogrow(ref: React.RefObject<HTMLTextAreaElement>, value: string) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [ref, value])
}
function highlight(text: string, q: string) {
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return text
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + q.length)
  const after = text.slice(idx + q.length)
  return (
    <>
      {before}
      <mark className="bg-yellow-200">{match}</mark>
      {after}
    </>
  )
}

/* ======================== Page (guarded) ======================== */
export default function RealTimeMessagesPage() {
  return (
    <RequireSignedIn>
      <MessagesContent />
    </RequireSignedIn>
  )
}

function MessagesContent() {
  const { role: authRole, user } = useAuth()
  const { conversations, loading: conversationsLoading, createConversation } = useConversations()
  const searchParams = useSearchParams()
  const [activeId, setActiveId] = useState<string>('')
  const [query, setQuery] = useState('')

  // Transform conversations to threads format
  const threads = useMemo(() => {
    if (!user?.id) return []
    return conversations.map(conv => transformConversation(conv, user.id))
  }, [conversations, user?.id])

  // Set initial active conversation from URL or first conversation
  useEffect(() => {
    const conversationFromUrl = searchParams?.get('conversation')
    if (conversationFromUrl && threads.some(t => t.id === conversationFromUrl)) {
      setActiveId(conversationFromUrl)
    } else if (threads.length > 0 && !activeId) {
      setActiveId(threads[0].id)
    }
  }, [threads, activeId, searchParams])

  // Role-specific filter
  type BaseFilter = 'all' | 'unread' | 'starred'
  type ExtraFilter = 'quotes' | 'hot'
  const [filter, setFilter] = useState<BaseFilter | ExtraFilter>('all')
  const [labelFilter, setLabelFilter] = useState<string>('all')

  const sorted = useMemo(() => {
    const copy = [...threads]
    copy.sort((a, b) => Number(b.pinned) - Number(a.pinned))
    return copy
  }, [threads])

  const filtered = useMemo(() => {
    let data = sorted
    const q = query.trim().toLowerCase()
    if (q) {
      data = data.filter(
        t =>
          t.title.toLowerCase().includes(q) ||
          t.counterpart.toLowerCase().includes(q) ||
          t.lastMessage.toLowerCase().includes(q)
      )
    }
    if (filter === 'unread') data = data.filter(t => t.unread > 0)
    if (filter === 'quotes') {
      // Will need to check messages for offers
    }
    if (filter === 'hot') {
      data = data.filter(t => t.hot)
    }
    if (labelFilter !== 'all') data = data.filter(t => t.labels?.includes(labelFilter))
    return data
  }, [sorted, query, filter, labelFilter])

  const active = useMemo(
    () => threads.find(t => t.id === activeId) ?? EMPTY_THREAD,
    [threads, activeId]
  )
  const unreadCount = threads.reduce((n, t) => n + (t.unread > 0 ? 1 : 0), 0)

  // Show loading state
  if (conversationsLoading) {
    return (
      <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-7xl items-center justify-center px-4 py-4">
        <div className="text-center">
          <img
            src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
            alt="Loading..."
            className="w-8 h-8 object-contain mx-auto mb-4"
          />
          <p className="text-slate-600">Loading conversations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-7xl gap-4 px-4 py-4">
      {/* Left: thread list */}
      <aside className="hidden w-[360px] shrink-0 flex-col rounded-2xl border bg-white md:flex">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              Real-time Messages
            </span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                {unreadCount} unread
              </span>
            )}
          </div>
          <Link href="/post-job" className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50">
            New chat
          </Link>
        </div>

        <div className="border-b p-3">
          {/* search */}
          <div className="flex rounded-xl border bg-white px-3 py-2">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search messages"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          {/* filters */}
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={classNames('rounded-md px-2 py-1', filter === 'all' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100')}
            >All</button>
            <button
              onClick={() => setFilter('unread')}
              className={classNames('rounded-md px-2 py-1', filter === 'unread' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100')}
            >Unread</button>

            {authRole === 'homeowner' && (
              <button
                onClick={() => setFilter('quotes')}
                className={classNames('rounded-md px-2 py-1', filter === 'quotes' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100')}
              >Quotes</button>
            )}
            {authRole === 'pro' && (
              <button
                onClick={() => setFilter('hot')}
                className={classNames('rounded-md px-2 py-1', filter === 'hot' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100')}
              >Hot leads</button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <div className="text-slate-400 mb-2">
                <svg className="h-12 w-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm text-slate-600 mb-1">No conversations yet</p>
              <p className="text-xs text-slate-400">Start a conversation to see it here</p>
            </div>
          ) : (
            filtered.map(t => {
              const isActive = t.id === activeId
              const q = query.trim()
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={classNames(
                    'mb-1 flex w-full items-start gap-3 rounded-xl border p-2 text-left',
                    isActive ? 'border-emerald-300 bg-emerald-50/60' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  )}
                >
                  <Avatar name={t.counterpart} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-slate-800">{highlight(t.counterpart, q)}</div>
                      <div className="shrink-0 text-[11px] text-slate-500">{t.lastTime}</div>
                    </div>
                    <div className="truncate text-[13px] text-slate-600">{t.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {t.unread > 0 && (
                        <span className="ml-auto rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{t.unread}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Right: chat window */}
      <section className="relative flex min-w-0 flex-1 flex-col rounded-2xl border bg-white">
        {activeId ? (
          <ActiveConversation
            conversationId={activeId}
            authRole={authRole}
            query={query}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            Select a conversation to start messaging
          </div>
        )}
      </section>
    </div>
  )
}

/* ======================== Active Conversation Component ======================== */
function ActiveConversation({
  conversationId,
  authRole,
  query
}: {
  conversationId: string
  authRole?: Role
  query: string
}) {
  const { user } = useAuth()
  const {
    conversation,
    messages: dbMessages,
    loading,
    error,
    typingUsers,
    sendMessage,
    sendMessageWithFiles,
    sendOffer,
    updateOfferStatus,
    markAsRead,
    setTyping,
    deleteMessage,
    deleteMessagePermanently,
    archiveConversation,
    deleteConversation
  } = useConversation(conversationId)

  const { handleTyping, stopTyping } = useTypingIndicator(conversationId, setTyping)

  // Transform messages
  const messages = useMemo(() => {
    if (!user?.id || !dbMessages) return []
    return dbMessages.map(msg => transformMessage(msg, user.id))
  }, [dbMessages, user?.id])

  const [text, setText] = useState('')
  const [showOffer, setShowOffer] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [showPaymentAdjustment, setShowPaymentAdjustment] = useState(false)
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [adjustmentCategory, setAdjustmentCategory] = useState('')
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false)
  const [activeBooking, setActiveBooking] = useState<any>(null)

  // Fetch active booking for this conversation
  useEffect(() => {
    const fetchActiveBooking = async () => {
      if (!conversation || !user) return

      try {
        // Get the homeowner and contractor IDs from conversation
        const homeownerId = conversation.homeowner_id
        const contractorId = conversation.pro_id

        // Find active booking between these parties
        const response = await fetch(`/api/booking/active?homeownerId=${homeownerId}&contractorId=${contractorId}`)
        const data = await response.json()

        if (data.success && data.booking) {
          setActiveBooking(data.booking)
        }
      } catch (error) {
        console.error('Error fetching active booking:', error)
      }
    }

    fetchActiveBooking()
  }, [conversation, user])

  const handleRequestAdjustment = async () => {
    if (!adjustmentAmount || !adjustmentReason || !activeBooking || !user) return

    setSubmittingAdjustment(true)
    try {
      const userRole = user.id === conversation?.homeowner_id ? 'homeowner' : 'contractor'

      const response = await fetch('/api/payments/request-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: activeBooking.id,
          requestedBy: userRole,
          requesterId: user.id,
          requesterName: userRole === 'homeowner' ? conversation?.homeowner_name : conversation?.pro_name,
          newAmount: parseFloat(adjustmentAmount),
          reason: adjustmentReason,
          category: adjustmentCategory || undefined,
          homeownerId: conversation?.homeowner_id,
          contractorId: conversation?.pro_id
        })
      })

      const data = await response.json()

      if (data.success) {
        // Send a system message about the adjustment request
        await sendMessage(`💰 Payment adjustment requested: $${activeBooking.amount?.toFixed(2) || '0.00'} → $${parseFloat(adjustmentAmount).toFixed(2)}. Reason: ${adjustmentReason}`)

        setShowPaymentAdjustment(false)
        setAdjustmentAmount('')
        setAdjustmentReason('')
        setAdjustmentCategory('')
        alert('Payment adjustment request sent! The other party will be notified via email.')
      } else {
        alert(data.error || 'Failed to submit adjustment request')
      }
    } catch (error) {
      console.error('Error requesting adjustment:', error)
      alert('Failed to submit adjustment request')
    } finally {
      setSubmittingAdjustment(false)
    }
  }

  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useAutogrow(inputRef, text)

  // Scroll to bottom when messages change
  useEffect(() => {
    const el = listRef.current
    if (el) {
      el.scrollTop = el.scrollHeight + 1000
    }
  }, [messages])

  // Mark messages as read when conversation becomes active
  useEffect(() => {
    if (conversationId && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      markAsRead(lastMessage.id)
    }
  }, [conversationId, messages, markAsRead])

  const submitMessage = async () => {
    const trimmed = text.trim()
    if (!trimmed && selectedFiles.length === 0) return

    try {
      if (selectedFiles.length > 0) {
        await sendMessageWithFiles(trimmed, selectedFiles)
        setSelectedFiles([])
      } else {
        await sendMessage(trimmed)
      }
      setText('')
      stopTyping()
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message. Please try again.')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files])
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <img
            src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
            alt="Loading..."
            className="w-6 h-6 object-contain mx-auto mb-2"
          />
          <p className="text-sm text-slate-600">Loading conversation...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600 mb-2">Error loading conversation</p>
          <p className="text-xs text-slate-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        Conversation not found
      </div>
    )
  }

  const counterpartName = user?.id === conversation.homeowner_id
    ? conversation.pro_name
    : conversation.homeowner_name
  const userRole = user?.id === conversation.homeowner_id ? 'homeowner' : 'pro'
  const quick = userRole === 'pro' ? QUICK_PRO : QUICK_HOMEOWNER

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b p-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={counterpartName || 'Unknown'} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-800">{counterpartName}</div>
            <div className="text-xs text-slate-500">{conversation.title}</div>
            {typingUsers.length > 0 && (
              <div className="text-xs text-emerald-600">typing...</div>
            )}
          </div>
        </div>

        {/* Conversation actions */}
        <div className="flex items-center gap-2">
          <ConversationActionsMenu
            onArchive={async () => {
              try {
                await archiveConversation()
                alert('Conversation archived')
              } catch (error) {
                alert('Failed to archive conversation')
              }
            }}
            onDelete={async () => {
              if (confirm('Delete this conversation? This will hide it from your inbox.')) {
                try {
                  await deleteConversation()
                  alert('Conversation deleted')
                } catch (error) {
                  alert('Failed to delete conversation')
                }
              }
            }}
          />
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="relative flex-1 overflow-auto p-4"
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50">
            <div className="rounded-md bg-white px-4 py-2 text-sm text-emerald-700 shadow">Drop files to attach</div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            query={query}
            onDelete={async () => {
              if (confirm('Delete this message? This action cannot be undone.')) {
                try {
                  await deleteMessage(msg.id)
                } catch (error) {
                  alert('Failed to delete message')
                }
              }
            }}
          />
        ))}
      </div>

      {/* Pro quote toolbar + Payment Adjustment for both roles */}
      <div className="flex items-center justify-between gap-2 border-t bg-white/60 px-3 py-2">
        {/* Left side - Cancel job button */}
        {activeBooking && (
          <button
            onClick={() => {
              if (confirm('Are you sure you want to cancel this job? You will need to provide a reason.')) {
                const reason = prompt('Please provide a reason for cancellation:')
                if (reason && reason.trim()) {
                  const cancellerRole = user?.id === conversation?.homeowner_id ? 'homeowner' : 'contractor'
                  const cancellerName = cancellerRole === 'homeowner' ? conversation?.homeowner_name : conversation?.pro_name

                  // Call cancel API with all required fields
                  fetch('/api/booking/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      bookingId: activeBooking.id,
                      paymentHoldId: activeBooking.paymentHoldId,
                      cancelledBy: cancellerRole,
                      cancelledById: user?.id,
                      cancelledByName: cancellerName,
                      contractorId: conversation?.pro_id,
                      homeownerId: conversation?.homeowner_id,
                      reason: reason.trim(),
                      amount: activeBooking.amount
                    })
                  }).then(res => res.json()).then(data => {
                    if (data.success) {
                      alert('Job cancelled successfully. The other party has been notified.')
                      setActiveBooking(null)
                    } else {
                      alert(data.error || 'Failed to cancel job')
                    }
                  }).catch(err => {
                    console.error('Cancel error:', err)
                    alert('Failed to cancel job. Please try again.')
                  })
                }
              }
            }}
            className="flex items-center gap-2 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel Job
          </button>
        )}

        {/* Right side - Quote and Payment Adjustment */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Payment Adjustment button - for both roles when there's an active booking */}
          {activeBooking && (
            <button
              onClick={() => setShowPaymentAdjustment(v => !v)}
              className={classNames(
                'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
                showPaymentAdjustment ? 'bg-blue-600 text-white border-blue-600' : 'border-blue-200 text-blue-600 hover:bg-blue-50'
              )}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {showPaymentAdjustment ? 'Close' : 'Adjust Payment'}
            </button>
          )}

          {/* Quote button - only for pros */}
          {userRole === 'pro' && (
            <button
              onClick={() => setShowOffer(v => !v)}
              className={classNames(
                'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
                showOffer ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:bg-slate-50'
              )}
            >
              <FileTextIcon className="h-4 w-4" />
              {showOffer ? 'Close Quote' : 'Send Quote'}
            </button>
          )}
        </div>
      </div>

      {/* Payment Adjustment Form */}
      {showPaymentAdjustment && activeBooking && (
        <div className="border-t bg-blue-50/50 p-4">
          <div className="mx-auto max-w-3xl rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm font-semibold">Request Payment Adjustment</div>
              <div className="ml-auto text-xs text-slate-500">
                Current: ${activeBooking.amount?.toFixed(2) || '0.00'}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">New Amount (USD)</label>
                <input
                  value={adjustmentAmount}
                  onChange={e => setAdjustmentAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Category (optional)</label>
                <select
                  value={adjustmentCategory}
                  onChange={e => setAdjustmentCategory(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">Select category</option>
                  <option value="additional_work">Additional Work</option>
                  <option value="materials">Materials/Parts</option>
                  <option value="time_extension">Time Extension</option>
                  <option value="scope_change">Scope Change</option>
                  <option value="discount">Discount/Reduction</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Reason for Adjustment</label>
                <textarea
                  value={adjustmentReason}
                  onChange={e => setAdjustmentReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why the payment amount should change..."
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                {parseFloat(adjustmentAmount) > (activeBooking.amount || 0)
                  ? `+$${(parseFloat(adjustmentAmount) - (activeBooking.amount || 0)).toFixed(2)} increase`
                  : parseFloat(adjustmentAmount) < (activeBooking.amount || 0)
                    ? `-$${((activeBooking.amount || 0) - parseFloat(adjustmentAmount)).toFixed(2)} decrease`
                    : 'Enter a different amount'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPaymentAdjustment(false)}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  disabled={!adjustmentAmount || !adjustmentReason || submittingAdjustment}
                  onClick={handleRequestAdjustment}
                  className={classNames(
                    'rounded-md px-3 py-1.5 text-sm font-semibold text-white',
                    adjustmentAmount && adjustmentReason && !submittingAdjustment
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-slate-300 cursor-not-allowed'
                  )}
                >
                  {submittingAdjustment ? 'Sending...' : 'Request Adjustment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quote form for pros */}
      {showOffer && userRole === 'pro' && (
        <div className="border-t bg-emerald-50/50 p-3">
          <OfferComposer
            onCancel={() => setShowOffer(false)}
            onSubmit={async (offer) => {
              await sendOffer(offer)
              setShowOffer(false)
            }}
          />
        </div>
      )}

      {/* Quick replies */}
      <div className="border-t bg-white/70 px-3 py-2">
        <div className="flex flex-wrap gap-2">
          {quick.map((qr) => (
            <button
              key={qr}
              onClick={() => setText(t => (t ? `${t} ${qr}` : qr))}
              className="rounded-full border px-3 py-1 text-xs hover:bg-slate-50"
            >
              {qr}
            </button>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t p-3">
        {/* Selected files preview */}
        {selectedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs bg-slate-50">
                <span className="truncate max-w-[220px]">{file.name}</span>
                <button
                  className="text-slate-500 hover:text-slate-700"
                  onClick={() => setSelectedFiles(files => files.filter((_, i) => i !== index))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border bg-white p-2">
          <input
            type="file"
            multiple
            hidden
            id="file-upload"
            onChange={handleFileSelect}
          />
          <button
            title="Attach"
            className="rounded-md border p-2 hover:bg-slate-50"
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <PaperclipIcon className="h-4 w-4 text-slate-600" />
          </button>

          <textarea
            ref={inputRef}
            value={text}
            onChange={e => {
              setText(e.target.value)
              handleTyping()
            }}
            onBlur={stopTyping}
            placeholder="Write a message"
            rows={1}
            className="min-h-[36px] max-h-[200px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submitMessage()
              }
            }}
          />

          <button
            onClick={submitMessage}
            disabled={!text.trim() && selectedFiles.length === 0}
            className={classNames(
              'rounded-md px-3 py-2 text-xs font-semibold',
              (text.trim() || selectedFiles.length > 0)
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            )}
          >
            Send
          </button>
        </div>

        <div className="mt-2 text-[11px] text-slate-500">Press Enter to send. Shift+Enter for a new line.</div>
      </div>
    </>
  )
}

/* ======================== Message Bubble ======================== */
function MessageBubble({ message, query }: { message: Message; query: string }) {
  const isMe = message.fromMe

  if (message.kind === 'offer') {
    return <OfferBubble message={message} query={query} />
  }

  if (message.kind === 'system') {
    return (
      <div className="my-2 flex justify-center">
        <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-600">{message.text}</div>
      </div>
    )
  }

  return (
    <div className={classNames('mb-3 flex items-end gap-2', isMe ? 'justify-end' : 'justify-start')}>
      {!isMe && <div className="h-6 w-6 rounded-full bg-slate-200" />}
      <div className={classNames('max-w-[72%] rounded-2xl px-3 py-2 text-sm shadow-sm border',
        isMe ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-800 border-slate-200')}>
        {message.text && <div className="whitespace-pre-wrap">{highlight(message.text, query)}</div>}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {message.attachments.map(att => (
              att.kind === 'image' ? (
                <img key={att.id} src={att.url} alt={att.name} className="h-24 w-full object-cover rounded" />
              ) : (
                <a key={att.id} href={att.url} target="_blank" rel="noreferrer"
                   className="flex items-center gap-2 rounded border px-2 py-1 text-xs hover:bg-white/10">
                  <span className="truncate">{att.name}</span>
                </a>
              )
            ))}
          </div>
        )}
        <div className={classNames('mt-1 flex items-center gap-2 text-[11px]',
          isMe ? 'text-emerald-100/80' : 'text-slate-500')}>
          <span>{message.time}</span>
          {isMe && message.status && <span>• {message.status}</span>}
        </div>
      </div>
    </div>
  )
}

/* ======================== Offer Bubble ======================== */
function OfferBubble({ message, query }: { message: Message; query: string }) {
  const isMe = message.fromMe
  const status = message.offerStatus || 'pending'

  return (
    <div className={classNames('mb-3 flex items-end gap-2', isMe ? 'justify-end' : 'justify-start')}>
      {!isMe && <div className="h-6 w-6 rounded-full bg-slate-200" />}
      <div className={classNames('max-w-[72%] overflow-hidden rounded-2xl border bg-white text-sm shadow-sm',
        isMe ? 'border-emerald-200' : 'border-slate-200')}>
        <div className="flex items-center gap-2 border-b bg-emerald-600 px-3 py-2 text-white">
          <FileTextIcon className="h-4 w-4" />
          <div className="font-semibold">Quote</div>
          <div className="ml-auto text-xs opacity-90">{message.time}</div>
        </div>
        <div className="p-3">
          <div className="mb-1 text-[13px] font-semibold text-slate-800">
            {highlight(message.offerTitle || 'Service Quote', query)}
          </div>
          <div className="mb-2 flex items-center gap-3">
            <div className="rounded-md bg-emerald-50 px-2 py-1 text-[13px] font-semibold text-emerald-700">
              ${message.offerPrice?.toLocaleString()}
            </div>
            <div className="rounded-md border px-2 py-1 text-[12px] text-slate-600">
              {message.offerDays} {message.offerDays === 1 ? 'day' : 'days'}
            </div>
            <StatusPill status={status} />
          </div>
          {message.offerNotes && (
            <p className="whitespace-pre-wrap text-[13px] text-slate-700">
              {highlight(message.offerNotes, query)}
            </p>
          )}

          {status === 'countered' && (
            <div className="mt-3 rounded-md border bg-amber-50 p-2 text-[13px] text-amber-900">
              <div className="mb-1 font-semibold">Counter-offer</div>
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-amber-100 px-2 py-1 font-semibold">
                  ${message.counterPrice?.toLocaleString()}
                </div>
                <div className="rounded-md border px-2 py-1">
                  {message.counterDays} {message.counterDays === 1 ? 'day' : 'days'}
                </div>
              </div>
              {message.counterNotes && <div className="mt-1 text-slate-700">{message.counterNotes}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: OfferStatus }) {
  const map: Record<OfferStatus, string> = {
    pending: 'bg-slate-100 text-slate-700',
    accepted: 'bg-emerald-100 text-emerald-800',
    declined: 'bg-rose-100 text-rose-800',
    countered: 'bg-amber-100 text-amber-800',
  }
  return <span className={classNames('rounded-md px-2 py-0.5 text-[11px] font-semibold', map[status])}>{status}</span>
}

/* ======================== Offer Composer ======================== */
function OfferComposer({ onCancel, onSubmit }: {
  onCancel: () => void
  onSubmit: (payload: { title: string; price: number; delivery_days: number; notes?: string }) => Promise<void>
}) {
  const [title, setTitle] = useState('Diagnostic & Repair Visit')
  const [price, setPrice] = useState<string>('150')
  const [days, setDays] = useState<string>('1')
  const [notes, setNotes] = useState('Includes first hour on site. Parts/labor beyond that quoted before proceeding.')
  const [submitting, setSubmitting] = useState(false)

  const priceNum = Number(price.replace(/[^\d.]/g, ''))
  const daysNum = Number(days.replace(/[^\d]/g, ''))
  const valid = title.trim().length > 0 && priceNum > 0 && daysNum > 0

  const handleSubmit = async () => {
    if (!valid || submitting) return

    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        price: priceNum,
        delivery_days: daysNum,
        notes: notes.trim() || undefined
      })
    } catch (error) {
      console.error('Failed to send offer:', error)
      alert('Failed to send offer. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl rounded-xl border bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <FileTextIcon className="h-4 w-4 text-emerald-700" />
        <div className="text-sm font-semibold">Create Quote</div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            placeholder="e.g., Replace evaporator coil"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Price (USD)</label>
          <input
            value={price}
            onChange={e => setPrice(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Delivery time (days)</label>
          <input
            value={days}
            onChange={e => setDays(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            placeholder="1"
          />
        </div>
        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">Notes / Scope</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            placeholder="Describe what is included…"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50">
          Cancel
        </button>
        <button
          disabled={!valid || submitting}
          onClick={handleSubmit}
          className={classNames(
            'rounded-md px-3 py-1.5 text-sm font-semibold text-white',
            valid && !submitting ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 cursor-not-allowed'
          )}
        >
          {submitting ? 'Sending...' : 'Send Quote'}
        </button>
      </div>
    </div>
  )
}

/* ======================== Conversation Actions Menu ======================== */
function ConversationActionsMenu({
  onArchive,
  onDelete
}: {
  onArchive: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="rounded-md border p-2 hover:bg-slate-50"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
        </svg>
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-48 bg-white border rounded-md shadow-lg py-1 z-20">
          <button
            onClick={() => {
              onArchive()
              setShowMenu(false)
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
          >
            Archive conversation
          </button>
          <button
            onClick={() => {
              onDelete()
              setShowMenu(false)
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600"
          >
            Delete conversation
          </button>
        </div>
      )}
    </div>
  )
}