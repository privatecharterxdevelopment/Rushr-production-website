// app/api/booking/accept/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/booking/accept?id=xxx&action=accept|decline
 * Handles contractor acceptance/decline of booking request
 * On accept: charges homeowner's saved card
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const bookingId = searchParams.get('id')
    const action = searchParams.get('action')
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://userushr.com'

    if (!bookingId || !action) {
      return NextResponse.redirect(`${baseUrl}/dashboard/contractor?error=invalid_request`)
    }

    // Get the booking request (direct_offer)
    const { data: booking, error: bookingError } = await supabase
      .from('direct_offers')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      console.error('Booking not found:', bookingError)
      return NextResponse.redirect(`${baseUrl}/dashboard/contractor?error=booking_not_found`)
    }

    // Check if booking is still pending
    if (booking.status !== 'pending') {
      return NextResponse.redirect(`${baseUrl}/dashboard/contractor?error=booking_already_processed`)
    }

    // Check if booking has expired
    if (booking.expires_at && new Date(booking.expires_at) < new Date()) {
      await supabase
        .from('direct_offers')
        .update({ status: 'expired' })
        .eq('id', bookingId)
      return NextResponse.redirect(`${baseUrl}/dashboard/contractor?error=booking_expired`)
    }

    if (action === 'decline') {
      // Handle decline
      await supabase
        .from('direct_offers')
        .update({
          status: 'rejected',
          contractor_response: 'rejected',
          responded_at: new Date().toISOString()
        })
        .eq('id', bookingId)

      // Notify homeowner that contractor declined
      await notifyHomeownerDeclined(booking)

      return NextResponse.redirect(`${baseUrl}/dashboard/contractor?success=declined`)
    }

    if (action === 'accept') {
      // Handle accept - charge homeowner's saved card
      const chargeResult = await chargeHomeownerSavedCard(booking)

      if (chargeResult.success) {
        // Update booking status
        await supabase
          .from('direct_offers')
          .update({
            status: 'accepted',
            contractor_response: 'accepted',
            responded_at: new Date().toISOString(),
            final_agreed_amount: booking.offered_amount
          })
          .eq('id', bookingId)

        // Notify homeowner that contractor accepted and payment was charged
        await notifyHomeownerAccepted(booking, chargeResult.paymentIntentId)

        return NextResponse.redirect(`${baseUrl}/dashboard/contractor?success=accepted&booking=${bookingId}`)
      } else {
        // Payment failed - notify homeowner to add/update card
        await supabase
          .from('direct_offers')
          .update({
            status: 'payment_required',
            contractor_response: 'accepted'
          })
          .eq('id', bookingId)

        await notifyHomeownerPaymentRequired(booking, chargeResult.error)

        return NextResponse.redirect(`${baseUrl}/dashboard/contractor?success=accepted_pending_payment&booking=${bookingId}`)
      }
    }

    return NextResponse.redirect(`${baseUrl}/dashboard/contractor?error=invalid_action`)

  } catch (error: any) {
    console.error('Booking accept error:', error)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://userushr.com'
    return NextResponse.redirect(`${baseUrl}/dashboard/contractor?error=server_error`)
  }
}

/**
 * Charge homeowner's saved payment method
 */
