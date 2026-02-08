import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '../../../../lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/payments/respond-adjustment?id=xxx&action=accept|decline
 * Handles email link clicks for accepting/declining payment adjustments
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const adjustmentId = searchParams.get('id')
  const action = searchParams.get('action')

  if (!adjustmentId || !action) {
    return NextResponse.redirect(new URL('/dashboard?error=invalid_request', request.url))
  }

  try {
    // Get the adjustment
    const { data: adjustment, error } = await supabase
      .from('payment_adjustments')
      .select('*')
      .eq('id', adjustmentId)
      .single()

    if (error || !adjustment) {
      return NextResponse.redirect(new URL('/dashboard?error=adjustment_not_found', request.url))
    }

    if (adjustment.status !== 'pending') {
      return NextResponse.redirect(new URL('/dashboard?error=already_responded', request.url))
    }

    // Check if expired
    if (new Date(adjustment.expires_at) < new Date()) {
      await supabase
        .from('payment_adjustments')
        .update({ status: 'cancelled' })
        .eq('id', adjustmentId)

      return NextResponse.redirect(new URL('/dashboard?error=request_expired', request.url))
    }

    if (action === 'accept') {
      // Process acceptance
      const result = await processAcceptance(adjustment)
      if (result.success) {
        return NextResponse.redirect(new URL(`/dashboard?success=adjustment_accepted&amount=${adjustment.new_amount}`, request.url))
      } else {
        return NextResponse.redirect(new URL(`/dashboard?error=${result.error}`, request.url))
      }
    } else if (action === 'decline') {
      // Process decline
      await processDecline(adjustment)
      return NextResponse.redirect(new URL('/dashboard?success=adjustment_declined', request.url))
    }

    return NextResponse.redirect(new URL('/dashboard?error=invalid_action', request.url))

  } catch (err: any) {
    console.error('Respond adjustment error:', err)
    return NextResponse.redirect(new URL('/dashboard?error=server_error', request.url))
  }
}

/**
 * POST /api/payments/respond-adjustment
 * Handles dashboard responses with optional notes
 */
export async function POST(request: NextRequest) {
  try {
    const {
      adjustmentId,
      action, // 'accept' or 'decline'
      respondedById,
      respondedByName,
      responseNote
    } = await request.json()

    if (!adjustmentId || !action || !respondedById) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get the adjustment
    const { data: adjustment, error } = await supabase
      .from('payment_adjustments')
      .select('*')
      .eq('id', adjustmentId)
      .single()

    if (error || !adjustment) {
      return NextResponse.json(
        { error: 'Adjustment not found' },
        { status: 404 }
      )
    }

    if (adjustment.status !== 'pending') {
      return NextResponse.json(
        { error: 'This adjustment has already been responded to' },
        { status: 400 }
      )
    }

    // Verify responder is the counterparty
    const isCounterparty =
      (adjustment.requested_by === 'homeowner' && respondedById === adjustment.contractor_id) ||
      (adjustment.requested_by === 'contractor' && respondedById === adjustment.homeowner_id)

    if (!isCounterparty) {
      return NextResponse.json(
        { error: 'Unauthorized to respond to this adjustment' },
        { status: 403 }
      )
    }

    if (action === 'accept') {
      const result = await processAcceptance(adjustment, respondedById, respondedByName, responseNote)
      if (result.success) {
        return NextResponse.json({
          success: true,
          message: 'Adjustment accepted',
          paymentLink: result.paymentLink
        })
      } else {
        return NextResponse.json(
          { error: result.error },
          { status: 500 }
        )
      }
    } else if (action === 'decline') {
      await processDecline(adjustment, respondedById, respondedByName, responseNote)
      return NextResponse.json({
        success: true,
        message: 'Adjustment declined'
      })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )

  } catch (err: any) {
    console.error('Respond adjustment POST error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to respond to adjustment' },
      { status: 500 }
    )
  }
}

