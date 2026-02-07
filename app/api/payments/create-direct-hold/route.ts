import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Platform fee percentage for direct payment jobs
const PLATFORM_FEE_PERCENT = 10

/**
 * POST /api/payments/create-direct-hold
 * Creates a payment hold for a direct payment job
 * Called BEFORE the job is created - holds funds on homeowner's card
 */
export async function POST(request: NextRequest) {
  try {
    const { homeownerId, amount, category, description } = await request.json()

    if (!homeownerId || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: homeownerId, amount' },
        { status: 400 }
      )
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
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
        { error: 'No payment method found. Please add a card first.', needsCard: true },
        { status: 400 }
      )
    }

    if (!stripeCustomer.default_payment_method_id) {
      return NextResponse.json(
        { error: 'No default payment method. Please add a card first.', needsCard: true },
        { status: 400 }
      )
    }

    // 2. Calculate fees
    const amountCents = Math.round(amount * 100)
    const platformFeeCents = Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100))
    const contractorPayoutCents = amountCents - platformFeeCents

    // Stripe fee estimate (2.9% + 30 cents)
    const stripeFeeEstimate = Math.round(amountCents * 0.029 + 30)

    console.log('[DirectHold] Creating payment hold:', {
      homeownerId,
      amount: amountCents / 100,
      platformFee: platformFeeCents / 100,
      contractorPayout: contractorPayoutCents / 100
    })

    // 3. Create payment intent with manual capture (escrow/hold)
    const stripe = getStripe()

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: stripeCustomer.stripe_customer_id,
      payment_method: stripeCustomer.default_payment_method_id,
      capture_method: 'manual', // Hold - funds authorized but not captured
      confirm: true, // Confirm immediately
      off_session: true, // Charge without user present
      description: `Rushr Direct Payment: ${category || 'Service'} - ${description || 'Job request'}`,
      metadata: {
        homeowner_id: homeownerId,
        type: 'direct_payment_job',
        category: category || '',
        platform_fee: platformFeeCents.toString(),
        contractor_payout: contractorPayoutCents.toString()
      }
    })

    console.log('[DirectHold] Payment intent created:', paymentIntent.id, paymentIntent.status)

    // 4. Store the payment hold in database (contractor_id will be set when job is accepted)
    const { data: paymentHold, error: holdError } = await supabase
      .from('payment_holds')
      .insert({
        homeowner_id: homeownerId,
        contractor_id: null, // Will be set when contractor accepts
        job_id: null, // Will be set when job is created
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
      console.error('[DirectHold] Error storing payment hold:', holdError)
      // Cancel the payment intent if we can't store it
      await stripe.paymentIntents.cancel(paymentIntent.id)
      return NextResponse.json(
        { error: 'Failed to create payment hold record' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      paymentHoldId: paymentHold.id,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: amount,
      platformFee: platformFeeCents / 100,
      contractorPayout: contractorPayoutCents / 100,
      message: 'Payment authorized and held. Ready to post job.'
    })

  } catch (error: any) {
    console.error('[DirectHold] Create hold error:', error)

    // Handle Stripe-specific errors
    if (error.type === 'StripeCardError') {
      return NextResponse.json(
        { error: error.message || 'Card was declined', cardError: true },
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
