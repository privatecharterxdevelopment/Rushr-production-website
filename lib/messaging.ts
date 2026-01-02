import { supabase } from './supabaseClient'
import type { Database } from './database.types'

// Types for the messaging system
export interface Conversation {
  id: string
  homeowner_id: string
  pro_id: string
  title: string
  job_id?: string
  status: 'active' | 'archived' | 'closed'
  last_message_at: string
  created_at: string
  updated_at: string
  homeowner_name?: string
  homeowner_email?: string
  pro_name?: string
  pro_email?: string
  message_count?: number
  unread_count?: number
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  message_type: 'text' | 'offer' | 'system' | 'file'
  content?: string
  metadata?: Record<string, any>
  reply_to_id?: string
  read_at?: string
  created_at: string
  updated_at: string
  attachments?: MessageAttachment[]
  offer?: MessageOffer
  isDeleted?: boolean
}

export interface MessageAttachment {
  id: string
  message_id: string
  file_name: string
  file_url: string
  file_type: string
  file_size?: number
  created_at: string
}

export interface MessageOffer {
  id: string
  message_id: string
  title: string
  price: number
  delivery_days: number
  notes?: string
  status: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired'
  counter_price?: number
  counter_days?: number
  counter_notes?: string
  expires_at?: string
  created_at: string
  updated_at: string
}

export interface ConversationParticipant {
  id: string
  conversation_id: string
  user_id: string
  last_read_message_id?: string
  last_read_at: string
  is_typing: boolean
  typing_updated_at: string
  joined_at: string
}

