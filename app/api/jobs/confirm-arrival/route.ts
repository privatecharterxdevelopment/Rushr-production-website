import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    // 2. Verify contractor owns the accepted bid
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

    return NextResponse.json({
      success: true,
      message: 'Arrival confirmed. Job is now in progress.',
      contractorName: contractor?.business_name || contractor?.name || 'Contractor'
    })

  } catch (error: any) {
    console.error('Confirm arrival error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to confirm arrival' },
      { status: 500 }
    )
  }
}
