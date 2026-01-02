'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { MessagingAPI, type Conversation, type Message, type ConversationParticipant } from '../messaging'
import { useAuth } from '../../contexts/AuthContext'
import { SupportMessagesAPI } from '../supportMessages'

// Hook for managing conversations list
export function useConversations(userId?: string, role?: 'homeowner' | 'pro') {
  const { user: homeownerUser } = useAuth()
  const user = userId ? { id: userId } : homeownerUser
  const userRole = role || 'homeowner'

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const subscriptionRef = useRef<any>(null)

  // Track read status for mock conversations
  const markConversationAsRead = useCallback((conversationId: string) => {
    setConversations(prev =>
      prev.map(conv =>
        conv.id === conversationId
          ? { ...conv, unread_count: 0 }
          : conv
      )
    )
  }, [])

  const loadConversations = useCallback(async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      // Fetch real conversations from database with timeout (20s for slow connections)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout - conversations took too long to load')), 20000)
      )

      const realConversations = await Promise.race([
        MessagingAPI.getConversations(user.id),
        timeoutPromise
      ])

      // Transform to add display names for Rushr Support
      const transformedConversations = realConversations.map(conv => {
        // Check if this is a conversation with Rushr Support
        const isRushrSupport = conv.pro_id === '00000000-0000-0000-0000-000000000000' ||
                               conv.homeowner_id === '00000000-0000-0000-0000-000000000000'

        if (isRushrSupport) {
          return {
            ...conv,
            pro_name: conv.pro_id === '00000000-0000-0000-0000-000000000000' ? 'Rushr Support' : conv.pro_name,
            homeowner_name: conv.homeowner_id === '00000000-0000-0000-0000-000000000000' ? 'Rushr Support' : conv.homeowner_name
          }
        }
        return conv
      })

      setConversations(transformedConversations)
      setError(null)
    } catch (err: any) {
      // Better error logging for Supabase errors
      const errorMessage = err?.message || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err)) || 'Failed to load conversations'
      // Only log non-timeout errors as errors (timeouts are expected on slow networks)
      if (errorMessage.includes('timeout')) {
        console.warn('Conversations load timed out - will retry on refresh')
      } else {
        console.error('Error loading conversations:', errorMessage, err)
      }
      setError(errorMessage)
      // Set empty conversations on error so app can still function
      setConversations([])
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadConversations()

    // Subscribe to real-time updates
    if (user?.id) {
      subscriptionRef.current = MessagingAPI.subscribeToConversations(
        user.id,
        setConversations
      )
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe()
      }
    }
  }, [loadConversations, user?.id])

  const createConversation = useCallback(async (
    homeownerId: string,
    proId: string,
    title: string,
    jobId?: string
  ) => {
    try {
      const conversation = await MessagingAPI.createOrGetConversation(
        homeownerId,
        proId,
        title,
        jobId
      )
      await loadConversations() // Refresh the list
      return conversation
    } catch (err) {
      console.error('Error creating conversation:', err)
      throw err
    }
  }, [loadConversations])

  return {
    conversations,
    loading,
    error,
    refresh: loadConversations,
    createConversation,
    markConversationAsRead
  }
}

