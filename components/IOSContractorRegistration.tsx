// components/IOSContractorRegistration.tsx
// iOS contractor app registration - Blue themed with wizard flow
// Matches website wizard (app/pro/wizard/page.tsx) fields exactly
'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useProAuth } from '../contexts/ProAuthContext'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

type Screen = 'splash' | 'welcome' | 'signin' | 'signup'
type WizardStep = 'basics' | 'area' | 'credentials' | 'pricing' | 'review'
type Day = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'
type RateType = 'Hourly' | 'Flat'
type Hours = Record<Day, { enabled: boolean; open: string; close: string }>

const DAYS: Day[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const EMPTY_HOURS: Hours = DAYS.reduce((acc, d) => {
  (acc as any)[d] = { enabled: ['Mon','Tue','Wed','Thu','Fri'].includes(d), open:'09:00', close:'17:00' }
  return acc
}, {} as Hours)

// Service categories — matches website wizard exactly (14 categories)
const SERVICE_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Roofing',
  'Carpentry',
  'Landscaping',
  'Locksmith',
  'Appliance Repair',
  'Water Damage Restoration',
  'General Contractor',
  'Pest Control',
  'Cleaning',
  'Painting',
  'Handyman',
]

// US States
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]

const MAPBOX_TOKEN = 'pk.eyJ1IjoicnVzaHJhZG1pbiIsImEiOiJjbWdiaTlobmcwdHc3MmtvbHhhOTJjNnJvIn0.st2PXkQQtqnh3tHrjp9pzw'

// Haptic feedback
const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Light) => {
  try { await Haptics.impact({ style }) } catch (e) {}
}

const triggerNotification = async (type: NotificationType) => {
  try { await Haptics.notification({ type }) } catch (e) {}
}

// Shared input style
const INPUT_CLASS = 'w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all'
const LABEL_CLASS = 'block text-gray-600 text-[13px] font-medium mb-2'

interface Props {
  onSwitchToHomeowner?: () => void
}

