import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      contractorId,
      contractorName,
      category,
      jobDescription,
      userLocation,
      locationName,
      homeownerId,
      homeownerEmail
    } = body

    if (!contractorId) {
      return NextResponse.json({ error: 'Contractor ID required' }, { status: 400 })
    }

    // Get contractor's email from database
    const { data: contractor, error: contractorError } = await supabaseAdmin
      .from('pro_contractors')
      .select('email, name, business_name')
      .eq('id', contractorId)
      .single()

    if (contractorError || !contractor?.email) {
      console.error('Error fetching contractor:', contractorError)
      return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })
    }

    // Get homeowner's profile for name
    let homeownerName = 'A homeowner'
    if (homeownerId) {
      const { data: homeowner } = await supabaseAdmin
        .from('homeowner_profiles')
        .select('full_name')
        .eq('id', homeownerId)
        .single()

      if (homeowner?.full_name) {
        homeownerName = homeowner.full_name
      }
    }

    // Try to create a booking request record in database
    let bookingId = `temp_${Date.now()}`
    try {
      const { data: bookingRequest, error: bookingError } = await supabaseAdmin
        .from('booking_requests')
        .insert({
          contractor_id: contractorId,
          homeowner_id: homeownerId,
          category,
          description: jobDescription,
          location_name: locationName,
          latitude: userLocation?.lat,
          longitude: userLocation?.lng,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (bookingRequest?.id) {
        bookingId = bookingRequest.id
      }
    } catch (bookingError) {
      console.log('Note: booking_requests table may not exist, continuing with notification')
    }

    // Generate confirm/decline URLs
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://rushr.app'
    const confirmUrl = `${baseUrl}/api/booking/confirm?id=${bookingId}&action=confirm`
    const declineUrl = `${baseUrl}/api/booking/confirm?id=${bookingId}&action=decline`

    // Send email notification to contractor using Supabase Edge Function or direct email
    // For now, we'll create an in-app notification and log the email content

    // Create in-app notification for contractor
    try {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: contractorId,
          type: 'booking_request',
          title: `New ${category} request`,
          message: `${homeownerName} needs ${category?.toLowerCase()} help: "${jobDescription}"`,
          data: {
            bookingId,
            category,
            jobDescription,
            locationName,
            homeownerId,
            homeownerEmail,
            confirmUrl,
            declineUrl
          },
          read: false,
          created_at: new Date().toISOString()
        })
    } catch (notifError) {
      console.log('Note: notifications table may not exist, continuing with email')
    }

    // Send email via Resend (if configured) or Supabase email
    const RESEND_API_KEY = process.env.RESEND_API_KEY

    if (RESEND_API_KEY) {
      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">New Service Request</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">via Rushr</p>
            </div>

            <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="color: #334155; font-size: 16px; margin: 0 0 20px 0;">
                Hi ${contractor.business_name || contractor.name},
              </p>

              <p style="color: #334155; font-size: 16px; margin: 0 0 20px 0;">
                <strong>${homeownerName}</strong> is looking for <strong>${category}</strong> help in your area.
              </p>

              <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #0f172a; margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Job Details</h3>
                <p style="color: #475569; margin: 0 0 10px 0;"><strong>Category:</strong> ${category}</p>
                <p style="color: #475569; margin: 0 0 10px 0;"><strong>Location:</strong> ${locationName || 'Near you'}</p>
                <p style="color: #475569; margin: 0;"><strong>Description:</strong> ${jobDescription}</p>
              </div>

              <div style="margin: 30px 0; text-align: center;">
                <a href="${confirmUrl}" style="display: inline-block; background: #10B981; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-right: 10px;">
                  Accept Request
                </a>
                <a href="${declineUrl}" style="display: inline-block; background: #f1f5f9; color: #475569; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                  Decline
                </a>
              </div>

              <p style="color: #64748b; font-size: 14px; margin: 20px 0 0 0; text-align: center;">
                Respond quickly to increase your chances of getting this job!
              </p>
            </div>

            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 20px;">
              This email was sent by Rushr. If you have questions, contact support@rushr.app
            </p>
          </div>
        `

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Rushr <notifications@rushr.app>',
            to: contractor.email,
            subject: `New ${category} Request - ${homeownerName} needs help`,
            html: emailHtml
          })
        })

        console.log('Email sent to contractor:', contractor.email)
      } catch (emailError) {
        console.error('Error sending email:', emailError)
        // Continue even if email fails - notification was created
      }
    } else {
      console.log('RESEND_API_KEY not configured - email not sent')
      console.log('Would send to:', contractor.email)
      console.log('Job details:', { category, jobDescription, locationName })
    }

    return NextResponse.json({
      success: true,
      message: 'Contractor notified',
      bookingId
    })

  } catch (error) {
    console.error('Error in notify-contractor-booking:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
