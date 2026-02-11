import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Verify the caller's auth token and optionally check it matches a userId.
 * Returns the authenticated user or a 401 response.
 */
export async function verifyAuth(
  request: NextRequest,
  requiredUserId?: string | null
): Promise<{ user: any; error?: NextResponse }> {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Unauthorized - no auth token' }, { status: 401 })
    }
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Unauthorized - invalid token' }, { status: 401 })
    }
  }

  // If a specific userId is required, verify it matches the caller
  if (requiredUserId && user.id !== requiredUserId) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Forbidden - user mismatch' }, { status: 403 })
    }
  }

  return { user }
}
