import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/jobs/propose-final-price
 * Contractor proposes a final price before marking the job as complete.
 * If the price differs from the original escrow, the homeowner must accept.
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId, contractorId, finalPrice, reason } = await request.json()

    if (!jobId || !contractorId || finalPrice === undefined || finalPrice === null) {
      return NextResponse.json(
        { error: 'Missing required fields (jobId, contractorId, finalPrice)' },
        { status: 400 }
      )
    }

    if (finalPrice <= 0) {
      return NextResponse.json(
        { error: 'Final price must be greater than 0' },
        { status: 400 }
      )
    }

    // 1. Verify job exists, is in_progress, and contractor is assigned
    const { data: job, error: jobError } = await supabase
      .from('homeowner_jobs')
      .select('*, payment_holds!homeowner_jobs_payment_hold_id_fkey(amount)')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    if (job.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Job must be in progress to propose a final price' },
        { status: 400 }
      )
    }

    if (job.contractor_id !== contractorId) {
      return NextResponse.json(
        { error: 'Only the assigned contractor can propose a final price' },
        { status: 403 }
      )
    }

    // 2. Get the original escrow amount from payment_holds
    const { data: paymentHold } = await supabase
      .from('payment_holds')
      .select('id, amount')
      .eq('job_id', jobId)
      .in('status', ['captured', 'authorized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const originalAmount = paymentHold?.amount || job.final_cost || 0

    // 3. Update job with final price proposal
    const { error: updateError } = await supabase
      .from('homeowner_jobs')
      .update({
        final_price: finalPrice,
        final_price_proposed_by: 'contractor',
        final_price_accepted: Math.abs(finalPrice - originalAmount) < 0.01, // Auto-accept if same price
        final_price_reason: reason || null,
        final_price_proposed_at: new Date().toISOString(),
        final_price_accepted_at: Math.abs(finalPrice - originalAmount) < 0.01 ? new Date().toISOString() : null,
        contractor_marked_complete: true
      })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error updating job with final price:', updateError)
      return NextResponse.json(
        { error: 'Failed to update job' },
        { status: 500 }
      )
    }

    const priceChanged = Math.abs(finalPrice - originalAmount) >= 0.01

    // 4. If price changed, create a payment_adjustment record for tracking
    if (priceChanged) {
      await supabase
        .from('payment_adjustments')
        .insert({
          job_id: jobId,
          payment_hold_id: paymentHold?.id || null,
          requested_by: 'contractor',
          requested_by_id: contractorId,
          contractor_id: contractorId,
          homeowner_id: job.homeowner_id,
          original_amount: originalAmount,
          new_amount: finalPrice,
          reason: reason || 'Job took longer than expected',
          status: 'pending',
          category: 'completion_adjustment'
        })
    }

    // 5. Notify homeowner
    if (priceChanged) {
      const { data: contractor } = await supabase
        .from('pro_contractors')
        .select('name, business_name')
        .eq('id', contractorId)
        .single()

      const contractorName = contractor?.business_name || contractor?.name || 'Contractor'
      const diff = finalPrice - originalAmount
      const diffText = diff > 0
        ? `$${diff.toFixed(2)} more than the original $${originalAmount.toFixed(2)}`
        : `$${Math.abs(diff).toFixed(2)} less than the original $${originalAmount.toFixed(2)}`

      await supabase.from('notifications').insert({
        user_id: job.homeowner_id,
        type: 'job_update',
        title: 'Final Price Proposal',
        message: `${contractorName} has proposed a final price of $${finalPrice.toFixed(2)} (${diffText}). Please review and accept to complete the job.`,
        job_id: jobId
      })
    } else {
      // Same price — also confirm contractor completion via the confirm-complete API flow
      await supabase
        .from('payment_holds')
        .update({
          contractor_confirmed_complete: true,
          contractor_confirmed_at: new Date().toISOString()
        })
        .eq('job_id', jobId)
        .in('status', ['captured', 'authorized'])

      await supabase.from('notifications').insert({
        user_id: job.homeowner_id,
        type: 'job_update',
        title: 'Contractor Marked Job Complete',
        message: `Please confirm job completion to release payment of $${finalPrice.toFixed(2)}.`,
        job_id: jobId
      })
    }

    return NextResponse.json({
      success: true,
      priceChanged,
      originalAmount,
      finalPrice,
      message: priceChanged
        ? 'Final price proposed. Waiting for homeowner approval.'
        : 'Job marked as complete. Waiting for homeowner confirmation.'
    })

  } catch (error: any) {
    console.error('Propose final price error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to propose final price' },
      { status: 500 }
    )
  }
}
