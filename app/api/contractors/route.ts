// app/api/contractors/route.ts
import { NextResponse } from 'next/server'
import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js'

/** ---------- Supabase bootstrap (server) ---------- */
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function getSupabase(authorization?: string): SupabaseClient {
  if (!SUPABASE_URL) {
    throw new Error('ENV SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is missing')
  }
  if (SERVICE_ROLE) {
    return createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: authorization ? { Authorization: authorization } : {} },
    })
  }
  if (!ANON_KEY) {
    throw new Error('ENV NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')
  }
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: authorization ? { Authorization: authorization } : {} },
  })
}

/** ==================================================
 *  GET /api/contractors
 *  Returns list of contractors from pro_contractors table
 *  ================================================== */
export async function GET(req: Request) {
  try {
    const supabase = getSupabase()

    const url = new URL(req.url)
    const limit = url.searchParams.get('limit')

    let query = supabase
      .from('pro_contractors')
      .select('*')
      .eq('status', 'approved') // Only show approved contractors in search
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('created_at', { ascending: false })

    if (limit) {
      query = query.limit(parseInt(limit))
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching contractors:', error)
      return NextResponse.json({ contractors: [] })
    }

    // Transform data to match expected format
    const contractors = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name || c.business_name || 'Contractor',
      business_name: c.business_name,
      services: c.categories || c.specialties || [],
      city: c.city,
      state: c.state,
      zip: c.base_zip,
      rating: c.rating || 0,
      years: c.years_in_business || 0,
      emergency: c.emergency_service || false,
      twentyFourSeven: c.twenty_four_seven || false,
      loc: (c.latitude && c.longitude) ? { lat: c.latitude, lng: c.longitude } : null,
      logo_url: c.logo_url,
      avatar_url: c.avatar_url,
    }))

    return NextResponse.json({ contractors })
  } catch (e: any) {
    console.error('Server error:', e)
    return NextResponse.json({ contractors: [] })
  }
}

/** ---------- tiny helpers ---------- */
function numOrNull(x: any) {
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}
function jsonOr<T>(s: any, fallback: T): T {
  try { return JSON.parse(String(s)) as T } catch { return fallback }
}
function strOrNull(v: any) {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length ? s : null
}

/** ==================================================
 *  POST /api/contractors
 *  Body: multipart/form-data from contractor wizard
 *  ================================================== */
