import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const emailLower = email.toLowerCase().trim()

    // Check if user exists in homeowner table
    const { data: homeowner } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, user_id')
      .eq('email', emailLower)
      .maybeSingle()

    // Check if user exists in contractor table
    const { data: contractor } = await supabaseAdmin
      .from('pro_contractors')
      .select('id, email, user_id')
      .eq('email', emailLower)
      .maybeSingle()

    // Always return success for security (don't reveal if email exists)
    if (!homeowner && !contractor) {
      console.log('User not found in either table')
      return NextResponse.json({
        success: true,
        message: 'If an account with that email exists, you will receive password reset instructions.'
      })
    }

    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpiry = new Date(Date.now() + 3600000) // 1 hour from now

    // Store reset token in the appropriate table
    if (homeowner) {
      const { error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update({
          reset_token: resetToken,
          reset_token_expiry: resetTokenExpiry.toISOString()
        })
        .eq('id', homeowner.id)

      if (updateError) {
        console.error('Error storing reset token for homeowner:', updateError)
        return NextResponse.json({
          success: true,
          message: 'If an account with that email exists, you will receive password reset instructions.'
        })
      }
    } else if (contractor) {
      const { error: updateError } = await supabaseAdmin
        .from('pro_contractors')
        .update({
          reset_token: resetToken,
          reset_token_expiry: resetTokenExpiry.toISOString()
        })
        .eq('id', contractor.id)

      if (updateError) {
        console.error('Error storing reset token for contractor:', updateError)
        return NextResponse.json({
          success: true,
          message: 'If an account with that email exists, you will receive password reset instructions.'
        })
      }
    }

    const resetUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3005'}/auth/reset-password?token=${resetToken}&type=recovery`

    // Send email via Supabase Edge Function (which uses Resend)
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #10b981; font-size: 28px; font-weight: bold;">Rushr</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 40px 20px 40px;">
                    <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 24px; font-weight: 600;">Reset your password</h2>
                    <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 16px; line-height: 1.5;">
                      We received a request to reset the password for your Rushr account.
                    </p>
                    <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.5;">
                      Click the button below to reset your password. This link will expire in 1 hour.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 40px 30px 40px; text-align: center;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Reset Password
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 40px 30px 40px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                      If you didn't request this password reset, you can safely ignore this email. Your password will not be changed.
                    </p>
                    <p style="margin: 16px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                      Or copy and paste this URL into your browser:<br>
                      <a href="${resetUrl}" style="color: #10b981; word-break: break-all;">${resetUrl}</a>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 40px 40px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                      © ${new Date().getFullYear()} Rushr. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `

    const emailResponse = await supabaseAdmin.functions.invoke('send-email', {
      body: {
        to: emailLower,
        subject: 'Reset your Rushr password',
        html: emailHtml
      }
    })

    if (emailResponse.error) {
      console.error('Error sending email:', emailResponse.error)
    } else {
      console.log('Password reset email sent successfully to:', emailLower)
    }

    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, you will receive password reset instructions.'
    })

  } catch (error: any) {
    console.error('Error in forgot-password:', error)

    // Still return success to not reveal if email exists
    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, you will receive password reset instructions.'
    })
  }
}
