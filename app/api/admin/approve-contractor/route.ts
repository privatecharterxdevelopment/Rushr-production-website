import { NextRequest, NextResponse } from 'next/server'
import { notifyContractorApproved } from '../../../../lib/emailService'

/**
 * POST /api/admin/approve-contractor
 * Sends approval email notification to contractor
 * (Status update is handled by the client directly via Supabase)
 */
export async function POST(request: NextRequest) {
  try {
    const { contractorEmail, contractorName, businessName } = await request.json()

    if (!contractorEmail) {
      return NextResponse.json({ error: 'Missing contractorEmail' }, { status: 400 })
    }

    // Send email notification
    try {
      await notifyContractorApproved({
        contractorEmail,
        contractorName,
        businessName
      })
    } catch (emailError) {
      console.error('Error sending approval email:', emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in approve-contractor:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