async function chargeHomeownerSavedCard(booking: any): Promise<{ success: boolean; paymentIntentId?: string; error?: string }> {
  try {
    const homeownerId = booking.homeowner_id
    const amount = booking.offered_amount

    // Get homeowner's Stripe customer and default payment method
    const { data: stripeCustomer } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id, default_payment_method_id')
      .eq('user_id', homeownerId)
      .single()

    if (!stripeCustomer?.stripe_customer_id) {
      return { success: false, error: 'no_stripe_customer' }
    }

    if (!stripeCustomer.default_payment_method_id) {
      // Try to get payment methods from Stripe directly
      const paymentMethods = await getStripe().paymentMethods.list({
        customer: stripeCustomer.stripe_customer_id,
        type: 'card'
      })

      if (paymentMethods.data.length === 0) {
        return { success: false, error: 'no_payment_method' }
      }

      // Use the first available payment method
      stripeCustomer.default_payment_method_id = paymentMethods.data[0].id
    }

    // Calculate fees
    const platformFee = Math.round(amount * 0.10 * 100) / 100 // 10%
    const contractorPayout = amount - platformFee

    // Create and confirm payment intent
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      customer: stripeCustomer.stripe_customer_id,
      payment_method: stripeCustomer.default_payment_method_id,
      off_session: true,
      confirm: true,
      capture_method: 'manual', // Hold funds, capture later on job completion
      metadata: {
        booking_id: booking.id,
        homeowner_id: homeownerId,
        contractor_id: booking.contractor_id,
        platform_fee: platformFee.toString(),
        contractor_payout: contractorPayout.toString(),
        source: 'instant_booking'
      },
      description: `Booking: ${booking.title}`,
      statement_descriptor: 'RUSHR BOOKING'
    })

    // Create payment_hold record
    await supabase
      .from('payment_holds')
      .insert({
        offer_id: booking.id,
        homeowner_id: homeownerId,
        contractor_id: booking.contractor_id,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_customer_id: stripeCustomer.stripe_customer_id,
        amount: amount,
        platform_fee: platformFee,
        contractor_payout: contractorPayout,
        status: 'authorized',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    console.log('✅ Payment authorized for booking:', booking.id, 'Amount:', amount)
    return { success: true, paymentIntentId: paymentIntent.id }

  } catch (error: any) {
    console.error('Error charging saved card:', error)

    // Handle specific Stripe errors
    if (error.code === 'authentication_required') {
      return { success: false, error: 'authentication_required' }
    }
    if (error.code === 'card_declined') {
      return { success: false, error: 'card_declined' }
    }

    return { success: false, error: error.message || 'payment_failed' }
  }
}

/**
 * Notify homeowner that contractor accepted and payment was charged
 */
async function notifyHomeownerAccepted(booking: any, paymentIntentId?: string) {
  try {
    // Get homeowner email
    const { data: homeownerAuth } = await supabase.auth.admin.getUserById(booking.homeowner_id)
    const homeownerEmail = homeownerAuth?.user?.email

    // Get contractor details
    const { data: contractor } = await supabase
      .from('pro_contractors')
      .select('name, business_name, phone')
      .eq('id', booking.contractor_id)
      .single()

    if (!homeownerEmail) return

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://userushr.com'

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Booking Confirmed!</h1>
        </div>

        <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px;">Great news!</p>

          <p><strong>${contractor?.business_name || contractor?.name || 'Your contractor'}</strong> has accepted your booking request!</p>

          <div style="background: white; border: 1px solid #E5E7EB; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>Service:</strong> ${booking.category}</p>
            <p style="margin: 8px 0;"><strong>Amount:</strong> $${booking.offered_amount.toFixed(2)} (held in escrow)</p>
            ${contractor?.phone ? `<p style="margin: 8px 0;"><strong>Contact:</strong> ${contractor.phone}</p>` : ''}
          </div>

          <p style="font-size: 14px; color: #6B7280;">
            Your payment has been authorized and held in escrow. It will only be released to the contractor when you confirm the job is complete.
          </p>

          <div style="margin: 30px 0; text-align: center;">
            <a href="${baseUrl}/dashboard/homeowner"
               style="display: inline-block; background: #10B981; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              View in Dashboard
            </a>
          </div>

          <p style="margin-top: 30px;">Best regards,<br><strong>The Rushr Team</strong></p>
        </div>
      </div>
    `

    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        to: homeownerEmail,
        subject: `Booking Confirmed! ${contractor?.business_name || 'Contractor'} accepted your request`,
        html: emailHtml
      }),
    })

    // Create in-app notification
    await supabase.from('notifications').insert({
      user_id: booking.homeowner_id,
      type: 'booking_accepted',
      title: 'Booking Confirmed!',
      message: `${contractor?.business_name || 'Your contractor'} has accepted your booking`,
      data: { booking_id: booking.id },
      read: false
    })

  } catch (error) {
    console.error('Error notifying homeowner of acceptance:', error)
  }
}

/**
 * Notify homeowner that contractor declined
 */
async function notifyHomeownerDeclined(booking: any) {
  try {
    const { data: homeownerAuth } = await supabase.auth.admin.getUserById(booking.homeowner_id)
    const homeownerEmail = homeownerAuth?.user?.email

    const { data: contractor } = await supabase
      .from('pro_contractors')
      .select('name, business_name')
      .eq('id', booking.contractor_id)
      .single()

    if (!homeownerEmail) return

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://userushr.com'

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #6B7280; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Booking Update</h1>
        </div>

        <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px;">Hi there,</p>

          <p>Unfortunately, <strong>${contractor?.business_name || contractor?.name || 'the contractor'}</strong> is unable to accept your booking request for ${booking.category} at this time.</p>

          <p>Don't worry - there are other great professionals ready to help!</p>

          <div style="margin: 30px 0; text-align: center;">
            <a href="${baseUrl}"
               style="display: inline-block; background: #10B981; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Find Another Pro
            </a>
          </div>

          <p style="margin-top: 30px;">Best regards,<br><strong>The Rushr Team</strong></p>
        </div>
      </div>
    `

    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        to: homeownerEmail,
        subject: `Booking Update - ${booking.category}`,
        html: emailHtml
      }),
    })

    // Create in-app notification
    await supabase.from('notifications').insert({
      user_id: booking.homeowner_id,
      type: 'booking_declined',
      title: 'Booking Declined',
      message: `${contractor?.business_name || 'The contractor'} couldn't accept your request`,
      data: { booking_id: booking.id },
      read: false
    })

  } catch (error) {
    console.error('Error notifying homeowner of decline:', error)
  }
}

