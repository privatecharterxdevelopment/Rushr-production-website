import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20' as any
})

/**
 * GET /api/admin/contractor-stripe-link
 * Get a Stripe Express Dashboard login link for a contractor
 *
 * Query params: contractorId
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const contractorId = searchParams.get('contractorId')

    if (!contractorId) {
      return NextResponse.json(
        { error: 'Missing contractorId parameter' },
        { status: 400 }
      )
    }

    // Get contractor's Stripe account ID
    const { data: contractor, error } = await supabase
      .from('pro_contractors')
      .select('stripe_account_id, business_name, name')
      .eq('id', contractorId)
      .single()

    if (error || !contractor) {
      return NextResponse.json(
        { error: 'Contractor not found', details: error?.message },
        { status: 404 }
      )
    }

    if (!contractor.stripe_account_id) {
      return NextResponse.json(
        { error: 'Contractor has not connected their Stripe account yet', hasStripe: false },
        { status: 200 }
      )
    }

    // Get the Stripe account to check status
    const stripeAccount = await stripe.accounts.retrieve(contractor.stripe_account_id)

    // Create a login link for the Express Dashboard
    // Note: This only works for Express accounts that have completed onboarding
    try {
      const loginLink = await stripe.accounts.createLoginLink(contractor.stripe_account_id)

      return NextResponse.json({
        success: true,
        hasStripe: true,
        loginUrl: loginLink.url,
        stripeAccountId: contractor.stripe_account_id,
        payoutsEnabled: stripeAccount.payouts_enabled,
        chargesEnabled: stripeAccount.charges_enabled,
        detailsSubmitted: stripeAccount.details_submitted
      })
    } catch (linkError: any) {
      // If login link fails, it might be because onboarding isn't complete
      // Return the dashboard URL instead
      return NextResponse.json({
        success: true,
        hasStripe: true,
        loginUrl: null,
        stripeAccountId: contractor.stripe_account_id,
        payoutsEnabled: stripeAccount.payouts_enabled,
        chargesEnabled: stripeAccount.charges_enabled,
        detailsSubmitted: stripeAccount.details_submitted,
        note: 'Contractor onboarding may not be complete. Cannot generate dashboard link.'
      })
    }

  } catch (error: any) {
    console.error('Error getting Stripe link:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    )
  }
}
