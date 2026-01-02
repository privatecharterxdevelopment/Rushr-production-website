import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyNewJob } from '../../../lib/emailService'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * POST /api/notify-contractors-new-job
 *
 * Sends email notifications to all approved contractors in the job's ZIP area
 * Called after a new job is posted by a homeowner
 */
export async function POST(req: Request) {
  try {
    const { jobId, jobTitle, jobCategory, jobAddress, jobZip } = await req.json()

    if (!jobId || !jobZip) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Find all approved contractors who service this ZIP code
    const { data: contractors, error } = await supabase
      .from('pro_contractors')
      .select('id, name, email, service_area_zips, base_zip, categories')
      .eq('status', 'approved')

    if (error) {
      console.error('Error fetching contractors:', error)
      return NextResponse.json({ error: 'Failed to fetch contractors' }, { status: 500 })
    }

    if (!contractors || contractors.length === 0) {
      return NextResponse.json({ message: 'No contractors to notify', notified: 0 })
    }

    // Filter contractors who service this ZIP
    const matchingContractors = contractors.filter(c => {
      const serviceZips = c.service_area_zips || []
      const baseZip = c.base_zip
      return serviceZips.includes(jobZip) || baseZip === jobZip
    })

    console.log(`[NEW JOB] Found ${matchingContractors.length} contractors in ZIP ${jobZip}`)

    // Send emails to matching contractors (non-blocking)
    let notifiedCount = 0
    const emailPromises = matchingContractors.map(async (contractor) => {
      if (!contractor.email) return

      try {
        await notifyNewJob({
          contractorEmail: contractor.email,
          contractorName: contractor.name || 'Contractor',
          jobTitle: jobTitle || 'New Emergency Job',
          jobCategory: jobCategory || 'General',
          jobAddress: jobAddress || `ZIP: ${jobZip}`,
          jobId: jobId
        })
        notifiedCount++
        console.log(`[NEW JOB] Email sent to ${contractor.email}`)
      } catch (emailError) {
        console.error(`[NEW JOB] Failed to email ${contractor.email}:`, emailError)
      }
    })

    // Wait for all emails to be sent
    await Promise.allSettled(emailPromises)

    return NextResponse.json({
      success: true,
      message: `Notified ${notifiedCount} contractors`,
      notified: notifiedCount,
      total: matchingContractors.length
    })

  } catch (err: any) {
    console.error('[NEW JOB] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