/**
 * Notify homeowner that payment is required (no card on file)
 */
async function notifyHomeownerPaymentRequired(booking: any, errorReason?: string) {
  try {
    const { data: homeownerAuth } = await supabase.auth.admin.getUserById(booking.homeowner_id)
    const homeownerEmail = homeownerAuth?.user?.email

    const { data: contractor } = await supabase
      .from('pro_contractors')
      .select('name, business_name')
      .eq('id', booking.contractor_id)
      .single()

    if (!homeownerEmail) return

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://userushr.com'
    const paymentUrl = `${baseUrl}/dashboard/homeowner/billing?booking=${booking.id}`

    let errorMessage = 'We need a payment method to complete your booking.'
    if (errorReason === 'card_declined') {
      errorMessage = 'Your card was declined. Please update your payment method.'
    } else if (errorReason === 'authentication_required') {
      errorMessage = 'Your bank requires additional verification. Please update your payment method.'
    }

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Payment Required</h1>
        </div>

        <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px;">Hi there,</p>

          <p>Great news! <strong>${contractor?.business_name || contractor?.name || 'Your contractor'}</strong> has accepted your booking request!</p>

          <p style="color: #D97706; font-weight: 500;">${errorMessage}</p>

          <div style="background: white; border: 1px solid #E5E7EB; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>Service:</strong> ${booking.category}</p>
            <p style="margin: 8px 0;"><strong>Amount:</strong> $${booking.offered_amount.toFixed(2)}</p>
          </div>

          <div style="margin: 30px 0; text-align: center;">
            <a href="${paymentUrl}"
               style="display: inline-block; background: #10B981; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Add Payment Method
            </a>
          </div>

          <p style="font-size: 14px; color: #6B7280;">
            Once you add a payment method, your booking will be confirmed automatically.
          </p>

          <p style="margin-top: 30px;">Best regards,<br><strong>The Rushr Team</strong></p>
        </div>
      </div>
    `

    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        to: homeownerEmail,
        subject: `Action Required: Add Payment for ${booking.category} Booking`,
        html: emailHtml
      }),
    })

    // Create in-app notification
    await supabase.from('notifications').insert({
      user_id: booking.homeowner_id,
      type: 'payment_required',
      title: 'Payment Required',
      message: `Add a payment method to confirm your ${booking.category} booking`,
      data: { booking_id: booking.id, payment_url: paymentUrl },
      read: false
    })

  } catch (error) {
    console.error('Error notifying homeowner of payment required:', error)
  }
}