// Hook for managing a specific conversation
export function useConversation(conversationId: string | null, userId?: string) {
  const { user: homeownerUser } = useAuth()
  const user = userId ? { id: userId } : homeownerUser
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<ConversationParticipant[]>([])
  const subscriptionRef = useRef<any>(null)
  const typingSubscriptionRef = useRef<any>(null)

  const loadConversation = useCallback(async () => {
    if (!conversationId || !user?.id) return

    try {
      setLoading(true)

      // Fetch real conversation from database
      const result = await MessagingAPI.getConversation(conversationId, user.id)

      if (!result) {
        setError('Conversation not found')
        setConversation(null)
        setMessages([])
        return
      }

      // Transform Rushr Support conversation names
      const isRushrSupport = result.conversation.pro_id === '00000000-0000-0000-0000-000000000000' ||
                             result.conversation.homeowner_id === '00000000-0000-0000-0000-000000000000'

      const transformedConversation = isRushrSupport ? {
        ...result.conversation,
        pro_name: result.conversation.pro_id === '00000000-0000-0000-0000-000000000000' ? 'Rushr Support' : result.conversation.pro_name,
        homeowner_name: result.conversation.homeowner_id === '00000000-0000-0000-0000-000000000000' ? 'Rushr Support' : result.conversation.homeowner_name
      } : result.conversation

      setConversation(transformedConversation)
      setMessages(result.messages)
      setError(null)
    } catch (err) {
      console.error('Error loading conversation:', err)
      setError(err instanceof Error ? err.message : 'Failed to load conversation')
    } finally {
      setLoading(false)
    }
  }, [conversationId, user?.id])

  useEffect(() => {
    if (conversationId) {
      loadConversation()

      // Subscribe to new messages
      subscriptionRef.current = MessagingAPI.subscribeToMessages(
        conversationId,
        (newMessage) => {
          setMessages(prev => [...prev, newMessage])
        }
      )

      // Subscribe to typing indicators
      typingSubscriptionRef.current = MessagingAPI.subscribeToTyping(
        conversationId,
        setTypingUsers
      )
    } else {
      setConversation(null)
      setMessages([])
      setLoading(false)
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe()
      }
      if (typingSubscriptionRef.current) {
        typingSubscriptionRef.current.unsubscribe()
      }
    }
  }, [conversationId, loadConversation])

  const sendMessage = useCallback(async (content: string, replyToId?: string) => {
    if (!conversationId || !user?.id || !content.trim()) return

    try {
      // Send message via API - real-time subscription will update the messages
      await MessagingAPI.sendMessage(conversationId, user.id, content.trim(), replyToId)

      // Also send to support system if this is a Rushr Support conversation
      if (conversation?.pro_id === '00000000-0000-0000-0000-000000000000' ||
          conversation?.homeowner_id === '00000000-0000-0000-0000-000000000000') {
        SupportMessagesAPI.addMessage(
          user.id,
          (user as any).email || 'Unknown User',
          (user as any).email || '',
          content.trim()
        )
      }
    } catch (err) {
      console.error('Error sending message:', err)
      throw err
    }
  }, [conversationId, user?.id, conversation])

  const sendMessageWithFiles = useCallback(async (
    content: string,
    files: File[]
  ) => {
    if (!conversationId || !user?.id) return

    try {
      // Upload files first
      const attachments = await Promise.all(
        files.map(async (file) => {
          const fileUrl = await MessagingAPI.uploadFile(file, conversationId)
          return {
            file_name: file.name,
            file_url: fileUrl,
            file_type: file.type,
            file_size: file.size
          }
        })
      )

      await MessagingAPI.sendMessageWithAttachments(
        conversationId,
        user.id,
        content.trim(),
        attachments
      )
    } catch (err) {
      console.error('Error sending message with files:', err)
      throw err
    }
  }, [conversationId, user?.id])

  const sendOffer = useCallback(async (offer: {
    title: string
    price: number
    delivery_days: number
    notes?: string
  }) => {
    if (!conversationId || !user?.id) return

    try {
      await MessagingAPI.sendOffer(conversationId, user.id, offer)
    } catch (err) {
      console.error('Error sending offer:', err)
      throw err
    }
  }, [conversationId, user?.id])

  const updateOfferStatus = useCallback(async (
    offerId: string,
    status: 'accepted' | 'declined' | 'countered',
    counterData?: {
      counter_price?: number
      counter_days?: number
      counter_notes?: string
    }
  ) => {
    try {
      await MessagingAPI.updateOfferStatus(offerId, status, counterData)
      // Refresh conversation to get updated offer
      await loadConversation()
    } catch (err) {
      console.error('Error updating offer:', err)
      throw err
    }
  }, [loadConversation])

  const markAsRead = useCallback(async (messageId?: string) => {
    if (!conversationId || !user?.id) return

    try {
      await MessagingAPI.markAsRead(conversationId, user.id, messageId)
    } catch (err) {
      console.error('Error marking as read:', err)
    }
  }, [conversationId, user?.id])

  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!conversationId || !user?.id) return

    try {
      await MessagingAPI.setTyping(conversationId, user.id, isTyping)
    } catch (err) {
      console.error('Error setting typing:', err)
    }
  }, [conversationId, user?.id])

  // Get other users who are typing (exclude current user)
  const otherTypingUsers = typingUsers.filter(participant => participant.user_id !== user?.id)

  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      await MessagingAPI.deleteMessage(messageId)
      await loadConversation() // Refresh to show updated message
    } catch (err) {
      console.error('Error deleting message:', err)
      throw err
    }
  }, [loadConversation])

  const deleteMessagePermanently = useCallback(async (messageId: string) => {
    try {
      await MessagingAPI.deleteMessagePermanently(messageId)
      await loadConversation() // Refresh to remove message
    } catch (err) {
      console.error('Error deleting message permanently:', err)
      throw err
    }
  }, [loadConversation])

  const archiveConversation = useCallback(async () => {
    if (!conversationId) return
    try {
      await MessagingAPI.archiveConversation(conversationId)
    } catch (err) {
      console.error('Error archiving conversation:', err)
      throw err
    }
  }, [conversationId])

  const deleteConversation = useCallback(async () => {
    if (!conversationId) return
    try {
      await MessagingAPI.deleteConversation(conversationId)
    } catch (err) {
      console.error('Error deleting conversation:', err)
      throw err
    }
  }, [conversationId])

  const deleteConversationPermanently = useCallback(async () => {
    if (!conversationId) return
    try {
      await MessagingAPI.deleteConversationPermanently(conversationId)
    } catch (err) {
      console.error('Error deleting conversation permanently:', err)
      throw err
    }
  }, [conversationId])

  return {
    conversation,
    messages,
    loading,
    error,
    typingUsers: otherTypingUsers,
    sendMessage,
    sendMessageWithFiles,
    sendOffer,
    updateOfferStatus,
    markAsRead,
    setTyping,
    deleteMessage,
    deleteMessagePermanently,
    archiveConversation,
    deleteConversation,
    deleteConversationPermanently,
    refresh: loadConversation
  }
}

// Hook for managing typing indicator with debouncing
export function useTypingIndicator(
  conversationId: string | null,
  setTyping: (isTyping: boolean) => Promise<void>
) {
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isTypingRef = useRef(false)

  const handleTyping = useCallback(() => {
    if (!conversationId) return

    // Start typing if not already
    if (!isTypingRef.current) {
      isTypingRef.current = true
      setTyping(true)
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false
      setTyping(false)
    }, 3000) // Stop typing after 3 seconds of inactivity
  }, [conversationId, setTyping])

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    if (isTypingRef.current) {
      isTypingRef.current = false
      setTyping(false)
    }
  }, [setTyping])

  useEffect(() => {
    return () => {
      stopTyping()
    }
  }, [stopTyping])

  return {
    handleTyping,
    stopTyping
  }
}