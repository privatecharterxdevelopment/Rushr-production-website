import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { notifyDisputeResolved } from '../../../../lib/emailService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20' as any
})

/**
 * POST /api/disputes/resolve
 * Admin resolves a dispute
 *
 * Body: {
 *   disputeId,
 *   action: 'release_to_contractor' | 'refund_homeowner' | 'partial_refund' | 'dismissed',
 *   resolution: string (explanation),
 *   contractorAmount?: number (for partial_refund),
 *   homeownerRefund?: number (for partial_refund),
 *   adminNotes?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const {
      disputeId,
      action,
      resolution,
      contractorAmount,
      homeownerRefund,
      adminNotes,
      adminId
    } = await request.json()

    if (!disputeId || !action || !resolution) {
      return NextResponse.json(
        { error: 'Missing required fields: disputeId, action, resolution' },
        { status: 400 }
      )
    }

    const validActions = ['release_to_contractor', 'refund_homeowner', 'partial_refund', 'dismissed']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate partial_refund has amounts
    if (action === 'partial_refund' && (contractorAmount === undefined || homeownerRefund === undefined)) {
      return NextResponse.json(
        { error: 'partial_refund requires contractorAmount and homeownerRefund' },
        { status: 400 }
      )
    }

    // 1. Get the dispute with job and payment details
    const { data: dispute, error: disputeError } = await supabase
      .from('job_disputes')
      .select(`
        *,
        job:homeowner_jobs(
          id, title, homeowner_id, contractor_id, status,
          homeowner:user_profiles!homeowner_jobs_homeowner_id_fkey(id, name, email),
          accepted_bid:job_bids!homeowner_jobs_accepted_bid_id_fkey(contractor_id)
        )
      `)
      .eq('id', disputeId)
      .single()

    if (disputeError || !dispute) {
      return NextResponse.json(
        { error: 'Dispute not found', details: disputeError?.message },
        { status: 404 }
      )
    }

    // Check dispute is still open
    if (!['open', 'under_review'].includes(dispute.status)) {
      return NextResponse.json(
        { error: 'This dispute has already been resolved' },
        { status: 400 }
      )
    }

    const job = dispute.job
    const contractorId = job.accepted_bid?.contractor_id || job.contractor_id

    // 2. Get payment hold
    const { data: paymentHold } = await supabase
      .from('payment_holds')
      .select('*')
      .eq('job_id', job.id)
      .single()

    // 3. Get contractor details
    const { data: contractor } = await supabase
      .from('pro_contractors')
      .select('id, name, email, business_name, stripe_account_id')
      .eq('id', contractorId)
      .single()

    const { data: contractorAuth } = await supabase.auth.admin.getUserById(contractorId)

    // 4. Handle the resolution based on action
    let newJobStatus = 'completed'
    let newPaymentStatus = 'released'

    try {
      switch (action) {
        case 'release_to_contractor':
          // Full payment to contractor
          if (paymentHold && paymentHold.status === 'captured' && contractor?.stripe_account_id) {
            // Create Stripe Transfer
            await stripe.transfers.create({
              amount: Math.round(paymentHold.contractor_payout * 100), // Convert to cents
              currency: 'usd',
              destination: contractor.stripe_account_id,
              metadata: {
                job_id: job.id,
                dispute_id: disputeId,
                resolution: 'full_release'
              }
            })
            newPaymentStatus = 'released'
          }
          newJobStatus = 'completed'
          break

        case 'refund_homeowner':
          // Full refund to homeowner
          if (paymentHold && paymentHold.stripe_payment_intent_id) {
            await stripe.refunds.create({
              payment_intent: paymentHold.stripe_payment_intent_id,
              metadata: {
                job_id: job.id,
                dispute_id: disputeId,
                resolution: 'full_refund'
              }
            })
            newPaymentStatus = 'refunded'
          }
          newJobStatus = 'cancelled'
          break

        case 'partial_refund':
          // Partial refund to homeowner, partial to contractor
          if (paymentHold && paymentHold.stripe_payment_intent_id && contractor?.stripe_account_id) {
            // Refund portion to homeowner
            if (homeownerRefund > 0) {
              await stripe.refunds.create({
                payment_intent: paymentHold.stripe_payment_intent_id,
                amount: Math.round(homeownerRefund * 100),
                metadata: {
                  job_id: job.id,
                  dispute_id: disputeId,
                  resolution: 'partial_refund'
                }
              })
            }

            // Transfer remaining to contractor
            if (contractorAmount > 0) {
              await stripe.transfers.create({
                amount: Math.round(contractorAmount * 100),
                currency: 'usd',
                destination: contractor.stripe_account_id,
                metadata: {
                  job_id: job.id,
                  dispute_id: disputeId,
                  resolution: 'partial_release'
                }
              })
            }
            newPaymentStatus = 'partial_refund'
          }
          newJobStatus = 'completed'
          break

        case 'dismissed':
          // Dismiss dispute - job continues as normal
          newJobStatus = 'in_progress'
          newPaymentStatus = paymentHold?.status || 'pending'
          break
      }
    } catch (stripeError: any) {
      console.error('Stripe error during dispute resolution:', stripeError)
      // Continue with status updates even if Stripe fails - admin can retry manually
    }

    // 5. Update dispute record
    const { error: updateDisputeError } = await supabase
      .from('job_disputes')
      .update({
        status: 'resolved',
        resolution: resolution,
        resolution_action: action,
        contractor_amount: action === 'partial_refund' ? contractorAmount : null,
        homeowner_refund: action === 'partial_refund' ? homeownerRefund : null,
        resolved_by: adminId || null,
        resolved_at: new Date().toISOString(),
        admin_notes: adminNotes || null
      })
      .eq('id', disputeId)

    if (updateDisputeError) {
      console.error('Error updating dispute:', updateDisputeError)
    }

    // 6. Update job status
    const { error: updateJobError } = await supabase
      .from('homeowner_jobs')
      .update({ status: newJobStatus })
      .eq('id', job.id)

    if (updateJobError) {
      console.error('Error updating job status:', updateJobError)
    }

    // 7. Update payment_holds status
    if (paymentHold) {
      const { error: updatePaymentError } = await supabase
        .from('payment_holds')
        .update({
          status: newPaymentStatus,
          released_at: action !== 'dismissed' ? new Date().toISOString() : null
        })
        .eq('id', paymentHold.id)

      if (updatePaymentError) {
        console.error('Error updating payment hold:', updatePaymentError)
      }
    }

    // 8. Send notifications to both parties (non-blocking)
    try {
      // Notify homeowner
      if (job.homeowner?.email) {
        await notifyDisputeResolved({
          recipientEmail: job.homeowner.email,
          recipientName: job.homeowner.name || 'Homeowner',
          jobTitle: job.title,
          resolution: resolution,
          action: action
        })
      }

      // Notify contractor
      if (contractorAuth?.user?.email) {
        await notifyDisputeResolved({
          recipientEmail: contractorAuth.user.email,
          recipientName: contractor?.business_name || contractor?.name || 'Contractor',
          jobTitle: job.title,
          resolution: resolution,
          action: action
        })
      }
    } catch (emailError) {
      console.error('Failed to send resolution notifications:', emailError)
    }

    return NextResponse.json({
      success: true,
      message: 'Dispute resolved successfully',
      newJobStatus,
      newPaymentStatus
    })

  } catch (error: any) {
    console.error('Error in /api/disputes/resolve:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    )
  }
}
