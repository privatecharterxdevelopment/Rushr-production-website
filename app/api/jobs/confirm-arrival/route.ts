import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyWorkStarted } from '../../../../lib/emailService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/jobs/confirm-arrival
 * Contractor confirms arrival at job location
 * Changes job status from 'confirmed' to 'in_progress'
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId, contractorId } = await request.json()

    if (!jobId || !contractorId) {
      return NextResponse.json(
        { error: 'Missing required fields: jobId, contractorId' },
        { status: 400 }
      )
    }

    // 1. Get job and verify contractor is assigned
    const { data: job, error: jobError } = await supabase
      .from('homeowner_jobs')
      .select('*, accepted_bid_id')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Verify status is correct for arrival confirmation
    if (job.status !== 'confirmed') {
      return NextResponse.json(
        { error: `Cannot confirm arrival. Job status is: ${job.status}` },
        { status: 400 }
      )
    }

    // 2. Verify contractor is assigned to this job
    // For direct payment jobs, contractor_id is set directly on the job
    // For bid-based jobs, verify via accepted_bid_id
    if (job.accepted_bid_id) {
      const { data: bid, error: bidError } = await supabase
        .from('job_bids')
        .select('contractor_id')
        .eq('id', job.accepted_bid_id)
        .single()

      if (bidError || !bid || bid.contractor_id !== contractorId) {
        return NextResponse.json(
          { error: 'Unauthorized - you are not assigned to this job' },
          { status: 403 }
        )
      }
    } else if (job.contractor_id !== contractorId) {
      return NextResponse.json(
        { error: 'Unauthorized - you are not assigned to this job' },
        { status: 403 }
      )
    }

    // 3. Update job status to in_progress
    const { error: updateError } = await supabase
      .from('homeowner_jobs')
      .update({
        status: 'in_progress',
        arrived_at: new Date().toISOString()
      })
      .eq('id', jobId)

    if (updateError) {
      throw updateError
    }

    // 4. Send notification to homeowner
    await supabase.from('notifications').insert({
      user_id: job.homeowner_id,
      type: 'job_filled',
      title: 'Contractor Has Arrived!',
      message: 'Your contractor has arrived at the job location. Work is now in progress.',
      job_id: jobId,
      bid_id: job.accepted_bid_id
    })

    // 5. Get contractor name for response
    const { data: contractor } = await supabase
      .from('pro_contractors')
      .select('name, business_name')
      .eq('id', contractorId)
      .single()

    const contractorName = contractor?.business_name || contractor?.name || 'Contractor'

    // 6. Bell notification for contractor (confirmation of their arrival)
    await supabase.from('notifications').insert({
      user_id: contractorId,
      type: 'job_filled',
      title: 'Arrival Confirmed',
      message: `Your arrival for "${job.title}" has been confirmed. Job is now in progress.`,
      job_id: jobId,
      bid_id: job.accepted_bid_id
    })

    // 7. Email notifications to both parties (non-blocking)
    try {
      const { data: homeownerAuth } = await supabase.auth.admin.getUserById(job.homeowner_id)
      const { data: contractorAuth } = await supabase.auth.admin.getUserById(contractorId)

      const { data: homeowner } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('id', job.homeowner_id)
        .single()

      if (homeownerAuth?.user?.email && contractorAuth?.user?.email && homeowner) {
        await notifyWorkStarted({
          homeownerEmail: homeownerAuth.user.email,
          homeownerName: homeowner.name || 'Homeowner',
          contractorEmail: contractorAuth.user.email,
          contractorName,
          jobTitle: job.title || 'Job',
          estimatedCompletion: 'Today'
        })
      }
    } catch (emailError) {
      console.error('Failed to send arrival email notifications:', emailError)
    }

    return NextResponse.json({
      success: true,
      message: 'Arrival confirmed. Job is now in progress.',
      contractorName
    })

  } catch (error: any) {
    console.error('Confirm arrival error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to confirm arrival' },
      { status: 500 }
    )
  }
}
