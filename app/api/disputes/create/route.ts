import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyDisputeFiled } from '../../../../lib/emailService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/disputes/create
 * Create a new dispute for a job
 *
 * Body: { jobId, reason, description }
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId, reason, description, userId, userType } = await request.json()

    if (!jobId || !reason || !userId || !userType) {
      return NextResponse.json(
        { error: 'Missing required fields: jobId, reason, userId, userType' },
        { status: 400 }
      )
    }

    if (!['homeowner', 'contractor'].includes(userType)) {
      return NextResponse.json(
        { error: 'Invalid userType. Must be homeowner or contractor' },
        { status: 400 }
      )
    }

    // 1. Get the job details
    const { data: job, error: jobError } = await supabase
      .from('homeowner_jobs')
      .select(`
        *,
        homeowner:user_profiles!homeowner_jobs_homeowner_id_fkey(id, name, email),
        accepted_bid:job_bids!homeowner_jobs_accepted_bid_id_fkey(contractor_id)
      `)
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found', details: jobError?.message },
        { status: 404 }
      )
    }

    // 2. Validate that the job is in_progress (dispute can only be filed during active job)
    if (job.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Disputes can only be filed for jobs that are in progress' },
        { status: 400 }
      )
    }

    // 3. Validate the user is involved in this job
    const contractorId = job.accepted_bid?.contractor_id || job.contractor_id

    if (userType === 'homeowner' && job.homeowner_id !== userId) {
      return NextResponse.json(
        { error: 'You are not authorized to file a dispute for this job' },
        { status: 403 }
      )
    }

    if (userType === 'contractor' && contractorId !== userId) {
      return NextResponse.json(
        { error: 'You are not authorized to file a dispute for this job' },
        { status: 403 }
      )
    }

    // 4. Check if there's already an active dispute for this job
    const { data: existingDispute } = await supabase
      .from('job_disputes')
      .select('id')
      .eq('job_id', jobId)
      .in('status', ['open', 'under_review'])
      .single()

    if (existingDispute) {
      return NextResponse.json(
        { error: 'There is already an active dispute for this job' },
        { status: 400 }
      )
    }

    // 5. Create the dispute
    const { data: dispute, error: disputeError } = await supabase
      .from('job_disputes')
      .insert({
        job_id: jobId,
        filed_by_id: userId,
        filed_by_type: userType,
        reason: reason,
        description: description || null,
        status: 'open'
      })
      .select()
      .single()

    if (disputeError) {
      console.error('Error creating dispute:', disputeError)
      return NextResponse.json(
        { error: 'Failed to create dispute', details: disputeError.message },
        { status: 500 }
      )
    }

    // 6. Update job status to 'on_hold'
    const { error: jobUpdateError } = await supabase
      .from('homeowner_jobs')
      .update({ status: 'on_hold' })
      .eq('id', jobId)

    if (jobUpdateError) {
      console.error('Error updating job status:', jobUpdateError)
    }

    // 7. Update payment_holds status to 'disputed' if exists
    const { error: paymentUpdateError } = await supabase
      .from('payment_holds')
      .update({ status: 'disputed' })
      .eq('job_id', jobId)

    if (paymentUpdateError) {
      console.error('Error updating payment status:', paymentUpdateError)
    }

    // 8. Send notifications to the other party (non-blocking)
    try {
      // Get contractor details
      const { data: contractor } = await supabase
        .from('pro_contractors')
        .select('name, email, business_name')
        .eq('id', contractorId)
        .single()

      const { data: contractorAuth } = await supabase.auth.admin.getUserById(contractorId)

      if (userType === 'homeowner' && contractor && contractorAuth?.user?.email) {
        // Notify contractor that homeowner filed a dispute
        await notifyDisputeFiled({
          recipientEmail: contractorAuth.user.email,
          recipientName: contractor.business_name || contractor.name,
          jobTitle: job.title,
          reason: reason,
          filedBy: 'homeowner',
          filedByName: job.homeowner?.name || 'Homeowner'
        })
      } else if (userType === 'contractor' && job.homeowner?.email) {
        // Notify homeowner that contractor filed a dispute
        await notifyDisputeFiled({
          recipientEmail: job.homeowner.email,
          recipientName: job.homeowner.name || 'Homeowner',
          jobTitle: job.title,
          reason: reason,
          filedBy: 'contractor',
          filedByName: contractor?.business_name || contractor?.name || 'Contractor'
        })
      }
    } catch (emailError) {
      console.error('Failed to send dispute notification:', emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      success: true,
      message: 'Dispute created successfully',
      dispute: dispute
    })

  } catch (error: any) {
    console.error('Error in /api/disputes/create:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    )
  }
}
