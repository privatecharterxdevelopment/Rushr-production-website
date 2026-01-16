import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client with service role key for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contractors, category, searchQuery, userLocation, urgent } = body

    if (!contractors || !Array.isArray(contractors) || contractors.length === 0) {
      return NextResponse.json({ error: 'No contractors provided' }, { status: 400 })
    }

    // Get contractor details for notifications
    const { data: contractorData, error: fetchError } = await supabase
      .from('pro_contractors')
      .select('id, name, business_name, phone, email')
      .in('id', contractors)

    if (fetchError) {
      console.error('Error fetching contractors:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch contractor data' }, { status: 500 })
    }

    // Create notifications for each contractor
    const notifications = contractorData?.map(contractor => ({
      user_id: contractor.id,
      type: 'new_job_match',
      title: urgent ? '🚨 Urgent Job Request!' : '📍 New Job Request Nearby',
      message: `A homeowner is looking for ${category || 'a professional'} in your area. Respond quickly to get this job!`,
      metadata: {
        category,
        searchQuery,
        userLocation,
        urgent,
        timestamp: new Date().toISOString()
      },
      is_read: false,
      created_at: new Date().toISOString()
    })) || []

    // Insert notifications
    if (notifications.length > 0) {
      const { error: notifyError } = await supabase
        .from('notifications')
        .insert(notifications)

      if (notifyError) {
        console.error('Error creating notifications:', notifyError)
        // Don't fail the request, just log the error
      }
    }

    // TODO: Send push notifications / SMS to contractors who have opted in
    // This would integrate with Twilio for SMS and/or FCM for push notifications

    // For now, we'll also try to send emails to contractors
    const emailPromises = contractorData?.map(async (contractor) => {
      if (!contractor.email) return

      try {
        // Call the email notification API (if it exists)
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: contractor.email,
            subject: urgent ? '🚨 Urgent Job Request on Rushr!' : '📍 New Job Request on Rushr',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 20px; text-align: center;">
                  <h1 style="color: white; margin: 0;">Rushr</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                  <h2 style="color: #111827; margin-top: 0;">
                    ${urgent ? '🚨 Urgent Job Request!' : '📍 New Job Request Nearby'}
                  </h2>
                  <p style="color: #4b5563; font-size: 16px;">
                    A homeowner is looking for <strong>${category || 'a professional'}</strong> in your area.
                  </p>
                  ${searchQuery ? `<p style="color: #6b7280; font-size: 14px;">Search query: "${searchQuery}"</p>` : ''}
                  <div style="background: #fff; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
                    <p style="color: #111827; font-weight: bold; margin: 0 0 10px 0;">
                      ⚡ Respond quickly to get this job!
                    </p>
                    <p style="color: #6b7280; font-size: 14px; margin: 0;">
                      The homeowner will be connected with the first available pro.
                    </p>
                  </div>
                  <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard/contractor"
                     style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                    Go to Dashboard →
                  </a>
                </div>
                <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
                  You received this because you're a Rushr Pro contractor.
                </div>
              </div>
            `
          })
        })
      } catch (emailError) {
        console.error('Error sending email to contractor:', emailError)
      }
    }) || []

    await Promise.allSettled(emailPromises)

    return NextResponse.json({
      success: true,
      notified: contractors.length,
      message: `Notified ${contractors.length} contractors`
    })

  } catch (error) {
    console.error('Error in notify-contractors-instant-match:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
