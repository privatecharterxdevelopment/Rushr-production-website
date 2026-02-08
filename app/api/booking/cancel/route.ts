import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/booking/cancel
 * Cancels an ongoing job booking and releases/refunds the payment hold
 * Sends notification to the other party with cancellation reason
 */
export async function POST(request: NextRequest) {
  try {
    const {
      bookingId,
      paymentHoldId,
      cancelledBy, // 'homeowner' or 'contractor'
      cancelledById,
      cancelledByName,
      contractorId,
      contractorName,
      homeownerId,
      homeownerName,
      reason,
      amount
    } = await request.json()

    if (!bookingId || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: bookingId, reason' },
        { status: 400 }
      )
    }

    // 1. Get the booking details
    const { data: booking, error: bookingError } = await supabase
      .from('direct_offers')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      console.error('Booking not found:', bookingError)
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    // 2. If there's a payment hold, cancel/refund it
    if (paymentHoldId) {
      try {
        const { data: paymentHold } = await supabase
          .from('payment_holds')
          .select('stripe_payment_intent_id, status')
          .eq('id', paymentHoldId)
          .single()

        if (paymentHold?.stripe_payment_intent_id) {
          const stripe = getStripe()

          // Cancel the payment intent (releases the hold)
          await stripe.paymentIntents.cancel(paymentHold.stripe_payment_intent_id)

          console.log('[Cancel] Payment intent cancelled:', paymentHold.stripe_payment_intent_id)
        }

        // Update payment hold status
        await supabase
          .from('payment_holds')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('id', paymentHoldId)

      } catch (stripeError: any) {
        console.error('Stripe cancellation error:', stripeError)
        // Continue with booking cancellation even if Stripe fails
      }
    }

    // 3. Update booking status to cancelled
    const { error: updateError } = await supabase
      .from('direct_offers')
      .update({
        status: 'cancelled',
        payment_status: 'refunded',
        contractor_notes: cancelledBy === 'contractor'
          ? `Cancelled by contractor: ${reason}`
          : booking.contractor_notes,
        homeowner_notes: cancelledBy === 'homeowner'
          ? `Cancelled by homeowner: ${reason}`
          : booking.homeowner_notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId)

    if (updateError) {
      console.error('Error updating booking:', updateError)
      return NextResponse.json(
        { error: 'Failed to update booking status' },
        { status: 500 }
      )
    }

    // 4. Create cancellation record for admin tracking
    try {
      await supabase.from('job_cancellations').insert({
        booking_id: bookingId,
        payment_hold_id: paymentHoldId,
        cancelled_by: cancelledBy,
        cancelled_by_id: cancelledById || (cancelledBy === 'homeowner' ? booking.homeowner_id : booking.contractor_id),
        cancelled_by_name: cancelledByName,
        contractor_id: contractorId || booking.contractor_id,
        homeowner_id: homeownerId || booking.homeowner_id,
        reason: reason,
        amount: amount || booking.offered_amount,
        category: booking.category,
        created_at: new Date().toISOString()
      })
    } catch (cancellationError) {
      console.log('Note: Could not create cancellation record:', cancellationError)
      // Table might not exist yet - continue
    }

    // 5. Determine who to notify (the other party)
    const notifyContractor = cancelledBy === 'homeowner'
    const notifyHomeowner = cancelledBy === 'contractor'

    // Get notification recipient details
    let recipientEmail = ''
    let recipientName = ''
    let cancellerName = cancelledByName || ''

    if (notifyContractor) {
      // Get contractor email
      const { data: contractor } = await supabase
        .from('pro_contractors')
        .select('email, name, business_name')
        .eq('id', contractorId || booking.contractor_id)
        .single()

      if (contractor) {
        recipientEmail = contractor.email || ''
        recipientName = contractor.business_name || contractor.name || 'Contractor'
      }

      // Get canceller name (homeowner)
      if (!cancellerName) {
        const { data: homeowner } = await supabase
          .from('user_profiles')
          .select('name')
          .eq('id', booking.homeowner_id)
          .single()
        cancellerName = homeowner?.name || 'Homeowner'
      }
    } else if (notifyHomeowner) {
      // Get homeowner email
      const { data: authUser } = await supabase.auth.admin.getUserById(booking.homeowner_id)
      recipientEmail = authUser?.user?.email || ''

      const { data: homeowner } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('id', booking.homeowner_id)
        .single()
      recipientName = homeowner?.name || 'Homeowner'
      cancellerName = contractorName || 'Contractor'
    }

    // 6. Send email notification
    if (recipientEmail) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://userushr.com'
      const dashboardUrl = notifyContractor
        ? `${baseUrl}/dashboard/contractor`
        : `${baseUrl}/dashboard/homeowner`

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Job Cancelled</h1>
          </div>

          <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Hi ${recipientName},</p>

            <p>Unfortunately, <strong>${cancellerName}</strong> has cancelled the ${booking.category} job.</p>

            <div style="background: white; border: 1px solid #E5E7EB; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 8px 0;"><strong>Service:</strong> ${booking.category}</p>
              <p style="margin: 8px 0;"><strong>Original Amount:</strong> $${(amount || booking.offered_amount || 0).toFixed(2)}</p>
              <p style="margin: 8px 0; color: #DC2626;"><strong>Status:</strong> Cancelled</p>
            </div>

            <div style="background: #FEF2F2; border: 1px solid #FECACA; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: #991B1B;">Reason for cancellation:</p>
              <p style="margin: 10px 0 0 0; color: #7F1D1D;">"${reason}"</p>
            </div>

            ${notifyHomeowner ? `
              <p style="font-size: 14px; color: #6B7280;">
                Your payment hold has been automatically released. No charges were made to your card.
              </p>
            ` : ''}

            <div style="margin: 30px 0; text-align: center;">
              <a href="${dashboardUrl}"
                 style="display: inline-block; background: #3B82F6; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                View Dashboard
              </a>
            </div>

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
            subject: `Job Cancelled: ${booking.category} - ${cancellerName}`,
            html: emailHtml,
            text: `Hi ${recipientName}, ${cancellerName} has cancelled the ${booking.category} job. Reason: ${reason}`
          }),
        })
        console.log('✅ Cancellation email sent to:', recipientEmail)
      } catch (emailError) {
        console.error('Error sending cancellation email:', emailError)
      }
    }

    // 7. Create in-app notification
    const notifyUserId = notifyContractor
      ? (contractorId || booking.contractor_id)
      : booking.homeowner_id

    try {
      await supabase.from('notifications').insert({
        user_id: notifyUserId,
        type: 'job_cancelled',
        title: 'Job Cancelled',
        message: `${cancellerName} cancelled the ${booking.category} job. Reason: ${reason}`,
        data: {
          booking_id: bookingId,
          cancelled_by: cancelledBy,
          reason: reason,
          category: booking.category,
          amount: amount || booking.offered_amount
        },
        read: false
      })
    } catch (notifError) {
      console.log('Note: Could not create notification:', notifError)
    }

    return NextResponse.json({
      success: true,
      message: 'Job cancelled successfully',
      refunded: !!paymentHoldId
    })

  } catch (error: any) {
    console.error('Cancel booking error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to cancel booking' },
      { status: 500 }
    )
  }
}
