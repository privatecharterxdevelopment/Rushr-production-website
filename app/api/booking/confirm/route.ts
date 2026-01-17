import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const bookingId = searchParams.get('id')
    const action = searchParams.get('action') // 'confirm' or 'decline'

    if (!bookingId || !action) {
      return NextResponse.redirect(new URL('/pro?error=invalid-link', req.url))
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://rushr.app'

    // Update booking request status
    const newStatus = action === 'confirm' ? 'accepted' : 'declined'

    const { data: booking, error } = await supabaseAdmin
      .from('booking_requests')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString()
      })
      .eq('id', bookingId)
      .select('*, homeowner_id, contractor_id, category, description')
      .single()

    if (error) {
      console.error('Error updating booking:', error)
      // Redirect to dashboard even if error (booking might not exist yet)
      return NextResponse.redirect(new URL(`/dashboard/contractor?booking=${action}`, baseUrl))
    }

    // Notify homeowner of contractor's response
    if (booking?.homeowner_id) {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: booking.homeowner_id,
          type: action === 'confirm' ? 'booking_accepted' : 'booking_declined',
          title: action === 'confirm'
            ? 'Your request was accepted!'
            : 'Request update',
          message: action === 'confirm'
            ? `A contractor has accepted your ${booking.category} request and will contact you soon.`
            : `The contractor is not available for your ${booking.category} request. Try another pro!`,
          data: { bookingId, action },
          read: false,
          created_at: new Date().toISOString()
        })
    }

    // Redirect contractor to their dashboard with success message
    const redirectUrl = action === 'confirm'
      ? `/dashboard/contractor?booking=accepted&id=${bookingId}`
      : `/dashboard/contractor?booking=declined`

    return NextResponse.redirect(new URL(redirectUrl, baseUrl))

  } catch (error) {
    console.error('Error in booking confirm:', error)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://rushr.app'
    return NextResponse.redirect(new URL('/dashboard/contractor?error=something-went-wrong', baseUrl))
  }
}
