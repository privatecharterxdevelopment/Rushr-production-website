import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/push/register
 * Registers a device push token for a user.
 * Body: { userId, token, platform }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, token, platform = 'ios' } = await request.json()

    if (!userId || !token) {
      return NextResponse.json({ error: 'userId and token required' }, { status: 400 })
    }

    // Upsert the token (update timestamp if already exists)
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { user_id: userId, token, platform, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' }
      )

    if (error) {
      console.error('Failed to register push token:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Push register error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * DELETE /api/push/register
 * Removes a device push token (e.g., on logout).
 * Body: { userId, token }
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId, token } = await request.json()

    if (!userId || !token) {
      return NextResponse.json({ error: 'userId and token required' }, { status: 400 })
    }

    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
