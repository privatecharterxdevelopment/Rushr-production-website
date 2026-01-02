import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


/**
 * POST /api/stripe/customer/setup-intent
 * Creates a Setup Intent for adding payment methods
 */
export async function POST(request: NextRequest) {
  try {
    const { customerId } = await request.json()

    if (!customerId) {
      return NextResponse.json(
        { error: 'Missing customer ID' },
        { status: 400 }
      )
    }

    // Create Setup Intent
    const setupIntent = await getStripe().setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      metadata: {
        platform: 'rushr'
      }
    })

    return NextResponse.json({
      success: true,
      clientSecret: setupIntent.client_secret
    })

  } catch (error: any) {
    console.error('Create setup intent error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create setup intent' },
      { status: 500 }
    )
  }
}
