import { NextResponse } from 'next/server'
import { getStripe } from '../../../../lib/stripe'
import { createClient } from '@supabase/supabase-js'


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Get user's Stripe customer ID from database
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    if (profileError || !profile?.stripe_customer_id) {
      return NextResponse.json({
        success: true,
        charges: []
      })
    }

    // Fetch all charges for this customer from Stripe
    const charges = await getStripe().charges.list({
      customer: profile.stripe_customer_id,
      limit: 100,
      expand: ['data.payment_intent']
    })

    return NextResponse.json({
      success: true,
      charges: charges.data
    })
  } catch (error: any) {
    console.error('Error fetching Stripe transactions:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch transactions'
      },
      { status: 500 }
    )
  }
}
