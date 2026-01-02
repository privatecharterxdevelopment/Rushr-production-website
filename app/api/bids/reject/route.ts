import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyBidRejected } from '../../../../lib/emailService'
import { sendBidRejectedSMS } from '../../../../lib/smsService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/bids/reject
 * Rejects a bid and sends email/SMS notification to contractor
 */
export async function POST(request: NextRequest) {
  try {
    const { bidId, jobTitle, homeownerId } = await request.json()

    if (!bidId || !homeownerId) {
      return NextResponse.json(
        { error: 'Missing required fields: bidId, homeownerId' },
        { status: 400 }
      )
    }

    // 1. Get bid details
    const { data: bid, error: bidError } = await supabase
      .from('job_bids')
      .select('*, contractor_id, job_id')
      .eq('id', bidId)
      .single()

    if (bidError || !bid) {
      console.error('Error fetching bid:', bidError)
      return NextResponse.json(
        { error: 'Bid not found', details: bidError?.message },
        { status: 404 }
      )
    }

    // 2. Update bid status to rejected
    const { error: updateBidError } = await supabase
      .from('job_bids')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', bidId)

    if (updateBidError) {
      console.error('Error updating bid:', updateBidError)
      return NextResponse.json(
        { error: 'Failed to reject bid', details: updateBidError.message },
        { status: 500 }
      )
    }

    // 3. Create notification for contractor (in-app)
    const { data: job } = await supabase
      .from('homeowner_jobs')
      .select('title')
      .eq('id', bid.job_id)
      .single()

    const actualJobTitle = jobTitle || job?.title || 'Job'

    await supabase
      .from('notifications')
      .insert({
        user_id: bid.contractor_id,
        type: 'bid_rejected',
        title: 'Bid Not Accepted',
        message: `Your bid on "${actualJobTitle}" was not accepted.`,
        metadata: {
          job_id: bid.job_id,
          bid_id: bidId
        },
        read: false,
        created_at: new Date().toISOString()
      })

    // 4. Send email & SMS notifications to contractor (non-blocking)
    try {
      const { data: homeowner } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('id', homeownerId)
        .single()

      const { data: contractor } = await supabase
        .from('pro_contractors')
        .select('name, business_name, phone')
        .eq('id', bid.contractor_id)
        .single()

      const { data: contractorAuth } = await supabase.auth.admin.getUserById(bid.contractor_id)

      const contractorName = contractor?.business_name || contractor?.name || 'Contractor'
      const homeownerName = homeowner?.name || 'Homeowner'

      // Send email notification
      if (contractorAuth?.user?.email) {
        await notifyBidRejected({
          contractorEmail: contractorAuth.user.email,
          contractorName: contractorName,
          jobTitle: actualJobTitle,
          homeownerName: homeownerName
        })
      }

      // Send SMS notification
      if (contractor?.phone) {
        await sendBidRejectedSMS({
          contractorPhone: contractor.phone,
          contractorName: contractorName,
          jobTitle: actualJobTitle
        })
      }
    } catch (error) {
      console.error('Failed to send bid rejected notification:', error)
      // Don't fail the request if notification fails
    }

    return NextResponse.json({
      success: true,
      message: 'Bid rejected successfully'
    })

  } catch (error: any) {
    console.error('Error in /api/bids/reject:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    )
  }
}
