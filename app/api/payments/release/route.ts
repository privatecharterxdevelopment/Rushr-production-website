import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/payments/release
 * Releases payment from escrow to contractor via Stripe Connect transfer
 * Automatically called by trigger when both parties confirm completion
 */
export async function POST(request: NextRequest) {
  try {
    const { paymentHoldId } = await request.json()

    if (!paymentHoldId) {
      return NextResponse.json(
        { error: 'Missing paymentHoldId' },
        { status: 400 }
      )
    }

    // 1. Get payment hold
    const { data: paymentHold, error: holdError } = await supabase
      .from('payment_holds')
      .select('*')
      .eq('id', paymentHoldId)
      .single()

    if (holdError || !paymentHold) {
      return NextResponse.json(
        { error: 'Payment hold not found' },
        { status: 404 }
      )
    }

    // 2. Verify both parties confirmed
    if (!paymentHold.homeowner_confirmed_complete || !paymentHold.contractor_confirmed_complete) {
      return NextResponse.json(
        { error: 'Both parties must confirm completion before releasing payment' },
        { status: 400 }
      )
    }

    if (paymentHold.status === 'released') {
      return NextResponse.json(
        { error: 'Payment already released' },
        { status: 400 }
      )
    }

    // 3. Get contractor's Stripe Connect account
    const { data: connectAccount } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id, payouts_enabled')
      .eq('contractor_id', paymentHold.contractor_id)
      .single()

    if (!connectAccount || !connectAccount.payouts_enabled) {
      return NextResponse.json(
        { error: 'Contractor has not completed Stripe Connect onboarding' },
        { status: 400 }
      )
    }

    // 4. Create Stripe Transfer to contractor
    const transfer = await getStripe().transfers.create({
      amount: Math.round(paymentHold.contractor_payout * 100), // Convert to cents
      currency: 'usd',
      destination: connectAccount.stripe_account_id,
      transfer_group: paymentHold.job_id,
      metadata: {
        payment_hold_id: paymentHoldId,
        job_id: paymentHold.job_id,
        bid_id: paymentHold.bid_id
      },
      description: `Payment for job completion`
    })

    // 5. Update payment hold with transfer details
    const { error: updateError } = await supabase
      .from('payment_holds')
      .update({
        status: 'released',
        stripe_transfer_id: transfer.id,
        released_at: new Date().toISOString()
      })
      .eq('id', paymentHoldId)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      transferId: transfer.id,
      amount: paymentHold.contractor_payout,
      releasedAt: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Release payment error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to release payment' },
      { status: 500 }
    )
  }
}
