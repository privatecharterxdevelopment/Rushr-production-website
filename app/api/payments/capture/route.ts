import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../lib/stripe'
import { notifyPaymentCompleted } from '../../../../lib/emailService'
import { sendPaymentCompletedSMSHomeowner, sendPaymentCompletedSMSContractor } from '../../../../lib/smsService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/payments/capture
 * Captures (charges) the authorized payment after homeowner confirms acceptance
 */
export async function POST(request: NextRequest) {
  try {
    // Check if Stripe is configured
    if (!stripe) {
      return NextResponse.json(
        { error: 'Payment system not configured. Please add STRIPE_SECRET_KEY to environment variables.' },
        { status: 503 }
      )
    }

    const { paymentHoldId, homeownerId } = await request.json()

    if (!paymentHoldId || !homeownerId) {
      return NextResponse.json(
        { error: 'Missing paymentHoldId or homeownerId' },
        { status: 400 }
      )
    }

    // 1. Get payment hold
    const { data: paymentHold, error: holdError } = await supabase
      .from('payment_holds')
      .select('*')
      .eq('id', paymentHoldId)
      .eq('homeowner_id', homeownerId)
      .single()

    if (holdError || !paymentHold) {
      return NextResponse.json(
        { error: 'Payment hold not found or access denied' },
        { status: 404 }
      )
    }

    if (paymentHold.status !== 'authorized') {
      return NextResponse.json(
        { error: `Cannot capture payment with status: ${paymentHold.status}` },
        { status: 400 }
      )
    }

    // 2. Capture the payment intent
    const paymentIntent = await getStripe().paymentIntents.capture(
      paymentHold.stripe_payment_intent_id
    )

    // 3. Update payment hold status
    const { error: updateError } = await supabase
      .from('payment_holds')
      .update({
        status: 'captured',
        stripe_charge_id: paymentIntent.latest_charge as string
      })
      .eq('id', paymentHoldId)

    if (updateError) {
      throw updateError
    }

    // 4. Update job payment status
    await supabase
      .from('homeowner_jobs')
      .update({
        payment_status: 'paid',
        payment_captured_at: new Date().toISOString()
      })
      .eq('id', paymentHold.job_id)

    // 5. Send notification to contractor: "Payment secured - let's get to work!"
    await supabase.from('notifications').insert({
      user_id: paymentHold.contractor_id,
      type: 'job_request_received',
      title: 'Payment Secured!',
      message: `Homeowner paid $${paymentHold.amount}. Payment is in escrow - let's get to work!`,
      job_id: paymentHold.job_id,
      bid_id: paymentHold.bid_id
    })

    // 6. Send email & SMS notifications to both parties (non-blocking)
    try {
      const { data: job } = await supabase
        .from('homeowner_jobs')
        .select('title')
        .eq('id', paymentHold.job_id)
        .single()

      const { data: homeownerAuth } = await supabase.auth.admin.getUserById(paymentHold.homeowner_id)
      const { data: contractorAuth } = await supabase.auth.admin.getUserById(paymentHold.contractor_id)

      const { data: homeowner } = await supabase
        .from('user_profiles')
        .select('name, phone')
        .eq('id', paymentHold.homeowner_id)
        .single()

      const { data: contractor } = await supabase
        .from('pro_contractors')
        .select('name, business_name, phone')
        .eq('id', paymentHold.contractor_id)
        .single()

      const contractorName = contractor?.business_name || contractor?.name || 'Contractor'
      const homeownerName = homeowner?.name || 'Homeowner'
      const jobTitle = job?.title || 'Job'
      const amount = parseFloat(paymentHold.amount)

      // Send email notifications
      if (homeownerAuth?.user?.email && contractorAuth?.user?.email && job && homeowner && contractor) {
        await notifyPaymentCompleted({
          homeownerEmail: homeownerAuth.user.email,
          homeownerName: homeownerName,
          contractorEmail: contractorAuth.user.email,
          contractorName: contractorName,
          jobTitle: jobTitle,
          amount: amount
        })
      }

      // Send SMS to homeowner
      if (homeowner?.phone) {
        await sendPaymentCompletedSMSHomeowner({
          homeownerPhone: homeowner.phone,
          homeownerName: homeownerName,
          jobTitle: jobTitle,
          amount: amount,
          contractorName: contractorName
        })
      }

      // Send SMS to contractor
      if (contractor?.phone) {
        await sendPaymentCompletedSMSContractor({
          contractorPhone: contractor.phone,
          contractorName: contractorName,
          jobTitle: jobTitle,
          amount: amount,
          homeownerName: homeownerName
        })
      }
    } catch (notificationError) {
      console.error('Failed to send payment notifications:', notificationError)
      // Don't fail the request if notifications fail
    }

    return NextResponse.json({
      success: true,
      status: 'captured',
      chargeId: paymentIntent.latest_charge
    })

  } catch (error: any) {
    console.error('Capture payment error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to capture payment' },
      { status: 500 }
    )
  }
}
