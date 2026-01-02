import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


/**
 * GET /api/stripe/customer/payment-methods?userId=xxx
 * Fetches payment methods for a customer
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user ID' },
        { status: 400 }
      )
    }

    // Get customer from database
    const { data: customer } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id, default_payment_method_id')
      .eq('user_id', userId)
      .single()

    if (!customer) {
      return NextResponse.json({
        success: true,
        paymentMethods: [],
        defaultPaymentMethodId: null
      })
    }

    // Fetch payment methods from Stripe
    const paymentMethods = await getStripe().paymentMethods.list({
      customer: customer.stripe_customer_id,
      type: 'card'
    })

    return NextResponse.json({
      success: true,
      paymentMethods: paymentMethods.data,
      defaultPaymentMethodId: customer.default_payment_method_id,
      customerId: customer.stripe_customer_id
    })

  } catch (error: any) {
    console.error('Fetch payment methods error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch payment methods' },
      { status: 500 }
    )
  }
}
