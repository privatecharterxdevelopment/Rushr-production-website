// components/IOSContractorRegistration.tsx
// iOS contractor app registration - Blue themed with wizard flow
'use client'

import React, { useState, useEffect } from 'react'
import { useProAuth } from '../contexts/ProAuthContext'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

type Screen = 'splash' | 'welcome' | 'signin' | 'signup' | 'wizard'
type WizardStep = 'basics' | 'business' | 'credentials' | 'area' | 'review'

// Service categories
const SERVICE_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Roofing',
  'Landscaping',
  'Cleaning',
  'Painting',
  'Carpentry',
  'General Handyman',
  'Appliance Repair',
  'Locksmith',
  'Pest Control'
]

// US States
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]

// Haptic feedback
const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Light) => {
  try { await Haptics.impact({ style }) } catch (e) {}
}

const triggerNotification = async (type: NotificationType) => {
  try { await Haptics.notification({ type }) } catch (e) {}
}

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

  // Wizard fields
  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [licenseState, setLicenseState] = useState('')
  const [insuranceCarrier, setInsuranceCarrier] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [baseZip, setBaseZip] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-advance from splash
  useEffect(() => {
    const timer = setTimeout(() => setScreen('welcome'), 2000)
    return () => clearTimeout(timer)
  }, [])

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

  const handleSignUp = async () => {
    // Validate all wizard fields
    if (!email || !password) {
      await triggerNotification(NotificationType.Error)
      setError('Email and password are required')
      return
    }
    if (!name || !businessName || !phone) {
      await triggerNotification(NotificationType.Error)
      setError('Please complete all required fields')
      return
    }
    if (password.length < 8) {
      await triggerNotification(NotificationType.Error)
      setError('Password must be at least 8 characters')
      return
    }
    if (selectedCategories.length === 0) {
      await triggerNotification(NotificationType.Error)
      setError('Please select at least one service category')
      return
    }
    if (!baseZip || baseZip.length !== 5) {
      await triggerNotification(NotificationType.Error)
      setError('Please enter a valid ZIP code')
      return
    }

    setLoading(true)
    setError(null)

    const result = await signUp(email, password, {
      name,
      businessName,
      phone,
      licenseNumber: licenseNumber || 'pending',
      licenseState: licenseState || 'pending',
      insuranceCarrier: insuranceCarrier || 'pending',
      categories: selectedCategories,
      baseZip
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

  const nextWizardStep = async () => {
    await triggerHaptic()
    const steps: WizardStep[] = ['basics', 'business', 'credentials', 'area', 'review']
    const currentIndex = steps.indexOf(wizardStep)
    if (currentIndex < steps.length - 1) {
      setWizardStep(steps[currentIndex + 1])
    }
  }

  const prevWizardStep = async () => {
    await triggerHaptic()
    const steps: WizardStep[] = ['basics', 'business', 'credentials', 'area', 'review']
    const currentIndex = steps.indexOf(wizardStep)
    if (currentIndex > 0) {
      setWizardStep(steps[currentIndex - 1])
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

  // ============= SPLASH SCREEN =============
  if (screen === 'splash') {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)' }}
      >
        {/* Animated Logo */}
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
        {/* Hero Section - Blue Theme */}
        <div
          className="flex-1 flex flex-col items-center justify-center px-8 relative overflow-hidden"
          style={{ minHeight: '60%' }}
        >
          {/* Map Background Image */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'url(https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/-74.006,40.7128,12,0/800x1200@2x?access_token=pk.eyJ1IjoicnVzaHJhcHAiLCJhIjoiY200OHFyZTR1MDRoNzJrcjNjOWR2NDhzNyJ9.AJC5_k3SJyFNgKb0c5WDCQ)',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          />
          {/* Blue Gradient Overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.85) 0%, rgba(37, 99, 235, 0.92) 100%)'
            }}
          />

          {/* Headline */}
          <h1 className="text-white text-[32px] font-bold text-center tracking-tight relative z-10 leading-tight">
            Grow your{'\n'}business
          </h1>
          <p className="text-white/80 text-base text-center mt-3 relative z-10">
            Connect with homeowners in your area
          </p>
        </div>

        {/* Bottom Section */}
        <div
          className="bg-white px-6 pt-6 pb-6"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 34px), 34px)' }}
        >
          {/* Switch to Homeowner */}
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
        {/* Back button - floating */}
        <div
          className="absolute left-4 z-20"
          style={{ top: 'calc(env(safe-area-inset-top, 44px) + 8px)' }}
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

        {/* Scrollable content */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 44px) + 80px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 100px)'
          }}
        >
          <div className="px-6 pt-6">
            {/* Title */}
            <h1 className="text-[28px] font-bold text-gray-900 mb-2">Welcome back, Pro</h1>
            <p className="text-gray-500 text-[15px] mb-8">Sign in to manage your jobs</p>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 rounded-xl border border-red-100">
                <p className="text-red-600 text-[14px]">{error}</p>
              </div>
            )}

            {/* Form */}
            <div className="space-y-5">
              <div>
                <label className="block text-gray-600 text-[13px] font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-gray-600 text-[13px] font-medium mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>

              <button className="text-blue-600 text-[14px] font-medium">
                Forgot password?
              </button>
            </div>
          </div>
        </div>

        {/* Fixed bottom button */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 pt-4"
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
  if (screen === 'signup') {
    const wizardSteps: WizardStep[] = ['basics', 'business', 'credentials', 'area', 'review']
    const currentStepIndex = wizardSteps.indexOf(wizardStep)
    const progress = ((currentStepIndex + 1) / wizardSteps.length) * 100

    return (
      <div className="fixed inset-0 bg-white flex flex-col">
        {/* Header with progress */}
        <div
          className="sticky top-0 z-20 bg-white"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 8px)' }}
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
            </div>
            <span className="text-gray-500 text-sm">{currentStepIndex + 1}/{wizardSteps.length}</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div
          className="flex-1 overflow-y-auto px-6 pt-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 100px)' }}
        >
          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 rounded-xl border border-red-100">
              <p className="text-red-600 text-[14px]">{error}</p>
            </div>
          )}

          {/* Step: Basics */}
          {wizardStep === 'basics' && (
            <div>
              <h1 className="text-[28px] font-bold text-gray-900 mb-2">Let's get started</h1>
              <p className="text-gray-500 text-[15px] mb-8">Create your pro account</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-gray-600 text-[13px] font-medium mb-2">Full Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Smith"
                    autoCapitalize="words"
                    className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-gray-600 text-[13px] font-medium mb-2">Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-gray-600 text-[13px] font-medium mb-2">Password *</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-gray-600 text-[13px] font-medium mb-2">Phone Number *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step: Business */}
          {wizardStep === 'business' && (
            <div>
              <h1 className="text-[28px] font-bold text-gray-900 mb-2">Your Business</h1>
              <p className="text-gray-500 text-[15px] mb-8">Tell us about your business</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-gray-600 text-[13px] font-medium mb-2">Business Name *</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Smith's Plumbing"
                    className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-gray-600 text-[13px] font-medium mb-2">Services Offered *</label>
                  <p className="text-gray-400 text-[12px] mb-3">Select all that apply</p>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_CATEGORIES.map((category) => (
                      <button
                        key={category}
                        onClick={() => toggleCategory(category)}
                        className={`px-4 py-2 rounded-full text-[14px] font-medium transition-all ${
                          selectedCategories.includes(category)
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step: Credentials */}
          {wizardStep === 'credentials' && (
            <div>
              <h1 className="text-[28px] font-bold text-gray-900 mb-2">Credentials</h1>
              <p className="text-gray-500 text-[15px] mb-8">Optional but recommended</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-gray-600 text-[13px] font-medium mb-2">License Number</label>
                  <input
                    type="text"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-gray-600 text-[13px] font-medium mb-2">License State</label>
                  <select
                    value={licenseState}
                    onChange={(e) => setLicenseState(e.target.value)}
                    className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  >
                    <option value="">Select State</option>
                    {US_STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-600 text-[13px] font-medium mb-2">Insurance Carrier</label>
                  <input
                    type="text"
                    value={insuranceCarrier}
                    onChange={(e) => setInsuranceCarrier(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="p-4 bg-blue-50 rounded-xl">
                  <p className="text-blue-700 text-[13px]">
                    Adding credentials helps build trust with homeowners and increases your chances of getting hired.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step: Service Area */}
          {wizardStep === 'area' && (
            <div>
              <h1 className="text-[28px] font-bold text-gray-900 mb-2">Service Area</h1>
              <p className="text-gray-500 text-[15px] mb-8">Where do you operate?</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-gray-600 text-[13px] font-medium mb-2">Base ZIP Code *</label>
                  <input
                    type="text"
                    value={baseZip}
                    onChange={(e) => setBaseZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="12345"
                    inputMode="numeric"
                    maxLength={5}
                    className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-gray-600 text-[13px]">
                    You'll be shown jobs within your service area. You can update this later in settings.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step: Review */}
          {wizardStep === 'review' && (
            <div>
              <h1 className="text-[28px] font-bold text-gray-900 mb-2">Review & Submit</h1>
              <p className="text-gray-500 text-[15px] mb-8">Almost there!</p>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <h3 className="text-[13px] font-medium text-gray-500 mb-1">Personal Info</h3>
                  <p className="text-gray-900">{name}</p>
                  <p className="text-gray-600 text-[14px]">{email}</p>
                  <p className="text-gray-600 text-[14px]">{phone}</p>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl">
                  <h3 className="text-[13px] font-medium text-gray-500 mb-1">Business</h3>
                  <p className="text-gray-900">{businessName}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedCategories.map((cat) => (
                      <span key={cat} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[12px]">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl">
                  <h3 className="text-[13px] font-medium text-gray-500 mb-1">Service Area</h3>
                  <p className="text-gray-900">ZIP: {baseZip}</p>
                </div>

                {(licenseNumber || insuranceCarrier) && (
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <h3 className="text-[13px] font-medium text-gray-500 mb-1">Credentials</h3>
                    {licenseNumber && <p className="text-gray-900">License: {licenseNumber} ({licenseState})</p>}
                    {insuranceCarrier && <p className="text-gray-600 text-[14px]">Insurance: {insuranceCarrier}</p>}
                  </div>
                )}

                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <p className="text-amber-800 text-[13px]">
                    Your account will be reviewed before you can start receiving jobs. This usually takes less than 24 hours.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fixed bottom button */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 pt-4"
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
              disabled={loading}
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

  return null
}