// Messaging API functions
export class MessagingAPI {
  // Get all conversations for the current user
  static async getConversations(userId: string): Promise<Conversation[]> {
    const { data, error } = await supabase
      .from('conversation_details')
      .select('*')
      .or(`homeowner_id.eq.${userId},pro_id.eq.${userId}`)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false })

    if (error) {
      // Create a proper Error with message for better logging
      const errorMessage = error.message || error.details || error.hint || 'Failed to fetch conversations'
      throw new Error(errorMessage)
    }
    return data || []
  }

  // Get a specific conversation with messages
  static async getConversation(conversationId: string, userId: string): Promise<{
    conversation: Conversation
    messages: Message[]
  } | null> {
    // Get conversation details
    const { data: conversation, error: convError } = await supabase
      .from('conversation_details')
      .select('*')
      .eq('id', conversationId)
      .or(`homeowner_id.eq.${userId},pro_id.eq.${userId}`)
      .single()

    if (convError || !conversation) {
      console.error('Error fetching conversation:', convError)
      return null
    }

    // Get messages for this conversation
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select(`
        *,
        message_attachments(*),
        message_offers(*)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (msgError) {
      console.error('Error fetching messages:', msgError)
      return { conversation, messages: [] }
    }

    // Transform messages to include nested data
    const transformedMessages: Message[] = (messages || []).map(msg => ({
      ...msg,
      attachments: msg.message_attachments || [],
      offer: msg.message_offers?.[0] || undefined
    }))

    return {
      conversation,
      messages: transformedMessages
    }
  }

  // Create or get existing conversation between homeowner and pro
  static async createOrGetConversation(
    homeownerId: string,
    proId: string,
    title: string,
    jobId?: string
  ): Promise<Conversation> {
    // Try to find existing conversation
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('homeowner_id', homeownerId)
      .eq('pro_id', proId)
      .eq('job_id', jobId || '')
      .single()

    if (existing) {
      return existing
    }

    // Create new conversation
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        homeowner_id: homeownerId,
        pro_id: proId,
        title,
        job_id: jobId
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  // Send a text message
  static async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    replyToId?: string
  ): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        message_type: 'text',
        content,
        reply_to_id: replyToId
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  // Send a message with attachments
  static async sendMessageWithAttachments(
    conversationId: string,
    senderId: string,
    content: string,
    attachments: Omit<MessageAttachment, 'id' | 'message_id' | 'created_at'>[]
  ): Promise<Message> {
    // First create the message
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        message_type: attachments.length > 0 ? 'file' : 'text',
        content
      })
      .select()
      .single()

    if (msgError) throw msgError

    // Then create attachments if any
    if (attachments.length > 0) {
      const attachmentData = attachments.map(att => ({
        ...att,
        message_id: message.id
      }))

      const { error: attError } = await supabase
        .from('message_attachments')
        .insert(attachmentData)

      if (attError) {
        console.error('Error creating attachments:', attError)
      }
    }

    return message
  }

  // Send an offer (quote)
  static async sendOffer(
    conversationId: string,
    senderId: string,
    offer: {
      title: string
      price: number
      delivery_days: number
      notes?: string
      expires_at?: string
    }
  ): Promise<Message> {
    // Create offer message
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        message_type: 'offer',
        content: `Offer: ${offer.title} - $${offer.price}`
      })
      .select()
      .single()

    if (msgError) throw msgError

    // Create offer details
    const { data: offerData, error: offerError } = await supabase
      .from('message_offers')
      .insert({
        message_id: message.id,
        ...offer
      })
      .select()
      .single()

    if (offerError) throw offerError

    return { ...message, offer: offerData }
  }

  // Update offer status (accept, decline, counter)
  static async updateOfferStatus(
    offerId: string,
    status: MessageOffer['status'],
    counterData?: {
      counter_price?: number
      counter_days?: number
      counter_notes?: string
    }
  ): Promise<MessageOffer> {
    const updateData: any = { status }

    if (counterData) {
      Object.assign(updateData, counterData)
    }

    const { data, error } = await supabase
      .from('message_offers')
      .update(updateData)
      .eq('id', offerId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  // Mark messages as read
  static async markAsRead(conversationId: string, userId: string, messageId?: string): Promise<void> {
    const { error } = await supabase
      .from('conversation_participants')
      .update({
        last_read_message_id: messageId,
        last_read_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)

    if (error) throw error
  }

  // Set typing indicator
  static async setTyping(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
    const { error } = await supabase
      .from('conversation_participants')
      .update({
        is_typing: isTyping,
        typing_updated_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)

    if (error) throw error
  }

  // Get typing users for a conversation
  static async getTypingUsers(conversationId: string): Promise<ConversationParticipant[]> {
    const { data, error } = await supabase
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('is_typing', true)
      .gte('typing_updated_at', new Date(Date.now() - 10000).toISOString()) // Last 10 seconds

    if (error) throw error
    return data || []
  }

  // Subscribe to real-time conversation updates
  static subscribeToConversations(userId: string, callback: (conversations: Conversation[]) => void) {
    return supabase
      .channel('conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `homeowner_id=eq.${userId}`
        },
        () => this.getConversations(userId).then(callback)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `pro_id=eq.${userId}`
        },
        () => this.getConversations(userId).then(callback)
      )
      .subscribe()
  }

  // Subscribe to real-time messages for a conversation
  static subscribeToMessages(conversationId: string, callback: (message: Message) => void) {
    return supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        async (payload) => {
          // Fetch the full message with relations
          const { data } = await supabase
            .from('messages')
            .select(`
              *,
              message_attachments(*),
              message_offers(*)
            `)
            .eq('id', payload.new.id)
            .single()

          if (data) {
            const transformedMessage: Message = {
              ...data,
              attachments: data.message_attachments || [],
              offer: data.message_offers?.[0] || undefined
            }
            callback(transformedMessage)
          }
        }
      )
      .subscribe()
  }

  // Subscribe to typing indicators
  static subscribeToTyping(conversationId: string, callback: (participants: ConversationParticipant[]) => void) {
    return supabase
      .channel(`typing:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_participants',
          filter: `conversation_id=eq.${conversationId}`
        },
        () => this.getTypingUsers(conversationId).then(callback)
      )
      .subscribe()
  }

  // Upload file for attachment
  static async uploadFile(file: File, conversationId: string): Promise<string> {
    const fileExt = file.name.split('.').pop()
    const fileName = `${conversationId}/${Date.now()}.${fileExt}`

    const { data, error } = await supabase.storage
      .from('message-attachments')
      .upload(fileName, file)

    if (error) throw error

    const { data: urlData } = supabase.storage
      .from('message-attachments')
      .getPublicUrl(fileName)

    return urlData.publicUrl
  }

  // Delete a message (soft delete - mark as deleted)
  static async deleteMessage(messageId: string): Promise<void> {
    const { error } = await supabase.rpc('soft_delete_message', {
      message_id_param: messageId
    })

    if (error) throw error
  }

  // Delete a message permanently (hard delete)
  static async deleteMessagePermanently(messageId: string): Promise<void> {
    // First delete attachments from storage
    const { data: attachments } = await supabase
      .from('message_attachments')
      .select('file_url')
      .eq('message_id', messageId)

    if (attachments) {
      for (const attachment of attachments) {
        // Extract file path from URL
        const url = new URL(attachment.file_url)
        const filePath = url.pathname.split('/').pop()
        if (filePath) {
          await supabase.storage
            .from('message-attachments')
            .remove([filePath])
        }
      }
    }

    // Delete the message (cascades to attachments and offers)
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)

    if (error) throw error
  }

  // Archive a conversation
  static async archiveConversation(conversationId: string): Promise<void> {
    const { error } = await supabase.rpc('archive_conversation_for_user', {
      conversation_id_param: conversationId
    })

    if (error) throw error
  }

  // Delete a conversation (soft delete)
  static async deleteConversation(conversationId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_conversation_for_user', {
      conversation_id_param: conversationId
    })

    if (error) throw error
  }

  // Delete a conversation permanently (hard delete)
  static async deleteConversationPermanently(conversationId: string): Promise<void> {
    // First delete all message attachments from storage
    const { data: messages } = await supabase
      .from('messages')
      .select(`
        id,
        message_attachments(file_url)
      `)
      .eq('conversation_id', conversationId)

    if (messages) {
      for (const message of messages) {
        if (message.message_attachments) {
          for (const attachment of message.message_attachments) {
            const url = new URL(attachment.file_url)
            const filePath = url.pathname.split('/').pop()
            if (filePath) {
              await supabase.storage
                .from('message-attachments')
                .remove([filePath])
            }
          }
        }
      }
    }

    // Delete the conversation (cascades to all related data)
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)

    if (error) throw error
  }

  // Check if user can delete a message (within time limit or if they're the sender)
  static canDeleteMessage(message: Message, currentUserId: string, timeLimit: number = 24 * 60 * 60 * 1000): boolean {
    const isSender = message.sender_id === currentUserId
    const messageAge = Date.now() - new Date(message.created_at).getTime()

    return isSender && messageAge < timeLimit && !message.isDeleted
  }

  // Check if user can delete a message using database function
  static async canDeleteMessageDB(messageId: string, userId: string, timeLimitHours: number = 24): Promise<boolean> {
    const { data, error } = await supabase.rpc('can_delete_message', {
      message_id_param: messageId,
      user_id_param: userId,
      time_limit_hours: timeLimitHours
    })

    if (error) {
      console.error('Error checking delete permission:', error)
      return false
    }

    return data || false
  }

  // Check if user can delete a conversation
  static canDeleteConversation(conversation: Conversation, currentUserId: string): boolean {
    return (conversation.homeowner_id === currentUserId || conversation.pro_id === currentUserId) && conversation.status !== 'deleted'
  }
}