export default function IOSContractorRegistration({ onSwitchToHomeowner }: Props) {
  const { signIn, signUp } = useProAuth()

  const [screen, setScreen] = useState<Screen>('splash')
  const [wizardStep, setWizardStep] = useState<WizardStep>('basics')

  // Auth fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Step 1: Basics
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [website, setWebsite] = useState('')
  const [yearsInBusiness, setYearsInBusiness] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [about, setAbout] = useState('')
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  // Step 2: Service Area & Categories
  const [address, setAddress] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [baseZip, setBaseZip] = useState('')
  const [radiusMiles, setRadiusMiles] = useState(10)
  const [extraZips, setExtraZips] = useState<string[]>([])
  const [extraZipInput, setExtraZipInput] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [specialties, setSpecialties] = useState<string[]>([])
  const [specialtyInput, setSpecialtyInput] = useState('')
  const [geocoding, setGeocoding] = useState(false)

  // Step 3: Credentials
  const [licenseNumber, setLicenseNumber] = useState('')
  const [licenseType, setLicenseType] = useState('')
  const [licenseState, setLicenseState] = useState('')
  const [licensedStates, setLicensedStates] = useState('')
  const [licenseExpires, setLicenseExpires] = useState('')
  const [insuranceCarrier, setInsuranceCarrier] = useState('')
  const [insurancePolicy, setInsurancePolicy] = useState('')
  const [insuranceExpires, setInsuranceExpires] = useState('')
  const [licenseProof, setLicenseProof] = useState<File | null>(null)
  const [insuranceProof, setInsuranceProof] = useState<File | null>(null)

  // Step 4: Pricing & Availability
  const [rateType, setRateType] = useState<RateType>('Hourly')
  const [hourlyRate, setHourlyRate] = useState('')
  const [peakRate, setPeakRate] = useState('')
  const [offPeakRate, setOffPeakRate] = useState('')
  const [surgeRate, setSurgeRate] = useState('')
  const [flatMin, setFlatMin] = useState('')
  const [visitFee, setVisitFee] = useState('')
  const [diagnosticFee, setDiagnosticFee] = useState('')
  const [freeEstimates, setFreeEstimates] = useState(true)
  const [hours, setHours] = useState<Hours>({...EMPTY_HOURS})

  // Step 5: Review
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [certifyAccuracy, setCertifyAccuracy] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-advance from splash
  useEffect(() => {
    const timer = setTimeout(() => setScreen('welcome'), 2000)
    return () => clearTimeout(timer)
  }, [])

  // Logo preview
  useEffect(() => {
    if (logo) {
      const url = URL.createObjectURL(logo)
      setLogoPreview(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setLogoPreview(null)
    }
  }, [logo])

  // Scroll to top on step change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [wizardStep])

  // Geocoding
  async function geocodeAddress(addr: string, zip: string) {
    if (!addr || !zip || !/^\d{5}$/.test(zip)) return
    setGeocoding(true)
    try {
      const query = encodeURIComponent(`${addr}, ${zip}`)
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1`
      const response = await fetch(url)
      const data = await response.json()
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center
        setLatitude(lat)
        setLongitude(lng)
      }
    } catch (err) {
      console.error('Geocoding error:', err)
    } finally {
      setGeocoding(false)
    }
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) return
    setGeocoding(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`
          const response = await fetch(url)
          const data = await response.json()
          if (data.features && data.features.length > 0) {
            const feature = data.features[0]
            setAddress(feature.place_name)
            setLatitude(lat)
            setLongitude(lng)
            const zipMatch = feature.context?.find((c: any) => c.id.startsWith('postcode'))
            if (zipMatch?.text) setBaseZip(zipMatch.text)
          }
        } catch (err) {
          console.error('Reverse geocoding error:', err)
        } finally {
          setGeocoding(false)
        }
      },
      () => setGeocoding(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleSignIn = async () => {
    if (!email || !password) {
      await triggerNotification(NotificationType.Error)
      setError('Please enter email and password')
      return
    }
    setLoading(true)
    setError(null)
    const result = await signIn(email, password)
    if (result.error) {
      await triggerNotification(NotificationType.Error)
      setError(result.error)
      setLoading(false)
    } else {
      await triggerNotification(NotificationType.Success)
    }
  }

  // Validation per step (matches website)
  const validateBasics = () => {
    if (!name.trim()) return 'Full name is required'
    if (!/^\S+@\S+\.\S+$/.test(email)) return 'Valid email is required'
    if (!password || password.length < 6) return 'Password must be at least 6 characters'
    if (!/^[-+() 0-9]{7,}$/.test(phone)) return 'Valid phone number is required'
    if (!businessName.trim()) return 'Business name is required'
    return null
  }

  const validateArea = () => {
    if (!address.trim()) return 'Business address is required'
    if (!baseZip || !/^\d{5}$/.test(baseZip)) return 'Valid 5-digit ZIP code is required'
    if (selectedCategories.length === 0) return 'Please select at least one service category'
    return null
  }

  const validateCredentials = () => {
    if (!licenseNumber.trim()) return 'License number is required'
    if (!licenseState.trim()) return 'License state is required'
    if (!licenseExpires) return 'License expiration date is required'
    if (!insuranceCarrier.trim()) return 'Insurance carrier is required'
    if (!insurancePolicy.trim()) return 'Insurance policy number is required'
    if (!insuranceExpires) return 'Insurance expiration date is required'
    if (!licenseProof) return 'Please upload license proof'
    if (!insuranceProof) return 'Please upload insurance proof'
    // Expiry check
    const today = new Date().toISOString().slice(0, 10)
    if (licenseExpires < today) return 'License has expired'
    if (insuranceExpires < today) return 'Insurance policy has expired'
    return null
  }

  const validatePricing = () => {
    const openAny = DAYS.some(d => hours[d].enabled)
    if (!openAny) return 'Enable at least one business day'
    if (rateType === 'Hourly') {
      if (!hourlyRate.trim()) return 'Base hourly rate is required'
      if (!peakRate.trim()) return 'Peak rate is required'
      if (!offPeakRate.trim()) return 'Off-peak rate is required'
      if (!surgeRate.trim()) return 'Surge rate is required'
    }
    if (rateType === 'Flat' && !flatMin.trim()) return 'Flat rate amount is required'
    if (!visitFee.trim()) return 'Visit fee is required'
    if (!diagnosticFee.trim()) return 'Diagnostic fee is required'
    return null
  }

  const validateReview = () => {
    if (!agreeTerms) return 'You must accept the Terms & Privacy Policy'
    if (!certifyAccuracy) return 'Please certify the information is accurate'
    return null
  }

  const handleSignUp = async () => {
    // Validate review step
    const reviewError = validateReview()
    if (reviewError) {
      await triggerNotification(NotificationType.Error)
      setError(reviewError)
      return
    }

    setLoading(true)
    setError(null)

    const result = await signUp(email, password, {
      name,
      businessName,
      phone,
      website: website || undefined,
      yearsInBusiness: yearsInBusiness || undefined,
      teamSize: teamSize || undefined,
      about: about || undefined,
      logo,
      address,
      latitude,
      longitude,
      radiusMiles,
      extraZips,
      baseZip,
      categories: selectedCategories,
      specialties,
      licenseNumber,
      licenseType: licenseType || undefined,
      licenseState,
      licensedStates: licensedStates || undefined,
      licenseExpires,
      insuranceCarrier,
      insurancePolicy: insurancePolicy || undefined,
      insuranceExpires,
      licenseProof,
      insuranceProof,
      rateType,
      hourlyRate: rateType === 'Hourly' ? hourlyRate : undefined,
      peakRate: rateType === 'Hourly' ? peakRate : undefined,
      offPeakRate: rateType === 'Hourly' ? offPeakRate : undefined,
      surgeRate: rateType === 'Hourly' ? surgeRate : undefined,
      flatMin: rateType === 'Flat' ? flatMin : undefined,
      visitFee,
      diagnosticFee,
      freeEstimates,
      businessHours: hours,
    })

    if (result.error) {
      await triggerNotification(NotificationType.Error)
      setError(result.error)
      setLoading(false)
    } else {
      await triggerNotification(NotificationType.Success)
    }
  }

  const navigateTo = async (newScreen: Screen) => {
    await triggerHaptic()
    setError(null)
    setScreen(newScreen)
  }

  const WIZARD_STEPS: WizardStep[] = ['basics', 'area', 'credentials', 'pricing', 'review']

  const nextWizardStep = async () => {
    // Validate current step
    let stepError: string | null = null
    if (wizardStep === 'basics') stepError = validateBasics()
    else if (wizardStep === 'area') stepError = validateArea()
    else if (wizardStep === 'credentials') stepError = validateCredentials()
    else if (wizardStep === 'pricing') stepError = validatePricing()

    if (stepError) {
      await triggerNotification(NotificationType.Error)
      setError(stepError)
      return
    }

    await triggerHaptic()
    setError(null)
    const currentIndex = WIZARD_STEPS.indexOf(wizardStep)
    if (currentIndex < WIZARD_STEPS.length - 1) {
      setWizardStep(WIZARD_STEPS[currentIndex + 1])
    }
  }

  const prevWizardStep = async () => {
    await triggerHaptic()
    setError(null)
    const currentIndex = WIZARD_STEPS.indexOf(wizardStep)
    if (currentIndex > 0) {
      setWizardStep(WIZARD_STEPS[currentIndex - 1])
    } else {
      setScreen('welcome')
    }
  }

  const toggleCategory = async (category: string) => {
    await triggerHaptic()
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  const addExtraZip = () => {
    const zip = extraZipInput.trim()
    if (/^\d{5}$/.test(zip) && !extraZips.includes(zip) && zip !== baseZip) {
      setExtraZips(prev => [...prev, zip])
      setExtraZipInput('')
    }
  }

  const removeExtraZip = (zip: string) => {
    setExtraZips(prev => prev.filter(z => z !== zip))
  }

  const addSpecialty = () => {
    const s = specialtyInput.trim()
    if (s && !specialties.includes(s)) {
      setSpecialties(prev => [...prev, s])
      setSpecialtyInput('')
    }
  }

  const removeSpecialty = (s: string) => {
    setSpecialties(prev => prev.filter(x => x !== s))
  }

  const setDayHours = (day: Day, patch: Partial<Hours[Day]>) => {
    setHours(prev => ({ ...prev, [day]: { ...prev[day], ...patch } }))
  }

  // ============= SPLASH SCREEN =============
  if (screen === 'splash') {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)' }}
      >
        <div className="relative">
          <div
            className="absolute inset-0 w-28 h-28 rounded-3xl"
            style={{
              background: 'rgba(255,255,255,0.2)',
              animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
            }}
          />
          <div className="relative w-28 h-28 bg-white rounded-3xl flex items-center justify-center shadow-2xl p-3">
            <img
              src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg"
              alt="Rushr"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
        <p className="text-white/70 text-sm mt-6">For Professionals</p>

        <style jsx>{`
          @keyframes ping {
            0% { transform: scale(1); opacity: 0.8; }
            75%, 100% { transform: scale(1.3); opacity: 0; }
          }
        `}</style>
      </div>
    )
  }

  // ============= WELCOME SCREEN =============
  if (screen === 'welcome') {
    return (
      <div className="fixed inset-0 bg-white flex flex-col">
        <div
          className="flex-1 flex flex-col items-center justify-center px-8 relative overflow-hidden"
          style={{ minHeight: '60%' }}
        >
          <video
            className="absolute inset-0 w-full h-full object-cover"
            src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/MockUp_video/8965545-uhd_2160_3840_25fps.mp4"
            autoPlay
            loop
            muted
            playsInline
            webkit-playsinline="true"
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.6) 0%, rgba(37, 99, 235, 0.75) 100%)'
            }}
          />
          <h1 className="text-white text-[32px] font-bold text-center tracking-tight relative z-10 leading-tight">
            Grow your{'\n'}business
          </h1>
          <p className="text-white/80 text-base text-center mt-3 relative z-10">
            Connect with homeowners in your area
          </p>
        </div>

        <div
          className="bg-white px-6 pt-6 pb-6"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 34px), 34px)' }}
        >
          {onSwitchToHomeowner && (
            <button
              onClick={onSwitchToHomeowner}
              className="w-full text-center text-gray-500 text-sm mb-4 py-2"
            >
              Looking for help? <span className="text-blue-600 font-medium">Switch to homeowner</span>
            </button>
          )}

          <button
            onClick={() => navigateTo('signup')}
            className="w-full py-4 rounded-2xl font-semibold text-[17px] text-white mb-3 active:scale-[0.98] transition-transform"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
            }}
          >
            Join as a Pro
          </button>

          <button
            onClick={() => navigateTo('signin')}
            className="w-full py-4 bg-gray-100 rounded-2xl font-semibold text-[17px] text-gray-900 active:bg-gray-200 active:scale-[0.98] transition-all"
          >
            I already have an account
          </button>
        </div>
      </div>
    )
  }

  // ============= SIGN IN SCREEN =============
  if (screen === 'signin') {
    return (
      <div className="fixed inset-0 bg-white flex flex-col">
        <div
          className="absolute left-4 z-20"
          style={{ top: 'max(calc(env(safe-area-inset-top, 54px) + 12px), 66px)' }}
        >
          <button
            onClick={() => navigateTo('welcome')}
            className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center active:bg-black/10"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto"
          style={{
            paddingTop: 'max(calc(env(safe-area-inset-top, 54px) + 80px), 134px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 100px)'
          }}
        >
          <div className="px-8 pt-6">
            <h1 className="text-[28px] font-bold text-gray-900 mb-2">Welcome back, Pro</h1>
            <p className="text-gray-500 text-[15px] mb-8">Sign in to manage your jobs</p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 rounded-xl border border-red-100">
                <p className="text-red-600 text-[14px]">{error}</p>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className={LABEL_CLASS}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className={INPUT_CLASS}
                />
              </div>

              <button className="text-blue-600 text-[14px] font-medium">
                Forgot password?
              </button>
            </div>
          </div>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-8 pt-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 16px)' }}
        >
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full py-4 rounded-2xl font-semibold text-[17px] text-white active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </div>
    )
  }

  // ============= SIGN UP / WIZARD SCREEN =============
  const currentStepIndex = WIZARD_STEPS.indexOf(wizardStep)
  const progress = ((currentStepIndex + 1) / WIZARD_STEPS.length) * 100
  const STEP_TITLES: Record<WizardStep, string> = {
    basics: 'Business Basics',
    area: 'Service Area & Categories',
    credentials: 'Credentials',
    pricing: 'Pricing & Availability',
    review: 'Review & Submit',
  }

  return (
    <div className="fixed inset-0 bg-white flex flex-col">
      {/* Header with progress — below Dynamic Island */}
      <div
        className="sticky top-0 z-20 bg-white"
        style={{ paddingTop: 'max(calc(env(safe-area-inset-top, 54px) + 12px), 66px)' }}
      >
        <div className="flex items-center px-4 py-3">
          <button
            onClick={prevWizardStep}
            className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center active:bg-black/10"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 mx-4">
            <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-gray-400 text-[11px] mt-1 text-center">{STEP_TITLES[wizardStep]}</p>
          </div>
          <span className="text-gray-500 text-sm">{currentStepIndex + 1}/{WIZARD_STEPS.length}</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-8 pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 100px)' }}
      >
        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 rounded-xl border border-red-100">
            <p className="text-red-600 text-[14px]">{error}</p>
          </div>
        )}

        {/* ============= STEP 1: BASICS ============= */}
        {wizardStep === 'basics' && (
          <div>
            <h1 className="text-[28px] font-bold text-gray-900 mb-2">Business Basics</h1>
            <p className="text-gray-500 text-[15px] mb-6">Tell us about you and your business</p>

            <div className="space-y-5">
              <div>
                <label className={LABEL_CLASS}>Full Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Contractor" autoCapitalize="words" className={INPUT_CLASS} />
              </div>

              <div>
                <label className={LABEL_CLASS}>Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com" autoCapitalize="none" autoCorrect="off" className={INPUT_CLASS} />
              </div>

              <div>
                <label className={LABEL_CLASS}>Password *</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters" className={INPUT_CLASS} />
              </div>

              <div>
                <label className={LABEL_CLASS}>Phone *</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555" className={INPUT_CLASS} />
              </div>

              <div>
                <label className={LABEL_CLASS}>Business Name *</label>
                <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="BrightSpark Electric LLC" className={INPUT_CLASS} />
              </div>

              <div>
                <label className={LABEL_CLASS}>Website</label>
                <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com" autoCapitalize="none" className={INPUT_CLASS} />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={LABEL_CLASS}>Years in Business</label>
                  <input type="text" value={yearsInBusiness} onChange={(e) => setYearsInBusiness(e.target.value)}
                    placeholder="e.g., 8" inputMode="numeric" className={INPUT_CLASS} />
                </div>
                <div className="flex-1">
                  <label className={LABEL_CLASS}>Team Size</label>
                  <input type="text" value={teamSize} onChange={(e) => setTeamSize(e.target.value)}
                    placeholder="e.g., 3" inputMode="numeric" className={INPUT_CLASS} />
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>About Your Business</label>
                <textarea
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  placeholder="What you specialize in, what customers love, service guarantees..."
                  rows={4}
                  className={`${INPUT_CLASS} min-h-[100px] resize-none`}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Logo (optional)</label>
                {!logo ? (
                  <label className="flex items-center justify-center w-full px-4 py-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 cursor-pointer active:bg-gray-100">
                    <div className="text-center">
                      <svg className="w-8 h-8 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-gray-500 text-[14px]">Tap to upload logo</p>
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
                  </label>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <img src={logoPreview!} alt="Logo" className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white" />
                    <button type="button" onClick={() => setLogo(null)}
                      className="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-[13px] font-medium">
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============= STEP 2: SERVICE AREA & CATEGORIES ============= */}
        {wizardStep === 'area' && (
          <div>
            <h1 className="text-[28px] font-bold text-gray-900 mb-2">Service Area</h1>
            <p className="text-gray-500 text-[15px] mb-6">Where do you operate?</p>

            <div className="space-y-5">
              {/* Business Address */}
              <div>
                <label className={LABEL_CLASS}>Business Address *</label>
                <input type="text" value={address}
                  onChange={(e) => {
                    setAddress(e.target.value)
                    if (e.target.value && baseZip && /^\d{5}$/.test(baseZip)) {
                      geocodeAddress(e.target.value, baseZip)
                    }
                  }}
                  placeholder="123 Main Street, Brooklyn, NY" className={INPUT_CLASS} />
                {latitude && longitude && (
                  <p className="text-green-600 text-[12px] mt-1">Location verified</p>
                )}
              </div>

              {/* Use My Location */}
              <button type="button" onClick={useCurrentLocation} disabled={geocoding}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-600 rounded-xl font-medium text-[14px] active:bg-blue-100 disabled:opacity-50">
                {geocoding ? (
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
                {geocoding ? 'Getting location...' : 'Use My Location'}
              </button>

              {/* Base ZIP */}
              <div>
                <label className={LABEL_CLASS}>Base ZIP Code *</label>
                <input type="text" value={baseZip}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 5)
                    setBaseZip(v)
                    if (/^\d{5}$/.test(v) && address) {
                      geocodeAddress(address, v)
                    }
                  }}
                  placeholder="11215" inputMode="numeric" maxLength={5} className={INPUT_CLASS} />
              </div>

              {/* Radius */}
              <div>
                <label className={LABEL_CLASS}>Coverage Radius (miles)</label>
                <div className="flex gap-2">
                  {[5, 10, 15, 25, 50].map(n => (
                    <button key={n} type="button" onClick={() => setRadiusMiles(n)}
                      className={`flex-1 py-3 rounded-xl text-[14px] font-medium transition-all ${
                        radiusMiles === n
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional ZIPs */}
              <div>
                <label className={LABEL_CLASS}>Additional ZIP Codes</label>
                <div className="flex gap-2">
                  <input type="text" value={extraZipInput}
                    onChange={(e) => setExtraZipInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtraZip() } }}
                    placeholder="Add ZIP" inputMode="numeric" maxLength={5}
                    className={`${INPUT_CLASS} flex-1`} />
                  <button type="button" onClick={addExtraZip}
                    className="px-4 py-3 bg-blue-500 text-white rounded-xl font-medium text-[14px] active:bg-blue-600">
                    Add
                  </button>
                </div>
                {extraZips.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {extraZips.map(zip => (
                      <span key={zip} className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[13px]">
                        {zip}
                        <button type="button" onClick={() => removeExtraZip(zip)} className="text-blue-400 font-bold ml-1">x</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Categories */}
              <div>
                <label className={LABEL_CLASS}>Services Offered *</label>
                <p className="text-gray-400 text-[12px] mb-3">Select all that apply</p>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_CATEGORIES.map((category) => (
                    <button key={category} type="button" onClick={() => toggleCategory(category)}
                      className={`px-4 py-2 rounded-full text-[14px] font-medium transition-all ${
                        selectedCategories.includes(category)
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              {/* Specialties */}
              <div>
                <label className={LABEL_CLASS}>Specialties</label>
                <div className="flex gap-2">
                  <input type="text" value={specialtyInput}
                    onChange={(e) => setSpecialtyInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSpecialty() } }}
                    placeholder="e.g., Emergency repairs"
                    className={`${INPUT_CLASS} flex-1`} />
                  <button type="button" onClick={addSpecialty}
                    className="px-4 py-3 bg-blue-500 text-white rounded-xl font-medium text-[14px] active:bg-blue-600">
                    Add
                  </button>
                </div>
                {specialties.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {specialties.map(s => (
                      <span key={s} className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[13px]">
                        {s}
                        <button type="button" onClick={() => removeSpecialty(s)} className="text-blue-400 font-bold ml-1">x</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============= STEP 3: CREDENTIALS ============= */}
        {wizardStep === 'credentials' && (
          <div>
            <h1 className="text-[28px] font-bold text-gray-900 mb-2">Credentials</h1>
            <p className="text-gray-500 text-[15px] mb-6">License & insurance details</p>

            <div className="space-y-5">
              {/* License */}
              <div>
                <label className={LABEL_CLASS}>License Number *</label>
                <input type="text" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="123456" className={INPUT_CLASS} />
              </div>

              <div>
                <label className={LABEL_CLASS}>License Type</label>
                <input type="text" value={licenseType} onChange={(e) => setLicenseType(e.target.value)}
                  placeholder="Master electrician, General contractor..." className={INPUT_CLASS} />
              </div>

              <div>
                <label className={LABEL_CLASS}>Issuing State *</label>
                <select value={licenseState} onChange={(e) => setLicenseState(e.target.value)}
                  className={INPUT_CLASS}>
                  <option value="">Select State</option>
                  {US_STATES.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={LABEL_CLASS}>States Licensed In</label>
                <input type="text" value={licensedStates} onChange={(e) => setLicensedStates(e.target.value)}
                  placeholder="NY, NJ, CT" className={INPUT_CLASS} />
                <p className="text-gray-400 text-[11px] mt-1">Comma-separated list</p>
              </div>

              <div>
                <label className={LABEL_CLASS}>License Expires *</label>
                <input type="date" value={licenseExpires} onChange={(e) => setLicenseExpires(e.target.value)}
                  className={INPUT_CLASS} />
              </div>

              {/* Insurance */}
              <div className="border-t border-gray-200 pt-5">
                <p className="text-gray-900 text-[15px] font-semibold mb-4">Insurance</p>
              </div>

              <div>
                <label className={LABEL_CLASS}>Insurance Carrier *</label>
                <input type="text" value={insuranceCarrier} onChange={(e) => setInsuranceCarrier(e.target.value)}
                  placeholder="ABC Insurance" className={INPUT_CLASS} />
              </div>

              <div>
                <label className={LABEL_CLASS}>Policy Number *</label>
                <input type="text" value={insurancePolicy} onChange={(e) => setInsurancePolicy(e.target.value)}
                  placeholder="POL-1234567" className={INPUT_CLASS} />
              </div>

              <div>
                <label className={LABEL_CLASS}>Policy Expires *</label>
                <input type="date" value={insuranceExpires} onChange={(e) => setInsuranceExpires(e.target.value)}
                  className={INPUT_CLASS} />
              </div>

              {/* File uploads */}
              <div className="border-t border-gray-200 pt-5">
                <p className="text-gray-900 text-[15px] font-semibold mb-4">Upload Documents</p>
              </div>

              <div>
                <label className={LABEL_CLASS}>License Proof (PDF/Image) *</label>
                {!licenseProof ? (
                  <label className="flex items-center justify-center w-full px-4 py-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 cursor-pointer active:bg-gray-100">
                    <div className="text-center">
                      <svg className="w-6 h-6 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-gray-500 text-[13px]">Tap to upload</p>
                    </div>
                    <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => setLicenseProof(e.target.files?.[0] ?? null)} />
                  </label>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-200">
                    <span className="text-green-700 text-[13px] truncate flex-1 mr-2">{licenseProof.name}</span>
                    <button type="button" onClick={() => setLicenseProof(null)}
                      className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[12px] font-medium">
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className={LABEL_CLASS}>Insurance COI (PDF/Image) *</label>
                {!insuranceProof ? (
                  <label className="flex items-center justify-center w-full px-4 py-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 cursor-pointer active:bg-gray-100">
                    <div className="text-center">
                      <svg className="w-6 h-6 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-gray-500 text-[13px]">Tap to upload</p>
                    </div>
                    <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => setInsuranceProof(e.target.files?.[0] ?? null)} />
                  </label>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-200">
                    <span className="text-green-700 text-[13px] truncate flex-1 mr-2">{insuranceProof.name}</span>
                    <button type="button" onClick={() => setInsuranceProof(null)}
                      className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[12px] font-medium">
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============= STEP 4: PRICING & AVAILABILITY ============= */}
        {wizardStep === 'pricing' && (
          <div>
            <h1 className="text-[28px] font-bold text-gray-900 mb-2">Pricing & Hours</h1>
            <p className="text-gray-500 text-[15px] mb-6">Set your rates and availability</p>

            <div className="space-y-5">
              {/* Rate Type Toggle */}
              <div>
                <label className={LABEL_CLASS}>Rate Type</label>
                <div className="flex gap-2">
                  {(['Hourly', 'Flat'] as RateType[]).map(rt => (
                    <button key={rt} type="button" onClick={() => setRateType(rt)}
                      className={`flex-1 py-3 rounded-xl text-[14px] font-medium transition-all ${
                        rateType === rt
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                      {rt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hourly Rates */}
              {rateType === 'Hourly' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL_CLASS}>Base Rate *</label>
                      <input type="text" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)}
                        placeholder="$120" inputMode="numeric" className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Peak Rate *</label>
                      <input type="text" value={peakRate} onChange={(e) => setPeakRate(e.target.value)}
                        placeholder="$150" inputMode="numeric" className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Off-Peak Rate *</label>
                      <input type="text" value={offPeakRate} onChange={(e) => setOffPeakRate(e.target.value)}
                        placeholder="$100" inputMode="numeric" className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Surge Rate *</label>
                      <input type="text" value={surgeRate} onChange={(e) => setSurgeRate(e.target.value)}
                        placeholder="$200" inputMode="numeric" className={INPUT_CLASS} />
                    </div>
                  </div>
                </>
              )}

              {/* Flat Rate */}
              {rateType === 'Flat' && (
                <div>
                  <label className={LABEL_CLASS}>Typical Flat Price *</label>
                  <input type="text" value={flatMin} onChange={(e) => setFlatMin(e.target.value)}
                    placeholder="$600" inputMode="numeric" className={INPUT_CLASS} />
                </div>
              )}

              {/* Visit & Diagnostic Fees */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>Visit Fee *</label>
                  <input type="text" value={visitFee} onChange={(e) => setVisitFee(e.target.value)}
                    placeholder="$89" inputMode="numeric" className={INPUT_CLASS} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Diagnostic Fee *</label>
                  <input type="text" value={diagnosticFee} onChange={(e) => setDiagnosticFee(e.target.value)}
                    placeholder="$75" inputMode="numeric" className={INPUT_CLASS} />
                </div>
              </div>

              {/* Free Estimates */}
              <button type="button" onClick={() => setFreeEstimates(!freeEstimates)}
                className="flex items-center gap-3 w-full py-3 px-4 bg-gray-50 rounded-xl active:bg-gray-100">
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                  freeEstimates ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                }`}>
                  {freeEstimates && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-gray-700 text-[15px]">Offer free estimates</span>
              </button>

              {/* Business Hours */}
              <div className="border-t border-gray-200 pt-5">
                <label className={LABEL_CLASS}>Business Hours</label>
                <p className="text-gray-400 text-[11px] mb-3">Toggle days on/off, set open/close times</p>

                <div className="space-y-2">
                  {DAYS.map(day => (
                    <div key={day} className="flex items-center gap-2">
                      <button type="button" onClick={() => setDayHours(day, { enabled: !hours[day].enabled })}
                        className={`w-12 text-[13px] font-medium py-2 rounded-lg ${
                          hours[day].enabled ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'
                        }`}>
                        {day}
                      </button>
                      {hours[day].enabled ? (
                        <>
                          <input type="time" value={hours[day].open}
                            onChange={(e) => setDayHours(day, { open: e.target.value })}
                            className="flex-1 px-2 py-2 bg-gray-50 rounded-lg text-[14px] text-gray-900 border-0 outline-none" />
                          <span className="text-gray-400 text-[13px]">to</span>
                          <input type="time" value={hours[day].close}
                            onChange={(e) => setDayHours(day, { close: e.target.value })}
                            className="flex-1 px-2 py-2 bg-gray-50 rounded-lg text-[14px] text-gray-900 border-0 outline-none" />
                        </>
                      ) : (
                        <span className="text-gray-400 text-[13px] ml-2">Closed</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============= STEP 5: REVIEW & SUBMIT ============= */}
        {wizardStep === 'review' && (
          <div>
            <h1 className="text-[28px] font-bold text-gray-900 mb-2">Review & Submit</h1>
            <p className="text-gray-500 text-[15px] mb-6">Check your details before submitting</p>

            <div className="space-y-4">
              {/* Personal Info */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <h3 className="text-[13px] font-medium text-gray-500 mb-2">Personal Info</h3>
                <p className="text-gray-900 font-medium">{name}</p>
                <p className="text-gray-600 text-[14px]">{email}</p>
                <p className="text-gray-600 text-[14px]">{phone}</p>
              </div>

              {/* Business */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <h3 className="text-[13px] font-medium text-gray-500 mb-2">Business</h3>
                <p className="text-gray-900 font-medium">{businessName}</p>
                {website && <p className="text-blue-600 text-[14px]">{website}</p>}
                {yearsInBusiness && <p className="text-gray-600 text-[14px]">{yearsInBusiness} years in business</p>}
                {teamSize && <p className="text-gray-600 text-[14px]">Team of {teamSize}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedCategories.map((cat) => (
                    <span key={cat} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[12px]">
                      {cat}
                    </span>
                  ))}
                </div>
                {specialties.length > 0 && (
                  <p className="text-gray-600 text-[14px] mt-2">Specialties: {specialties.join(', ')}</p>
                )}
              </div>

              {/* Service Area */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <h3 className="text-[13px] font-medium text-gray-500 mb-2">Service Area</h3>
                {address && <p className="text-gray-900 text-[14px]">{address}</p>}
                <p className="text-gray-600 text-[14px]">ZIP: {baseZip} | Radius: {radiusMiles} mi</p>
                {extraZips.length > 0 && (
                  <p className="text-gray-600 text-[14px]">Extra ZIPs: {extraZips.join(', ')}</p>
                )}
              </div>

              {/* Credentials */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <h3 className="text-[13px] font-medium text-gray-500 mb-2">Credentials</h3>
                <p className="text-gray-900 text-[14px]">License: {licenseNumber} ({licenseState})</p>
                {licenseType && <p className="text-gray-600 text-[14px]">Type: {licenseType}</p>}
                <p className="text-gray-600 text-[14px]">Expires: {licenseExpires}</p>
                <p className="text-gray-600 text-[14px] mt-1">Insurance: {insuranceCarrier}</p>
                <p className="text-gray-600 text-[14px]">Policy: {insurancePolicy}</p>
                <p className="text-gray-600 text-[14px]">Expires: {insuranceExpires}</p>
                <div className="flex gap-2 mt-2">
                  {licenseProof && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-[11px]">License uploaded</span>
                  )}
                  {insuranceProof && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-[11px]">Insurance uploaded</span>
                  )}
                </div>
              </div>

              {/* Pricing */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <h3 className="text-[13px] font-medium text-gray-500 mb-2">Pricing</h3>
                <p className="text-gray-900 text-[14px]">Rate: {rateType}</p>
                {rateType === 'Hourly' && (
                  <p className="text-gray-600 text-[14px]">
                    Base: {hourlyRate} | Peak: {peakRate} | Off-Peak: {offPeakRate} | Surge: {surgeRate}
                  </p>
                )}
                {rateType === 'Flat' && (
                  <p className="text-gray-600 text-[14px]">Flat: {flatMin}</p>
                )}
                <p className="text-gray-600 text-[14px]">Visit: {visitFee} | Diagnostic: {diagnosticFee}</p>
                <p className="text-gray-600 text-[14px]">{freeEstimates ? 'Free estimates offered' : 'No free estimates'}</p>
              </div>

              {/* Hours */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <h3 className="text-[13px] font-medium text-gray-500 mb-2">Business Hours</h3>
                {DAYS.filter(d => hours[d].enabled).map(d => (
                  <p key={d} className="text-gray-600 text-[14px]">{d}: {hours[d].open} - {hours[d].close}</p>
                ))}
                {!DAYS.some(d => hours[d].enabled) && (
                  <p className="text-gray-400 text-[14px]">No hours set</p>
                )}
              </div>

              {/* Terms & Certify Checkboxes */}
              <div className="space-y-3 mt-4">
                <button type="button" onClick={() => setAgreeTerms(!agreeTerms)}
                  className="flex items-start gap-3 w-full text-left py-2">
                  <div className={`w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all mt-0.5 ${
                    agreeTerms ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                  }`}>
                    {agreeTerms && (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-gray-700 text-[14px]">
                    I agree to the <span className="text-blue-600 font-medium">Terms of Service</span> and <span className="text-blue-600 font-medium">Privacy Policy</span>
                  </span>
                </button>

                <button type="button" onClick={() => setCertifyAccuracy(!certifyAccuracy)}
                  className="flex items-start gap-3 w-full text-left py-2">
                  <div className={`w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all mt-0.5 ${
                    certifyAccuracy ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                  }`}>
                    {certifyAccuracy && (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-gray-700 text-[14px]">
                    I certify the information is accurate and I'm authorized to represent this business
                  </span>
                </button>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <p className="text-amber-800 text-[13px]">
                  Your account will be reviewed before you can start receiving jobs. This usually takes 1-2 business days.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fixed bottom button */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-8 pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 16px)' }}
      >
        {wizardStep !== 'review' ? (
          <button
            onClick={nextWizardStep}
            className="w-full py-4 rounded-2xl font-semibold text-[17px] text-white active:scale-[0.98] transition-transform"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
            }}
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleSignUp}
            disabled={loading || !agreeTerms || !certifyAccuracy}
            className="w-full py-4 rounded-2xl font-semibold text-[17px] text-white active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
            }}
          >
            {loading ? 'Creating Account...' : 'Submit Application'}
          </button>
        )}
      </div>
    </div>
  )
}
