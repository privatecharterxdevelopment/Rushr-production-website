import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLATFORM_FEE_PERCENT = 10

/**
 * POST /api/jobs/accept-final-price
 * Homeowner accepts (or declines) the contractor's proposed final price.
 * If accepted and price is higher, charges the difference to the homeowner's card.
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId, homeownerId, accepted } = await request.json()

    if (!jobId || !homeownerId || accepted === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields (jobId, homeownerId, accepted)' },
        { status: 400 }
      )
    }

    // 1. Get job with final price
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

    if (!job.final_price || !job.final_price_proposed_by) {
      return NextResponse.json(
        { error: 'No final price has been proposed for this job' },
        { status: 400 }
      )
    }

    if (job.final_price_accepted) {
      return NextResponse.json(
        { error: 'Final price has already been accepted' },
        { status: 400 }
      )
    }

    // 2. Get the payment hold (original escrow)
    const { data: paymentHold, error: holdError } = await supabase
      .from('payment_holds')
      .select('*')
      .eq('job_id', jobId)
      .in('status', ['captured', 'authorized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (holdError || !paymentHold) {
      return NextResponse.json(
        { error: 'Payment hold not found' },
        { status: 404 }
      )
    }

    if (!accepted) {
      // 3a. Homeowner declined — reset final price, keep job in_progress
      await supabase
        .from('homeowner_jobs')
        .update({
          final_price: null,
          final_price_proposed_by: null,
          final_price_accepted: false,
          final_price_reason: null,
          final_price_proposed_at: null,
          final_price_accepted_at: null,
          contractor_marked_complete: false
        })
        .eq('id', jobId)

      // Update payment_adjustment record
      await supabase
        .from('payment_adjustments')
        .update({
          status: 'declined',
          responded_by_id: homeownerId,
          responded_at: new Date().toISOString()
        })
        .eq('job_id', jobId)
        .eq('status', 'pending')

      // Notify contractor
      await supabase.from('notifications').insert({
        user_id: job.contractor_id,
        type: 'job_update',
        title: 'Final Price Declined',
        message: `The homeowner declined the proposed price of $${job.final_price.toFixed(2)}. Please discuss and propose a new price.`,
        job_id: jobId
      })

      return NextResponse.json({
        success: true,
        accepted: false,
        message: 'Final price declined. Contractor has been notified.'
      })
    }

    // 3b. Homeowner accepted the final price
    const originalAmount = parseFloat(paymentHold.amount)
    const finalPrice = parseFloat(job.final_price)
    const difference = finalPrice - originalAmount

    let additionalPaymentIntentId: string | null = null

    if (difference > 0.50) {
      // Need to charge additional amount to homeowner's card
      const { data: stripeCustomer } = await supabase
        .from('stripe_customers')
        .select('stripe_customer_id, default_payment_method_id')
        .eq('user_id', homeownerId)
        .single()

      if (!stripeCustomer?.default_payment_method_id) {
        return NextResponse.json(
          { error: 'No payment method found. Please add a card first.', needsCard: true },
          { status: 400 }
        )
      }

      // Create and immediately capture the additional charge
      const stripe = getStripe()
      const additionalPI = await stripe.paymentIntents.create({
        amount: Math.round(difference * 100),
        currency: 'usd',
        customer: stripeCustomer.stripe_customer_id,
        payment_method: stripeCustomer.default_payment_method_id,
        confirm: true,
        off_session: true,
        description: `Rushr Additional Charge: Price adjustment for job ${jobId}`,
        metadata: {
          homeowner_id: homeownerId,
          contractor_id: job.contractor_id,
          job_id: jobId,
          type: 'price_adjustment',
          original_amount: originalAmount.toString(),
          final_price: finalPrice.toString()
        }
      })

      additionalPaymentIntentId = additionalPI.id
    }

    // 4. Update the payment hold with new amounts
    const newPlatformFee = finalPrice * (PLATFORM_FEE_PERCENT / 100)
    const newContractorPayout = finalPrice - newPlatformFee

    await supabase
      .from('payment_holds')
      .update({
        amount: finalPrice,
        platform_fee: newPlatformFee,
        contractor_payout: newContractorPayout,
        contractor_confirmed_complete: true,
        contractor_confirmed_at: job.final_price_proposed_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentHold.id)

    // 5. Mark final price as accepted on the job
    await supabase
      .from('homeowner_jobs')
      .update({
        final_price_accepted: true,
        final_price_accepted_at: new Date().toISOString()
      })
      .eq('id', jobId)

    // 6. Update payment_adjustment record
    await supabase
      .from('payment_adjustments')
      .update({
        status: 'accepted',
        responded_by_id: homeownerId,
        responded_at: new Date().toISOString(),
        stripe_payment_intent_id: additionalPaymentIntentId
      })
      .eq('job_id', jobId)
      .eq('status', 'pending')

    // 7. Notify contractor that price was accepted
    await supabase.from('notifications').insert({
      user_id: job.contractor_id,
      type: 'job_update',
      title: 'Final Price Accepted!',
      message: `The homeowner accepted the final price of $${finalPrice.toFixed(2)}. Please confirm completion.`,
      job_id: jobId
    })

    return NextResponse.json({
      success: true,
      accepted: true,
      originalAmount,
      finalPrice,
      additionalCharge: difference > 0.50 ? difference : 0,
      newContractorPayout: newContractorPayout,
      message: difference > 0.50
        ? `Final price accepted. Additional $${difference.toFixed(2)} charged to your card.`
        : difference < -0.50
          ? `Final price accepted. You'll be refunded $${Math.abs(difference).toFixed(2)}.`
          : 'Final price accepted. Ready for completion confirmation.'
    })

  } catch (error: any) {
    console.error('Accept final price error:', error)

    if (error.type === 'StripeCardError') {
      return NextResponse.json(
        { error: error.message || 'Card was declined for additional charge', cardError: true },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to accept final price' },
      { status: 500 }
    )
  }
}
