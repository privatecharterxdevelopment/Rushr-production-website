import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Use service role key to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { count, error } = await supabaseAdmin
      .from('homeowner_jobs')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('Error fetching job count:', error)
      return NextResponse.json({ count: null }, { status: 500 })
    }

    return NextResponse.json({ count })
  } catch (err) {
    console.error('Error in job-count API:', err)
    return NextResponse.json({ count: null }, { status: 500 })
  }
}
