import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia'
})

/**
 * POST /api/stripe/customer/save-card
 * Attaches a payment method to a customer and optionally sets it as default
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, paymentMethodId, setAsDefault = true } = await request.json()

    if (!userId || !paymentMethodId) {
      return NextResponse.json(
        { error: 'Missing userId or paymentMethodId' },
        { status: 400 }
      )
    }

    // 1. Get or create Stripe customer
    let stripeCustomerId: string

    const { data: existingCustomer } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single()

    if (existingCustomer) {
      stripeCustomerId = existingCustomer.stripe_customer_id
    } else {
      // Get user details
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('email, name')
        .eq('id', userId)
        .single()

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: userProfile?.email,
        name: userProfile?.name,
        metadata: {
          user_id: userId
        }
      })

      stripeCustomerId = customer.id

      // Save to database
      await supabase.from('stripe_customers').insert({
        user_id: userId,
        stripe_customer_id: customer.id,
        email: userProfile?.email,
        name: userProfile?.name
      })
    }

    // 2. Attach payment method to customer (if not already attached)
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId
      })
    } catch (err: any) {
      // Payment method might already be attached
      if (!err.message?.includes('already been attached')) {
        throw err
      }
    }

    // 3. Set as default payment method if requested
    if (setAsDefault) {
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      })

      // Update database
      await supabase
        .from('stripe_customers')
        .update({ default_payment_method_id: paymentMethodId })
        .eq('user_id', userId)
    }

    return NextResponse.json({
      success: true,
      message: 'Card saved successfully',
      paymentMethodId
    })

  } catch (error: any) {
    console.error('Save card error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save card' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/stripe/customer/save-card
 * Removes a payment method from a customer
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const paymentMethodId = searchParams.get('paymentMethodId')
    const userId = searchParams.get('userId')

    if (!paymentMethodId || !userId) {
      return NextResponse.json(
        { error: 'Missing paymentMethodId or userId' },
        { status: 400 }
      )
    }

    // Verify user owns this payment method
    const { data: customer } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id, default_payment_method_id')
      .eq('user_id', userId)
      .single()

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    // Detach payment method from Stripe
    await stripe.paymentMethods.detach(paymentMethodId)

    // If this was the default, clear it
    if (customer.default_payment_method_id === paymentMethodId) {
      await supabase
        .from('stripe_customers')
        .update({ default_payment_method_id: null })
        .eq('user_id', userId)
    }

    return NextResponse.json({
      success: true,
      message: 'Card removed successfully'
    })

  } catch (error: any) {
    console.error('Remove card error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to remove card' },
      { status: 500 }
    )
  }
}
