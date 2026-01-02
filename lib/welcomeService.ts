import { supabase } from './supabaseClient'
import { MessagingAPI } from './messaging'

// Rushr Team system user ID - this should be a consistent UUID for the system
const RUSHR_TEAM_ID = '00000000-0000-0000-0000-000000000000'

export interface WelcomeNotification {
  id: string
  user_id: string
  title: string
  message: string
  type: 'welcome' | 'info' | 'warning' | 'success' | 'new_message' | 'payment_completed' | 'bid_received' | 'bid_accepted' | 'approval' | 'rejection'
  read: boolean
  created_at: string
  conversation_id?: string
  job_id?: string
  bid_id?: string
}

export class WelcomeService {
  /**
   * Send welcome messages to a new user
   * Creates both a chat message and a notification
   * Only sends once per user
   */
  static async sendWelcomeMessages(userId: string, userName: string, userRole: 'homeowner' | 'contractor') {
    try {
      // Check if welcome messages have already been sent
      const existingNotification = await this.hasWelcomeNotification(userId)
      if (existingNotification) {
        console.log(`Welcome messages already sent to user ${userId}`)
        return
      }

      console.log(`Sending welcome messages to ${userName} (${userRole})`)

      // Send welcome chat message
      await this.sendWelcomeChatMessage(userId, userName, userRole)

      // Send welcome notification
      await this.sendWelcomeNotification(userId, userName, userRole)

      console.log('Welcome messages sent successfully')
    } catch (error) {
      console.error('Error sending welcome messages:', error)
      throw error
    }
  }

  /**
   * Send a welcome chat message from the Rushr Team
   */
  static async sendWelcomeChatMessage(userId: string, userName: string, userRole: 'homeowner' | 'contractor') {
    try {
      // Check if welcome chat message already exists
      const hasWelcomeChat = await this.hasWelcomeChatMessage(userId)
      if (hasWelcomeChat) {
        console.log(`Welcome chat message already sent to user ${userId}`)
        return
      }

      // Create conversation with Rushr Team
      const conversation = await MessagingAPI.createOrGetConversation(
        userRole === 'homeowner' ? userId : RUSHR_TEAM_ID,
        userRole === 'contractor' ? userId : RUSHR_TEAM_ID,
        'Welcome to Rushr! 🎉'
      )

      // Welcome message content based on role
      const welcomeMessage = userRole === 'homeowner'
        ? `Hi ${userName}! 👋

Welcome to Rushr! We're excited to help you connect with trusted local professionals for all your home service needs.

🏠 **What you can do:**
• Post jobs and get competitive bids
• Browse verified professionals in your area
• Communicate directly with contractors
• Track your projects from start to finish

💡 **Pro tip:** The more details you provide in your job posts, the better quality bids you'll receive!

Need help getting started? Just reply to this message and our team will assist you. We're here to make your home improvement projects smooth and stress-free!

Welcome aboard! 🚀

— The Rushr Team`
        : `Hi ${userName}! 👋

Welcome to Rushr Pro! We're thrilled to have you join our network of trusted professionals.

🔧 **Your Pro benefits:**
• Find quality jobs in your area
• Communicate directly with homeowners
• Build your reputation with reviews
• Get paid securely through our platform

⚡ **Get started:**
• Complete your profile with licenses & insurance
• Set your service areas and specialties
• Start bidding on jobs that match your skills
• Consider upgrading to Signals for premium leads

Need assistance setting up your profile or have questions? Reply anytime - our team is here to help you succeed!

Ready to grow your business? 📈

— The Rushr Team`

      // Send the welcome message
      await MessagingAPI.sendMessage(
        conversation.id,
        RUSHR_TEAM_ID, // From Rushr Team
        welcomeMessage,
        'text'
      )

      console.log('Welcome chat message sent successfully')
    } catch (error) {
      console.error('Error sending welcome chat message:', error)
      throw error
    }
  }

