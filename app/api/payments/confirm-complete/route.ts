import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyPaymentCompleted } from '../../../../lib/emailService'
import { sendWorkCompletedSMSHomeowner, sendWorkCompletedSMSContractor } from '../../../../lib/smsService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/payments/confirm-complete
 * Allows homeowner or contractor to confirm job completion
 * When both confirm, payment is automatically released (via trigger)
 */
export async function POST(request: NextRequest) {
  try {
    const { paymentHoldId, jobId, userId, userType } = await request.json()

    if ((!paymentHoldId && !jobId) || !userType) {
      return NextResponse.json(
        { error: 'Missing required fields (need paymentHoldId or jobId, and userType)' },
        { status: 400 }
      )
    }

    if (!['homeowner', 'contractor'].includes(userType)) {
      return NextResponse.json(
        { error: 'Invalid userType. Must be homeowner or contractor' },
        { status: 400 }
      )
    }

    // 1. Get payment hold (by ID or by jobId)
    let paymentHold: any = null
    let holdError: any = null

    if (paymentHoldId) {
      const result = await supabase
        .from('payment_holds')
        .select('*')
        .eq('id', paymentHoldId)
        .single()
      paymentHold = result.data
      holdError = result.error
    } else if (jobId) {
      // Look up by job ID - get the most recent active payment hold
      const result = await supabase
        .from('payment_holds')
        .select('*')
        .eq('job_id', jobId)
        .eq('status', 'captured')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      paymentHold = result.data
      holdError = result.error
    }

    if (holdError || !paymentHold) {
      return NextResponse.json(
        { error: 'Payment hold not found. Ensure payment has been captured for this job.' },
        { status: 404 }
      )
    }

    // Optional: Verify user ID if provided
    if (userId) {
      if (
        (userType === 'homeowner' && paymentHold.homeowner_id !== userId) ||
        (userType === 'contractor' && paymentHold.contractor_id !== userId)
      ) {
        return NextResponse.json(
          { error: 'User type mismatch - you are not authorized for this action' },
          { status: 403 }
        )
      }
    }

    if (paymentHold.status !== 'captured') {
      return NextResponse.json(
        { error: 'Payment must be captured before confirming completion' },
        { status: 400 }
      )
    }

    // 2. Update confirmation status
    const updateFields: any = {}

    if (userType === 'homeowner') {
      if (paymentHold.homeowner_confirmed_complete) {
        return NextResponse.json(
          { error: 'Homeowner has already confirmed completion' },
          { status: 400 }
        )
      }
      updateFields.homeowner_confirmed_complete = true
      updateFields.homeowner_confirmed_at = new Date().toISOString()
    } else {
      if (paymentHold.contractor_confirmed_complete) {
        return NextResponse.json(
          { error: 'Contractor has already confirmed completion' },
          { status: 400 }
        )
      }
      updateFields.contractor_confirmed_complete = true
      updateFields.contractor_confirmed_at = new Date().toISOString()
    }

    const { data: updated, error: updateError } = await supabase
      .from('payment_holds')
      .update(updateFields)
      .eq('id', paymentHoldId)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    // 3. Check if both parties confirmed (trigger will auto-release)
    const bothConfirmed =
      (userType === 'homeowner' ? true : updated.homeowner_confirmed_complete) &&
      (userType === 'contractor' ? true : updated.contractor_confirmed_complete)

    // 4. Send notification to other party
    const otherPartyId = userType === 'homeowner'
      ? paymentHold.contractor_id
      : paymentHold.homeowner_id

    const otherPartyType = userType === 'homeowner' ? 'contractor' : 'homeowner'

    if (bothConfirmed) {
      // Both confirmed - payment will be released
      await supabase.from('notifications').insert({
        user_id: otherPartyId,
        type: 'job_filled',
        title: 'Job Complete - Payment Released!',
        message: `Both parties confirmed completion. Payment of $${updated.contractor_payout} has been released!`,
        job_id: paymentHold.job_id,
        bid_id: paymentHold.bid_id
      })
    } else {
      // One party confirmed, waiting for other
      await supabase.from('notifications').insert({
        user_id: otherPartyId,
        type: 'job_filled',
        title: `${userType === 'homeowner' ? 'Homeowner' : 'Contractor'} Confirmed Completion`,
        message: `Please confirm job completion to release payment of $${paymentHold.contractor_payout}`,
        job_id: paymentHold.job_id,
        bid_id: paymentHold.bid_id
      })
    }

    // 5. If both confirmed, update job status
    if (bothConfirmed) {
      await supabase
        .from('homeowner_jobs')
        .update({ status: 'completed' })
        .eq('id', paymentHold.job_id)

      // 6. Send payment completed email to both parties (non-blocking)
      try {
        const { data: job } = await supabase
          .from('homeowner_jobs')
          .select('title, homeowner_id')
          .eq('id', paymentHold.job_id)
          .single()

        const { data: homeownerAuth } = await supabase.auth.admin.getUserById(paymentHold.homeowner_id)
        const { data: contractorAuth } = await supabase.auth.admin.getUserById(paymentHold.contractor_id)

        const { data: homeowner } = await supabase
          .from('user_profiles')
          .select('name')
          .eq('id', paymentHold.homeowner_id)
          .single()

        const { data: contractor } = await supabase
          .from('pro_contractors')
          .select('name, business_name')
          .eq('id', paymentHold.contractor_id)
          .single()

        const contractorName = contractor?.business_name || contractor?.name || 'Contractor'

        // Send email notifications
        if (homeownerAuth?.user?.email && contractorAuth?.user?.email && job && homeowner && contractor) {
          await notifyPaymentCompleted({
            homeownerEmail: homeownerAuth.user.email,
            homeownerName: homeowner.name,
            contractorEmail: contractorAuth.user.email,
            contractorName: contractorName,
            jobTitle: job.title,
            amount: parseFloat(updated.contractor_payout)
          })
        }

        // Send SMS notifications
        if (homeowner && job) {
          // Get phone numbers
          const { data: homeownerProfile } = await supabase
            .from('user_profiles')
            .select('phone')
            .eq('id', paymentHold.homeowner_id)
            .single()

          const { data: contractorProfile } = await supabase
            .from('pro_contractors')
            .select('phone')
            .eq('id', paymentHold.contractor_id)
            .single()

          // SMS to homeowner
          if (homeownerProfile?.phone) {
            await sendWorkCompletedSMSHomeowner({
              homeownerPhone: homeownerProfile.phone,
              homeownerName: homeowner.name,
              contractorName: contractorName,
              jobTitle: job.title
            })
          }

          // SMS to contractor
          if (contractorProfile?.phone) {
            await sendWorkCompletedSMSContractor({
              contractorPhone: contractorProfile.phone,
              contractorName: contractorName,
              jobTitle: job.title,
              homeownerName: homeowner.name
            })
          }
        }
      } catch (emailError) {
        console.error('Failed to send payment completion notifications:', emailError)
        // Don't fail the request if notifications fail
      }
    }

    return NextResponse.json({
      success: true,
      bothConfirmed,
      paymentReleased: bothConfirmed,
      homeowerConfirmed: updated.homeowner_confirmed_complete,
      contractorConfirmed: updated.contractor_confirmed_complete
    })

  } catch (error: any) {
    console.error('Confirm completion error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to confirm completion' },
      { status: 500 }
    )
  }
}
