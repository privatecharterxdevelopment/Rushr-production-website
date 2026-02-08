import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/payments/request-adjustment
 * Creates a payment adjustment request that the other party can accept/decline
 */
export async function POST(request: NextRequest) {
  try {
    const {
      bookingId,
      paymentHoldId,
      conversationId,
      requestedBy, // 'homeowner' or 'contractor'
      requestedById,
      requestedByName,
      contractorId,
      homeownerId,
      originalAmount,
      newAmount,
      reason,
      category
    } = await request.json()

    if (!requestedById || !originalAmount || !newAmount || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate that requester is part of the booking
    if (requestedById !== contractorId && requestedById !== homeownerId) {
      return NextResponse.json(
        { error: 'Unauthorized to request adjustment' },
        { status: 403 }
      )
    }

    // Create the adjustment request
    const { data: adjustment, error: adjustmentError } = await supabase
      .from('payment_adjustments')
      .insert({
        booking_id: bookingId,
        payment_hold_id: paymentHoldId,
        conversation_id: conversationId,
        requested_by: requestedBy,
        requested_by_id: requestedById,
        requested_by_name: requestedByName,
        contractor_id: contractorId,
        homeowner_id: homeownerId,
        original_amount: originalAmount,
        new_amount: newAmount,
        reason: reason,
        category: category,
        status: 'pending'
      })
      .select()
      .single()

    if (adjustmentError) {
      console.error('Error creating adjustment:', adjustmentError)
      return NextResponse.json(
        { error: 'Failed to create adjustment request' },
        { status: 500 }
      )
    }

    // Determine who to notify (the other party)
    const notifyContractor = requestedBy === 'homeowner'
    const recipientId = notifyContractor ? contractorId : homeownerId

    // Get recipient details for email
    let recipientEmail = ''
    let recipientName = ''

    if (notifyContractor) {
      const { data: contractor } = await supabase
        .from('pro_contractors')
        .select('email, name, business_name')
        .eq('id', contractorId)
        .single()

      if (contractor) {
        recipientEmail = contractor.email || ''
        recipientName = contractor.business_name || contractor.name || 'Contractor'
      }
    } else {
      const { data: authUser } = await supabase.auth.admin.getUserById(homeownerId)
      recipientEmail = authUser?.user?.email || ''

      const { data: homeowner } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('id', homeownerId)
        .single()
      recipientName = homeowner?.name || 'Homeowner'
    }

    // Create in-app notification
    try {
      await supabase.from('notifications').insert({
        user_id: recipientId,
        type: 'payment_adjustment',
        title: 'Payment Adjustment Request',
        message: `${requestedByName || (requestedBy === 'homeowner' ? 'Homeowner' : 'Contractor')} has requested a payment adjustment from $${originalAmount.toFixed(2)} to $${newAmount.toFixed(2)}`,
        data: {
          adjustment_id: adjustment.id,
          booking_id: bookingId,
          original_amount: originalAmount,
          new_amount: newAmount,
          reason: reason,
          requested_by: requestedBy
        },
        read: false
      })
    } catch (notifErr) {
      console.log('Could not create notification:', notifErr)
    }

    // Send email notification
    if (recipientEmail) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://userushr.com'
      const dashboardUrl = notifyContractor
        ? `${baseUrl}/dashboard/contractor`
        : `${baseUrl}/dashboard/homeowner`
      const acceptUrl = `${baseUrl}/api/payments/respond-adjustment?id=${adjustment.id}&action=accept`
      const declineUrl = `${baseUrl}/api/payments/respond-adjustment?id=${adjustment.id}&action=decline`

      const isIncrease = newAmount > originalAmount
      const difference = Math.abs(newAmount - originalAmount)

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, ${isIncrease ? '#F59E0B' : '#10B981'} 0%, ${isIncrease ? '#D97706' : '#059669'} 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Payment Adjustment Request</h1>
          </div>

          <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Hi ${recipientName},</p>

            <p><strong>${requestedByName || (requestedBy === 'homeowner' ? 'The homeowner' : 'The contractor')}</strong> has requested a payment adjustment for your ${category || 'service'} job.</p>

            <div style="background: white; border: 1px solid #E5E7EB; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="color: #6B7280;">Original Amount:</span>
                <span style="font-weight: bold;">$${originalAmount.toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="color: #6B7280;">New Amount:</span>
                <span style="font-weight: bold; color: ${isIncrease ? '#D97706' : '#059669'};">$${newAmount.toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid #E5E7EB;">
                <span style="color: #6B7280;">${isIncrease ? 'Increase' : 'Decrease'}:</span>
                <span style="font-weight: bold; color: ${isIncrease ? '#DC2626' : '#059669'};">${isIncrease ? '+' : '-'}$${difference.toFixed(2)}</span>
              </div>
            </div>

            <div style="background: #FEF3C7; border: 1px solid #FCD34D; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: #92400E;">Reason:</p>
              <p style="margin: 10px 0 0 0; color: #78350F;">"${reason}"</p>
            </div>

            <div style="margin: 30px 0; text-align: center;">
              <a href="${acceptUrl}"
                 style="display: inline-block; background: #10B981; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-right: 10px;">
                Accept
              </a>
              <a href="${declineUrl}"
                 style="display: inline-block; background: #F3F4F6; color: #374151; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; border: 1px solid #D1D5DB;">
                Decline
              </a>
            </div>

            <p style="font-size: 14px; color: #6B7280; text-align: center;">
              Or manage this request in your <a href="${dashboardUrl}" style="color: #10B981;">dashboard</a>
            </p>

            <p style="margin-top: 30px;">Best regards,<br><strong>The Rushr Team</strong></p>
          </div>

          <div style="text-align: center; margin-top: 20px; color: #6B7280; font-size: 12px;">
            <p>© ${new Date().getFullYear()} Rushr. All rights reserved.</p>
          </div>
        </div>
      `

      try {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            to: recipientEmail,
            subject: `Payment Adjustment Request: ${isIncrease ? '+' : '-'}$${difference.toFixed(2)} - ${category || 'Service'}`,
            html: emailHtml,
            text: `Payment adjustment requested from $${originalAmount.toFixed(2)} to $${newAmount.toFixed(2)}. Reason: ${reason}. Accept: ${acceptUrl} Decline: ${declineUrl}`
          }),
        })
        console.log('✅ Adjustment email sent to:', recipientEmail)
      } catch (emailErr) {
        console.error('Error sending adjustment email:', emailErr)
      }
    }

    // Also send notification to requester confirming the request
    const requesterEmail = requestedBy === 'homeowner'
      ? (await supabase.auth.admin.getUserById(homeownerId))?.data?.user?.email
      : (await supabase.from('pro_contractors').select('email').eq('id', contractorId).single())?.data?.email

    if (requesterEmail) {
      const confirmEmailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Adjustment Request Sent</h1>
          </div>

          <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Your payment adjustment request has been sent to ${recipientName}.</p>

            <div style="background: white; border: 1px solid #E5E7EB; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 8px 0;"><strong>Original:</strong> $${originalAmount.toFixed(2)}</p>
              <p style="margin: 8px 0;"><strong>Requested:</strong> $${newAmount.toFixed(2)}</p>
              <p style="margin: 8px 0;"><strong>Reason:</strong> ${reason}</p>
            </div>

            <p style="font-size: 14px; color: #6B7280;">
              You'll receive a notification when they respond. This request expires in 48 hours.
            </p>
          </div>
        </div>
      `

      try {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            to: requesterEmail,
            subject: `Your Payment Adjustment Request Has Been Sent`,
            html: confirmEmailHtml
          }),
        })
      } catch (emailErr) {
        console.error('Error sending confirmation email:', emailErr)
      }
    }

    return NextResponse.json({
      success: true,
      adjustmentId: adjustment.id,
      message: 'Payment adjustment request sent'
    })

  } catch (error: any) {
    console.error('Request adjustment error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create adjustment request' },
      { status: 500 }
    )
  }
}
