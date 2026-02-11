// app/api/notify-contractor-booking/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/notify-contractor-booking
 * Creates a booking request (direct_offer) and sends email to contractor for acceptance
 */
export async function POST(request: NextRequest) {
  try {
    const {
      contractorId,
      contractorName,
      category,
      jobDescription,
      userLocation,
      locationName,
      homeownerId,
      homeownerEmail,
      estimatedAmount,
      hourlyRate
    } = await request.json()

    if (!contractorId || !homeownerId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get homeowner details
    const { data: homeowner } = await supabase
      .from('user_profiles')
      .select('name, phone')
      .eq('id', homeownerId)
      .single()

    // Get contractor details
    const { data: contractor } = await supabase
      .from('pro_contractors')
      .select('id, name, business_name, hourly_rate, email')
      .eq('id', contractorId)
      .single()

    if (!contractor) {
      return NextResponse.json(
        { error: 'Contractor not found' },
        { status: 404 }
      )
    }

    // Get contractor's auth email (if not in pro_contractors table)
    let contractorEmail = contractor.email
    if (!contractorEmail) {
      const { data: contractorAuth } = await supabase.auth.admin.getUserById(contractorId)
      contractorEmail = contractorAuth?.user?.email
    }

    if (!contractorEmail) {
      console.error('Contractor email not found for ID:', contractorId)
      return NextResponse.json(
        { error: 'Contractor email not found' },
        { status: 404 }
      )
    }

    // Calculate estimated amount based on hourly rate if not provided
    const rate = hourlyRate || contractor.hourly_rate || 65
    const amount = estimatedAmount || rate * 2 // Default 2 hours estimate

    // Truncate state to 2 chars (VARCHAR(2) in DB) — might receive full name
    const stateVal = userLocation?.state
      ? userLocation.state.substring(0, 2).toUpperCase()
      : null

    // Create booking request in direct_offers table
    const { data: bookingRequest, error: bookingError } = await supabase
      .from('direct_offers')
      .insert({
        homeowner_id: homeownerId,
        contractor_id: contractorId,
        title: `${category || 'Home'} Service Request`,
        description: jobDescription || `${category || 'Home'} service needed`,
        category: category || 'other',
        priority: 'normal',
        offered_amount: amount,
        status: 'pending',
        contractor_response: null,
        address: locationName || null,
        city: userLocation?.city || null,
        state: stateVal,
        zip: userLocation?.zip || null,
        latitude: userLocation?.lat || null,
        longitude: userLocation?.lng || null,
        homeowner_notes: jobDescription || null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      })
      .select()
      .single()

    if (bookingError) {
      console.error('Error creating booking request:', JSON.stringify(bookingError, null, 2))
      return NextResponse.json(
        { error: `Failed to create booking request: ${bookingError.message || bookingError.code || 'Unknown error'}` },
        { status: 500 }
      )
    }

    // Generate accept/decline URLs
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://userushr.com'
    const acceptUrl = `${baseUrl}/api/booking/accept?id=${bookingRequest.id}&action=accept`
    const declineUrl = `${baseUrl}/api/booking/accept?id=${bookingRequest.id}&action=decline`
    const dashboardUrl = `${baseUrl}/dashboard/contractor`

    // Email HTML template
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">New Booking Request!</h1>
        </div>

        <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px;">Hi ${contractor.business_name || contractor.name},</p>

          <p><strong>${homeowner?.name || 'A homeowner'}</strong> wants to book you for a job:</p>

          <div style="background: white; border: 1px solid #E5E7EB; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>Service:</strong> ${category}</p>
            <p style="margin: 8px 0;"><strong>Description:</strong> ${jobDescription || 'Service needed'}</p>
            ${locationName ? `<p style="margin: 8px 0;"><strong>Location:</strong> ${locationName}</p>` : ''}
            <p style="margin: 8px 0;"><strong>Estimated Amount:</strong> $${amount.toFixed(2)}</p>
          </div>

          <p style="font-size: 14px; color: #6B7280;">
            When you accept, the homeowner's payment method will be charged and funds held in escrow until job completion.
          </p>

          <div style="margin: 30px 0; text-align: center;">
            <a href="${acceptUrl}"
               style="display: inline-block; background: #10B981; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-right: 10px;">
              Accept Job
            </a>
            <a href="${declineUrl}"
               style="display: inline-block; background: #F3F4F6; color: #374151; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; border: 1px solid #D1D5DB;">
              Decline
            </a>
          </div>

          <p style="font-size: 14px; color: #6B7280; text-align: center;">
            Or view all requests in your <a href="${dashboardUrl}" style="color: #10B981;">dashboard</a>
          </p>

          <p style="margin-top: 30px;">Best regards,<br><strong>The Rushr Team</strong></p>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #6B7280; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Rushr. All rights reserved.</p>
        </div>
      </div>
    `

    // Send email via Supabase edge function
    try {
      const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: contractorEmail,
          subject: `New Booking Request: ${category} - ${homeowner?.name || 'Homeowner'}`,
          html: emailHtml,
          text: `Hi ${contractor.business_name || contractor.name}, ${homeowner?.name || 'A homeowner'} wants to book you for ${category}. Amount: $${amount.toFixed(2)}. Accept at: ${acceptUrl}`
        }),
      })

      if (!emailResponse.ok) {
        console.error('Failed to send email:', await emailResponse.text())
      } else {
        console.log('✅ Booking notification email sent to:', contractorEmail)
      }
    } catch (emailError) {
      console.error('Error sending booking notification email:', emailError)
      // Don't fail the request if email fails
    }

    // Create in-app notification for contractor
    try {
      await supabase.from('notifications').insert({
        user_id: contractorId,
        type: 'booking_request',
        title: 'New Booking Request',
        message: `${homeowner?.name || 'A homeowner'} wants to book you for ${category}`,
        data: {
          booking_id: bookingRequest.id,
          homeowner_name: homeowner?.name,
          category,
          amount
        },
        read: false
      })
    } catch (notifError) {
      console.log('Note: Could not create in-app notification:', notifError)
    }

    return NextResponse.json({
      success: true,
      bookingId: bookingRequest.id,
      message: 'Booking request sent to contractor'
    })

  } catch (error: any) {
    console.error('Notify contractor booking error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send booking request' },
      { status: 500 }
    )
  }
}
