import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUser } from '../../../../lib/pushService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/push/send
 * Sends a push notification to a user.
 * Body: { recipientId, title, body, data? }
 */
export async function POST(request: NextRequest) {
  try {
    const { recipientId, title, body, data } = await request.json()

    if (!recipientId || !title || !body) {
      return NextResponse.json(
        { error: 'recipientId, title, and body required' },
        { status: 400 }
      )
    }

    const result = await sendPushToUser(supabase, recipientId, {
      title,
      body,
      data,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    // Don't fail the request if push fails — it's a best-effort notification
    console.error('Push send error:', err)
    return NextResponse.json({ sent: 0, errors: [err.message] })
  }
}
