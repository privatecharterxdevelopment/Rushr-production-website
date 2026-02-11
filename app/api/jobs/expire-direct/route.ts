import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role key for this admin operation
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/jobs/expire-direct
 *
 * Converts expired direct payment jobs to bids mode.
 * Should be called by a cron job every 5 minutes.
 *
 * Can also be triggered with ?jobId=xxx to expire a specific job.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const specificJobId = searchParams.get('jobId')

    // Verify cron secret or admin access for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    // Allow if cron secret matches, or if called internally
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Check if this is an internal call (no auth header means internal)
      if (authHeader) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    let expiredJobs: any[] = []

    if (specificJobId) {
      // Expire a specific job
      const { data: job, error: fetchError } = await supabaseAdmin
        .from('homeowner_jobs')
        .select('id, homeowner_id, title, status, final_cost')
        .eq('id', specificJobId)
        .not('final_cost', 'is', null)
        .eq('status', 'pending')
        .single()

      if (fetchError || !job) {
        return NextResponse.json({
          success: false,
          error: 'Job not found or not eligible for expiration'
        })
      }

      expiredJobs = [job]
    } else {
      // Find all expired direct payment jobs
      // Find pending direct payment jobs older than 30 minutes
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const { data: jobs, error: fetchError } = await supabaseAdmin
        .from('homeowner_jobs')
        .select('id, homeowner_id, title, status, final_cost, created_at')
        .not('final_cost', 'is', null)
        .eq('status', 'pending')
        .lt('created_at', thirtyMinAgo)

      if (fetchError) {
        console.error('[ExpireDirect] Error fetching expired jobs:', fetchError)
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch expired jobs'
        }, { status: 500 })
      }

      expiredJobs = jobs || []
    }

    if (expiredJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired jobs to process',
        processed: 0
      })
    }

    console.log(`[ExpireDirect] Processing ${expiredJobs.length} expired jobs`)

    const results = []

    for (const job of expiredJobs) {
      try {
        // Update job to bids mode
        const { error: updateError } = await supabaseAdmin
          .from('homeowner_jobs')
          .update({
            status: 'bidding',
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        if (updateError) {
          console.error(`[ExpireDirect] Failed to update job ${job.id}:`, updateError)
          results.push({ jobId: job.id, success: false, error: updateError.message })
          continue
        }

        // Create notification for homeowner
        await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: job.homeowner_id,
            type: 'job_update',
            title: 'Job Converted to Bids',
            message: `No contractors accepted your direct payment for "${job.title}". Your job is now open for bids.`,
            link: `/jobs/${job.id}`,
            read: false
          })

        // Also send email notification
        try {
          await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: job.homeowner_id, // Will need to fetch email from users table
              template: 'job-converted-to-bids',
              data: {
                jobTitle: job.title,
                jobId: job.id
              }
            })
          })
        } catch (emailErr) {
          console.error(`[ExpireDirect] Failed to send email for job ${job.id}:`, emailErr)
        }

        console.log(`[ExpireDirect] Successfully converted job ${job.id} to bids mode`)
        results.push({ jobId: job.id, success: true })

      } catch (err) {
        console.error(`[ExpireDirect] Error processing job ${job.id}:`, err)
        results.push({ jobId: job.id, success: false, error: String(err) })
      }
    }

    const successCount = results.filter(r => r.success).length

    return NextResponse.json({
      success: true,
      message: `Processed ${expiredJobs.length} jobs, ${successCount} converted successfully`,
      processed: successCount,
      failed: results.filter(r => !r.success).length,
      results
    })

  } catch (error) {
    console.error('[ExpireDirect] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Also support GET for manual testing/health checks
export async function GET(request: NextRequest) {
  try {
    // Count pending direct payment jobs
    const { count, error } = await supabaseAdmin
      .from('homeowner_jobs')
      .select('*', { count: 'exact', head: true })
      .not('final_cost', 'is', null)
      .eq('status', 'pending')

    if (error) {
      return NextResponse.json({
        success: false,
        error: 'Failed to count pending jobs'
      }, { status: 500 })
    }

    // Count expired ones (older than 30 min)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { count: expiredCount, error: expiredError } = await supabaseAdmin
      .from('homeowner_jobs')
      .select('*', { count: 'exact', head: true })
      .not('final_cost', 'is', null)
      .eq('status', 'pending')
      .lt('created_at', thirtyMinAgo)

    return NextResponse.json({
      success: true,
      pendingDirectJobs: count || 0,
      expiredDirectJobs: expiredCount || 0,
      message: 'Use POST to process expired jobs'
    })

  } catch (error) {
    console.error('[ExpireDirect] GET Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
