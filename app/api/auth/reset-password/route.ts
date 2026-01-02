import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Create supabase admin client lazily to avoid build-time errors
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      )
    }

    // Check homeowner table for token
    const { data: homeowner } = await supabaseAdmin
      .from('user_profiles')
      .select('id, user_id, reset_token_expiry')
      .eq('reset_token', token)
      .maybeSingle()

    // Check contractor table for token
    const { data: contractor } = await supabaseAdmin
      .from('pro_contractors')
      .select('id, user_id, reset_token_expiry')
      .eq('reset_token', token)
      .maybeSingle()

    const profile = homeowner || contractor
    const tableName = homeowner ? 'user_profiles' : 'pro_contractors'

    if (!profile) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      )
    }

    // Check if token is expired
    const expiry = new Date(profile.reset_token_expiry)
    if (expiry < new Date()) {
      return NextResponse.json(
        { error: 'Reset token has expired' },
        { status: 400 }
      )
    }

    // Update user password in Supabase Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      profile.user_id,
      { password: password }
    )

    if (updateError) {
      console.error('Error updating password:', updateError)
      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      )
    }

    // Clear reset token from the appropriate table
    await supabaseAdmin
      .from(tableName)
      .update({
        reset_token: null,
        reset_token_expiry: null
      })
      .eq('id', profile.id)

    console.log(`Password reset successfully for ${homeowner ? 'homeowner' : 'contractor'}:`, profile.user_id)

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully'
    })

  } catch (error: any) {
    console.error('Error resetting password:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
