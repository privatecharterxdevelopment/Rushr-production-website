import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


/**
 * POST /api/stripe/customer/create
 * Creates a Stripe customer for homeowner to make payments
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, email, name } = await request.json()

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Check if customer already exists
    const { data: existingCustomer } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single()

    if (existingCustomer) {
      return NextResponse.json({
        success: true,
        customerId: existingCustomer.stripe_customer_id,
        alreadyExists: true
      })
    }

    // Create Stripe customer
    const customer = await getStripe().customers.create({
      email: email,
      name: name,
      metadata: {
        user_id: userId,
        platform: 'rushr',
        role: 'homeowner'
      }
    })

    // Save to database (use upsert to handle race conditions)
    const { error: dbError } = await supabase
      .from('stripe_customers')
      .upsert({
        user_id: userId,
        stripe_customer_id: customer.id,
        email: email,
        name: name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })

    if (dbError) {
      console.error('Failed to save customer to DB:', dbError)
      return NextResponse.json(
        { error: 'Failed to save customer to database' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      customerId: customer.id
    })

  } catch (error: any) {
    console.error('Create customer error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create customer' },
      { status: 500 }
    )
  }
}
