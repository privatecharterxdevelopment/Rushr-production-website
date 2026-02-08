import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLATFORM_FEE_PERCENT = 10

/**
 * POST /api/jobs/start-direct
 * Called when homeowner clicks "Start Job" on a specific contractor.
 * Creates escrow payment hold, assigns contractor, rejects other bids.
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId, contractorId, bidId, amount, homeownerId } = await request.json()

    if (!jobId || !contractorId || !amount || !homeownerId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // 1. Verify job exists and is still pending direct payment
    const { data: job, error: jobError } = await supabase
      .from('homeowner_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('homeowner_id', homeownerId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found or unauthorized' },
        { status: 404 }
      )
    }

    if (job.status !== 'pending') {
      return NextResponse.json(
        { error: 'Job is no longer available' },
        { status: 409 }
      )
    }

    // 2. Get homeowner's Stripe customer and payment method
    const { data: stripeCustomer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id, default_payment_method_id')
      .eq('user_id', homeownerId)
      .single()

    if (customerError || !stripeCustomer?.default_payment_method_id) {
      return NextResponse.json(
        { error: 'No payment method found. Please add a card first.', needsCard: true },
        { status: 400 }
      )
    }

    // 3. Calculate fees and create Stripe PaymentIntent (escrow hold)
    const amountCents = Math.round(amount * 100)
    const platformFeeCents = Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100))
    const contractorPayoutCents = amountCents - platformFeeCents
    const stripeFeeEstimate = Math.round(amountCents * 0.029 + 30)

    const stripe = getStripe()
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: stripeCustomer.stripe_customer_id,
      payment_method: stripeCustomer.default_payment_method_id,
      capture_method: 'manual',
      confirm: true,
      off_session: true,
      description: `Rushr Direct Payment: ${job.category || 'Service'} - ${job.title || 'Job'}`,
      metadata: {
        homeowner_id: homeownerId,
        contractor_id: contractorId,
        job_id: jobId,
        type: 'direct_payment_job',
        platform_fee: platformFeeCents.toString(),
        contractor_payout: contractorPayoutCents.toString()
      }
    })

    // 3b. Capture the payment immediately — HO clicked "Start Job", funds are now held in escrow
    let capturedIntent = paymentIntent
    if (paymentIntent.status === 'requires_capture') {
      capturedIntent = await stripe.paymentIntents.capture(paymentIntent.id)
    }

    // 4. Store payment hold (status: 'captured' since we captured above)
    const { data: paymentHold, error: holdError } = await supabase
      .from('payment_holds')
      .insert({
        homeowner_id: homeownerId,
        contractor_id: contractorId,
        job_id: jobId,
        bid_id: bidId || null,
        stripe_payment_intent_id: capturedIntent.id,
        stripe_customer_id: stripeCustomer.stripe_customer_id,
        amount: amount,
        platform_fee: platformFeeCents / 100,
        contractor_payout: contractorPayoutCents / 100,
        stripe_fee: stripeFeeEstimate / 100,
        status: capturedIntent.status === 'succeeded' ? 'captured' : 'authorized'
      })
      .select()
      .single()

    if (holdError) {
      console.error('[StartDirect] Error storing payment hold:', holdError)
      await stripe.paymentIntents.cancel(paymentIntent.id)
      return NextResponse.json(
        { error: 'Failed to create payment hold' },
        { status: 500 }
      )
    }

    // 5. Assign contractor and update job status
    const { error: jobUpdateError } = await supabase
      .from('homeowner_jobs')
      .update({
        contractor_id: contractorId,
        status: 'confirmed',
        payment_hold_id: paymentHold.id,
        accepted_bid_id: bidId || null
      })
      .eq('id', jobId)

    if (jobUpdateError) {
      console.error('[StartDirect] Error updating job:', jobUpdateError)
    }

    // 6. Accept winning bid, reject others
    if (bidId) {
      await supabase
        .from('job_bids')
        .update({ status: 'accepted' })
        .eq('id', bidId)

      await supabase
        .from('job_bids')
        .update({ status: 'rejected' })
        .eq('job_id', jobId)
        .neq('id', bidId)
        .eq('status', 'pending')
    }

    // 7. Create or find conversation
    let conversationId: string | null = null
    const { data: existingConvo } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${homeownerId},participant_2.eq.${contractorId}),and(participant_1.eq.${contractorId},participant_2.eq.${homeownerId})`)
      .single()

    if (existingConvo) {
      conversationId = existingConvo.id
    } else {
      const { data: newConvo } = await supabase
        .from('conversations')
        .insert({
          participant_1: homeownerId,
          participant_2: contractorId,
          job_id: jobId
        })
        .select()
        .single()
      conversationId = newConvo?.id || null
    }

    // 8. Notify contractor
    const { data: contractor } = await supabase
      .from('pro_contractors')
      .select('name, business_name, email')
      .eq('id', contractorId)
      .single()

    await supabase.from('notifications').insert({
      user_id: contractorId,
      type: 'job_filled',
      title: 'You\'ve been selected for a job!',
      message: `A homeowner selected you for a ${job.category || 'service'} job at $${amount}. Navigate to the job location.`,
      job_id: jobId,
      bid_id: bidId || null
    })

    // Send email notification (fire and forget)
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/notify-contractor-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contractorId,
        contractorName: contractor?.business_name || contractor?.name,
        category: job.category,
        jobDescription: job.description || job.title,
        locationName: job.address,
        homeownerId,
        estimatedAmount: amount
      })
    }).catch(err => console.error('[StartDirect] Email notification error:', err))

    return NextResponse.json({
      success: true,
      paymentHoldId: paymentHold.id,
      conversationId,
      contractorName: contractor?.business_name || contractor?.name || 'Contractor',
      amount,
      platformFee: platformFeeCents / 100,
      contractorPayout: contractorPayoutCents / 100
    })

  } catch (error: any) {
    console.error('[StartDirect] Error:', error)

    if (error.type === 'StripeCardError') {
      return NextResponse.json(
        { error: error.message || 'Card was declined', cardError: true },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to start job' },
      { status: 500 }
    )
  }
}
