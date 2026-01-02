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

    console.log('[DirectOffer] Auth header present:', !!authHeader)
    console.log('[DirectOffer] Token present:', !!token)

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized - No token provided' }, { status: 401 })
    }

    const supabase = createClient(
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
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[DirectOffer] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 })
    }

    console.log('[DirectOffer] Authenticated user:', user.id)

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
      .select('id')
      .eq('id', contractor_id)
      .single()

    if (contractorError || !contractor) {
      return NextResponse.json(
        { error: 'Contractor not found' },
        { status: 404 }
      )
    }

    // Create the direct offer using the function
    const { data: offerId, error: createError } = await supabase.rpc(
      'create_direct_offer',
      {
        p_contractor_id: contractor_id,
        p_title: title,
        p_description: description,
        p_category: category,
        p_offered_amount: parseFloat(offered_amount),
        p_priority: priority,
        p_address: address || null,
        p_city: city || null,
        p_state: state || null,
        p_zip: zip || null,
        p_latitude: latitude ? parseFloat(latitude) : null,
        p_longitude: longitude ? parseFloat(longitude) : null,
        p_estimated_duration_hours: estimated_duration_hours
          ? parseInt(estimated_duration_hours)
          : null,
        p_preferred_start_date: preferred_start_date || null,
        p_homeowner_notes: homeowner_notes || null,
      }
    )

    if (createError) {
      console.error('Error creating offer:', createError)
      return NextResponse.json(
        { error: createError.message || 'Failed to create offer' },
        { status: 500 }
      )
    }

    // Notification is automatically created by database trigger
    // (see notify_contractor_new_offer trigger)

    // Send email notification to contractor (non-blocking)
    try {
      const serviceSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { data: contractorAuth } = await serviceSupabase.auth.admin.getUserById(contractor_id)
      const { data: contractorProfile } = await serviceSupabase
        .from('pro_contractors')
        .select('name, business_name')
        .eq('id', contractor_id)
        .single()

      const { data: homeowner } = await serviceSupabase
        .from('user_profiles')
        .select('name')
        .eq('id', user.id)
        .single()

      const contractorName = contractorProfile?.business_name || contractorProfile?.name || 'Professional'

      // Send email notification
      if (contractorAuth?.user?.email && contractorProfile && homeowner) {
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
      const { data: contractorWithPhone } = await serviceSupabase
        .from('pro_contractors')
        .select('phone')
        .eq('id', contractor_id)
        .single()

      if (contractorWithPhone?.phone && homeowner) {
        await sendDirectOfferSMS({
          contractorPhone: contractorWithPhone.phone,
          contractorName: contractorName,
          homeownerName: homeowner.name,
          jobTitle: title,
          offeredAmount: parseFloat(offered_amount)
        })
      }
    } catch (emailError) {
      console.error('Failed to send custom offer notifications:', emailError)
      // Don't fail the request if notifications fail
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
    console.error('Error in create direct offer:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
