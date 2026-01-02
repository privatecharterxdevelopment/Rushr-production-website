import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '../../../../lib/stripe'


export async function POST(request: NextRequest) {
  try {
    const { job_id, amount, description, type, customer_email } = await request.json()

    if (!job_id || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create Stripe checkout session
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: description || 'Job Payment',
              description: type === 'escrow' ? 'Escrow Payment - Held until job completion' : 'Job Payment'
            },
            unit_amount: Math.round(amount * 100) // Convert to cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payments/success?session_id={CHECKOUT_SESSION_ID}&job_id=${job_id}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/homeowner`,
      customer_email: customer_email,
      metadata: {
        job_id,
        type,
        description
      }
    })

    return NextResponse.json({
      sessionId: session.id,
      url: session.url
    })
  } catch (error: any) {
    console.error('Stripe checkout session error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
