import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Platform fee percentage (e.g., 15%)
const PLATFORM_FEE_PERCENT = 15

/**
 * POST /api/stripe/escrow/create-hold
 * Creates a Stripe payment intent with manual capture (escrow hold)
 * Charges the homeowner's saved card and holds funds until job completion
 */
export async function POST(request: NextRequest) {
  try {
    const {
      homeownerId,
      contractorId,
      amount,
      jobDescription,
      category,
      bookingId // direct_offers id if already created
    } = await request.json()

    if (!homeownerId || !contractorId || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: homeownerId, contractorId, amount' },
        { status: 400 }
      )
    }

    // 1. Get homeowner's Stripe customer and default payment method
    const { data: stripeCustomer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id, default_payment_method_id')
      .eq('user_id', homeownerId)
      .single()

    if (customerError || !stripeCustomer) {
      return NextResponse.json(
        { error: 'No payment method found. Please add a card first.' },
        { status: 400 }
      )
    }

    if (!stripeCustomer.default_payment_method_id) {
      return NextResponse.json(
        { error: 'No default payment method. Please add a card first.' },
        { status: 400 }
      )
    }

    // 2. Get contractor's Stripe Connect account
    const { data: connectAccount, error: connectError } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id, charges_enabled')
      .eq('contractor_id', contractorId)
      .single()

    if (connectError || !connectAccount) {
      console.log('Contractor does not have Stripe Connect set up yet')
      // Continue without connected account - will do direct transfer later
    }

    // 3. Calculate fees
    const amountCents = Math.round(amount * 100)
    const platformFeeCents = Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100))
    const contractorPayoutCents = amountCents - platformFeeCents

    // Stripe fee estimate (2.9% + 30 cents)
    const stripeFeeEstimate = Math.round(amountCents * 0.029 + 30)

    console.log('[Escrow] Creating payment hold:', {
      amount: amountCents / 100,
      platformFee: platformFeeCents / 100,
      contractorPayout: contractorPayoutCents / 100,
      stripeFeeEstimate: stripeFeeEstimate / 100
    })

    // 4. Create payment intent with manual capture (escrow/hold)
    const stripe = getStripe()

    const paymentIntentParams: any = {
      amount: amountCents,
      currency: 'usd',
      customer: stripeCustomer.stripe_customer_id,
      payment_method: stripeCustomer.default_payment_method_id,
      capture_method: 'manual', // This creates a hold - funds are authorized but not captured
      confirm: true, // Confirm immediately
      off_session: true, // We're charging without user being present
      description: `Rushr ${category || 'Service'}: ${jobDescription || 'Emergency service'}`,
      metadata: {
        homeowner_id: homeownerId,
        contractor_id: contractorId,
        booking_id: bookingId || '',
        category: category || '',
        platform_fee: platformFeeCents.toString(),
        contractor_payout: contractorPayoutCents.toString()
      }
    }

    // If contractor has Connect account, set up for transfer later
    if (connectAccount?.stripe_account_id && connectAccount?.charges_enabled) {
      paymentIntentParams.transfer_group = `booking_${bookingId || Date.now()}`
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams)

    console.log('[Escrow] Payment intent created:', paymentIntent.id, paymentIntent.status)

    // 5. Store the payment hold in database
    const { data: paymentHold, error: holdError } = await supabase
      .from('payment_holds')
      .insert({
        homeowner_id: homeownerId,
        contractor_id: contractorId,
        job_id: null, // Will be linked when job is created
        bid_id: null,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_customer_id: stripeCustomer.stripe_customer_id,
        amount: amount,
        platform_fee: platformFeeCents / 100,
        contractor_payout: contractorPayoutCents / 100,
        stripe_fee: stripeFeeEstimate / 100,
        status: paymentIntent.status === 'requires_capture' ? 'authorized' : 'pending'
      })
      .select()
      .single()

    if (holdError) {
      console.error('[Escrow] Error storing payment hold:', holdError)
      // Cancel the payment intent if we can't store it
      await stripe.paymentIntents.cancel(paymentIntent.id)
      return NextResponse.json(
        { error: 'Failed to create payment hold record' },
        { status: 500 }
      )
    }

    // 6. If booking exists, update it with payment hold reference
    if (bookingId) {
      await supabase
        .from('direct_offers')
        .update({
          payment_hold_id: paymentHold.id,
          payment_status: 'authorized'
        })
        .eq('id', bookingId)
    }

    // 7. Create a conversation for real-time chat between homeowner and contractor
    let conversationId = null
    try {
      // Get contractor info for conversation title
      const { data: contractor } = await supabase
        .from('pro_contractors')
        .select('business_name, name')
        .eq('id', contractorId)
        .single()

      const contractorName = contractor?.business_name || contractor?.name || 'Contractor'
      const conversationTitle = `${category || 'Service'} - ${jobDescription?.substring(0, 50) || 'Job Request'}`

      // Check if conversation already exists
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('homeowner_id', homeownerId)
        .eq('pro_id', contractorId)
        .single()

      if (existingConv) {
        conversationId = existingConv.id
      } else {
        // Create new conversation
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            homeowner_id: homeownerId,
            pro_id: contractorId,
            title: conversationTitle,
            status: 'active'
          })
          .select()
          .single()

        if (!convError && newConv) {
          conversationId = newConv.id

          // Send initial system message
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender_id: homeownerId,
            message_type: 'system',
            content: `Booking confirmed for ${category || 'service'}. Payment of $${amount.toFixed(2)} is held in escrow. Chat with ${contractorName} here!`
          })
        }
      }

      console.log('[Escrow] Conversation created/found:', conversationId)
    } catch (convErr) {
      console.error('[Escrow] Error creating conversation:', convErr)
      // Don't fail the payment if conversation creation fails
    }

    return NextResponse.json({
      success: true,
      paymentHoldId: paymentHold.id,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: amount,
      platformFee: platformFeeCents / 100,
      contractorPayout: contractorPayoutCents / 100,
      conversationId: conversationId,
      message: 'Payment authorized and held in escrow'
    })

  } catch (error: any) {
    console.error('[Escrow] Create hold error:', error)

    // Handle Stripe-specific errors
    if (error.type === 'StripeCardError') {
      return NextResponse.json(
        { error: error.message || 'Card was declined' },
        { status: 400 }
      )
    }

    if (error.type === 'StripeInvalidRequestError') {
      return NextResponse.json(
        { error: 'Invalid payment request. Please try again.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create payment hold' },
      { status: 500 }
    )
  }
}
