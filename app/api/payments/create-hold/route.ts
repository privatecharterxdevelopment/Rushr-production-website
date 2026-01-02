import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/payments/create-hold
 * Creates a Stripe PaymentIntent to hold funds in escrow when homeowner accepts bid
 */
export async function POST(request: NextRequest) {
  try {
    const { bidId, homeownerId } = await request.json()
    if (!bidId || !homeownerId) {
      return NextResponse.json(
        { error: 'Missing bidId or homeownerId' },
        { status: 400 }
      )
    }

    // 1. Get bid details
    const { data: bid, error: bidError } = await supabase
      .from('job_bids')
      .select(`
    *,
    job:homeowner_jobs!job_bids_job_id_fkey(id, title, homeowner_id),
    contractor:user_profiles!contractor_id(id, name, email)
  `)
      .eq('id', bidId)
      .eq('homeowner_id', homeownerId)
      .single()

    if (bidError || !bid) {
      return NextResponse.json(
        { error: 'Bid not found or access denied' },
        { status: 404 }
      )
    }

    // 2. Check if payment hold already exists
    const { data: existingHold } = await supabase
      .from('payment_holds')
      .select('id, stripe_payment_intent_id')
      .eq('bid_id', bidId)
      .single()

    if (existingHold) {
      return NextResponse.json(
        { error: 'Payment hold already exists for this bid' },
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
        metadata: {
          user_id: homeownerId
        }
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
    const bidAmount = Number(bid.bid_amount)
    const platformFee = Math.round(bidAmount * 0.10 * 100) / 100 // 10%
    const contractorPayout = bidAmount - platformFee
    const stripeFee = Math.round((bidAmount * 0.029 + 0.30) * 100) / 100 // Stripe fee estimate

    // 5. Create Stripe PaymentIntent (authorize but don't capture yet)

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(bidAmount * 100), // Convert to cents
      currency: 'usd',
      customer: stripeCustomerId,
      capture_method: 'manual', // Authorize now, capture later
      metadata: {
        job_id: bid.job_id,
        bid_id: bidId,
        homeowner_id: homeownerId,
        contractor_id: bid.contractor_id,
        platform_fee: platformFee.toString(),
        contractor_payout: contractorPayout.toString()
      },
      description: `Escrow payment for: ${bid.job.title}`,
      statement_descriptor: 'RUSHR ESCROW'
    })
    // 6. Create payment_hold record
    const { data: paymentHold, error: holdError } = await supabase
      .from('payment_holds')
      .upsert(
        {
          job_id: bid.job_id,
          bid_id: bidId,
          homeowner_id: homeownerId,
          contractor_id: bid.contractor_id,
          stripe_payment_intent_id: paymentIntent.id,
          stripe_customer_id: stripeCustomerId,
          amount: bidAmount,
          platform_fee: platformFee,
          contractor_payout: contractorPayout,
          stripe_fee: stripeFee,
          status: 'pending',
          updated_at: new Date().toISOString()
        },
        { onConflict: 'bid_id' } // 👈 ensures unique constraint handled
      )
      .select()
      .single()

    if (holdError) {
      // Cancel the payment intent if DB insert fails
      await getStripe().paymentIntents.cancel(paymentIntent.id)
      throw holdError
    }

    // 7. Update job with payment hold reference
    await supabase
      .from('homeowner_jobs')
      .update({
        payment_status: 'pending',
        payment_hold_id: paymentHold.id
      })
      .eq('id', bid.job_id)
    console.log({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentHoldId: paymentHold.id,
      amount: bidAmount,
      platformFee,
      contractorPayout
    })
    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentHoldId: paymentHold.id,
      amount: bidAmount,
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