export async function POST(req: Request) {
  try {
    const authHeader =
      req.headers.get('authorization') ||
      req.headers.get('Authorization') ||
      ''
    const supabase = getSupabase(authHeader)

    const { data: { user }, error: getUserErr } = await supabase.auth.getUser()
    if (getUserErr) return NextResponse.json({ error: getUserErr.message }, { status: 401 })
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const fd = await req.formData()

    /** ---------- FILE UPLOADS ---------- */
    const bucket = supabase.storage.from('contractor-assets')
    const base = `${user.id}`

    async function uploadMaybe(file: File | null, path: string) {
      if (!file) return null
      const ext = (file.name?.split('.').pop() || 'bin').toLowerCase()
      const key = `${path}.${ext}`
      const { error } = await bucket.upload(key, file, {
        upsert: true, contentType: file.type || undefined,
      })
      if (error) throw error
      return bucket.getPublicUrl(key).data.publicUrl
    }

    const logo = fd.get('logo') as File | null
    const licenseProof = fd.get('licenseProof') as File | null
    const insuranceProof = fd.get('insuranceProof') as File | null
    const portfolioFiles = (fd.getAll('portfolio') as File[]).filter(Boolean)

    const logo_url = await uploadMaybe(logo, `${base}/logo-${Date.now()}`)
    const license_proof_url = await uploadMaybe(licenseProof, `${base}/license-${Date.now()}`)
    const insurance_proof_url = await uploadMaybe(insuranceProof, `${base}/insurance-${Date.now()}`)
    const portfolio_urls: string[] = []
    for (let i = 0; i < portfolioFiles.length; i++) {
      const f = portfolioFiles[i]
      const ext = (f.name?.split('.').pop() || 'jpg').toLowerCase()
      const key = `${base}/portfolio/${Date.now()}-${i}.${ext}`
      const { error } = await bucket.upload(key, f, {
        upsert: true, contentType: f.type || undefined,
      })
      if (error) throw error
      portfolio_urls.push(bucket.getPublicUrl(key).data.publicUrl)
    }

    /** ---------- ENFORCE required proofs ---------- */
    if (!license_proof_url) return NextResponse.json({ error: 'License proof required' }, { status: 400 })
    if (!insurance_proof_url) return NextResponse.json({ error: 'Insurance proof required' }, { status: 400 })

    /** ---------- Other fields ---------- */
    const hours = jsonOr(fd.get('hours'), {})
    const categories = jsonOr<string[]>(fd.get('categories'), [])
    const specialties = jsonOr<string[]>(fd.get('specialties'), [])
    const extraZips = jsonOr<string[]>(fd.get('extraZips'), [])
    const payments = jsonOr<string[]>(fd.get('payments'), [])

    const today = new Date().toISOString().slice(0, 10)
    const license_expires = String(fd.get('licenseExpires') || '')
    const insurance_expires = String(fd.get('insuranceExpires') || '')
    const license_valid = !!license_proof_url && license_expires >= today
    const insurance_valid = !!insurance_proof_url && insurance_expires >= today
    const nextStatus = (license_valid && insurance_valid) ? 'approved' : 'pending'

    const payload = {
      user_id: user.id,
      contact_name: strOrNull(fd.get('name')),
      contact_email: strOrNull(fd.get('email')),
      contact_phone: strOrNull(fd.get('phone')),
      business_name: strOrNull(fd.get('businessName')),
      website_url: strOrNull(fd.get('website')),
      years_in_business: numOrNull(fd.get('yearsInBusiness')),
      team_size: numOrNull(fd.get('teamSize')),
      about: strOrNull(fd.get('about')),
      base_zip: strOrNull(fd.get('baseZip')),
      radius_miles: numOrNull(fd.get('radiusMiles')),
      extra_zips: extraZips.length ? extraZips : null,
      categories: categories.length ? categories : null,
      specialties: specialties.length ? specialties : null,
      emergency: String(fd.get('emergency')) === 'true',
      hours,
      license_number: strOrNull(fd.get('licenseNumber')),
      license_type: strOrNull(fd.get('licenseType')),
      license_state: strOrNull(fd.get('licenseState')),
      license_expires,
      insurance_carrier: strOrNull(fd.get('insuranceCarrier')),
      insurance_policy: strOrNull(fd.get('insurancePolicy')),
      insurance_expires,
      rate_type: strOrNull(fd.get('rateType')),
      hourly_rate: numOrNull(fd.get('hourlyRate')),
      flat_min: numOrNull(fd.get('flatMin')),
      visit_fee: numOrNull(fd.get('visitFee')),
      free_estimates: String(fd.get('freeEstimates')) === 'true',
      payments: payments.length ? payments : null,
      instagram_url: strOrNull(fd.get('instagram')),
      facebook_url: strOrNull(fd.get('facebook')),
      yelp_url: strOrNull(fd.get('yelp')),
      google_url: strOrNull(fd.get('google')),
      logo_url,
      portfolio_urls,
      license_proof_url,
      insurance_proof_url,
      license_valid,
      insurance_valid,
      agree_terms: String(fd.get('agreeTerms')) === 'true',
      certify_accuracy: String(fd.get('certifyAccuracy')) === 'true',
      // Add required fields for ProAuthContext
      status: nextStatus,
      kyc_status: 'not_started', // KYC starts as not_started
      created_at: new Date().toISOString(),
    }

    /** ---------- DB writes ---------- */
    const { data: existing, error: selErr } = await supabase
      .from('pro_profiles')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 })

    let writeErr: PostgrestError | null = null
    if (existing) {
      const { error } = await supabase.from('pro_profiles').update(payload).eq('user_id', user.id)
      writeErr = error
    } else {
      const { error } = await supabase.from('pro_profiles').insert(payload)
      writeErr = error
    }
    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 400 })

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ role: 'pro', pro_onboarding_status: nextStatus })
      .eq('id', user.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, status: nextStatus })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
