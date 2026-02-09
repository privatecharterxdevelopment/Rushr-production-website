// lib/pushService.ts
// APNs push notification service using Node.js built-in http2
import http2 from 'http2'
import jwt from 'jsonwebtoken'

const APNS_HOST_PROD = 'api.push.apple.com'
const APNS_HOST_DEV = 'api.sandbox.push.apple.com'

// Environment variables needed:
// APNS_KEY_ID     - Key ID from Apple Developer (10 char)
// APNS_TEAM_ID    - Team ID from Apple Developer (10 char)
// APNS_KEY_BASE64 - Base64-encoded .p8 private key content
// APNS_BUNDLE_ID  - App bundle ID (com.userushr.app)
// APNS_PRODUCTION  - "true" for production, omit for sandbox

function getApnsToken(): string {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const keyBase64 = process.env.APNS_KEY_BASE64

  if (!keyId || !teamId || !keyBase64) {
    throw new Error('APNs credentials not configured (APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_BASE64)')
  }

  const key = Buffer.from(keyBase64, 'base64').toString('utf8')

  return jwt.sign({}, key, {
    algorithm: 'ES256',
    keyid: keyId,
    issuer: teamId,
    expiresIn: '1h',
  })
}

interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
  badge?: number
  sound?: string
}

export async function sendPushNotification(
  deviceToken: string,
  payload: PushPayload
): Promise<{ success: boolean; error?: string }> {
  const bundleId = process.env.APNS_BUNDLE_ID || 'com.userushr.app'
  const isProduction = process.env.APNS_PRODUCTION === 'true'
  const host = isProduction ? APNS_HOST_PROD : APNS_HOST_DEV

  try {
    const token = getApnsToken()

    const apnsPayload = {
      aps: {
        alert: {
          title: payload.title,
          body: payload.body,
        },
        badge: payload.badge ?? 1,
        sound: payload.sound || 'default',
        'mutable-content': 1,
      },
      ...payload.data,
    }

    return new Promise((resolve) => {
      const client = http2.connect(`https://${host}`)

      client.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })

      const headers = {
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        'authorization': `bearer ${token}`,
        'apns-topic': bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': '0',
      }

      const req = client.request(headers)

      let responseData = ''
      let statusCode = 0

      req.on('response', (headers) => {
        statusCode = headers[':status'] as number
      })

      req.on('data', (chunk: Buffer) => {
        responseData += chunk.toString()
      })

      req.on('end', () => {
        client.close()
        if (statusCode === 200) {
          resolve({ success: true })
        } else {
          resolve({ success: false, error: `APNs ${statusCode}: ${responseData}` })
        }
      })

      req.on('error', (err) => {
        client.close()
        resolve({ success: false, error: err.message })
      })

      req.write(JSON.stringify(apnsPayload))
      req.end()
    })
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function sendPushToUser(
  supabase: any,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; errors: string[] }> {
  // Fetch all device tokens for this user
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId)

  if (error || !tokens?.length) {
    return { sent: 0, errors: error ? [error.message] : ['No device tokens found'] }
  }

  const results = await Promise.all(
    tokens.map((t: { token: string }) => sendPushNotification(t.token, payload))
  )

  const errors: string[] = []
  let sent = 0
  results.forEach((r) => {
    if (r.success) sent++
    else if (r.error) errors.push(r.error)
  })

  return { sent, errors }
}
