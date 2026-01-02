import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER

// Lazy initialization to avoid build errors when credentials aren't set
let client: ReturnType<typeof twilio> | null = null

function getTwilioClient() {
  if (!accountSid || !authToken) {
    console.warn('⚠️ Twilio credentials not configured. SMS notifications will not be sent.')
    return null
  }

  // Validate accountSid format (must start with AC, not SK which is an API key)
  if (!accountSid.startsWith('AC')) {
    console.warn('⚠️ Invalid Twilio Account SID format. Must start with AC, not SK (API key).')
    return null
  }

  if (!client) {
    try {
      client = twilio(accountSid, authToken)
    } catch (error) {
      console.error('⚠️ Failed to initialize Twilio client:', error)
      return null
    }
  }

  return client
}

interface SendSMSParams {
  to: string
  message: string
}

/**
 * Send an SMS message via Twilio
 */
export async function sendSMS({ to, message }: SendSMSParams): Promise<{ success: boolean; error?: string }> {
  const twilioClient = getTwilioClient()

  if (!twilioClient || !twilioPhoneNumber) {
    console.error('Twilio client not configured')
    return { success: false, error: 'SMS service not configured' }
  }

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: to,
    })

    console.log(`✅ SMS sent successfully to ${to}. SID: ${result.sid}`)
    return { success: true }
  } catch (error: any) {
    console.error('❌ Error sending SMS:', error)
    return { success: false, error: error.message || 'Failed to send SMS' }
  }
}

/**
 * Send SMS notification to homeowner when they receive a new bid
 */
export async function sendBidReceivedSMS({
  homeownerPhone,
  homeownerName,
  contractorName,
  jobTitle,
  bidAmount,
}: {
  homeownerPhone: string
  homeownerName: string
  contractorName: string
  jobTitle: string
  bidAmount: number
}): Promise<{ success: boolean; error?: string }> {
  const message = `Hi ${homeownerName}! You received a new bid from ${contractorName} for "${jobTitle}" - $${bidAmount}. View details at https://rushr-main.vercel.app/dashboard/homeowner`

  return sendSMS({ to: homeownerPhone, message })
}

/**
 * Send SMS notification to contractor when their bid is accepted
 */
export async function sendBidAcceptedSMS({
  contractorPhone,
  contractorName,
  homeownerName,
  jobTitle,
}: {
  contractorPhone: string
  contractorName: string
  homeownerName: string
  jobTitle: string
}): Promise<{ success: boolean; error?: string }> {
  const message = `Congratulations ${contractorName}! ${homeownerName} accepted your bid for "${jobTitle}". View job details at https://rushr-main.vercel.app/dashboard/contractor`

  return sendSMS({ to: contractorPhone, message })
}

/**
 * Send SMS notification to contractor when their bid is rejected
 */
export async function sendBidRejectedSMS({
  contractorPhone,
  contractorName,
  jobTitle,
}: {
  contractorPhone: string
  contractorName: string
  jobTitle: string
}): Promise<{ success: boolean; error?: string }> {
  const message = `Hi ${contractorName}, your bid for "${jobTitle}" was not accepted. Don't worry - more opportunities await! View jobs at https://rushr-main.vercel.app/dashboard/contractor`

  return sendSMS({ to: contractorPhone, message })
}

/**
 * Send SMS notification to contractor when they receive a direct offer
 */
export async function sendDirectOfferSMS({
  contractorPhone,
  contractorName,
  homeownerName,
  jobTitle,
  offeredAmount,
}: {
  contractorPhone: string
  contractorName: string
  homeownerName: string
  jobTitle: string
  offeredAmount: number
}): Promise<{ success: boolean; error?: string }> {
  const message = `Hi ${contractorName}! ${homeownerName} sent you a direct job offer for "${jobTitle}" - $${offeredAmount}. View offer at https://rushr-main.vercel.app/dashboard/contractor/offers`

  return sendSMS({ to: contractorPhone, message })
}

/**
 * Send SMS notification to homeowner when payment is completed
 */
export async function sendPaymentCompletedSMSHomeowner({
  homeownerPhone,
  homeownerName,
  jobTitle,
  amount,
  contractorName,
}: {
  homeownerPhone: string
  homeownerName: string
  jobTitle: string
  amount: number
  contractorName: string
}): Promise<{ success: boolean; error?: string }> {
  const message = `Hi ${homeownerName}! Your payment of $${amount} for "${jobTitle}" is confirmed. ${contractorName} has been notified and will begin work soon.`

  return sendSMS({ to: homeownerPhone, message })
}

/**
 * Send SMS notification to contractor when payment is completed
 */
export async function sendPaymentCompletedSMSContractor({
  contractorPhone,
  contractorName,
  jobTitle,
  amount,
  homeownerName,
}: {
  contractorPhone: string
  contractorName: string
  jobTitle: string
  amount: number
  homeownerName: string
}): Promise<{ success: boolean; error?: string }> {
  const message = `Hi ${contractorName}! ${homeownerName} has paid $${amount} for "${jobTitle}". You can now start work. Payment will be released upon completion.`

  return sendSMS({ to: contractorPhone, message })
}

/**
 * Send SMS notification to homeowner when work is started
 */
export async function sendWorkStartedSMSHomeowner({
  homeownerPhone,
  homeownerName,
  contractorName,
  jobTitle,
}: {
  homeownerPhone: string
  homeownerName: string
  contractorName: string
  jobTitle: string
}): Promise<{ success: boolean; error?: string }> {
  const message = `Hi ${homeownerName}! ${contractorName} has started work on "${jobTitle}". Track progress at https://rushr-main.vercel.app/dashboard/homeowner`

  return sendSMS({ to: homeownerPhone, message })
}

/**
 * Send SMS notification to contractor confirming work started
 */
export async function sendWorkStartedSMSContractor({
  contractorPhone,
  contractorName,
  jobTitle,
}: {
  contractorPhone: string
  contractorName: string
  jobTitle: string
}): Promise<{ success: boolean; error?: string }> {
  const message = `Hi ${contractorName}! Work started for "${jobTitle}" has been recorded. The homeowner has been notified. Update your progress at https://rushr-main.vercel.app/dashboard/contractor`

  return sendSMS({ to: contractorPhone, message })
}

/**
 * Send SMS notification to homeowner when work is completed
 */
export async function sendWorkCompletedSMSHomeowner({
  homeownerPhone,
  homeownerName,
  contractorName,
  jobTitle,
}: {
  homeownerPhone: string
  homeownerName: string
  contractorName: string
  jobTitle: string
}): Promise<{ success: boolean; error?: string }> {
  const message = `Hi ${homeownerName}! ${contractorName} has completed work on "${jobTitle}". Please review and rate the work at https://rushr-main.vercel.app/dashboard/homeowner`

  return sendSMS({ to: homeownerPhone, message })
}

/**
 * Send SMS notification to contractor confirming work completed
 */
export async function sendWorkCompletedSMSContractor({
  contractorPhone,
  contractorName,
  jobTitle,
  homeownerName,
}: {
  contractorPhone: string
  contractorName: string
  jobTitle: string
  homeownerName: string
}): Promise<{ success: boolean; error?: string }> {
  const message = `Hi ${contractorName}! Job "${jobTitle}" marked as complete. ${homeownerName} has been notified. Payment will be released soon!`

  return sendSMS({ to: contractorPhone, message })
}