  /**
   * Send a welcome notification for the bell icon
   */
  static async sendWelcomeNotification(userId: string, userName: string, userRole: 'homeowner' | 'contractor') {
    try {
      const notificationTitle = userRole === 'homeowner'
        ? '🎉 Welcome to Rushr!'
        : '🎉 Welcome to Rushr Pro!'

      const notificationMessage = userRole === 'homeowner'
        ? `Hi ${userName}! Ready to find trusted professionals for your home projects? Check out your dashboard to get started.`
        : `Hi ${userName}! Your Pro account is ready. Complete your profile and start finding quality jobs in your area.`

      // Insert notification into notifications table
      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          title: notificationTitle,
          message: notificationMessage,
          type: 'welcome',
          read: false
        })

      if (error) {
        // If notifications table doesn't exist, we'll create it or handle gracefully
        console.warn('Notifications table might not exist yet:', error)
        return
      }

      console.log('Welcome notification sent successfully')
    } catch (error) {
      console.error('Error sending welcome notification:', error)
      // Don't throw here - notifications are nice-to-have
    }
  }

  /**
   * Get unread notifications for a user
   */
  static async getNotifications(userId: string): Promise<WelcomeNotification[]> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('Error fetching notifications:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error getting notifications:', error)
      return []
    }
  }

  /**
   * Mark notification as read
   */
  static async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)

      if (error) {
        console.error('Error marking notification as read:', error)
      }
    } catch (error) {
      console.error('Error updating notification:', error)
    }
  }

  /**
   * Get unread notification count
   */
  static async getUnreadNotificationCount(userId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false)

      if (error) {
        console.warn('Error counting notifications:', error)
        return 0
      }

      return count || 0
    } catch (error) {
      console.error('Error getting notification count:', error)
      return 0
    }
  }

  /**
   * Check if user already has a welcome notification
   */
  static async hasWelcomeNotification(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'welcome')
        .limit(1)

      if (error) {
        console.warn('Error checking for welcome notification:', error)
        return false
      }

      return (data && data.length > 0) || false
    } catch (error) {
      console.error('Error checking welcome notification:', error)
      return false
    }
  }

  /**
   * Check if user already has a welcome chat message
   */
  static async hasWelcomeChatMessage(userId: string): Promise<boolean> {
    try {
      // Look for conversations with the Rushr Team that contain welcome messages
      const { data, error } = await supabase
        .from('conversations')
        .select('id')
        .or(`homeowner_id.eq.${userId},pro_id.eq.${userId}`)
        .or(`homeowner_id.eq.${RUSHR_TEAM_ID},pro_id.eq.${RUSHR_TEAM_ID}`)
        .eq('title', 'Welcome to Rushr! 🎉')
        .limit(1)

      if (error) {
        console.warn('Error checking for welcome chat message:', error)
        return false
      }

      return (data && data.length > 0) || false
    } catch (error) {
      console.error('Error checking welcome chat message:', error)
      return false
    }
  }

  /**
   * Send approval notification to contractor
   */
  static async sendApprovalNotification(params: {
    contractorId: string
    contractorName: string
    businessName?: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const name = params.businessName || params.contractorName

      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: params.contractorId,
          title: 'Account Approved! 🎉',
          message: `Congratulations ${name}!\n\nYour Rushr Pro account has been approved. You can now:\n\n• Browse and bid on available jobs\n• Connect with homeowners in your area\n• Start growing your business\n\nWelcome to the Rushr Pro network!`,
          type: 'approval',
          read: false
        })

      if (error) {
        console.error('Failed to create approval notification:', error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (err: any) {
      console.error('Approval notification error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Send rejection notification to contractor
   */
  static async sendRejectionNotification(params: {
    contractorId: string
    contractorName: string
    businessName?: string
    reason?: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const name = params.businessName || params.contractorName
      const reasonText = params.reason ? `\n\nReason: ${params.reason}` : ''

      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: params.contractorId,
          title: 'Application Status Update',
          message: `Hi ${name},\n\nWe've reviewed your application and unfortunately we're unable to approve it at this time.${reasonText}\n\nIf you have questions or would like to discuss this further, please contact us:\n\n📧 hello@userushr.com\n\nWe appreciate your interest in Rushr Pro.`,
          type: 'rejection',
          read: false
        })

      if (error) {
        console.error('Failed to create rejection notification:', error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (err: any) {
      console.error('Rejection notification error:', err)
      return { success: false, error: err.message }
    }
  }
}