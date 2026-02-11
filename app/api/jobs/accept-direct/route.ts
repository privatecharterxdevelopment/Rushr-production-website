import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/jobs/accept-direct
 * Contractor accepts a direct payment job
 * Uses transaction + FOR UPDATE to prevent race conditions
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

    // Use RPC function for atomic acceptance (prevents race conditions)
    const { data, error } = await supabase.rpc('accept_direct_job', {
      p_job_id: jobId,
      p_contractor_id: contractorId
    })

    if (error) {
      console.error('[AcceptDirect] RPC error:', error)

      // Check if job was already taken
      if (error.message?.includes('already accepted') || error.message?.includes('not available')) {
        return NextResponse.json(
          { error: 'This job has already been taken by another contractor', alreadyTaken: true },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: error.message || 'Failed to accept job' },
        { status: 500 }
      )
    }

    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error || 'Failed to accept job', alreadyTaken: data?.already_taken },
        { status: data?.already_taken ? 409 : 400 }
      )
    }

    // Get contractor info for notifications
    const { data: contractor } = await supabase
      .from('pro_contractors')
      .select('name, business_name, phone, email')
      .eq('id', contractorId)
      .single()

    // Get job info for notifications
    const { data: job } = await supabase
      .from('homeowner_jobs')
      .select('title, homeowner_id, final_cost, category, address')
      .eq('id', jobId)
      .single()

    // Create notification for homeowner
    if (job) {
      await supabase.from('notifications').insert({
        user_id: job.homeowner_id,
        type: 'job_accepted',
        title: 'Contractor Accepted Your Job!',
        message: `${contractor?.business_name || contractor?.name || 'A contractor'} accepted your job "${job.title}" for $${job.final_cost?.toFixed(2)}`,
        job_id: jobId
      })

      // Create conversation between homeowner and contractor
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('homeowner_id', job.homeowner_id)
        .eq('pro_id', contractorId)
        .single()

      let conversationId = existingConv?.id

      if (!conversationId) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            homeowner_id: job.homeowner_id,
            pro_id: contractorId,
            title: `${job.category || 'Job'} - ${job.title}`,
            status: 'active'
          })
          .select('id')
          .single()

        conversationId = newConv?.id
      }

      // Send system message in conversation
      if (conversationId) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: contractorId,
          message_type: 'system',
          content: `Job accepted! ${contractor?.business_name || contractor?.name} will be handling "${job.title}" for $${job.final_cost?.toFixed(2)}. Payment is held in escrow.`
        })
      }

      // Send email notification to homeowner (non-blocking)
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: job.homeowner_id, // API will look up email
          template: 'job_accepted',
          data: {
            jobTitle: job.title,
            contractorName: contractor?.business_name || contractor?.name,
            amount: job.final_cost,
            jobId: jobId
          }
        })
      }).catch(err => console.error('Email send error:', err))
    }

    return NextResponse.json({
      success: true,
      message: 'Job accepted successfully',
      jobId: jobId,
      conversationId: data.conversation_id
    })

  } catch (error: any) {
    console.error('[AcceptDirect] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to accept job' },
      { status: 500 }
    )
  }
}
