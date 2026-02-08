import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyBidReceived } from '../../../../lib/emailService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/jobs/notify-direct-acceptance
 * Sends bell + email notification to homeowner when a contractor accepts their direct payment job.
 * Called fire-and-forget from the contractor dashboard after the bid insert.
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId, contractorId, bidAmount } = await request.json()

    if (!jobId || !contractorId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Fetch job details
    const { data: job, error: jobError } = await supabase
      .from('homeowner_jobs')
      .select('title, homeowner_id, category')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Fetch contractor info
    const { data: contractor } = await supabase
      .from('pro_contractors')
      .select('name, business_name')
      .eq('id', contractorId)
      .single()

    const contractorName = contractor?.business_name || contractor?.name || 'A contractor'

    // 1. Bell notification for homeowner
    await supabase.from('notifications').insert({
      user_id: job.homeowner_id,
      type: 'job_accepted',
      title: 'A Contractor Accepted Your Job!',
      message: `${contractorName} accepted your "${job.title}" job for $${bidAmount?.toFixed(2) || '0.00'}`,
      job_id: jobId
    })

    // 2. Email notification for homeowner (non-blocking)
    try {
      const { data: homeownerAuth } = await supabase.auth.admin.getUserById(job.homeowner_id)
      const { data: homeowner } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('id', job.homeowner_id)
        .single()

      if (homeownerAuth?.user?.email && homeowner) {
        await notifyBidReceived({
          homeownerEmail: homeownerAuth.user.email,
          homeownerName: homeowner.name || 'Homeowner',
          contractorName,
          jobTitle: job.title || 'Job',
          bidAmount: bidAmount || 0,
          estimatedArrival: 'ASAP'
        })
      }
    } catch (emailError) {
      console.error('[NotifyDirectAcceptance] Email error:', emailError)
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[NotifyDirectAcceptance] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send notification' },
      { status: 500 }
    )
  }
}
