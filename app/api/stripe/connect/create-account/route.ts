import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


/**
 * POST /api/stripe/connect/create-account
 * Creates a Stripe Connect account for contractor after wizard completion
 */
export async function POST(request: NextRequest) {
  try {
    const { contractorId, email, businessName, name } = await request.json()

    if (!contractorId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Check if Connect account already exists
    const { data: existingAccount } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id, onboarding_complete')
      .eq('contractor_id', contractorId)
      .single()

    if (existingAccount) {
      return NextResponse.json({
        success: true,
        accountId: existingAccount.stripe_account_id,
        onboardingComplete: existingAccount.onboarding_complete,
        alreadyExists: true
      })
    }

    // Create Stripe Connect Express account
    const account = await getStripe().accounts.create({
      type: 'express',
      email: email,
      business_type: 'individual', // Can be updated during onboarding
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      business_profile: {
        name: businessName || name,
        product_description: 'Home service professional on Rushr platform',
        mcc: '1799', // Special Trade Contractors
      },
      metadata: {
        contractor_id: contractorId,
        platform: 'rushr'
      }
    })

    // Save to database
    const { error: dbError } = await supabase
      .from('stripe_connect_accounts')
      .insert({
        contractor_id: contractorId,
        stripe_account_id: account.id,
        onboarding_complete: false,
        charges_enabled: false,
        payouts_enabled: false,
        email: email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (dbError) {
      console.error('Failed to save Connect account to DB:', dbError)
      // Don't fail the request - account is created in Stripe
    }

    return NextResponse.json({
      success: true,
      accountId: account.id,
      onboardingComplete: false
    })

  } catch (error: any) {
    console.error('Create Connect account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create Connect account' },
      { status: 500 }
    )
  }
}