async function processAcceptance(
  adjustment: any,
  respondedById?: string,
  respondedByName?: string,
  responseNote?: string
): Promise<{ success: boolean; paymentLink?: string; error?: string }> {
  try {
    const stripe = getStripe()
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://userushr.com'

    // If the new amount is higher, create a payment link for the difference
    let paymentLink = null
    let paymentIntentId = null

    if (adjustment.new_amount > adjustment.original_amount) {
      const difference = adjustment.new_amount - adjustment.original_amount
      const amountCents = Math.round(difference * 100)

      // Create a Stripe Payment Link for the additional amount
      const price = await stripe.prices.create({
        unit_amount: amountCents,
        currency: 'usd',
        product_data: {
          name: `Payment Adjustment - ${adjustment.category || 'Service'}`,
          description: `Additional payment for: ${adjustment.reason}`,
        },
      })

      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: {
          adjustment_id: adjustment.id,
          booking_id: adjustment.booking_id || '',
          homeowner_id: adjustment.homeowner_id,
          contractor_id: adjustment.contractor_id,
          type: 'adjustment'
        },
        after_completion: {
          type: 'redirect',
          redirect: {
            url: `${baseUrl}/dashboard?success=adjustment_paid`
          }
        }
      })

      paymentLink = link.url

      // Update adjustment with payment link
      await supabase
        .from('payment_adjustments')
        .update({
          status: 'accepted',
          stripe_payment_link_id: link.id,
          stripe_payment_link_url: link.url,
          responded_by_id: respondedById,
          responded_by_name: respondedByName,
          response_note: responseNote,
          responded_at: new Date().toISOString()
        })
        .eq('id', adjustment.id)

    } else {
      // If amount is same or lower, just mark as accepted (refund handled separately)
      await supabase
        .from('payment_adjustments')
        .update({
          status: 'accepted',
          responded_by_id: respondedById,
          responded_by_name: respondedByName,
          response_note: responseNote,
          responded_at: new Date().toISOString()
        })
        .eq('id', adjustment.id)
    }

    // Notify the requester
    const notifyHomeowner = adjustment.requested_by === 'homeowner'
    const recipientId = notifyHomeowner ? adjustment.homeowner_id : adjustment.contractor_id

    // Create notification
    await supabase.from('notifications').insert({
      user_id: recipientId,
      type: 'adjustment_accepted',
      title: 'Payment Adjustment Accepted!',
      message: `Your payment adjustment request from $${adjustment.original_amount.toFixed(2)} to $${adjustment.new_amount.toFixed(2)} has been accepted.${paymentLink ? ' Payment link sent.' : ''}`,
      data: {
        adjustment_id: adjustment.id,
        payment_link: paymentLink
      },
      read: false
    })

    // Send email to requester
    let requesterEmail = ''
    let requesterName = ''

    if (notifyHomeowner) {
      const { data: authUser } = await supabase.auth.admin.getUserById(adjustment.homeowner_id)
      requesterEmail = authUser?.user?.email || ''
      const { data: profile } = await supabase.from('user_profiles').select('name').eq('id', adjustment.homeowner_id).single()
      requesterName = profile?.name || 'Homeowner'
    } else {
      const { data: contractor } = await supabase
        .from('pro_contractors')
        .select('email, name, business_name')
        .eq('id', adjustment.contractor_id)
        .single()
      requesterEmail = contractor?.email || ''
      requesterName = contractor?.business_name || contractor?.name || 'Contractor'
    }

    if (requesterEmail) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Adjustment Accepted!</h1>
          </div>

          <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Hi ${requesterName},</p>

            <p>Great news! Your payment adjustment request has been <strong>accepted</strong>.</p>

            <div style="background: white; border: 1px solid #E5E7EB; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 8px 0;"><strong>Original:</strong> $${adjustment.original_amount.toFixed(2)}</p>
              <p style="margin: 8px 0;"><strong>New Amount:</strong> $${adjustment.new_amount.toFixed(2)}</p>
              <p style="margin: 8px 0;"><strong>Reason:</strong> ${adjustment.reason}</p>
              ${responseNote ? `<p style="margin: 8px 0;"><strong>Note:</strong> ${responseNote}</p>` : ''}
            </div>

            ${paymentLink ? `
              <div style="margin: 30px 0; text-align: center;">
                <a href="${paymentLink}"
                   style="display: inline-block; background: #10B981; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Pay Additional $${(adjustment.new_amount - adjustment.original_amount).toFixed(2)}
                </a>
              </div>
            ` : ''}

            <p style="margin-top: 30px;">Best regards,<br><strong>The Rushr Team</strong></p>
          </div>
        </div>
      `

      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: requesterEmail,
          subject: `Payment Adjustment Accepted - $${adjustment.new_amount.toFixed(2)}`,
          html: emailHtml
        }),
      })
    }

    return { success: true, paymentLink }

  } catch (err: any) {
    console.error('Process acceptance error:', err)
    return { success: false, error: err.message }
  }
}

async function processDecline(
  adjustment: any,
  respondedById?: string,
  respondedByName?: string,
  responseNote?: string
) {
  // Update status to declined
  await supabase
    .from('payment_adjustments')
    .update({
      status: 'declined',
      responded_by_id: respondedById,
      responded_by_name: respondedByName,
      response_note: responseNote,
      responded_at: new Date().toISOString()
    })
    .eq('id', adjustment.id)

  // Notify the requester
  const notifyHomeowner = adjustment.requested_by === 'homeowner'
  const recipientId = notifyHomeowner ? adjustment.homeowner_id : adjustment.contractor_id

  await supabase.from('notifications').insert({
    user_id: recipientId,
    type: 'adjustment_declined',
    title: 'Payment Adjustment Declined',
    message: `Your payment adjustment request from $${adjustment.original_amount.toFixed(2)} to $${adjustment.new_amount.toFixed(2)} was declined.${responseNote ? ` Note: ${responseNote}` : ''}`,
    data: {
      adjustment_id: adjustment.id,
      response_note: responseNote
    },
    read: false
  })

  // Send email
  let requesterEmail = ''
  let requesterName = ''

  if (notifyHomeowner) {
    const { data: authUser } = await supabase.auth.admin.getUserById(adjustment.homeowner_id)
    requesterEmail = authUser?.user?.email || ''
    const { data: profile } = await supabase.from('user_profiles').select('name').eq('id', adjustment.homeowner_id).single()
    requesterName = profile?.name || 'Homeowner'
  } else {
    const { data: contractor } = await supabase
      .from('pro_contractors')
      .select('email, name, business_name')
      .eq('id', adjustment.contractor_id)
      .single()
    requesterEmail = contractor?.email || ''
    requesterName = contractor?.business_name || contractor?.name || 'Contractor'
  }

  if (requesterEmail) {
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Adjustment Declined</h1>
        </div>

        <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px;">Hi ${requesterName},</p>

          <p>Unfortunately, your payment adjustment request was <strong>declined</strong>.</p>

          <div style="background: white; border: 1px solid #E5E7EB; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>Original:</strong> $${adjustment.original_amount.toFixed(2)}</p>
            <p style="margin: 8px 0;"><strong>Requested:</strong> $${adjustment.new_amount.toFixed(2)}</p>
            <p style="margin: 8px 0;"><strong>Your Reason:</strong> ${adjustment.reason}</p>
            ${responseNote ? `<p style="margin: 8px 0; color: #DC2626;"><strong>Response:</strong> ${responseNote}</p>` : ''}
          </div>

          <p style="font-size: 14px; color: #6B7280;">
            You can continue discussing this in the chat or contact support if you have questions.
          </p>

          <p style="margin-top: 30px;">Best regards,<br><strong>The Rushr Team</strong></p>
        </div>
      </div>
    `

    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        to: requesterEmail,
        subject: `Payment Adjustment Declined`,
        html: emailHtml
      }),
    })
  }
}
