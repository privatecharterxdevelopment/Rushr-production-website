import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/booking/active
 * Gets active booking between homeowner and contractor
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const homeownerId = searchParams.get('homeownerId')
  const contractorId = searchParams.get('contractorId')

  if (!homeownerId || !contractorId) {
    return NextResponse.json(
      { success: false, error: 'Missing homeownerId or contractorId' },
      { status: 400 }
    )
  }

  try {
    // Look for active direct offers (bookings) between the parties
    const { data: booking, error } = await supabase
      .from('direct_offers')
      .select(`
        *,
        payment_holds (
          id,
          amount,
          status,
          stripe_payment_intent_id
        )
      `)
      .eq('homeowner_id', homeownerId)
      .eq('contractor_id', contractorId)
      .in('status', ['pending', 'accepted', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching active booking:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch booking' },
        { status: 500 }
      )
    }

    if (!booking) {
      // Check for jobs with accepted bids instead
      const { data: job } = await supabase
        .from('homeowner_jobs')
        .select(`
          *,
          payment_holds (
            id,
            amount,
            status,
            stripe_payment_intent_id
          )
        `)
        .eq('homeowner_id', homeownerId)
        .eq('contractor_id', contractorId)
        .in('status', ['pending', 'confirmed', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (job) {
        return NextResponse.json({
          success: true,
          booking: {
            id: job.id,
            type: 'job',
            amount: job.payment_holds?.[0]?.amount || job.budget || 0,
            status: job.status,
            paymentHoldId: job.payment_holds?.[0]?.id
          }
        })
      }

      return NextResponse.json({ success: true, booking: null })
    }

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        type: 'direct_offer',
        amount: booking.payment_holds?.[0]?.amount || booking.offered_amount || 0,
        status: booking.status,
        paymentHoldId: booking.payment_holds?.[0]?.id
      }
    })

  } catch (error: any) {
    console.error('Active booking error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Server error' },
      { status: 500 }
    )
  }
}
