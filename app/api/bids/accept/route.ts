import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyBidAccepted, notifyHomeownerBidAccepted } from '../../../../lib/emailService'
import { sendBidAcceptedSMS } from '../../../../lib/smsService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/bids/accept
 * Accepts a bid and sends email notification to contractor
 */
export async function POST(request: NextRequest) {
  try {
    const { bidId, jobId } = await request.json()

    if (!bidId || !jobId) {
      return NextResponse.json(
        { error: 'Missing required fields: bidId, jobId' },
        { status: 400 }
      )
    }

    // 1. Get bid details
    const { data: bid, error: bidError } = await supabase
      .from('job_bids')
      .select('*, contractor_id, job_id, bid_amount')
      .eq('id', bidId)
      .single()

    if (bidError || !bid) {
      console.error('Error fetching bid:', bidError)
      return NextResponse.json(
        { error: 'Bid not found', details: bidError?.message },
        { status: 404 }
      )
    }

    // 2. Update bid status to accepted
    const { error: updateBidError } = await supabase
      .from('job_bids')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', bidId)

    if (updateBidError) {
      console.error('Error updating bid:', updateBidError)
      return NextResponse.json(
        { error: 'Failed to accept bid', details: updateBidError.message },
        { status: 500 }
      )
    }

    // 3. Update job status
    const { error: updateJobError } = await supabase
      .from('homeowner_jobs')
      .update({
        status: 'in_progress',
        final_cost: bid.bid_amount,
        accepted_bid_id: bidId
      })
      .eq('id', jobId)

    if (updateJobError) {
      console.error('Error updating job:', updateJobError)
    }

    // 4. Send email & SMS notifications to contractor (non-blocking)
    try {
      const { data: job } = await supabase
        .from('homeowner_jobs')
        .select('title, address, homeowner_id')
        .eq('id', jobId)
        .single()

      const { data: homeowner } = await supabase
        .from('user_profiles')
        .select('name, phone')
        .eq('id', job?.homeowner_id)
        .single()

      const { data: contractor } = await supabase
        .from('pro_contractors')
        .select('name, business_name, phone')
        .eq('id', bid.contractor_id)
        .single()

      const { data: contractorAuth } = await supabase.auth.admin.getUserById(bid.contractor_id)

      const contractorName = contractor?.business_name || contractor?.name || 'Contractor'

      // Send email notification
      if (contractorAuth?.user?.email && job && homeowner && contractor) {
        await notifyBidAccepted({
          contractorEmail: contractorAuth.user.email,
          contractorName: contractorName,
          jobTitle: job.title,
          homeownerName: homeowner.name,
          homeownerPhone: homeowner.phone || 'Not provided',
          jobAddress: job.address || 'Address in job details'
        })
      }

      // Send SMS notification to contractor
      if (contractor?.phone && job && homeowner) {
        await sendBidAcceptedSMS({
          contractorPhone: contractor.phone,
          contractorName: contractorName,
          homeownerName: homeowner.name,
          jobTitle: job.title
        })
      }

      // Send confirmation email to homeowner
      const { data: homeownerAuth } = await supabase.auth.admin.getUserById(job?.homeowner_id)
      if (homeownerAuth?.user?.email && job && homeowner && contractor) {
        await notifyHomeownerBidAccepted({
          homeownerEmail: homeownerAuth.user.email,
          homeownerName: homeowner.name || 'Homeowner',
          contractorName: contractorName,
          contractorPhone: contractor.phone || 'Contact via app',
          jobTitle: job.title,
          bidAmount: bid.bid_amount,
          jobAddress: job.address || 'See job details'
        })
      }
    } catch (error) {
      console.error('Failed to send bid accepted notification:', error)
      // Don't fail the request if notification fails
    }

    return NextResponse.json({
      success: true,
      message: 'Bid accepted successfully'
    })

  } catch (error: any) {
    console.error('Error in /api/bids/accept:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    )
  }
}
