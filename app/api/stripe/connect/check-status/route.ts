import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/stripe/connect/check-status
 * Checks Stripe Connect account status and updates database
 */
export async function POST(request: NextRequest) {
  try {
    const { contractorId } = await request.json()

    if (!contractorId) {
      return NextResponse.json(
        { error: 'Missing contractorId' },
        { status: 400 }
      )
    }

    // Get Stripe account from database
    const { data: connectAccount, error: fetchError } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id')
      .eq('contractor_id', contractorId)
      .single()

    if (fetchError || !connectAccount) {
      return NextResponse.json({
        success: true,
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsCurrentlyDue: [],
        message: 'No Stripe account found'
      })
    }

    // Fetch account status from Stripe
    const account = await getStripe().accounts.retrieve(connectAccount.stripe_account_id)

    // Update database with latest status
    await supabase
      .from('stripe_connect_accounts')
      .update({
        onboarding_complete: account.details_submitted || false,
        charges_enabled: account.charges_enabled || false,
        payouts_enabled: account.payouts_enabled || false,
        account_type: account.type,
        country: account.country,
        requirements_currently_due: account.requirements?.currently_due || [],
        requirements_eventually_due: account.requirements?.eventually_due || [],
        updated_at: new Date().toISOString()
      })
      .eq('contractor_id', contractorId)

    // Also update pro_contractors kyc_status if onboarding complete
    if (account.details_submitted && account.payouts_enabled) {
      await supabase
        .from('pro_contractors')
        .update({
          kyc_status: 'completed',
          kyc_completed_at: new Date().toISOString()
        })
        .eq('id', contractorId)
    }

    return NextResponse.json({
      success: true,
      onboardingComplete: account.details_submitted || false,
      chargesEnabled: account.charges_enabled || false,
      payoutsEnabled: account.payouts_enabled || false,
      requirementsCurrentlyDue: account.requirements?.currently_due || [],
      requirementsEventuallyDue: account.requirements?.eventually_due || [],
      accountStatus: {
        detailsSubmitted: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled
      }
    })

  } catch (error: any) {
    console.error('Check account status error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check account status' },
      { status: 500 }
    )
  }
}
