// app/api/direct-offers/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCustomOffer } from '../../../../lib/emailService'
import { sendDirectOfferSMS } from '../../../../lib/smsService'

export async function POST(request: NextRequest) {
  try {
    // Get session from cookies
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.split(' ')[1] || request.cookies.get('rushr-auth-token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized - No token provided' }, { status: 401 })
    }

    // Auth client to verify user identity
    const authSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` }
        }
      }
    )

    // Get authenticated user from session
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser()

    if (authError || !user) {
      console.error('[DirectOffer] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 })
    }

    console.log('[DirectOffer] Authenticated user:', user.id)

    // Service role client for DB operations (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Parse request body
    const body = await request.json()

    const {
      contractor_id,
      title,
      description,
      category,
      priority = 'normal',
      offered_amount,
      estimated_duration_hours,
      preferred_start_date,
      address,
      city,
      state,
      zip,
      latitude,
      longitude,
      homeowner_notes,
    } = body

    // Validate required fields
    if (!contractor_id || !title || !description || !category || !offered_amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify contractor exists
    const { data: contractor, error: contractorError } = await supabase
      .from('pro_contractors')
      .select('id, categories, specialties, name, business_name, phone')
      .eq('id', contractor_id)
      .single()

    if (contractorError || !contractor) {
      console.error('[DirectOffer] Contractor lookup error:', contractorError)
      return NextResponse.json(
        { error: 'Contractor not found' },
        { status: 404 }
      )
    }

    // Create the direct offer
    const { data: offerData, error: createError } = await supabase
      .from('direct_offers')
      .insert({
        homeowner_id: user.id,
        contractor_id,
        title,
        description,
        category,
        priority,
        offered_amount: parseFloat(offered_amount),
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        estimated_duration_hours: estimated_duration_hours
          ? parseInt(estimated_duration_hours)
          : null,
        preferred_start_date: preferred_start_date || null,
        homeowner_notes: homeowner_notes || null,
      })
      .select('id')
      .single()

    if (createError) {
      console.error('[DirectOffer] Insert error:', createError)
      return NextResponse.json(
        { error: createError.message || 'Failed to create offer' },
        { status: 500 }
      )
    }

    const offerId = offerData?.id
    console.log('[DirectOffer] Created offer:', offerId)

    // Send notifications (non-blocking)
    try {
      const { data: contractorAuth } = await supabase.auth.admin.getUserById(contractor_id)

      const { data: homeowner } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('id', user.id)
        .single()

      const contractorName = contractor.business_name || contractor.name || 'Professional'

      // Send email notification
      if (contractorAuth?.user?.email && homeowner) {
        await notifyCustomOffer({
          contractorEmail: contractorAuth.user.email,
          contractorName: contractorName,
          homeownerName: homeowner.name,
          jobTitle: title,
          offeredAmount: parseFloat(offered_amount),
          jobDescription: description,
          category: category
        })
      }

      // Send SMS notification
      if (contractor.phone && homeowner) {
        await sendDirectOfferSMS({
          contractorPhone: contractor.phone,
          contractorName: contractorName,
          homeownerName: homeowner.name,
          jobTitle: title,
          offeredAmount: parseFloat(offered_amount)
        })
      }
    } catch (notifyError) {
      console.error('[DirectOffer] Notification error (non-blocking):', notifyError)
    }

    return NextResponse.json(
      {
        success: true,
        offer_id: offerId,
        message: 'Offer created successfully',
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('[DirectOffer] Unhandled error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
