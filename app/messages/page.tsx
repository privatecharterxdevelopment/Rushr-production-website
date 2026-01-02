'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import { useProAuth } from '../../contexts/ProAuthContext'
import { useConversations, useConversation } from '../../lib/hooks/useMessaging'
import { Capacitor } from '@capacitor/core'
import { safeBack } from '../../lib/safeBack'
import {
  ArrowLeft,
  Send,
  Search,
  Filter,
  MessageCircle,
  Clock,
  DollarSign,
  Calendar,
  Check,
  CheckCheck,
  X,
  ChevronRight
} from 'lucide-react'

type FilterType = 'all' | 'name' | 'price' | 'date'

export default function MessagesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const conversationIdFromUrl = searchParams.get('id')

  const { user: homeownerUser, userProfile, loading: homeownerLoading } = useAuth()
  const { user: contractorUser, contractorProfile, loading: contractorLoading } = useProAuth()

  const user = homeownerUser || contractorUser
  const profile = userProfile || contractorProfile
  const isContractor = !!contractorProfile

  const [selectedConversation, setSelectedConversation] = useState<string | null>(conversationIdFromUrl)
  const [messageInput, setMessageInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [showFilters, setShowFilters] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { conversations, loading: convsLoading, error: convsError, refresh: refreshConversations, markConversationAsRead } = useConversations(user?.id, isContractor ? 'pro' : 'homeowner')
  const { messages, loading: msgsLoading, sendMessage, markAsRead } = useConversation(selectedConversation, user?.id)

  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

  // Auto-scroll to bottom when new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Mark messages as read when viewing conversation
  useEffect(() => {
    if (selectedConversation) {
      markAsRead()
      markConversationAsRead(selectedConversation)
    }
  }, [selectedConversation, markAsRead, markConversationAsRead])

  // Loading state - include auth loading AND conversations loading
  if (homeownerLoading || contractorLoading || (user && convsLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col items-center">
          <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
            <div className="absolute inset-0 rounded-full border-emerald-200 border-t-emerald-600 animate-spin" style={{ borderWidth: 3 }} />
            <img
              src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg"
              alt="Rushr"
              style={{ width: 44, height: 44 }}
              className="object-contain"
            />
          </div>
          <p className="text-slate-600 text-sm mt-3">Loading messages...</p>
        </div>
      </div>
    )
  }

  // Not logged in
  if (!user) {
    router.replace('/')
    return null
  }

  // Error loading conversations
  if (convsError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center p-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <X className="h-8 w-8 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Failed to load messages</h3>
          <p className="text-slate-500 text-sm mb-4">{convsError}</p>
          <button
            onClick={() => refreshConversations()}
            className="px-6 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // Filter and sort conversations
  const filteredConversations = conversations
    .filter(conv => {
      if (!searchQuery) return true
      const name = isContractor ? conv.homeowner_name : conv.pro_name
      return name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
             conv.title?.toLowerCase().includes(searchQuery.toLowerCase())
    })
    .sort((a, b) => {
      switch (activeFilter) {
        case 'date':
          return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
        case 'name':
          const nameA = isContractor ? a.homeowner_name : a.pro_name
          const nameB = isContractor ? b.homeowner_name : b.pro_name
          return (nameA || '').localeCompare(nameB || '')
        default:
          return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      }
    })

  const selectedConv = conversations.find(c => c.id === selectedConversation)
  const otherPersonName = selectedConv ? (isContractor ? selectedConv.homeowner_name : selectedConv.pro_name) : ''

  const handleSend = async () => {
    if (!messageInput.trim() || !selectedConversation) return

    try {
      await sendMessage(messageInput.trim())
      setMessageInput('')
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' })
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
  }

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  // Group messages by date
  const groupedMessages = messages.reduce((groups: { [key: string]: typeof messages }, msg) => {
    const date = new Date(msg.created_at).toDateString()
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {})

  // Conversation List View
  if (!selectedConversation) {
    // iOS native layout with proper scrolling
    if (isNative) {
      return (
        <div className="fixed inset-0 flex flex-col bg-slate-50">
          {/* iOS Native Header */}
          <div
            className="relative z-50 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
            }}
          >
            <div className="px-4 py-4">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => safeBack(router, '/')}
                  className="flex items-center text-white active:opacity-60"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <ArrowLeft className="h-6 w-6" />
                  <span className="ml-1 font-medium">Back</span>
                </button>
                <h1 className="text-xl font-bold text-white">Messages</h1>
                <div className="w-16" />
              </div>

              {/* Search Bar */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-200" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/20 backdrop-blur-sm rounded-xl text-white placeholder-emerald-200 border border-white/30 focus:outline-none focus:border-white/50"
                />
              </div>

              {/* Filter Pills */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {[
                  { key: 'all', label: 'All', icon: MessageCircle },
                  { key: 'name', label: 'Name', icon: Filter },
                  { key: 'date', label: 'Date', icon: Calendar }
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveFilter(key as FilterType)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                      activeFilter === key
                        ? 'bg-white text-emerald-600 shadow-md'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scrollable Conversations List */}
          <div
            className="flex-1 overflow-auto"
            style={{
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 34px))'
            }}
          >
            <div className="p-4 space-y-2">
              {convsLoading ? (
                <div className="text-center py-12">
                  <img
                    src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
                    alt="Loading..."
                    className="h-8 w-8 mx-auto mb-2 object-contain"
                  />
                  <p className="text-slate-500 text-sm">Loading conversations...</p>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-20 h-20 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                    <MessageCircle className="h-10 w-10 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-1">No messages yet</h3>
                  <p className="text-slate-500 text-sm">
                    {searchQuery ? 'No conversations match your search' : 'Start a conversation to get help'}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const name = isContractor ? conv.homeowner_name : conv.pro_name
                  const initial = name?.charAt(0)?.toUpperCase() || '?'
                  const isRushrSupport = conv.pro_id === '00000000-0000-0000-0000-000000000000' ||
                                         conv.homeowner_id === '00000000-0000-0000-0000-000000000000'

                  return (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv.id)}
                      className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md active:scale-[0.99] transition-all text-left"
                    >
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white flex-shrink-0 ${
                        isRushrSupport
                          ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
                          : 'bg-gradient-to-br from-blue-400 to-purple-500'
                      }`}>
                        {isRushrSupport ? '🚀' : initial}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <h3 className="font-semibold text-slate-900 truncate">
                            {isRushrSupport ? 'Rushr Support' : (name || 'Unknown')}
                          </h3>
                          <span className="text-xs text-slate-500 flex-shrink-0">
                            {formatTime(conv.last_message_at)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 truncate">{conv.title}</p>
                        {(conv.unread_count || 0) > 0 && (
                          <div className="mt-1 flex items-center gap-1">
                            <span className="px-2 py-0.5 bg-emerald-500 text-white text-xs font-medium rounded-full">
                              {conv.unread_count} new
                            </span>
                          </div>
                        )}
                      </div>

                      <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )
    }

    // Web layout
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Web Header */}
        <div className="bg-gradient-to-b from-emerald-600 to-emerald-500 text-white">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => safeBack(router, '/')}
                className="p-2 -ml-2 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <h1 className="text-xl font-bold">Messages</h1>
              <div className="w-10" /> {/* Spacer for centering */}
            </div>

            {/* Search Bar */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-200" />
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white/20 backdrop-blur-sm rounded-xl text-white placeholder-emerald-200 border border-white/30 focus:outline-none focus:border-white/50"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {[
                { key: 'all', label: 'All', icon: MessageCircle },
                { key: 'name', label: 'Name', icon: Filter },
                { key: 'date', label: 'Date', icon: Calendar }
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key as FilterType)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    activeFilter === key
                      ? 'bg-white text-emerald-600 shadow-md'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Conversations List */}
        <div className="p-4 space-y-2">
          {convsLoading ? (
            <div className="text-center py-12">
              <img
                src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
                alt="Loading..."
                className="h-8 w-8 mx-auto mb-2 object-contain"
              />
              <p className="text-slate-500 text-sm">Loading conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                <MessageCircle className="h-10 w-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-1">No messages yet</h3>
              <p className="text-slate-500 text-sm">
                {searchQuery ? 'No conversations match your search' : 'Start a conversation to get help'}
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const name = isContractor ? conv.homeowner_name : conv.pro_name
              const initial = name?.charAt(0)?.toUpperCase() || '?'
              const isRushrSupport = conv.pro_id === '00000000-0000-0000-0000-000000000000' ||
                                     conv.homeowner_id === '00000000-0000-0000-0000-000000000000'

              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv.id)}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md active:scale-[0.99] transition-all text-left"
                >
                  {/* Avatar */}
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white flex-shrink-0 ${
                    isRushrSupport
                      ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
                      : 'bg-gradient-to-br from-blue-400 to-purple-500'
                  }`}>
                    {isRushrSupport ? '🚀' : initial}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {isRushrSupport ? 'Rushr Support' : (name || 'Unknown')}
                      </h3>
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 truncate">{conv.title}</p>
                    {(conv.unread_count || 0) > 0 && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="px-2 py-0.5 bg-emerald-500 text-white text-xs font-medium rounded-full">
                          {conv.unread_count} new
                        </span>
                      </div>
                    )}
                  </div>

                  <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
                </button>
              )
            })
          )}
        </div>
      </div>
    )
  }

  // Chat View
  return (
    <div
      className={isNative ? "fixed inset-0 flex flex-col bg-slate-100" : "h-screen flex flex-col bg-slate-100"}
    >
      {/* Chat Header */}
      <div
        className="flex-shrink-0"
        style={isNative ? {
          background: 'linear-gradient(135deg, #10b981, #059669)',
          paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
        } : {
          background: 'linear-gradient(135deg, #10b981, #059669)'
        }}
      >
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedConversation(null)}
              className="p-2 -ml-2 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>

            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-semibold">
                {otherPersonName?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <h2 className="font-semibold">{otherPersonName || 'Chat'}</h2>
                <p className="text-xs text-emerald-200">{selectedConv?.title}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {msgsLoading ? (
          <div className="text-center py-8">
            <img
              src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
              alt="Loading..."
              className="h-8 w-8 mx-auto mb-2 object-contain"
            />
            <p className="text-slate-500 text-sm">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-200 rounded-full flex items-center justify-center">
              <MessageCircle className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-slate-500">No messages yet. Say hello!</p>
          </div>
        ) : (
          Object.entries(groupedMessages).map(([date, msgs]) => (
            <div key={date}>
              {/* Date Separator */}
              <div className="flex items-center justify-center my-4">
                <span className="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-medium rounded-full">
                  {formatMessageDate(msgs[0].created_at)}
                </span>
              </div>

              {/* Messages for this date */}
              <div className="space-y-2">
                {msgs.map((msg) => {
                  const isMe = msg.sender_id === user?.id
                  const isSystem = msg.message_type === 'system'

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 max-w-[90%]">
                          <p className="text-sm text-emerald-800 whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                          isMe
                            ? 'bg-emerald-500 text-white rounded-br-md'
                            : 'bg-white text-slate-900 shadow-sm rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        <div className={`flex items-center justify-end gap-1 mt-1 ${isMe ? 'text-emerald-200' : 'text-slate-400'}`}>
                          <span className="text-xs">
                            {new Date(msg.created_at).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </span>
                          {isMe && (
                            msg.read_at ? (
                              <CheckCheck className="h-3.5 w-3.5" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div
        className="bg-white border-t border-slate-200 flex-shrink-0"
        style={{
          paddingBottom: isNative ? 'calc(16px + env(safe-area-inset-bottom))' : '16px'
        }}
      >
        <div className="p-3 flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Type a message..."
              rows={1}
              className="w-full px-4 py-3 bg-slate-100 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 max-h-32"
              style={{ minHeight: '44px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!messageInput.trim()}
            className="w-12 h-12 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-full flex items-center justify-center text-white transition-colors flex-shrink-0"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
