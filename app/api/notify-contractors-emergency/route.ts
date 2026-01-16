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
    const { contractors, category, searchQuery, userLocation, emergency } = body

    if (!contractors || !Array.isArray(contractors) || contractors.length === 0) {
      return NextResponse.json({ error: 'No contractors provided' }, { status: 400 })
    }

    // Get contractor details for notifications
    const { data: contractorData, error: fetchError } = await supabase
      .from('pro_contractors')
      .select('id, name, business_name, phone, email, availability')
      .in('id', contractors)

    if (fetchError) {
      console.error('Error fetching contractors:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch contractor data' }, { status: 500 })
    }

    // Create emergency notifications for ALL contractors (regardless of online status)
    const notifications = contractorData?.map(contractor => ({
      user_id: contractor.id,
      type: 'new_job_match',
      title: '🆘 EMERGENCY - No Pros Available!',
      message: `A homeowner urgently needs ${category || 'help'} but no pros are online. Go online now to help!`,
      metadata: {
        category,
        searchQuery,
        userLocation,
        emergency: true,
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
      }
    }

    // Send urgent emails to all contractors in the category
    const emailPromises = contractorData?.map(async (contractor) => {
      if (!contractor.email) return

      try {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: contractor.email,
            subject: '🆘 EMERGENCY - Homeowner Needs Help Now!',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 20px; text-align: center;">
                  <h1 style="color: white; margin: 0;">🆘 EMERGENCY</h1>
                </div>
                <div style="padding: 30px; background: #fef2f2;">
                  <h2 style="color: #991b1b; margin-top: 0;">
                    No Pros Available - Homeowner Needs Help!
                  </h2>
                  <p style="color: #4b5563; font-size: 16px;">
                    A homeowner urgently needs <strong>${category || 'a professional'}</strong> but no pros are currently online in their area.
                  </p>
                  ${searchQuery ? `<p style="color: #6b7280; font-size: 14px;">Their request: "${searchQuery}"</p>` : ''}
                  <div style="background: #fff; border-radius: 8px; padding: 20px; margin: 20px 0; border: 2px solid #dc2626;">
                    <p style="color: #991b1b; font-weight: bold; margin: 0 0 10px 0; font-size: 18px;">
                      💰 High-value opportunity!
                    </p>
                    <p style="color: #4b5563; font-size: 14px; margin: 0;">
                      Emergency jobs often pay premium rates. Go online now to claim this job!
                    </p>
                  </div>
                  <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard/contractor"
                     style="display: inline-block; background: #dc2626; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                    🚀 Go Online Now →
                  </a>
                </div>
                <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
                  You received this emergency alert because you're a Rushr Pro contractor for ${category || 'this service'}.
                </div>
              </div>
            `
          })
        })
      } catch (emailError) {
        console.error('Error sending emergency email to contractor:', emailError)
      }
    }) || []

    await Promise.allSettled(emailPromises)

    // TODO: Send SMS alerts for emergency requests
    // This would use Twilio to send urgent SMS to all contractors

    return NextResponse.json({
      success: true,
      notified: contractors.length,
      message: `Sent emergency notifications to ${contractors.length} contractors`
    })

  } catch (error) {
    console.error('Error in notify-contractors-emergency:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
