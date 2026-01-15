'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AiRewriteBubble from '@/components/AiRewriteBubble'
import TagInput from '@/components/TagInput'
import toast, { Toaster } from 'react-hot-toast'
import IOSProWizardWrapper from '@/components/IOSProWizardWrapper'

/* ====================== Types ====================== */
type Day = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'
type Hours = Record<Day, { enabled: boolean; open: string; close: string }>
type RateType = 'Hourly'|'Flat'|'Visit fee'
// Payment methods removed - all payments go through Stripe Connect
type StepId = 'basics'|'area'|'credentials'|'pricing'|'review'
type Mode = 'wizard'|'full'

type FormDataT = {
  name: string; email: string; password: string; phone: string
  businessName: string; website: string
  yearsInBusiness: string; teamSize: string; about: string
  baseZip: string; address: string; latitude: number | null; longitude: number | null; radiusMiles: number; extraZips: string[]
  categories: string[]; specialties: string[]
  emergency: boolean; hours: Hours
  licenseNumber: string; licenseType: string; licenseState: string; licensedStates: string; licenseExpires: string
  insuranceCarrier: string; insurancePolicy: string; insuranceExpires: string
  rateType: RateType; hourlyRate: string; peakRate: string; offPeakRate: string; surgeRate: string; flatMin: string; visitFee: string; diagnosticFee: string; freeEstimates: boolean
  // payments removed - handled by Stripe Connect
  instagram: string; facebook: string; yelp: string; google: string
  logo: File | null; portfolio: File[]; licenseProof: File | null; insuranceProof: File | null
  agreeTerms: boolean; certifyAccuracy: boolean
}

