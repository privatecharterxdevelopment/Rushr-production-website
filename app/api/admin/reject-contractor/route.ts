import { NextRequest, NextResponse } from 'next/server'
import { notifyContractorRejected } from '../../../../lib/emailService'

/**
 * POST /api/admin/reject-contractor
 * Sends rejection email notification to contractor
 * (Status update is handled by the client directly via Supabase)
 */
export async function POST(request: NextRequest) {
  try {
    const { contractorEmail, contractorName, businessName, reason } = await request.json()

    if (!contractorEmail) {
      return NextResponse.json({ error: 'Missing contractorEmail' }, { status: 400 })
    }

    // Send email notification
    try {
      await notifyContractorRejected({
        contractorEmail,
        contractorName,
        businessName,
        reason: reason || 'Did not meet approval criteria'
      })
    } catch (emailError) {
      console.error('Error sending rejection email:', emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in reject-contractor:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
