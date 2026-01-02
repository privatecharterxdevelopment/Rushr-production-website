// app/api/direct-offers/create-payment/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Lazy initialization to prevent build-time errors
let stripe: Stripe | null = null
function getStripe() {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia'
    })
  }
  return stripe
}

/**
 * POST /api/direct-offers/create-payment
 * Creates a Stripe PaymentIntent to hold funds in escrow for accepted direct offer
 */
export async function POST(request: NextRequest) {
  try {
    const { offerId, homeownerId } = await request.json()

    if (!offerId || !homeownerId) {
      return NextResponse.json(
        { error: 'Missing offerId or homeownerId' },
        { status: 400 }
      )
    }

    // 1. Get offer details
    const { data: offer, error: offerError } = await supabase
      .from('direct_offers')
      .select('*, contractor:pro_contractors!contractor_id(id, name, email)')
      .eq('id', offerId)
      .eq('homeowner_id', homeownerId)
      .eq('status', 'accepted') // Must be accepted before payment
      .single()

    if (offerError || !offer) {
      return NextResponse.json(
        { error: 'Offer not found, not accepted, or access denied' },
        { status: 404 }
      )
    }

    // 2. Check if payment hold already exists
    const { data: existingHold } = await supabase
      .from('payment_holds')
      .select('id, stripe_payment_intent_id')
      .eq('offer_id', offerId)
      .single()

    if (existingHold) {
      return NextResponse.json(
        { error: 'Payment hold already exists for this offer' },
        { status: 400 }
      )
    }

    // 3. Get or create Stripe customer for homeowner
    let stripeCustomerId: string

    const { data: existingCustomer } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', homeownerId)
      .single()

    if (existingCustomer) {
      stripeCustomerId = existingCustomer.stripe_customer_id
    } else {
      // Get homeowner details
      const { data: homeowner } = await supabase
        .from('user_profiles')
        .select('email, name')
        .eq('id', homeownerId)
        .single()

      // Create Stripe customer
      const customer = await getStripe().customers.create({
        email: homeowner?.email,
        name: homeowner?.name,
        metadata: { user_id: homeownerId }
      })

      stripeCustomerId = customer.id

      // Save to database
      await supabase.from('stripe_customers').insert({
        user_id: homeownerId,
        stripe_customer_id: customer.id,
        email: homeowner?.email,
        name: homeowner?.name
      })
    }

    // 4. Calculate amounts
    const offerAmount = Number(offer.final_agreed_amount)
    const platformFee = Math.round(offerAmount * 0.10 * 100) / 100 // 10%
    const contractorPayout = offerAmount - platformFee
    const stripeFee = Math.round((offerAmount * 0.029 + 0.30) * 100) / 100

    // 5. Create Stripe PaymentIntent
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(offerAmount * 100), // Convert to cents
      currency: 'usd',
      customer: stripeCustomerId,
      capture_method: 'manual', // Authorize now, capture later
      metadata: {
        offer_id: offerId,
        homeowner_id: homeownerId,
        contractor_id: offer.contractor_id,
        platform_fee: platformFee.toString(),
        contractor_payout: contractorPayout.toString(),
        source: 'direct_offer'
      },
      description: `Direct offer payment: ${offer.title}`,
      statement_descriptor: 'RUSHR ESCROW'
    })

    // 6. Create payment_hold record
    const { data: paymentHold, error: holdError } = await supabase
      .from('payment_holds')
      .insert({
        offer_id: offerId,
        homeowner_id: homeownerId,
        contractor_id: offer.contractor_id,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_customer_id: stripeCustomerId,
        amount: offerAmount,
        platform_fee: platformFee,
        contractor_payout: contractorPayout,
        stripe_fee: stripeFee,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (holdError) {
      // Cancel the payment intent if DB insert fails
      await getStripe().paymentIntents.cancel(paymentIntent.id)
      throw holdError
    }

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentHoldId: paymentHold.id,
      amount: offerAmount,
      platformFee,
      contractorPayout
    })

  } catch (error: any) {
    console.error('Create payment hold error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create payment hold' },
      { status: 500 }
    )
  }
}