/* ====================== Constants ====================== */
const STEPS: StepId[] = ['basics','area','credentials','pricing','review']
const TITLES: Record<StepId,string> = {
  basics: 'Business basics',
  area: 'Service area & categories',
  credentials: 'Credentials',
  pricing: 'Pricing & availability',
  review: 'Preview & submit'
}
const DAYS: Day[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const EMPTY_HOURS: Hours = DAYS.reduce((acc, d) => {
  (acc as any)[d] = { enabled: ['Mon','Tue','Wed','Thu','Fri'].includes(d), open:'09:00', close:'17:00' }
  return acc
}, {} as Hours)
// Payment methods removed - all payments go through Stripe Connect
const DRAFT_KEY = 'rushr.contractor.signup.v1'

/* ====================== Page ====================== */
export default function ContractorSignup() {
  const router = useRouter()
  const sp = useSearchParams()

  const categories = useMemo<string[]>(
    () => ['Electrical','HVAC','Roofing','Plumbing','Carpentry','Landscaping'],
    []
  )

  const [form, setForm] = useState<FormDataT>(()=>({
    name:'', email:'', password:'', phone:'',
    businessName:'', website:'',
    yearsInBusiness:'', teamSize:'', about:'',
    baseZip:'', address:'', latitude:null, longitude:null, radiusMiles:10, extraZips:[],
    categories:[], specialties:[],
    emergency:false, hours:{...EMPTY_HOURS},
    licenseNumber:'', licenseType:'', licenseState:'', licensedStates:'', licenseExpires:'',
    insuranceCarrier:'', insurancePolicy:'', insuranceExpires:'',
    rateType:'Hourly', hourlyRate:'', peakRate:'', offPeakRate:'', surgeRate:'', flatMin:'', visitFee:'', diagnosticFee:'', freeEstimates:true,
    instagram:'', facebook:'', yelp:'', google:'',
    logo:null, portfolio:[], licenseProof:null, insuranceProof:null,
    agreeTerms:false, certifyAccuracy:false,
  }))

  const [mode, setMode] = useState<Mode>('wizard')
  const [step, setStep] = useState<StepId>('basics')
  const idx = STEPS.indexOf(step)
  const canBack = idx > 0
  const canNext = idx < STEPS.length - 1

  const [errors, setErrors] = useState<Record<string,string>>({})
  const [busy, setBusy] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationForZips, setLocationForZips] = useState('')
  const [fetchingZips, setFetchingZips] = useState(false)

  /* ---------------- Draft load + URL sync ---------------- */
  useEffect(()=>{
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        setForm(f=>({ ...f, ...migrateDraft(saved), logo:null, portfolio:[], licenseProof:null, insuranceProof:null }))
      }
    } catch {}
    const s = sp.get('step') as StepId | null
    if (s && STEPS.includes(s)) setStep(s)
    const m = sp.get('mode') as Mode | null
    if (m==='full' || m==='wizard') setMode(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(()=>{
    const qs = new URLSearchParams(sp.toString())
    qs.set('step', step)
    qs.set('mode', mode)
    router.replace(`?${qs.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mode])

  /* ---------------- Helpers ---------------- */
  function set<K extends keyof FormDataT>(k: K, v: FormDataT[K]) { setForm(prev => ({ ...prev, [k]: v })) }
  function setHours(day: Day, patch: Partial<Hours[Day]>) {
    setForm(prev => ({ ...prev, hours: { ...prev.hours, [day]: { ...prev.hours[day], ...patch } } }))
  }
  function toggle<T>(arr: T[], v: T): T[] { return arr.includes(v) ? arr.filter(x=>x!==v) : [...arr, v] }
  const zip5 = (z:string) => /^\d{5}$/.test(z)

  /* ---------------- Geocoding Functions ---------------- */
  async function geocodeAddress(address: string, zip: string): Promise<{lat: number, lng: number} | null> {
    const MAPBOX_TOKEN = 'pk.eyJ1IjoicnVzaHJhZG1pbiIsImEiOiJjbWdiaTlobmcwdHc3MmtvbHhhOTJjNnJvIn0.st2PXkQQtqnh3tHrjp9pzw'

    const query = encodeURIComponent(`${address}, ${zip}`)
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1`

    try {
      const response = await fetch(url)
      const data = await response.json()

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center
        return { lat, lng }
      }
      return null
    } catch (error) {
      console.error('Geocoding error:', error)
      return null
    }
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported by your browser')
      return
    }

    setGeocoding(true)
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords

        // Reverse geocode to get address
        const MAPBOX_TOKEN = 'pk.eyJ1IjoicnVzaHJhZG1pbiIsImEiOiJjbWdiaTlobmcwdHc3MmtvbHhhOTJjNnJvIn0.st2PXkQQtqnh3tHrjp9pzw'
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&limit=1`

        try {
          const response = await fetch(url)
          const data = await response.json()

          if (data.features && data.features.length > 0) {
            const feature = data.features[0]
            const address = feature.place_name
            const zipMatch = feature.context?.find((c: any) => c.id.startsWith('postcode'))
            const zip = zipMatch?.text || ''

            set('address', address)
            set('latitude', latitude)
            set('longitude', longitude)
            if (zip) set('baseZip', zip)
          }
        } catch (error) {
          setLocationError('Failed to get address from location')
        } finally {
          setGeocoding(false)
        }
      },
      (error) => {
        setLocationError('Failed to get your location: ' + error.message)
        setGeocoding(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  /* ---------------- Fetch ZIPs by Location ---------------- */
  async function fetchZipsByLocation() {
    if (!locationForZips.trim()) return

    setFetchingZips(true)
    try {
      const MAPBOX_TOKEN = 'pk.eyJ1IjoicnVzaHJhZG1pbiIsImEiOiJjbWdiaTlobmcwdHc3MmtvbHhhOTJjNnJvIn0.st2PXkQQtqnh3tHrjp9pzw'

      // First, geocode the location to get coordinates and context
      const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationForZips)}.json?access_token=${MAPBOX_TOKEN}&types=place,locality,region,district&limit=1&country=US`
      const geoResponse = await fetch(geoUrl)
      const geoData = await geoResponse.json()

      if (!geoData.features || geoData.features.length === 0) {
        toast.error('Location not found. Try a city or state name.')
        setFetchingZips(false)
        return
      }

      const feature = geoData.features[0]
      const [lng, lat] = feature.center

      // Extract location context to filter ZIPs
      const placeType = feature.place_type[0]
      const locationContext: any = {}

      // Parse context to get city, state, etc.
      if (feature.context) {
        feature.context.forEach((ctx: any) => {
          if (ctx.id.startsWith('region.')) locationContext.state = ctx.text
          if (ctx.id.startsWith('place.')) locationContext.city = ctx.text
          if (ctx.id.startsWith('district.')) locationContext.district = ctx.text
        })
      }

      // For place-level searches, use the place name
      if (placeType === 'place') {
        locationContext.city = feature.text
      } else if (placeType === 'region') {
        locationContext.state = feature.text
      }

      // Determine search radius based on place type
      let radius = 10 // default 10km
      if (placeType === 'region') radius = 100 // state-level
      else if (placeType === 'district') radius = 50 // district-level
      else if (placeType === 'place') radius = 20 // city-level

      // Use reverse geocoding with proximity to find nearby ZIP codes
      const allZips = new Set<string>()

      // Create multiple search points in a grid
      const gridSize = placeType === 'region' ? 8 : placeType === 'district' ? 5 : 3
      const step = radius / gridSize

      for (let i = -gridSize; i <= gridSize; i++) {
        for (let j = -gridSize; j <= gridSize; j++) {
          // Calculate offset in degrees (rough approximation: 1 degree ≈ 111km)
          const offsetLat = lat + (i * step) / 111
          const offsetLng = lng + (j * step) / (111 * Math.cos(lat * Math.PI / 180))

          try {
            const zipUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${offsetLng},${offsetLat}.json?access_token=${MAPBOX_TOKEN}&types=postcode&limit=1`
            const zipResponse = await fetch(zipUrl)
            const zipData = await zipResponse.json()

            if (zipData.features && zipData.features.length > 0) {
              const zipFeature = zipData.features[0]
              const zip = zipFeature.text

              if (/^\d{5}$/.test(zip)) {
                // CRITICAL: Validate ZIP belongs to the searched location
                let isValidZip = false

                if (placeType === 'region') {
                  // For state searches, match state
                  const zipState = zipFeature.context?.find((ctx: any) => ctx.id.startsWith('region.'))?.text
                  isValidZip = zipState === locationContext.state
                } else if (placeType === 'place') {
                  // For city searches, match city name
                  const zipCity = zipFeature.context?.find((ctx: any) => ctx.id.startsWith('place.'))?.text
                  isValidZip = zipCity === locationContext.city
                } else if (placeType === 'district') {
                  // For district searches, match district
                  const zipDistrict = zipFeature.context?.find((ctx: any) => ctx.id.startsWith('district.'))?.text
                  isValidZip = zipDistrict === locationContext.district
                }

                if (isValidZip) {
                  allZips.add(zip)
                }
              }
            }
          } catch (err) {
            // Skip errors for individual grid points
            console.warn('Grid search error:', err)
          }
        }
      }

      const newZips = Array.from(allZips)
        .filter((z: string) => !form.extraZips.includes(z) && z !== form.baseZip)
        .sort()

      if (newZips.length > 0) {
        set('extraZips', [...form.extraZips, ...newZips])
        toast.success(`Added ${newZips.length} ZIP codes from ${feature.place_name}`)
        setLocationForZips('')
      } else {
        toast.error('No new ZIP codes found in this area (all may already be added)')
      }
    } catch (error) {
      console.error('Error fetching ZIPs:', error)
      toast.error('Failed to fetch ZIP codes. Please try again.')
    } finally {
      setFetchingZips(false)
    }
  }

  /* ---------------- Validation ---------------- */
  const validateBasics = (f: FormDataT) => {
    const e: Record<string,string> = {}
    if (!f.name.trim()) e.name = 'Required'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Valid email required'
    if (!f.password || f.password.length < 6) e.password = 'Password must be at least 6 characters'
    if (!/^[-+() 0-9]{7,}$/.test(f.phone)) e.phone = 'Phone looks off'
    if (!f.businessName.trim()) e.businessName = 'Required'
    return e
  }
  const validateArea = (f: FormDataT) => {
    const e: Record<string,string> = {}
    if (!f.address.trim()) e.address = 'Street address required'
    if (!zip5(f.baseZip)) e.baseZip = '5-digit ZIP'
    if (!f.categories.length) e.categories = 'Pick at least one'
    const bad = f.extraZips.find(z=>!zip5(z))
    if (bad) e.extraZips = `Invalid ZIP: ${bad}`
    return e
  }
  const validateCredentials = (f: FormDataT) => {
    const e: Record<string,string> = {}
    if (!f.licenseNumber.trim()) e.licenseNumber = 'Required'
    if (!f.licenseState.trim()) e.licenseState = 'Required'
    if (!f.licenseExpires.trim()) e.licenseExpires = 'Required'
    if (!f.insuranceCarrier.trim()) e.insuranceCarrier = 'Required'
    if (!f.insurancePolicy.trim()) e.insurancePolicy = 'Required'
    if (!f.insuranceExpires.trim()) e.insuranceExpires = 'Required'
    // uploads required
    if (!f.licenseProof) e.licenseProof = 'Upload required'
    if (!f.insuranceProof) e.insuranceProof = 'Upload required'
    // simple expiry check
    const today = new Date().toISOString().slice(0,10)
    if (f.licenseExpires && f.licenseExpires < today) e.licenseExpires = 'License expired'
    if (f.insuranceExpires && f.insuranceExpires < today) e.insuranceExpires = 'Policy expired'
    return e
  }
  const validatePricing = (f: FormDataT) => {
    const e: Record<string,string> = {}
    const openAny = DAYS.some(d=>f.hours[d].enabled)
    if (!openAny) e.hours = 'Enable at least one day'
    if (f.rateType==='Hourly') {
      if (!f.hourlyRate.trim()) e.hourlyRate = 'Add base hourly rate'
      if (!f.peakRate.trim()) e.peakRate = 'Add peak hourly rate'
      if (!f.offPeakRate.trim()) e.offPeakRate = 'Add off-peak hourly rate'
      if (!f.surgeRate.trim()) e.surgeRate = 'Add surge hourly rate'
    }
    if (f.rateType==='Flat' && !f.flatMin.trim()) e.flatMin = 'Add a typical flat amount'
    if (!f.visitFee.trim()) e.visitFee = 'Add visit fee'
    if (!f.diagnosticFee.trim()) e.diagnosticFee = 'Add diagnostic fee'
    return e
  }
  const validateReview = (f: FormDataT) => {
    const e: Record<string,string> = {}
    if (!f.agreeTerms) e.agreeTerms = 'You must accept'
    if (!f.certifyAccuracy) e.certifyAccuracy = 'Please certify'
    return e
  }
  const validators: Record<StepId,(f:FormDataT)=>Record<string,string>> = {
    basics: validateBasics, area: validateArea, credentials: validateCredentials, pricing: validatePricing, review: validateReview
  }
  function validateAll(f: FormDataT) {
    return { ...validateBasics(f), ...validateArea(f), ...validateCredentials(f), ...validatePricing(f), ...validateReview(f) }
  }
  function scrollToFirstError(eobj: Record<string,string>) {
    const first = Object.keys(eobj)[0]
    if (!first) return
    document.querySelector<HTMLElement>(`[data-err="${first}"]`)?.scrollIntoView({ behavior:'smooth', block:'center' })
  }

  /* ---------------- Draft actions (kept for restore only) ---------------- */
  function saveDraft() {
    try {
      const { logo, portfolio, licenseProof, insuranceProof, ...json } = form
      localStorage.setItem(DRAFT_KEY, JSON.stringify(json))
    } catch {}
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY) } catch {} }

  /* ---------------- Submit ---------------- */
async function submitAll(e?: React.FormEvent) {
  e?.preventDefault()

  console.log('[WIZARD] submitAll called')

  const eobj = validateAll(form)
  setErrors(eobj)
  if (Object.keys(eobj).length) {
    console.log('[WIZARD] Validation errors:', Object.keys(eobj), eobj)
    scrollToFirstError(eobj)
    toast.error(`Please fix: ${Object.keys(eobj).join(', ')}`, { duration: 4000 })
    return
  }

  setBusy(true)
  console.log('[WIZARD] Submit started - validation passed')

  try {
    // Check if user already has a session
    console.log('[WIZARD] Checking for existing session...')
    let { data: { session } } = await supabase.auth.getSession()
    console.log('[WIZARD] Session check complete. Has session?', !!session, 'User ID:', session?.user?.id?.substring(0, 8))

    // If no session, create new account
    if (!session) {
      console.log('[WIZARD] No session - creating new account with email:', form.email)
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            name: form.name,
            business_name: form.businessName,
            role: 'contractor', // CRITICAL: Prevent auto-creation of homeowner profile
          }
        }
      })

      if (signUpError) {
        console.error('[WIZARD] Signup error:', signUpError)
        toast.error(`Signup error: ${signUpError.message}`, { duration: 5000 })
        setBusy(false)
        return
      }

      session = signUpData.session
      if (!session) {
        toast.error('Account created but could not sign in. Please sign in manually.', { duration: 5000 })
        router.push('/pro/sign-in')
        setBusy(false)
        return
      }
      console.log('[WIZARD] Account created successfully, User ID:', session.user?.id)
    } else {
      console.log('[WIZARD] Existing session found, User ID:', session.user?.id)
    }

    // KYC FLOW:
    // 1. Wizard submit → status: pending_approval, kyc_status: in_progress
    // 2. Admin approves → status: approved, kyc_status: completed
    // 3. Contractor goes online → status: online

    // Create or update contractor profile
    const { data: upsertData, error: profileError } = await supabase
      .from('pro_contractors')
      .upsert({
        id: session.user.id,
        name: form.name,
        business_name: form.businessName,
        email: form.email,
        phone: form.phone,
        license_number: form.licenseNumber,
        license_state: form.licenseState,
        licensed_states: form.licensedStates,
        insurance_carrier: form.insuranceCarrier,
        insurance_policy: form.insurancePolicy,
        categories: form.categories,
        address: form.address,
        latitude: form.latitude,
        longitude: form.longitude,
        base_zip: form.baseZip,
        service_area_zips: [form.baseZip, ...form.extraZips],
        radius_miles: form.radiusMiles,
        emergency_service: form.emergency,
        business_hours: form.hours,
        hourly_rate: form.hourlyRate ? parseFloat(form.hourlyRate.replace(/[^0-9.]/g, '')) : null,
        peak_rate: form.peakRate ? parseFloat(form.peakRate.replace(/[^0-9.]/g, '')) : null,
        off_peak_rate: form.offPeakRate ? parseFloat(form.offPeakRate.replace(/[^0-9.]/g, '')) : null,
        surge_rate: form.surgeRate ? parseFloat(form.surgeRate.replace(/[^0-9.]/g, '')) : null,
        rate_type: form.rateType,
        free_estimates: form.freeEstimates,
        years_in_business: form.yearsInBusiness ? parseInt(form.yearsInBusiness) : null,
        team_size: form.teamSize ? parseInt(form.teamSize) : null,
        about: form.about,
        website: form.website,
        license_type: form.licenseType,
        license_expires: form.licenseExpires,
        insurance_expires: form.insuranceExpires,
        specialties: form.specialties,
        flat_rate_min: form.flatMin ? parseFloat(form.flatMin.replace(/[^0-9.]/g, '')) : null,
        visit_fee: form.visitFee ? parseFloat(form.visitFee.replace(/[^0-9.]/g, '')) : null,
        diagnostic_fee: form.diagnosticFee ? parseFloat(form.diagnosticFee.replace(/[^0-9.]/g, '')) : null,
        instagram: form.instagram,
        facebook: form.facebook,
        yelp: form.yelp,
        google_business: form.google,
        status: 'pending_approval',
        kyc_status: 'in_progress'
      })
      .select()

    if (profileError) {
      console.error('[WIZARD] Database error:', profileError)
      console.error('[WIZARD] Error details:', {
        message: profileError.message,
        code: profileError.code,
        details: profileError.details,
        hint: profileError.hint
      })
      toast.error(`Database error: ${profileError.message}`, {
        duration: 5000,
        position: 'top-center'
      })
      setBusy(false)
      return
    }

    console.log('[WIZARD] Profile saved successfully:', upsertData)

    // Upload logo if provided
    let logoUrl: string | null = null
    if (form.logo) {
      console.log('[WIZARD] Uploading contractor logo...')
      try {
        const fileExt = form.logo.name.split('.').pop()
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`
        const filePath = `contractor-logos/${fileName}`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('contractor-logos')
          .upload(filePath, form.logo, {
            cacheControl: '3600',
            upsert: true
          })

        if (uploadError) {
          console.error('[WIZARD] Logo upload error:', uploadError)
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('contractor-logos')
            .getPublicUrl(filePath)

          logoUrl = publicUrl
          console.log('[WIZARD] Logo uploaded successfully:', logoUrl)

          // Update contractor profile with logo URL
          await supabase
            .from('pro_contractors')
            .update({ logo_url: logoUrl })
            .eq('id', session.user.id)
        }
      } catch (logoError: any) {
        console.error('[WIZARD] Logo upload failed:', logoError)
        // Don't fail wizard if logo upload fails
      }
    }

    // Send welcome email to contractor (non-blocking - don't fail wizard if email fails)
    console.log('[WIZARD] Sending welcome email to contractor...')
    try {
      const emailResponse = await fetch('/api/send-welcome-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          name: form.name,
          businessName: form.businessName,
          type: 'contractor'
        })
      })

      const emailData = await emailResponse.json()
      if (emailData.success) {
        console.log('[WIZARD] ✅ Welcome email sent successfully to', form.email)
      } else {
        console.warn('[WIZARD] ⚠️ Welcome email failed:', emailData.error)
      }
    } catch (emailError: any) {
      console.error('[WIZARD] ❌ Welcome email error:', emailError)
      // Don't fail the wizard if email fails
    }

    // Create Stripe Connect account for payouts
    console.log('[WIZARD] Creating Stripe Connect account...')
    try {
      const stripeResponse = await fetch('/api/stripe/connect/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId: session.user.id,
          email: form.email,
          businessName: form.businessName,
          name: form.name
        })
      })

      console.log('[WIZARD] Stripe create-account response status:', stripeResponse.status)
      const stripeData = await stripeResponse.json()
      console.log('[WIZARD] Stripe create-account data:', stripeData)

      if (!stripeData.success) {
        console.log('[WIZARD] Stripe account creation deferred:', stripeData.error)
        // Don't show error - Stripe setup can be completed after admin verification
      } else {
        console.log('[WIZARD] ✅ Stripe Connect account created:', stripeData.accountId)

        // Get Stripe onboarding link to complete KYC and bank account setup
        console.log('[WIZARD] Getting Stripe onboarding link...')
        try {
          const onboardingResponse = await fetch('/api/stripe/connect/onboarding-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contractorId: session.user.id })
          })

          console.log('[WIZARD] Stripe onboarding-link response status:', onboardingResponse.status)
          const onboardingData = await onboardingResponse.json()
          console.log('[WIZARD] Stripe onboarding-link data:', onboardingData)

          if (onboardingData.success && onboardingData.url) {
            clearDraft()
            toast.success('Redirecting to Stripe to complete payment setup...', { duration: 3000 })
            console.log('[WIZARD] ✅ Redirecting to Stripe onboarding:', onboardingData.url)
            setTimeout(() => { window.location.href = onboardingData.url }, 1000)
            return // Exit here - Stripe will redirect back to dashboard
          } else {
            console.error('[WIZARD] ❌ Failed to get onboarding link:', onboardingData.error)
            toast.error(`Could not generate Stripe link: ${onboardingData.error}`, { duration: 6000 })
          }
        } catch (onboardingError: any) {
          console.error('[WIZARD] ❌ Onboarding link fetch error:', onboardingError)
          toast.error(`Network error: ${onboardingError.message}. Complete setup from dashboard.`, { duration: 6000 })
        }
      }
    } catch (stripeError: any) {
      console.error('[WIZARD] ❌ Stripe Connect fetch error:', stripeError)
      toast.error(`Network error: ${stripeError.message}. Complete setup from dashboard.`, { duration: 6000 })
      // Don't fail wizard - can complete Stripe setup later
    }

    // Fallback: If Stripe setup fails, still let them access dashboard
    clearDraft()
    setBusy(false) // IMPORTANT: Clear busy state BEFORE alert/redirect
    toast.success('Welcome to Rushr Pro! Complete payment setup from dashboard.', { duration: 5000 })

    console.log('[WIZARD] ========================================')
    console.log('[WIZARD] CONTRACTOR PROFILE CREATED SUCCESSFULLY')
    console.log('[WIZARD] User ID:', session.user.id)
    console.log('[WIZARD] Email:', form.email)
    console.log('[WIZARD] Base Zip:', form.baseZip)
    console.log('[WIZARD] Categories:', form.categories)
    console.log('[WIZARD] Profile data:', upsertData)
    console.log('[WIZARD] ========================================')
    console.log('[WIZARD] Waiting 2 seconds before redirect...')

    // CRITICAL: Wait 2 seconds for ProAuthContext to reload the contractor profile
    // Otherwise the dashboard will think wizard isn't complete and redirect back here
    await new Promise(resolve => setTimeout(resolve, 2000))

    console.log('[WIZARD] ========================================')
    console.log('[WIZARD] REDIRECTING TO CONTRACTOR DASHBOARD')
    console.log('[WIZARD] Target: /dashboard/contractor')
    console.log('[WIZARD] Method: window.location.href (hard redirect)')
    console.log('[WIZARD] ========================================')
    // Use window.location.href to bypass all client-side routing and force a full page load
    window.location.href = '/dashboard/contractor'
  } catch (err: any) {
    console.error('[WIZARD] Submit error:', err)
    toast.error(`Error: ${err?.message || 'Could not submit. Check console.'}`, { duration: 5000 })
    setBusy(false)
  }
}

  /* ---------------- UI helpers ---------------- */
  function nextStep() {
    const eobj = validators[step](form); setErrors(eobj)
    if (Object.keys(eobj).length) { scrollToFirstError(eobj); return }
    if (idx < STEPS.length-1) setStep(STEPS[idx+1])
  }
  const prevStep = () => { if (idx>0) setStep(STEPS[idx-1]) }
  const badgeErr = (key: string) => errors[key] ? 'ring-rose-300 border-rose-300' : ''
  const hintErr  = (key: string) => errors[key] ? <div className="mt-1 text-[11px] text-rose-600">{errors[key]}</div> : null
  const SectionTitle = ({children}:{children:React.ReactNode}) => (<div className="text-sm font-semibold text-slate-900 mb-2">{children}</div>)

  /* ====================== Render ====================== */
  return (
    <IOSProWizardWrapper>
      <Toaster position="top-center" />
      <section className="section min-h-screen bg-gray-50 py-12">
        <div className="container max-w-4xl mx-auto px-4">
        {/* Header row */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Become a Rushr Pro</h1>
            <p className="text-slate-600 mt-1">Tell us about your business so homeowners can hire you with confidence.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50" onClick={()=> setMode(m => m==='wizard' ? 'full' : 'wizard')}>
              {mode==='wizard' ? 'Switch to full form' : 'Switch to wizard'}
            </button>
          </div>
        </div>

        {/* Progress (wizard) */}
        {mode==='wizard' && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
              <span>{TITLES[step]}</span>
              <span>Step {idx+1} of {STEPS.length}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-blue-600 transition-[width]" style={{ width: `${(idx)/(STEPS.length-1)*100}%` }} />
            </div>
          </div>
        )}

        {/* ------------- WIZARD ------------- */}
        {mode==='wizard' && (
          <form onSubmit={submitAll} className="bg-white rounded-lg shadow-md p-6">
            {step==='basics' && (
              <div className="grid md:grid-cols-2 gap-4">
                <div data-err="name">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your name *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('name')}`} value={form.name} onChange={e=>set('name', e.target.value)} placeholder="Alex Contractor" />
                  {hintErr('name')}
                </div>
                <div data-err="email">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" className={`w-full px-3 py-2 border rounded-md ${badgeErr('email')}`} value={form.email} onChange={e=>set('email', e.target.value)} placeholder="you@company.com" />
                  {hintErr('email')}
                </div>
                <div data-err="password">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <input type="password" className={`w-full px-3 py-2 border rounded-md ${badgeErr('password')}`} value={form.password} onChange={e=>set('password', e.target.value)} placeholder="Create a secure password (min 6 chars)" minLength={6} />
                  {hintErr('password')}
                </div>
                <div data-err="phone">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('phone')}`} value={form.phone} onChange={e=>set('phone', e.target.value)} placeholder="(555) 555-5555" />
                  {hintErr('phone')}
                </div>
                <div data-err="businessName">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business name *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('businessName')}`} value={form.businessName} onChange={e=>set('businessName', e.target.value)} placeholder="BrightSpark Electric LLC" />
                  {hintErr('businessName')}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <input className="w-full px-3 py-2 border rounded-md" value={form.website} onChange={e=>set('website', e.target.value)} placeholder="https://example.com" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Years in business</label>
                    <input className="w-full px-3 py-2 border rounded-md" value={form.yearsInBusiness} onChange={e=>set('yearsInBusiness', e.target.value)} placeholder="e.g., 8" inputMode="numeric" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Team size</label>
                    <input className="w-full px-3 py-2 border rounded-md" value={form.teamSize} onChange={e=>set('teamSize', e.target.value)} placeholder="e.g., 3" inputMode="numeric" />
                  </div>
                </div>

                {/* About */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">About your business</label>
                  <textarea
                    className="w-full min-h-[120px] px-3 py-2 border rounded-md"
                    value={form.about}
                    onChange={(e)=>set('about', e.target.value)}
                    placeholder="What you specialize in, what customers love, service guarantees, etc."
                  />
                </div>

                {/* Logo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Logo (optional)</label>
                  {!form.logo ? (
                    <label className="px-4 py-2 border rounded-md cursor-pointer inline-block hover:bg-gray-50">
                      Upload
                      <input type="file" className="hidden" accept="image/*" onChange={e=> set('logo', e.target.files?.[0] ?? null)} />
                    </label>
                  ) : (
                    <div className="flex items-center gap-3">
                      <img src={URL.createObjectURL(form.logo)} alt="logo preview" className="h-16 w-16 object-contain rounded border border-slate-200 bg-white" />
                      <button type="button" className="px-4 py-2 border rounded-md hover:bg-gray-50" onClick={()=>set('logo', null)}>Remove</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step==='area' && (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2" data-err="address">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Address *
                    <span className="text-xs text-gray-500 ml-2">(This will be shown on the map)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      className={`flex-1 px-3 py-2 border rounded-md ${badgeErr('address')}`}
                      value={form.address}
                      onChange={async (e) => {
                        set('address', e.target.value)
                        // Auto-geocode when valid address + ZIP entered
                        if (e.target.value && form.baseZip && /^\d{5}$/.test(form.baseZip)) {
                          setGeocoding(true)
                          const coords = await geocodeAddress(e.target.value, form.baseZip)
                          if (coords) {
                            set('latitude', coords.lat)
                            set('longitude', coords.lng)
                          }
                          setGeocoding(false)
                        }
                      }}
                      placeholder="123 Main Street, Brooklyn, NY"
                    />
                    <button
                      type="button"
                      onClick={useCurrentLocation}
                      disabled={geocoding}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap flex items-center gap-2"
                    >
                      {geocoding ? (
                        <>
                          <img
          src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
          alt="Loading..."
          className="h-4 w-4 border-2 border-white border-t-transparent rounded-full object-contain"
        />
                          Getting...
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Use My Location
                        </>
                      )}
                    </button>
                  </div>
                  {hintErr('address')}
                  {locationError && <div className="mt-1 text-xs text-amber-600">{locationError}</div>}
                  {form.latitude && form.longitude && (
                    <div className="mt-1 text-xs text-green-600">
                      ✓ Location verified: {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
                    </div>
                  )}
                </div>

                <div data-err="baseZip">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base ZIP *</label>
                  <input
                    className={`w-full px-3 py-2 border rounded-md ${badgeErr('baseZip')}`}
                    value={form.baseZip}
                    onChange={async (e) => {
                      set('baseZip', e.target.value)
                      // Auto-geocode when valid ZIP is entered with address
                      if (/^\d{5}$/.test(e.target.value) && form.address) {
                        setGeocoding(true)
                        const coords = await geocodeAddress(form.address, e.target.value)
                        if (coords) {
                          set('latitude', coords.lat)
                          set('longitude', coords.lng)
                        }
                        setGeocoding(false)
                      }
                    }}
                    placeholder="11215"
                    inputMode="numeric"
                  />
                  {hintErr('baseZip')}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Coverage radius (miles)</label>
                  <select className="w-full px-3 py-2 border rounded-md" value={form.radiusMiles} onChange={e=>set('radiusMiles', Number(e.target.value))}>
                    {[5,10,15,25,50].map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2" data-err="extraZips">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional ZIPs</label>

                  {/* Fetch ZIPs by Location */}
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-medium text-blue-900">Quick Add: Fetch all ZIPs from a location</label>
                      {form.extraZips.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            set('extraZips', [])
                            toast.success('All ZIP codes cleared')
                          }}
                          className="text-xs text-rose-600 hover:text-rose-700 underline font-medium"
                        >
                          Clear All ZIPs
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={locationForZips}
                        onChange={(e) => setLocationForZips(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            fetchZipsByLocation()
                          }
                        }}
                        placeholder="e.g., Brooklyn, Manhattan, New York"
                        className="flex-1 px-3 py-2 border border-blue-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={fetchZipsByLocation}
                        disabled={fetchingZips || !locationForZips.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm font-medium"
                      >
                        {fetchingZips ? 'Fetching...' : 'Get ZIPs'}
                      </button>
                    </div>
                    <p className="text-xs text-blue-700 mt-2">Enter a city or area name to automatically add all ZIP codes. You can remove unwanted ZIPs below.</p>
                  </div>

                  <TagInput
                    values={form.extraZips}
                    onChange={(vals)=>set('extraZips', vals)}
                    placeholder="Or type individual ZIPs and press Enter…"
                    allowComma
                    allowEnter
                    inputMode="numeric"
                    validate={(v)=> /^\d{5}$/.test(v) ? null : '5-digit ZIP'}
                  />
                  {hintErr('extraZips')}
                </div>

                <div data-err="categories" className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categories you serve *</label>
                  <div className={`rounded-xl border p-2 ${errors.categories ? 'border-rose-300 ring-rose-300' : 'border-slate-200'}`}>
                    <div className="flex flex-wrap gap-2">
                      {categories.map(c=>(
                        <button
                          key={c}
                          type="button"
                          onClick={()=> set('categories', toggle(form.categories, c))}
                          className={`px-3 py-1.5 rounded-lg border text-sm ${
                            form.categories.includes(c)
                              ? 'border-blue-500 text-blue-700 bg-blue-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  {hintErr('categories')}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specialties</label>
                  <TagInput
                    values={form.specialties}
                    onChange={(vals)=>set('specialties', vals)}
                    placeholder="Add specialties (Enter or comma)…"
                    allowComma
                    allowEnter
                  />
                </div>
              </div>
            )}

            {step==='credentials' && (
              <div className="grid md:grid-cols-2 gap-4">
                <div data-err="licenseNumber">
                  <label className="block text-sm font-medium text-gray-700 mb-1">License # *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('licenseNumber')}`} value={form.licenseNumber} onChange={e=>set('licenseNumber', e.target.value)} placeholder="123456" />
                  {hintErr('licenseNumber')}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License type</label>
                  <input className="w-full px-3 py-2 border rounded-md" value={form.licenseType} onChange={e=>set('licenseType', e.target.value)} placeholder="Master electrician, Home improvement contractor…" />
                </div>
                <div data-err="licenseState">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issuing state/authority *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('licenseState')}`} value={form.licenseState} onChange={e=>set('licenseState', e.target.value)} placeholder="NY (DOB), NJ (DCA), etc." />
                  {hintErr('licenseState')}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">States licensed in</label>
                  <input className="w-full px-3 py-2 border rounded-md" value={form.licensedStates} onChange={e=>set('licensedStates', e.target.value)} placeholder="NY, NJ, CT" />
                  <div className="mt-1 text-xs text-slate-500">Comma-separated list of states</div>
                </div>
                <div data-err="licenseExpires">
                  <label className="block text-sm font-medium text-gray-700 mb-1">License expires *</label>
                  <input type="date" className={`w-full px-3 py-2 border rounded-md ${badgeErr('licenseExpires')}`} value={form.licenseExpires} onChange={e=>set('licenseExpires', e.target.value)} />
                  {hintErr('licenseExpires')}
                </div>

                <div data-err="insuranceCarrier">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Insurance carrier *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('insuranceCarrier')}`} value={form.insuranceCarrier} onChange={e=>set('insuranceCarrier', e.target.value)} placeholder="ABC Insurance" />
                  {hintErr('insuranceCarrier')}
                </div>
                <div data-err="insurancePolicy">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Policy # *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('insurancePolicy')}`} value={form.insurancePolicy} onChange={e=>set('insurancePolicy', e.target.value)} placeholder="POL-1234567" />
                  {hintErr('insurancePolicy')}
                </div>
                <div data-err="insuranceExpires">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Policy expires *</label>
                  <input type="date" className={`w-full px-3 py-2 border rounded-md ${badgeErr('insuranceExpires')}`} value={form.insuranceExpires} onChange={e=>set('insuranceExpires', e.target.value)} />
                  {hintErr('insuranceExpires')}
                </div>

                {/* License proof */}
                <div data-err="licenseProof">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Upload license proof (PDF/JPG)</label>
                  {!form.licenseProof ? (
                    <label className="px-4 py-2 border rounded-md cursor-pointer inline-block hover:bg-gray-50">
                      Upload
                      <input type="file" className="hidden" accept=".pdf,image/*" onChange={e=> set('licenseProof', e.target.files?.[0] ?? null)} />
                    </label>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="truncate max-w-[240px]">{form.licenseProof.name}</span>
                      <button type="button" className="px-4 py-2 border rounded-md hover:bg-gray-50" onClick={()=>set('licenseProof', null)}>Remove</button>
                    </div>
                  )}
                  {hintErr('licenseProof')}
                </div>

                {/* Insurance proof */}
                <div data-err="insuranceProof">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Upload insurance COI (PDF/JPG)</label>
                  {!form.insuranceProof ? (
                    <label className="px-4 py-2 border rounded-md cursor-pointer inline-block hover:bg-gray-50">
                      Upload
                      <input type="file" className="hidden" accept=".pdf,image/*" onChange={e=> set('insuranceProof', e.target.files?.[0] ?? null)} />
                    </label>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="truncate max-w-[240px]">{form.insuranceProof.name}</span>
                      <button type="button" className="px-4 py-2 border rounded-md hover:bg-gray-50" onClick={()=>set('insuranceProof', null)}>Remove</button>
                    </div>
                  )}
                  {hintErr('insuranceProof')}
                </div>
              </div>
            )}

            {step==='pricing' && (
              <div className="space-y-4">
                <div>
                  <SectionTitle>Pricing</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    {(['Hourly','Flat'] as RateType[]).map(rt=>(
                      <button
                        key={rt}
                        type="button"
                        onClick={()=>set('rateType', rt)}
                        className={`px-3 py-1.5 rounded-lg border text-sm ${
                          form.rateType===rt ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {rt}
                      </button>
                    ))}
                  </div>

                  {form.rateType==='Hourly' && (
                    <div className="mt-3 space-y-3">
                      <div className="grid md:grid-cols-2 gap-3">
                        <div data-err="hourlyRate">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Base hourly rate *</label>
                          <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('hourlyRate')}`} value={form.hourlyRate} onChange={e=>set('hourlyRate', e.target.value)} placeholder="$120" />
                          {hintErr('hourlyRate')}
                        </div>
                        <div data-err="peakRate">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Peak hourly rate *</label>
                          <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('peakRate')}`} value={form.peakRate} onChange={e=>set('peakRate', e.target.value)} placeholder="$150" />
                          {hintErr('peakRate')}
                        </div>
                        <div data-err="offPeakRate">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Off-peak hourly rate *</label>
                          <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('offPeakRate')}`} value={form.offPeakRate} onChange={e=>set('offPeakRate', e.target.value)} placeholder="$100" />
                          {hintErr('offPeakRate')}
                        </div>
                        <div data-err="surgeRate">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Surge hourly rate *</label>
                          <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('surgeRate')}`} value={form.surgeRate} onChange={e=>set('surgeRate', e.target.value)} placeholder="$200" />
                          {hintErr('surgeRate')}
                        </div>
                      </div>
                    </div>
                  )}
                  {form.rateType==='Flat' && (
                    <div className="mt-2" data-err="flatMin">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Typical flat price *</label>
                      <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('flatMin')}`} value={form.flatMin} onChange={e=>set('flatMin', e.target.value)} placeholder="$600" />
                      {hintErr('flatMin')}
                    </div>
                  )}

                  <div className="mt-3 grid md:grid-cols-2 gap-3">
                    <div data-err="visitFee">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Visit fee *</label>
                      <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('visitFee')}`} value={form.visitFee} onChange={e=>set('visitFee', e.target.value)} placeholder="$89" />
                      {hintErr('visitFee')}
                    </div>
                    <div data-err="diagnosticFee">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Diagnostic fee *</label>
                      <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('diagnosticFee')}`} value={form.diagnosticFee} onChange={e=>set('diagnosticFee', e.target.value)} placeholder="$75" />
                      {hintErr('diagnosticFee')}
                    </div>
                  </div>

                  <label className="mt-3 flex items-center gap-2">
                    <input type="checkbox" checked={form.freeEstimates} onChange={e=>set('freeEstimates', e.target.checked)} />
                    Offer free estimates
                  </label>
                </div>

                <div>
                  <SectionTitle>Availability & Hours</SectionTitle>

                  <div className={`mt-3 rounded-xl border p-3 ${badgeErr('hours')}`} data-err="hours">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {DAYS.map((d)=>(
                        <div key={d} className="flex items-center gap-2 text-sm">
                          <label className="w-10">{d}</label>
                          <input type="checkbox" checked={form.hours[d].enabled} onChange={e=>setHours(d, { enabled: e.target.checked })} />
                          <input className="w-20 px-2 py-1 border rounded" value={form.hours[d].open} onChange={e=>setHours(d, { open: e.target.value })} placeholder="09:00" />
                          <span>–</span>
                          <input className="w-20 px-2 py-1 border rounded" value={form.hours[d].close} onChange={e=>setHours(d, { close: e.target.value })} placeholder="17:00" />
                        </div>
                      ))}
                    </div>
                    {hintErr('hours')}
                    <div className="mt-1 text-xs text-slate-500">Use 24-hour format (e.g., 08:30, 17:00). Uncheck to mark a day as closed.</div>
                  </div>
                </div>
              </div>
            )}

            {step==='review' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold mb-3">Quick preview</div>

                  {/* Logo Preview */}
                  {form.logo && (
                    <div className="mb-4 flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                      <img
                        src={URL.createObjectURL(form.logo)}
                        alt="Business logo"
                        className="h-20 w-20 object-contain rounded-lg border-2 border-slate-200 bg-white shadow-sm"
                      />
                      <div className="text-xs text-slate-600">
                        <div className="font-medium text-slate-900">Your Logo</div>
                        <div>This will appear on your profile</div>
                      </div>
                    </div>
                  )}

                  <ul className="text-sm text-slate-700 space-y-1">
                    <li><b>{form.businessName || 'Your business name'}</b> — {form.categories.join(', ') || 'No categories selected'}</li>
                    <li>{form.baseZip ? `Base ZIP ${form.baseZip}` : 'No base ZIP'} • Radius {form.radiusMiles} mi</li>
                    <li>Extra ZIPs: {form.extraZips.length ? form.extraZips.join(', ') : '—'}</li>
                    <li>License #{form.licenseNumber || '—'} (Expires: {form.licenseExpires || '—'})</li>
                    <li>Insurance: {form.insuranceCarrier || '—'} (Expires: {form.insuranceExpires || '—'})</li>
                    <li>Rate: {form.rateType} {form.rateType==='Hourly' ? form.hourlyRate : form.rateType==='Flat' ? form.flatMin : form.visitFee}</li>
                    <li>Specialties: {form.specialties.length ? form.specialties.join(', ') : '—'}</li>
                    {form.website && <li>Website: <a href={form.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{form.website}</a></li>}
                  </ul>
                </div>

                <div className="grid gap-2">
                  <label className="flex items-start gap-2 text-sm" data-err="agreeTerms">
                    <input type="checkbox" checked={form.agreeTerms} onChange={e=>set('agreeTerms', e.target.checked)} />
                    <span>I agree to the <a className="text-blue-600 underline" href="/terms" target="_blank">Terms</a> and <a className="text-blue-600 underline" href="/privacy" target="_blank">Privacy Policy</a>.
                      {errors.agreeTerms && <span className="block text-rose-600 text-xs">You must accept.</span>}
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm" data-err="certifyAccuracy">
                    <input type="checkbox" checked={form.certifyAccuracy} onChange={e=>set('certifyAccuracy', e.target.checked)} />
                    <span>I certify the information is accurate and I'm authorized to represent this business.
                      {errors.certifyAccuracy && <span className="block text-rose-600 text-xs">Please certify.</span>}
                    </span>
                  </label>
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={busy || !form.agreeTerms || !form.certifyAccuracy}
                  >
                    {busy ? 'Submitting…' : 'Submit for review'}
                  </button>
                </div>
              </div>
            )}

            {/* Wizard footer nav */}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
              {canBack && <button type="button" className="px-4 py-2 border rounded-md hover:bg-gray-50" onClick={prevStep}>Back</button>}
              {canNext && <button type="button" className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" onClick={nextStep}>Next</button>}
              <span className="text-xs text-slate-500 ml-auto">We typically review new pros within 1–2 business days.</span>
            </div>
          </form>
        )}

        {/* ------------- FULL FORM MODE ------------- */}
        {mode==='full' && (
          <form onSubmit={submitAll} className="bg-white rounded-lg shadow-md p-6 space-y-8">
            {/* BASICS */}
            <div>
              <h2 className="text-xl font-semibold text-slate-900 mb-4 border-b pb-2">Basic Information</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div data-err="name">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your name *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('name')}`} value={form.name} onChange={e=>set('name', e.target.value)} placeholder="Alex Contractor" />
                  {hintErr('name')}
                </div>
                <div data-err="email">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" className={`w-full px-3 py-2 border rounded-md ${badgeErr('email')}`} value={form.email} onChange={e=>set('email', e.target.value)} placeholder="you@company.com" />
                  {hintErr('email')}
                </div>
                <div data-err="password">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <input type="password" className={`w-full px-3 py-2 border rounded-md ${badgeErr('password')}`} value={form.password} onChange={e=>set('password', e.target.value)} placeholder="Create a secure password (min 6 chars)" minLength={6} />
                  {hintErr('password')}
                </div>
                <div data-err="phone">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('phone')}`} value={form.phone} onChange={e=>set('phone', e.target.value)} placeholder="(555) 555-5555" />
                  {hintErr('phone')}
                </div>
                <div data-err="businessName">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business name *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('businessName')}`} value={form.businessName} onChange={e=>set('businessName', e.target.value)} placeholder="BrightSpark Electric LLC" />
                  {hintErr('businessName')}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <input className="w-full px-3 py-2 border rounded-md" value={form.website} onChange={e=>set('website', e.target.value)} placeholder="https://example.com" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Years in business</label>
                    <input className="w-full px-3 py-2 border rounded-md" value={form.yearsInBusiness} onChange={e=>set('yearsInBusiness', e.target.value)} placeholder="e.g., 8" inputMode="numeric" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Team size</label>
                    <input className="w-full px-3 py-2 border rounded-md" value={form.teamSize} onChange={e=>set('teamSize', e.target.value)} placeholder="e.g., 3" inputMode="numeric" />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">About your business</label>
                  <textarea
                    className="w-full min-h-[120px] px-3 py-2 border rounded-md"
                    value={form.about}
                    onChange={(e)=>set('about', e.target.value)}
                    placeholder="What you specialize in, what customers love, service guarantees, etc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Logo (optional)</label>
                  {!form.logo ? (
                    <label className="px-4 py-2 border rounded-md cursor-pointer inline-block hover:bg-gray-50">
                      Upload
                      <input type="file" className="hidden" accept="image/*" onChange={e=> set('logo', e.target.files?.[0] ?? null)} />
                    </label>
                  ) : (
                    <div className="flex items-center gap-3">
                      <img src={URL.createObjectURL(form.logo)} alt="logo preview" className="h-16 w-16 object-contain rounded border border-slate-200 bg-white" />
                      <button type="button" className="px-4 py-2 border rounded-md hover:bg-gray-50" onClick={()=>set('logo', null)}>Remove</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SERVICE AREA */}
            <div>
              <h2 className="text-xl font-semibold text-slate-900 mb-4 border-b pb-2">Service Area</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2" data-err="address">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Address *
                    <span className="text-xs text-gray-500 ml-2">(This will be shown on the map)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      className={`flex-1 px-3 py-2 border rounded-md ${badgeErr('address')}`}
                      value={form.address}
                      onChange={async (e) => {
                        set('address', e.target.value)
                        if (e.target.value && form.baseZip && /^\d{5}$/.test(form.baseZip)) {
                          setGeocoding(true)
                          const coords = await geocodeAddress(e.target.value, form.baseZip)
                          if (coords) {
                            set('latitude', coords.lat)
                            set('longitude', coords.lng)
                          }
                          setGeocoding(false)
                        }
                      }}
                      placeholder="123 Main Street, Brooklyn, NY"
                    />
                    <button
                      type="button"
                      onClick={useCurrentLocation}
                      disabled={geocoding}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap flex items-center gap-2"
                    >
                      {geocoding ? (
                        <>
                          <img
                            src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
                            alt="Loading..."
                            className="h-4 w-4 border-2 border-white border-t-transparent rounded-full object-contain"
                          />
                          Getting...
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Use My Location
                        </>
                      )}
                    </button>
                  </div>
                  {hintErr('address')}
                  {locationError && <div className="mt-1 text-xs text-amber-600">{locationError}</div>}
                  {form.latitude && form.longitude && (
                    <div className="mt-1 text-xs text-green-600">
                      ✓ Location verified: {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
                    </div>
                  )}
                </div>
                <div data-err="baseZip">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base ZIP *</label>
                  <input
                    className={`w-full px-3 py-2 border rounded-md ${badgeErr('baseZip')}`}
                    value={form.baseZip}
                    onChange={async (e) => {
                      set('baseZip', e.target.value)
                      if (/^\d{5}$/.test(e.target.value) && form.address) {
                        setGeocoding(true)
                        const coords = await geocodeAddress(form.address, e.target.value)
                        if (coords) {
                          set('latitude', coords.lat)
                          set('longitude', coords.lng)
                        }
                        setGeocoding(false)
                      }
                    }}
                    placeholder="11215"
                    inputMode="numeric"
                  />
                  {hintErr('baseZip')}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Coverage radius (miles)</label>
                  <select className="w-full px-3 py-2 border rounded-md" value={form.radiusMiles} onChange={e=>set('radiusMiles', Number(e.target.value))}>
                    {[5,10,15,25,50].map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2" data-err="extraZips">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional ZIPs</label>

                  {/* Fetch ZIPs by Location */}
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-medium text-blue-900">Quick Add: Fetch all ZIPs from a location</label>
                      {form.extraZips.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            set('extraZips', [])
                            toast.success('All ZIP codes cleared')
                          }}
                          className="text-xs text-rose-600 hover:text-rose-700 underline font-medium"
                        >
                          Clear All ZIPs
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={locationForZips}
                        onChange={(e) => setLocationForZips(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            fetchZipsByLocation()
                          }
                        }}
                        placeholder="e.g., Brooklyn, Manhattan, New York"
                        className="flex-1 px-3 py-2 border border-blue-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={fetchZipsByLocation}
                        disabled={fetchingZips || !locationForZips.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm font-medium"
                      >
                        {fetchingZips ? 'Fetching...' : 'Get ZIPs'}
                      </button>
                    </div>
                    <p className="text-xs text-blue-700 mt-2">Enter a city or area name to automatically add all ZIP codes. You can remove unwanted ZIPs below.</p>
                  </div>

                  <TagInput
                    values={form.extraZips}
                    onChange={(vals)=>set('extraZips', vals)}
                    placeholder="Or type individual ZIPs and press Enter…"
                    allowComma
                    allowEnter
                    inputMode="numeric"
                    validate={(v)=> /^\d{5}$/.test(v) ? null : '5-digit ZIP'}
                  />
                  {hintErr('extraZips')}
                </div>
                <div data-err="categories" className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categories you serve *</label>
                  <div className={`rounded-xl border p-2 ${errors.categories ? 'border-rose-300 ring-rose-300' : 'border-slate-200'}`}>
                    <div className="flex flex-wrap gap-2">
                      {categories.map(c=>(
                        <button
                          key={c}
                          type="button"
                          onClick={()=> set('categories', toggle(form.categories, c))}
                          className={`px-3 py-1.5 rounded-lg border text-sm ${
                            form.categories.includes(c)
                              ? 'border-blue-500 text-blue-700 bg-blue-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  {hintErr('categories')}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specialties</label>
                  <TagInput
                    values={form.specialties}
                    onChange={(vals)=>set('specialties', vals)}
                    placeholder="Add specialties (Enter or comma)…"
                    allowComma
                    allowEnter
                  />
                </div>
              </div>
            </div>

            {/* CREDENTIALS */}
            <div>
              <h2 className="text-xl font-semibold text-slate-900 mb-4 border-b pb-2">License & Insurance</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div data-err="licenseNumber">
                  <label className="block text-sm font-medium text-gray-700 mb-1">License # *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('licenseNumber')}`} value={form.licenseNumber} onChange={e=>set('licenseNumber', e.target.value)} placeholder="123456" />
                  {hintErr('licenseNumber')}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License type</label>
                  <input className="w-full px-3 py-2 border rounded-md" value={form.licenseType} onChange={e=>set('licenseType', e.target.value)} placeholder="Master electrician, Home improvement contractor…" />
                </div>
                <div data-err="licenseState">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issuing state/authority *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('licenseState')}`} value={form.licenseState} onChange={e=>set('licenseState', e.target.value)} placeholder="NY (DOB), NJ (DCA), etc." />
                  {hintErr('licenseState')}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">States licensed in</label>
                  <input className="w-full px-3 py-2 border rounded-md" value={form.licensedStates} onChange={e=>set('licensedStates', e.target.value)} placeholder="NY, NJ, CT" />
                  <div className="mt-1 text-xs text-slate-500">Comma-separated list of states</div>
                </div>
                <div data-err="licenseExpires">
                  <label className="block text-sm font-medium text-gray-700 mb-1">License expires *</label>
                  <input type="date" className={`w-full px-3 py-2 border rounded-md ${badgeErr('licenseExpires')}`} value={form.licenseExpires} onChange={e=>set('licenseExpires', e.target.value)} />
                  {hintErr('licenseExpires')}
                </div>
                <div data-err="insuranceCarrier">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Insurance carrier *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('insuranceCarrier')}`} value={form.insuranceCarrier} onChange={e=>set('insuranceCarrier', e.target.value)} placeholder="ABC Insurance" />
                  {hintErr('insuranceCarrier')}
                </div>
                <div data-err="insurancePolicy">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Policy # *</label>
                  <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('insurancePolicy')}`} value={form.insurancePolicy} onChange={e=>set('insurancePolicy', e.target.value)} placeholder="POL-1234567" />
                  {hintErr('insurancePolicy')}
                </div>
                <div data-err="insuranceExpires">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Policy expires *</label>
                  <input type="date" className={`w-full px-3 py-2 border rounded-md ${badgeErr('insuranceExpires')}`} value={form.insuranceExpires} onChange={e=>set('insuranceExpires', e.target.value)} />
                  {hintErr('insuranceExpires')}
                </div>
                <div data-err="licenseProof">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Upload license proof (PDF/JPG)</label>
                  {!form.licenseProof ? (
                    <label className="px-4 py-2 border rounded-md cursor-pointer inline-block hover:bg-gray-50">
                      Upload
                      <input type="file" className="hidden" accept=".pdf,image/*" onChange={e=> set('licenseProof', e.target.files?.[0] ?? null)} />
                    </label>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="truncate max-w-[240px]">{form.licenseProof.name}</span>
                      <button type="button" className="px-4 py-2 border rounded-md hover:bg-gray-50" onClick={()=>set('licenseProof', null)}>Remove</button>
                    </div>
                  )}
                  {hintErr('licenseProof')}
                </div>
                <div data-err="insuranceProof">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Upload insurance COI (PDF/JPG)</label>
                  {!form.insuranceProof ? (
                    <label className="px-4 py-2 border rounded-md cursor-pointer inline-block hover:bg-gray-50">
                      Upload
                      <input type="file" className="hidden" accept=".pdf,image/*" onChange={e=> set('insuranceProof', e.target.files?.[0] ?? null)} />
                    </label>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="truncate max-w-[240px]">{form.insuranceProof.name}</span>
                      <button type="button" className="px-4 py-2 border rounded-md hover:bg-gray-50" onClick={()=>set('insuranceProof', null)}>Remove</button>
                    </div>
                  )}
                  {hintErr('insuranceProof')}
                </div>
              </div>
            </div>

            {/* PRICING & AVAILABILITY */}
            <div>
              <h2 className="text-xl font-semibold text-slate-900 mb-4 border-b pb-2">Pricing & Availability</h2>
              <div className="space-y-4">
                <div>
                  <SectionTitle>Pricing</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    {(['Hourly','Flat'] as RateType[]).map(rt=>(
                      <button
                        key={rt}
                        type="button"
                        onClick={()=>set('rateType', rt)}
                        className={`px-3 py-1.5 rounded-lg border text-sm ${
                          form.rateType===rt ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {rt}
                      </button>
                    ))}
                  </div>

                  {form.rateType==='Hourly' && (
                    <div className="mt-3 space-y-3">
                      <div className="grid md:grid-cols-2 gap-3">
                        <div data-err="hourlyRate">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Base hourly rate *</label>
                          <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('hourlyRate')}`} value={form.hourlyRate} onChange={e=>set('hourlyRate', e.target.value)} placeholder="$120" />
                          {hintErr('hourlyRate')}
                        </div>
                        <div data-err="peakRate">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Peak hourly rate *</label>
                          <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('peakRate')}`} value={form.peakRate} onChange={e=>set('peakRate', e.target.value)} placeholder="$150" />
                          {hintErr('peakRate')}
                        </div>
                        <div data-err="offPeakRate">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Off-peak hourly rate *</label>
                          <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('offPeakRate')}`} value={form.offPeakRate} onChange={e=>set('offPeakRate', e.target.value)} placeholder="$100" />
                          {hintErr('offPeakRate')}
                        </div>
                        <div data-err="surgeRate">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Surge hourly rate *</label>
                          <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('surgeRate')}`} value={form.surgeRate} onChange={e=>set('surgeRate', e.target.value)} placeholder="$200" />
                          {hintErr('surgeRate')}
                        </div>
                      </div>
                    </div>
                  )}
                  {form.rateType==='Flat' && (
                    <div className="mt-2" data-err="flatMin">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Typical flat price *</label>
                      <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('flatMin')}`} value={form.flatMin} onChange={e=>set('flatMin', e.target.value)} placeholder="$600" />
                      {hintErr('flatMin')}
                    </div>
                  )}

                  <div className="mt-3 grid md:grid-cols-2 gap-3">
                    <div data-err="visitFee">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Visit fee *</label>
                      <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('visitFee')}`} value={form.visitFee} onChange={e=>set('visitFee', e.target.value)} placeholder="$89" />
                      {hintErr('visitFee')}
                    </div>
                    <div data-err="diagnosticFee">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Diagnostic fee *</label>
                      <input className={`w-full px-3 py-2 border rounded-md ${badgeErr('diagnosticFee')}`} value={form.diagnosticFee} onChange={e=>set('diagnosticFee', e.target.value)} placeholder="$75" />
                      {hintErr('diagnosticFee')}
                    </div>
                  </div>

                  <label className="mt-3 flex items-center gap-2">
                    <input type="checkbox" checked={form.freeEstimates} onChange={e=>set('freeEstimates', e.target.checked)} />
                    Offer free estimates
                  </label>
                </div>
                <div>
                  <SectionTitle>Availability & Hours</SectionTitle>
                  <div className={`mt-3 rounded-xl border p-3 ${badgeErr('hours')}`} data-err="hours">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {DAYS.map((d)=>(
                        <div key={d} className="flex items-center gap-2 text-sm">
                          <label className="w-10">{d}</label>
                          <input type="checkbox" checked={form.hours[d].enabled} onChange={e=>setHours(d, { enabled: e.target.checked })} />
                          <input className="w-20 px-2 py-1 border rounded" value={form.hours[d].open} onChange={e=>setHours(d, { open: e.target.value })} placeholder="09:00" />
                          <span>–</span>
                          <input className="w-20 px-2 py-1 border rounded" value={form.hours[d].close} onChange={e=>setHours(d, { close: e.target.value })} placeholder="17:00" />
                        </div>
                      ))}
                    </div>
                    {hintErr('hours')}
                    <div className="mt-1 text-xs text-slate-500">Use 24-hour format (e.g., 08:30, 17:00). Uncheck to mark a day as closed.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* REVIEW & SUBMIT */}
            <div>
              <h2 className="text-xl font-semibold text-slate-900 mb-4 border-b pb-2">Review & Submit</h2>
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold mb-3">Quick preview</div>

                  {/* Logo Preview */}
                  {form.logo && (
                    <div className="mb-4 flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                      <img
                        src={URL.createObjectURL(form.logo)}
                        alt="Business logo"
                        className="h-20 w-20 object-contain rounded-lg border-2 border-slate-200 bg-white shadow-sm"
                      />
                      <div className="text-xs text-slate-600">
                        <div className="font-medium text-slate-900">Your Logo</div>
                        <div>This will appear on your profile</div>
                      </div>
                    </div>
                  )}

                  <ul className="text-sm text-slate-700 space-y-1">
                    <li><b>{form.businessName || 'Your business name'}</b> — {form.categories.join(', ') || 'No categories selected'}</li>
                    <li>{form.baseZip ? `Base ZIP ${form.baseZip}` : 'No base ZIP'} • Radius {form.radiusMiles} mi</li>
                    <li>Extra ZIPs: {form.extraZips.length ? form.extraZips.join(', ') : '—'}</li>
                    <li>License #{form.licenseNumber || '—'} (Expires: {form.licenseExpires || '—'})</li>
                    <li>Insurance: {form.insuranceCarrier || '—'} (Expires: {form.insuranceExpires || '—'})</li>
                    <li>Rate: {form.rateType} {form.rateType==='Hourly' ? form.hourlyRate : form.rateType==='Flat' ? form.flatMin : form.visitFee}</li>
                    <li>Specialties: {form.specialties.length ? form.specialties.join(', ') : '—'}</li>
                    {form.website && <li>Website: <a href={form.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{form.website}</a></li>}
                  </ul>
                </div>
                <div className="grid gap-2">
                  <label className="flex items-start gap-2 text-sm" data-err="agreeTerms">
                    <input type="checkbox" checked={form.agreeTerms} onChange={e=>set('agreeTerms', e.target.checked)} />
                    <span>I agree to the <a className="text-blue-600 underline" href="/terms" target="_blank">Terms</a> and <a className="text-blue-600 underline" href="/privacy" target="_blank">Privacy Policy</a>.
                      {errors.agreeTerms && <span className="block text-rose-600 text-xs">You must accept.</span>}
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm" data-err="certifyAccuracy">
                    <input type="checkbox" checked={form.certifyAccuracy} onChange={e=>set('certifyAccuracy', e.target.checked)} />
                    <span>I certify the information is accurate and I'm authorized to represent this business.
                      {errors.certifyAccuracy && <span className="block text-rose-600 text-xs">Please certify.</span>}
                    </span>
                  </label>
                </div>
                <div className="pt-1">
                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={busy || !form.agreeTerms || !form.certifyAccuracy}
                  >
                    {busy ? 'Submitting…' : 'Submit for review'}
                  </button>
                  <p className="text-xs text-slate-500 mt-2">We typically review new pros within 1–2 business days.</p>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </section>
    </IOSProWizardWrapper>
  )
}

/* ====================== Utils ====================== */
function migrateDraft(v: any): Partial<FormDataT> {
  if (!v || typeof v !== 'object') return {}
  const asArr = (x: any): string[] =>
    Array.isArray(x) ? x.map(String) :
    typeof x === 'string' ? x.split(',').map(s=>s.trim()).filter(Boolean) : []

  return {
    ...v,
    extraZips: asArr(v.extraZips),
    specialties: asArr(v.specialties),
    categories: asArr(v.categories),
  }
}