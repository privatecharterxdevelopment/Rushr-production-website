'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useProAuth } from '../../../../contexts/ProAuthContext'
import { supabase } from '../../../../lib/supabaseClient'
import { ArrowLeft, Send, MessageSquare } from 'lucide-react'

interface Conversation {
  id: string
  homeowner_id: string
  homeowner_name: string
  job_id: string
  job_title: string
  last_message: string | null
  last_message_at: string | null
  unread_count: number
  status: string
}

interface Message {
  id: string
  content: string
  sender_id: string
  sender_type: 'homeowner' | 'contractor'
  created_at: string
  conversation_id: string
}

export default function ContractorMessagesPage() {
  const { user, contractorProfile, loading: authLoading } = useProAuth()
  const searchParams = useSearchParams()
  const conversationId = searchParams.get('id')

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [homeownerTyping, setHomeownerTyping] = useState(false)
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Hardcoded welcome message for contractors
  const welcomeNotification = {
    id: 'welcome-contractor',
    user_id: user?.id || '',
    type: 'welcome',
    title: 'Welcome to Rushr Pro! 🎉',
    message: 'Welcome to your professional messaging center! This is where you\'ll communicate with homeowners about their projects.\n\nHere\'s what you can do:\n• View all your conversations in one place\n• Chat with homeowners in real-time\n• Discuss project details and requirements\n• Get updates when homeowners respond\n\nTo get started, browse available jobs and submit your bids. When homeowners are interested, they\'ll start a conversation with you here. Good luck!',
    read: true,
    created_at: new Date().toISOString(),
    conversation_id: null,
    job_id: null
  }

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Fetch conversations with real data
  useEffect(() => {
    const fetchConversations = async () => {
      if (!user) return

      try {
        const { data: convos, error } = await supabase
          .from('conversations')
          .select(`
            id,
            homeowner_id,
            pro_id,
            job_id,
            status,
            last_message_at,
            contractor_unread_count,
            homeowner_jobs!conversations_job_id_fkey (
              id,
              title
            )
          `)
          .eq('pro_id', user.id)
          .order('last_message_at', { ascending: false, nullsFirst: false })

        if (error) {
          console.error('Error fetching conversations:', error)
        } else {
          // Get last message and homeowner info for each conversation
          const conversationsWithMessages = await Promise.all(
            (convos || []).map(async (convo: any) => {
              // Fetch last message
              const { data: lastMsg } = await supabase
                .from('messages')
                .select('content')
                .eq('conversation_id', convo.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

              // Fetch homeowner profile
              const { data: homeownerProfile } = await supabase
                .from('user_profiles')
                .select('name, email')
                .eq('id', convo.homeowner_id)
                .single()

              const job = convo.homeowner_jobs

              return {
                id: convo.id,
                homeowner_id: convo.homeowner_id,
                homeowner_name: homeownerProfile?.name || homeownerProfile?.email || 'Homeowner',
                job_id: convo.job_id,
                job_title: job?.title || 'Job',
                last_message: lastMsg?.content || 'No messages yet',
                last_message_at: convo.last_message_at,
                unread_count: convo.contractor_unread_count || 0,
                status: convo.status
              }
            })
          )

          setConversations(conversationsWithMessages)
        }
      } catch (err) {
        console.error('Error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchConversations()

    // Subscribe to conversation updates
    const conversationSubscription = supabase
      .channel('contractor_conversations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `pro_id=eq.${user.id}`
      }, () => {
        fetchConversations()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(conversationSubscription)
    }
  }, [user])

  // Fetch messages for selected conversation
  useEffect(() => {
    if (!conversationId) {
      setSelectedConversation(null)
      return
    }

    const selected = conversations.find(c => c.id === conversationId)
    setSelectedConversation(selected || null)

    const fetchMessages = async () => {
      const { data: msgs, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching messages:', error)
      } else {
        setMessages(msgs || [])

        // Mark messages as read
        await markAsRead()
      }
    }

    fetchMessages()

    // Subscribe to new messages in this conversation
    const messageSubscription = supabase
      .channel(`messages_${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
        scrollToBottom()
      })
      .subscribe()

    // Subscribe to typing indicators
    const typingChannel = supabase
      .channel(`typing_${conversationId}`)
      .on('presence', { event: 'sync' }, () => {
        const state = typingChannel.presenceState()
        const typing = Object.values(state).some((presences: any) =>
          presences.some((p: any) => p.user_id !== user.id && p.is_typing)
        )
        setHomeownerTyping(typing)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(messageSubscription)
      supabase.removeChannel(typingChannel)
    }
  }, [conversationId, conversations, user])

  // Mark conversation as read
  const markAsRead = async () => {
    if (!conversationId || !user) return

    await supabase
      .from('conversations')
      .update({ contractor_unread_count: 0 })
      .eq('id', conversationId)
  }

  // Handle typing indicator
  const handleTyping = () => {
    if (!conversationId || !user) return

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Send typing status
    const typingChannel = supabase.channel(`typing_${conversationId}`)
    typingChannel.track({
      user_id: user.id,
      is_typing: true,
      timestamp: new Date().toISOString()
    })

    // Stop typing after 2 seconds of no input
    typingTimeoutRef.current = setTimeout(() => {
      typingChannel.track({
        user_id: user.id,
        is_typing: false,
        timestamp: new Date().toISOString()
      })
    }, 2000)
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !conversationId || !user) return

    setSending(true)
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          sender_type: 'contractor',
          content: newMessage.trim()
        })

      if (error) {
        console.error('Failed to send message:', error)
        alert('Failed to send message. Please try again.')
      } else {
        setNewMessage('')

        // Stop typing indicator
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current)
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  // Conditional rendering AFTER all hooks
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <img
          src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
          alt="Loading..."
          className="h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4 object-contain"
        />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user || !contractorProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Contractor access required</h2>
          <Link href="/pro" className="btn-primary">Go to Pro Dashboard</Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <img
          src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
          alt="Loading..."
          className="h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4 object-contain"
        />
          <p>Loading messages...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/contractor" className="btn btn-outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
            <p className="text-gray-600">Chat with your clients</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Conversations List */}
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Conversations</h2>

            <div className="space-y-2">
              {/* Welcome Message - Always shown at top */}
              {welcomeNotification && (
                <button
                  onClick={() => {
                    setShowWelcomeMessage(true)
                    setSelectedConversation(null)
                  }}
                  className={`block w-full p-4 rounded-lg border transition-colors text-left ${
                    showWelcomeMessage
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 hover:from-blue-100 hover:to-indigo-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">🎉</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-gray-900">{welcomeNotification.title}</h3>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{welcomeNotification.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(welcomeNotification.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {/* Regular Conversations */}
              {conversations.length === 0 && !welcomeNotification ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">No conversations yet</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Messages will appear here when you accept jobs
                  </p>
                </div>
              ) : (
                <>
                  {conversations.map((conv) => (
                    <Link
                      key={conv.id}
                      href={`/dashboard/contractor/messages?id=${conv.id}`}
                      className={`block p-4 rounded-lg border transition-colors ${
                        conversationId === conv.id
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">{conv.homeowner_name}</h3>
                        {conv.unread_count > 0 && (
                          <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-1 font-medium">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-1 font-medium">{conv.job_title}</p>
                      <p className="text-sm text-gray-500 truncate">{conv.last_message}</p>
                      {conv.last_message_at && (
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(conv.last_message_at).toLocaleString()}
                        </p>
                      )}
                    </Link>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 flex flex-col">
          {showWelcomeMessage && welcomeNotification ? (
            <>
              {/* Welcome Message Header */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">🎉</div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{welcomeNotification.title}</h2>
                    <p className="text-sm text-gray-600">
                      {new Date(welcomeNotification.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Welcome Message Content */}
              <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                <div className="max-w-2xl mx-auto">
                  <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-8">
                    <div className="text-center mb-6">
                      <div className="text-6xl mb-4">🎉</div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">{welcomeNotification.title}</h3>
                    </div>
                    <div className="prose prose-blue max-w-none">
                      <p className="text-gray-700 text-lg leading-relaxed whitespace-pre-wrap">
                        {welcomeNotification.message}
                      </p>
                    </div>
                    <div className="mt-8 pt-6 border-t border-gray-200">
                      <p className="text-sm text-gray-500 text-center">
                        This welcome message will always be available in your conversations list
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : conversationId && selectedConversation ? (
            <>
              {/* Conversation Header */}
              <div className="bg-white border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">{selectedConversation.homeowner_name}</h2>
                <p className="text-sm text-gray-600">{selectedConversation.job_title}</p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                {messages.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Start a conversation</h3>
                    <p className="text-gray-600">
                      Send a message to discuss job details with your client
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender_type === 'contractor' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-md rounded-2xl px-5 py-3 shadow-sm ${
                            msg.sender_type === 'contractor'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-900'
                          }`}
                          style={{
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word',
                            maxWidth: '70%'
                          }}
                        >
                          <p className="text-[16px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          <p className={`text-xs mt-2 ${msg.sender_type === 'contractor' ? 'text-blue-100' : 'text-gray-500'}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Typing Indicator */}
                    {homeownerTyping && (
                      <div className="flex justify-start">
                        <div className="bg-gray-200 text-gray-900 rounded-2xl px-5 py-3 shadow-sm">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div className="bg-white border-t border-gray-200 p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value)
                      handleTyping()
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-3 text-[16px] border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
                    disabled={sending}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sending}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No conversation selected</h3>
                <p className="text-gray-600">
                  Select a conversation from the list to start messaging
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
