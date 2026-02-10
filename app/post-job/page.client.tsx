'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '../../lib/supabaseClient'
import { openAuth } from '../../components/AuthModal'
import { showGlobalToast } from '../../components/Toast'
import { Capacitor } from '@capacitor/core'
import { getCurrentLocation, reverseGeocode, isNativePlatform } from '../../lib/nativeLocation'
import { safeBack } from '../../lib/safeBack'
import {
  Check,
  Clock,
  MapPin,
  Phone,
  Shield,
  Star,
  X,
  AlertTriangle,
  Info,
  Users,
  Zap,
  Wind,
  Hammer,
  Droplets,
  Wrench,
  Leaf,
  User,
  ChevronLeft,
  DollarSign,
  CreditCard,
  Lock,
} from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const ProMap = dynamic(() => import('../../components/ProMap'), { ssr: false })
const PostJobMultiStep = dynamic(() => import('../../components/PostJobMultiStep'), { ssr: false })
const InstantMatchOverlay = dynamic(() => import('../../components/InstantMatchOverlay'), { ssr: false })
const BidsWaitingOverlay = dynamic(() => import('../../components/BidsWaitingOverlay'), { ssr: false })

type Props = { userId: string | null; initialPhone?: string }

/** Emergency contractor type */
type Contractor = {
  id: string
  name: string
  rating: number
  jobs: number
  distanceKm: number
  etaMin: number
  trades: string[]
  insured: boolean
  backgroundChecked: boolean
  activeNow: boolean
}

const MOCK: Contractor[] = [
  { id: 'c1', name: 'Atlas Plumbing & Heating', rating: 4.9, jobs: 312, distanceKm: 1.2, etaMin: 14, trades: ['Water leak', 'Burst pipe', 'Gas'], insured: true, backgroundChecked: true, activeNow: true },
  { id: 'c2', name: 'BrightSpark Electrical', rating: 4.8, jobs: 201, distanceKm: 2.0, etaMin: 18, trades: ['Power outage', 'Breaker'], insured: true, backgroundChecked: true, activeNow: true },
  { id: 'c3', name: 'Shield Roofing', rating: 4.7, jobs: 167, distanceKm: 3.4, etaMin: 24, trades: ['Roof leak', 'Tarp'], insured: true, backgroundChecked: true, activeNow: true },
  { id: 'c4', name: 'Metro Restoration', rating: 4.6, jobs: 451, distanceKm: 4.1, etaMin: 27, trades: ['Flood', 'Mold'], insured: true, backgroundChecked: true, activeNow: false },
]

/** UI components */
function Stars({ value }: { value: number }) {
  const full = Math.floor(value)
  const half = value - full >= 0.5
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rated ${value} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < full
            ? 'fill-yellow-400 stroke-yellow-400'
            : half && i === full
              ? 'fill-yellow-300 stroke-yellow-300'
              : 'stroke-slate-300'
            }`}
        />
      ))}
    </div>
  )
}

// Emergency banner removed - keeping page minimal

function SafetyNotice() {
  return (
    <div className="card p-4 flex items-start gap-3 bg-emerald-50 border-emerald-200">
      <Shield className="h-5 w-5 text-emerald-600 flex-shrink-0" />
      <div className="text-sm text-slate-700">
        <div className="font-medium text-emerald-800 mb-1">Safety First</div>
        Shut off water or power if safe to do so. Keep children and pets away from hazards. If you smell gas, call your utility company and 911.
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
  helper,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  helper?: string
}) {
  return (
    <div>
      <label className={`block text-sm font-medium text-slate-700 mb-2 ${required ? 'after:content-["*"] after:text-red-500 after:ml-1' : ''}`}>
        {label}
      </label>
      {children}
      {helper ? <div className="mt-2 text-xs text-slate-500">{helper}</div> : null}
    </div>
  )
}

function ContractorCard({
  c,
  selected,
  onPick,
}: {
  c: Contractor
  selected?: boolean
  onPick?: () => void
}) {
  return (
    <div className={`card p-4 flex items-center justify-between gap-4 transition-all hover:shadow-lg ${selected ? 'ring-2 ring-emerald-500 bg-emerald-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="grid place-items-center h-10 w-10 rounded-xl bg-emerald-100 text-emerald-600">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold text-slate-900">{c.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Stars value={c.rating} />
            <span>•</span>
            <span>{c.jobs} jobs</span>
            <span>•</span>
            <span>{c.distanceKm.toFixed(1)} km</span>
            {c.insured && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">Insured</span>}
            {c.backgroundChecked && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Verified</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {c.trades.map((t) => (
              <span key={t} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">{t}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {c.activeNow ? (
          <div className="text-right">
            <div className="text-xs text-emerald-600 font-medium">Available Now</div>
            <div className="text-xs text-slate-500">Will share ETA & price</div>
          </div>
        ) : (
          <div className="text-right text-xs text-slate-500">Currently unavailable</div>
        )}
        <button
          className={`px-4 py-2 rounded-lg font-medium transition-all ${c.activeNow
            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
            : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          onClick={onPick}
          disabled={!c.activeNow}
        >
          Select
        </button>
      </div>
    </div>
  )
}

function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <div>
            <div className="font-semibold text-slate-900">{title}</div>
            <p className="mt-1 text-sm text-slate-600">{body}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={onConfirm}>
            Send Emergency Request
          </button>
        </div>
      </div>
    </div>
  )
}

function ErrorPopup({
  message,
  onClose,
}: {
  message: string
  onClose: () => void
}) {
  if (!message) return null
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-slate-900 mb-2">Action Required</div>
            <p className="text-sm text-slate-700">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end">
          <button
            className="px-6 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

/** Stripe Card Input Form - used inside AddCardModal */
function CardInputForm({
  userId,
  onSuccess,
  onCancel
}: {
  userId: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError(null)

    try {
      // Get user email from Supabase auth
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        throw new Error('Could not retrieve your email. Please log in again.')
      }

      // First ensure customer exists
      const createResponse = await fetch('/api/stripe/customer/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email: user.email, name: user.user_metadata?.full_name || user.email })
      })
      const createData = await createResponse.json()

      if (!createResponse.ok || !createData.customerId) {
        throw new Error(createData.error || 'Failed to create customer')
      }

      const customerId = createData.customerId

      // Create setup intent
      const intentResponse = await fetch('/api/stripe/customer/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId })
      })
      const { clientSecret } = await intentResponse.json()

      if (!clientSecret) {
        throw new Error('Failed to create setup intent')
      }

      const cardElement = elements.getElement(CardElement)
      if (!cardElement) {
        throw new Error('Card element not found')
      }

      // Confirm card setup (with timeout for WKWebView)
      const confirmPromise = stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement }
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Card verification timed out. Please try again.')), 30000)
      )
      const { error: stripeError, setupIntent } = await Promise.race([confirmPromise, timeoutPromise])

      if (stripeError) {
        setError(stripeError.message || 'Failed to save card')
        setLoading(false)
        return
      }

      if (!setupIntent?.payment_method) {
        throw new Error('No payment method returned from Stripe')
      }

      // Save card via server API (uses service role key, bypasses RLS)
      const pmId = typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method.id
      const saveRes = await fetch('/api/stripe/customer/save-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, paymentMethodId: pmId, setAsDefault: true })
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok || !saveData.success) {
        throw new Error(saveData.error || 'Failed to save card to account')
      }

      showGlobalToast('Card saved successfully!', 'success')
      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Failed to save card')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#1e293b',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                '::placeholder': { color: '#94a3b8' },
              },
              invalid: { color: '#ef4444' },
            },
          }}
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || loading}
          className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            'Save Card'
          )}
        </button>
      </div>
    </form>
  )
}

/** Add Card Modal - Shows Stripe card input inline */
function AddCardModal({
  open,
  userId,
  onSuccess,
  onClose
}: {
  open: boolean
  userId: string
  onSuccess: () => void
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Add Payment Method</h3>
              <p className="text-xs text-slate-500">Required for Direct Payment jobs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 pt-4">
          {/* Security Badge */}
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl mb-4">
            <Lock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-500">
              Secure payment by Stripe. Your card details are encrypted.
            </span>
          </div>

          {/* Stripe Elements Form */}
          <Elements stripe={stripePromise}>
            <CardInputForm
              userId={userId}
              onSuccess={onSuccess}
              onCancel={onClose}
            />
          </Elements>

          {/* Info */}
          <p className="text-xs text-center text-slate-400 mt-4">
            Your card will be charged only when a contractor accepts your job.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Emergency categories and services - Home emergencies only */
const EMERGENCY_CATEGORIES = [
  { key: 'home', label: 'Home Emergency' }
]

const EMERGENCY_TYPES_MAP: Record<string, Array<{ key: string, label: string, icon: string }>> = {
  'home': [
    { key: 'plumbing', label: 'Plumbing Emergency', icon: '🚢' },
    { key: 'electrical', label: 'Electrical Emergency', icon: '⚡' },
    { key: 'hvac', label: 'HVAC Emergency', icon: '❄️' },
    { key: 'roofing', label: 'Roof Emergency', icon: '🏠' },
    { key: 'water-damage', label: 'Water Damage', icon: '💧' },
    { key: 'locksmith', label: 'Lockout Emergency', icon: '🔐' },
    { key: 'appliance', label: 'Appliance Emergency', icon: '🔧' },
    { key: 'other', label: 'Other Home Emergency', icon: '🔨' }
  ]
}

function CategoryPill({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm flex items-center gap-2 transition-all ${active ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg' : 'border-slate-200 hover:bg-emerald-50 hover:border-emerald-200'
        }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-200" />
              <div>
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="mt-2 flex gap-2">
                  <div className="h-3 w-16 rounded bg-slate-200" />
                  <div className="h-3 w-10 rounded bg-slate-200" />
                  <div className="h-3 w-14 rounded bg-slate-200" />
                </div>
              </div>
            </div>
            <div className="h-8 w-20 rounded bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  )
}

function TopProgress({ active }: { active: boolean }) {
  return (
    <div className={`fixed inset-x-0 top-0 z-[70] ${active ? '' : 'hidden'}`}>
      <div className="h-1 w-full overflow-hidden bg-transparent">
        <div className="h-full w-1/3 animate-[progress_1.2s_ease-in-out_infinite] bg-emerald-600" />
      </div>
      <style jsx>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(50%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  )
}

export default function PostJobInner({ userId, initialPhone = '' }: Props) {
  const router = useRouter()

  // Detect iOS native platform
  const [isNative, setIsNative] = useState(false)
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])

  // Form state
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState(initialPhone)
  const [category, setCategory] = useState('')
  const [emergencyType, setEmergencyType] = useState('')
  const [details, setDetails] = useState('')
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [showPhoneModal, setShowPhoneModal] = useState(false)

  // Track if we should auto-submit after restoring data
  const [pendingAutoSubmit, setPendingAutoSubmit] = useState(false)

  // Restore saved form data if user just logged in
  useEffect(() => {
    const savedData = localStorage.getItem('rushr_pending_job')
    if (savedData) {
      try {
        const formData = JSON.parse(savedData)
        // Only restore if data is less than 1 hour old
        const oneHourAgo = Date.now() - (60 * 60 * 1000)
        if (formData.timestamp > oneHourAgo) {
          setAddress(formData.address || '')
          setPhone(formData.phone || '')
          setCategory(formData.category || '')
          setEmergencyType(formData.emergencyType || '')
          setDetails(formData.details || '')
          setSendAll(formData.sendAll !== undefined ? formData.sendAll : true)
          setPicked(formData.picked || null)
          setUserLocation(formData.userLocation || null)
          console.log('[RESTORE] Restored saved job form data')

          // If user is now logged in, auto-submit the job
          if (userId) {
            console.log('[RESTORE] User is logged in, will auto-submit job')
            showGlobalToast('Your job request has been restored. Review and submit!', 'success')
            setPendingAutoSubmit(true)
          }
        }
        // Clear the saved data
        localStorage.removeItem('rushr_pending_job')
      } catch (e) {
        console.error('[RESTORE] Failed to parse saved form data:', e)
      }
    }
  }, [userId])

  // Auto-submit job after user logs in (if they had pending data)
  useEffect(() => {
    if (pendingAutoSubmit && userId && category && emergencyType) {
      console.log('[AUTO-SUBMIT] Triggering auto-submit after login')
      setPendingAutoSubmit(false)

      // Small delay to ensure all state is properly set
      setTimeout(() => {
        // Check if address and phone were restored
        if (!address || address.trim() === '') {
          console.log('[AUTO-SUBMIT] Address missing, opening location modal')
          setShowLocationModal(true)
          return
        }
        if (!phone || phone.trim() === '') {
          console.log('[AUTO-SUBMIT] Phone missing, opening phone modal')
          setShowPhoneModal(true)
          return
        }
        // All validation passed, show confirmation modal
        console.log('[AUTO-SUBMIT] Opening confirmation modal')
        setConfirmOpen(true)
      }, 500)
    }
  }, [pendingAutoSubmit, userId, category, emergencyType, address, phone])

  // Sync phone from parent's userProfile (already loaded by AuthContext)
  useEffect(() => {
    if (initialPhone && !phone) {
      setPhone(initialPhone)
    }
  }, [initialPhone])

  // Save phone to user_profiles so it persists across sessions
  const savePhoneToProfile = async (phoneNumber: string) => {
    if (!userId || !phoneNumber.trim()) return
    await supabase
      .from('user_profiles')
      .update({ phone: phoneNumber.trim() })
      .eq('id', userId)
  }

  // Check if user has saved card (for direct payment) — uses API for reliable check
  useEffect(() => {
    if (!userId) {
      setHasSavedCard(false)
      return
    }

    async function checkSavedCard() {
      setCheckingCard(true)
      try {
        const response = await fetch(`/api/stripe/customer/payment-methods?userId=${userId}`)
        const data = await response.json()
        setHasSavedCard(data.success && data.paymentMethods && data.paymentMethods.length > 0)
      } catch (err) {
        console.error('Error checking saved card:', err)
        setHasSavedCard(false)
      } finally {
        setCheckingCard(false)
      }
    }

    checkSavedCard()
  }, [userId])

  // Handler for when card is successfully added
  const handleCardAdded = async () => {
    setShowAddCardModal(false)
    // Verify card was saved via API (uses service role, bypasses RLS)
    try {
      const response = await fetch(`/api/stripe/customer/payment-methods?userId=${userId}`)
      const data = await response.json()

      if (data.success && data.paymentMethods && data.paymentMethods.length > 0) {
        setHasSavedCard(true)
        showGlobalToast('Card saved! You can now post your job.', 'success')
      }
    } catch (err) {
      console.error('Error verifying card:', err)
      // Optimistically set to true since confirmCardSetup succeeded
      setHasSavedCard(true)
    }
  }

  // Handler for when InstantMatch times out and switches to bids
  const handleSwitchToBids = async () => {
    if (!createdJobId) return
    console.log('[SWITCH-TO-BIDS] No contractor found, switching job to bids mode')
    try {
      await supabase
        .from('homeowner_jobs')
        .update({ payment_type: 'bids', direct_amount: null })
        .eq('id', createdJobId)
      setPaymentType('bids')
      showGlobalToast('Switched to Bids mode — you\'ll receive bids shortly.', 'success')
    } catch (err) {
      console.error('[SWITCH-TO-BIDS] Error:', err)
    }
  }

  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(1)
  const totalSteps = 5
  const [photos, setPhotos] = useState<File[]>([])
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)

  // Form validation state
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [uploadError, setUploadError] = useState<string>('')

  // Emergency flow state
  const [sendAll, setSendAll] = useState(true)
  const [picked, setPicked] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [errorPopup, setErrorPopup] = useState<string>('')

  // Direct Payment state
  const [paymentType, setPaymentType] = useState<'direct' | 'bids'>('direct')
  const [directAmount, setDirectAmount] = useState('')
  const [hasSavedCard, setHasSavedCard] = useState(false)
  const [checkingCard, setCheckingCard] = useState(false)
  const [showInstantMatch, setShowInstantMatch] = useState(false)
  const [showBidsOverlay, setShowBidsOverlay] = useState(false)
  const [createdJobTitle, setCreatedJobTitle] = useState('')
  const [showAddCardModal, setShowAddCardModal] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)
  const [paymentHoldId, setPaymentHoldId] = useState<string | null>(null)

  // Get user's current location - uses native Capacitor Geolocation on iOS
  const fetchCurrentLocation = async () => {
    console.log('[POST-JOB] fetchCurrentLocation called! Native:', isNativePlatform())

    const result = await getCurrentLocation()

    if (result.success && result.coordinates) {
      const { latitude, longitude } = result.coordinates
      console.log('[POST-JOB] Location success:', latitude, longitude)

      // Store as [lat, lng] for ProMapInner
      setUserLocation([latitude, longitude])

      // Reverse geocode to get readable address
      const addressResult = await reverseGeocode(latitude, longitude)
      if (addressResult) {
        setAddress(addressResult)
      } else {
        setAddress(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
      }

      console.log('[POST-JOB] Set userLocation:', [latitude, longitude])
    } else {
      console.error('[POST-JOB] Location error:', result.error)
      alert(result.error || 'Could not get your location.')
    }
  }

  // Geocode address (e.g., "New York City" → coordinates + formatted address)
  const geocodeAddress = async (searchText: string) => {
    const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!MAPBOX_TOKEN) {
      console.error('Mapbox token not configured')
      return
    }

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchText)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
      )
      const data = await response.json()

      if (data.features && data.features.length > 0) {
        const feature = data.features[0]
        const [lng, lat] = feature.center
        const formattedAddress = feature.place_name

        setUserLocation([lat, lng])
        setAddress(formattedAddress)
        console.log('Geocoded:', searchText, '→', formattedAddress, [lat, lng])
      }
    } catch (error) {
      console.error('Geocoding error:', error)
    }
  }

  // Debounced geocoding when user types in address field
  useEffect(() => {
    if (!address || address.length < 3) return
    if (address.startsWith('Current Location')) return

    const timer = setTimeout(() => {
      geocodeAddress(address)
    }, 1000) // Wait 1 second after user stops typing

    return () => clearTimeout(timer)
  }, [address])

  // Form validation functions
  const validateField = (field: string, value: string) => {
    const newErrors = { ...errors }

    switch (field) {
      case 'address':
        if (!value.trim()) {
          newErrors.address = 'Address is required'
        } else if (value.trim().length < 5) {
          newErrors.address = 'Please enter a complete address'
        } else {
          delete newErrors.address
        }
        break

      case 'phone':
        const phoneRegex = /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/
        if (!value.trim()) {
          newErrors.phone = 'Phone number is required'
        } else if (!phoneRegex.test(value.trim())) {
          newErrors.phone = 'Please enter a valid phone number'
        } else {
          delete newErrors.phone
        }
        break

      case 'category':
        if (!value) {
          newErrors.category = 'Please select an emergency category'
        } else {
          delete newErrors.category
        }
        break

      case 'emergencyType':
        if (!value) {
          newErrors.emergencyType = 'Please select the type of emergency'
        } else {
          delete newErrors.emergencyType
        }
        break

      // issueTitle removed - auto-generated from emergency type
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateForm = () => {
    const isAddressValid = validateField('address', address)
    const isPhoneValid = validateField('phone', phone)
    const isCategoryValid = validateField('category', category)
    const isEmergencyTypeValid = validateField('emergencyType', emergencyType)

    return isAddressValid && isPhoneValid && isCategoryValid && isEmergencyTypeValid
  }

  const handleFieldBlur = (field: string, value: string) => {
    setTouched({ ...touched, [field]: true })
    validateField(field, value)
  }

  // Read URL parameters
  const searchParams = useSearchParams()

  useEffect(() => {
    const categoryParam = searchParams.get('category')
    if (categoryParam) {
      // Map category names from URL to internal category keys (home emergencies only)
      const categoryMap: Record<string, { category: string, type: string }> = {
        'Plumber': { category: 'home', type: 'plumbing' },
        'Plumbing': { category: 'home', type: 'plumbing' },
        'Electrician': { category: 'home', type: 'electrical' },
        'Electrical': { category: 'home', type: 'electrical' },
        'HVAC': { category: 'home', type: 'hvac' },
        'Roofer': { category: 'home', type: 'roofing' },
        'Roofing': { category: 'home', type: 'roofing' },
        'Water Damage Restoration': { category: 'home', type: 'water-damage' },
        'Water Damage': { category: 'home', type: 'water-damage' },
        'Locksmith': { category: 'home', type: 'locksmith' },
        'Appliance Repair': { category: 'home', type: 'appliance' },
        'Other': { category: 'home', type: 'other' },
      }

      const mapped = categoryMap[categoryParam]
      if (mapped) {
        setCategory(mapped.category)
        setEmergencyType(mapped.type)
      } else {
        // Fallback: just set the category directly
        setCategory(categoryParam.toLowerCase())
      }
    }
  }, [searchParams])

  // Auto-fetch user location on page load
  useEffect(() => {
    console.log('[POST-JOB] Auto-fetching user location on page load...')
    fetchCurrentLocation()
  }, []) // Empty dependency array = runs once on mount

  // Pro list filters
  const [onlyActive, setOnlyActive] = useState(true)
  const [sortBy, setSortBy] = useState<'eta' | 'distance' | 'rating'>('eta')
  const [nearbyContractors, setNearbyContractors] = useState<Contractor[]>([])
  const [nearbyContractorsWithLocation, setNearbyContractorsWithLocation] = useState<any[]>([]) // Store contractors with lat/lng for map
  const [loadingContractors, setLoadingContractors] = useState(false)
  const [showCount, setShowCount] = useState(5) // Show 5 contractors initially

  // Helper function to calculate distance using Haversine formula
  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959 // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // Contractors are shown only in the hero search InstantMatchOverlay, not on post-job

  const filteredNearby = useMemo(() => {
    // Only show contractors if we have a location (userLocation OR valid ZIP in address)
    const hasLocation = userLocation !== null || address.match(/\d{5}/)
    if (!hasLocation) return []

    const base = nearbyContractors.length > 0
      ? (onlyActive ? nearbyContractors.filter(m => m.activeNow) : nearbyContractors)
      : [] // Don't fallback to MOCK - only show real data
    const sorted = [...base].sort((a, b) =>
      sortBy === 'eta' ? a.etaMin - b.etaMin : sortBy === 'distance' ? a.distanceKm - b.distanceKm : b.rating - a.rating
    )
    return sorted
  }, [nearbyContractors, onlyActive, sortBy, userLocation, address])

  const selectedContractor = useMemo(() =>
    nearbyContractors.find((m) => m.id === picked) || null
    , [picked, nearbyContractors])

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    setUploadError('')

    // Validate file types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/mov', 'video/avi']
    const invalidFiles = files.filter(file => !allowedTypes.includes(file.type))

    if (invalidFiles.length > 0) {
      setUploadError('Please upload only images (JPG, PNG, GIF, WebP) or videos (MP4, MOV, AVI)')
      return
    }

    // Validate file sizes (10MB for images, 50MB for videos)
    const oversizedFiles = files.filter(file => {
      const isVideo = file.type.startsWith('video/')
      const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
      return file.size > maxSize
    })

    if (oversizedFiles.length > 0) {
      setUploadError('Files too large. Images must be under 10MB, videos under 50MB')
      return
    }

    // Check total file count
    if (photos.length + files.length > 6) {
      setUploadError('Maximum 6 files allowed. Please remove some files first.')
      return
    }

    setPhotos((prev) => [...prev, ...files])
  }

  function removePhoto(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i))
    setUploadError('') // Clear any upload errors when removing files
  }

  function submit() {
    console.log('[SUBMIT] Button clicked!')
    console.log('[SUBMIT] Form values:', { address, phone, category, emergencyType, sendAll, picked })

    // Validate category and emergency type first (required to proceed)
    if (!category || category.trim() === '') {
      console.error('[SUBMIT] Category is missing')
      setErrorPopup('Please select an emergency category.')
      return
    }

    if (!emergencyType || emergencyType.trim() === '') {
      console.error('[SUBMIT] Emergency type is missing')
      setErrorPopup('Please select a specific emergency type.')
      return
    }

    // AUTH CHECK FIRST - require login before any other validation
    if (!userId) {
      console.log('[SUBMIT] User not logged in, saving form data and opening auth modal')

      // Save form data to localStorage so it persists after login
      const formData = {
        address,
        phone,
        category,
        emergencyType,
        details,
        sendAll,
        picked,
        userLocation,
        timestamp: Date.now()
      }
      localStorage.setItem('rushr_pending_job', JSON.stringify(formData))

      // Open login modal - user will be returned to this page after login
      openAuth('/post-job')
      return
    }

    // User is logged in - now validate address and phone
    if (!address || address.trim() === '') {
      console.error('[SUBMIT] Address is missing')
      setErrorPopup('Please set your emergency location by clicking the "Set location" link at the top.')
      setShowLocationModal(true)
      return
    }

    if (!phone || phone.trim() === '') {
      console.error('[SUBMIT] Phone is missing')
      setErrorPopup('Please set your contact number by clicking the "Set phone" link at the top.')
      setShowPhoneModal(true)
      return
    }

    // For Direct Payment: check card BEFORE confirmation
    if (paymentType === 'direct') {
      const amount = parseFloat(directAmount)
      if (!amount || amount <= 0) {
        setErrorPopup('Please enter a valid amount for direct payment.')
        return
      }
      if (!hasSavedCard) {
        setShowAddCardModal(true)
        return
      }
    }

    // Mark all fields as touched to show validation errors
    setTouched({
      address: true,
      phone: true,
      category: true,
      emergencyType: true,
    })

    // If selecting specific contractor but none picked, auto-switch to "Alert All"
    if (!sendAll && !picked) {
      console.log('[SUBMIT] No contractor selected, auto-switching to "Alert All Nearby"')
      setSendAll(true)
      // Continue with submission using "Alert All" mode
    }

    console.log('[SUBMIT] Opening confirmation modal')
    setConfirmOpen(true)
  }

  async function actuallySend() {
    setConfirmOpen(false)

    // Set sending state FIRST to show loading indicator
    setSending(true)
    console.log('[SUBMIT] Starting job submission, sending=true')

    try {
      console.log('Submitting emergency job to database...')

      // Auto-generate title from emergency type (home emergencies only)
      const emergencyTypeLabels: Record<string, string> = {
        'plumbing': 'Plumbing Emergency',
        'electrical': 'Electrical Emergency',
        'hvac': 'HVAC Emergency',
        'roofing': 'Roof Emergency',
        'water-damage': 'Water Damage Emergency',
        'locksmith': 'Lockout Emergency',
        'appliance': 'Appliance Emergency',
        'other': 'Home Emergency',
      }
      const autoTitle = emergencyTypeLabels[emergencyType] || 'Home Emergency'

      // Prepare job data (escrow is created later when HO clicks "Start Job")
      const jobData: any = {
        title: autoTitle,
        description: details || autoTitle,
        category: emergencyType || category || 'other',
        priority: 'emergency', // All post-job submissions are emergency
        status: 'pending', // Waiting for contractors to accept
        address: address,
        latitude: userLocation ? userLocation[0] : null,
        longitude: userLocation ? userLocation[1] : null,
        zip_code: address.match(/\d{5}/)?.[0] || null,
        phone: phone,
        homeowner_id: userId, // Current user ID
        created_at: new Date().toISOString(),
        // Include contractor info if specific contractor was selected
        requested_contractor_id: !sendAll && picked ? picked : null,
        requested_contractor_name: !sendAll && selectedContractor ? selectedContractor.name : null,
        // Direct payment fields
        payment_type: paymentType,
        direct_amount: paymentType === 'direct' ? parseFloat(directAmount) : null,
      }

      console.log('[SUBMIT] Job data prepared:', jobData)

      // Insert job into database
      const { data: insertedJob, error } = await supabase
        .from('homeowner_jobs')
        .insert([jobData])
        .select()
        .single()

      if (error) {
        console.error('[SUBMIT] Error creating job:', error)
        setErrorPopup('Failed to submit emergency request. Please try again.')
        setSending(false)
        return
      }

      console.log('[SUBMIT] Job created successfully:', insertedJob)

      // Upload photos to Supabase Storage (non-blocking — failures don't prevent submission)
      if (photos.length > 0 && userId) {
        (async () => {
          try {
            const uploadedUrls: string[] = []

            for (const photo of photos) {
              const ext = photo.name.split('.').pop() || 'jpg'
              const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
              const filePath = `${userId}/${insertedJob.id}/${fileName}`

              const { error: uploadError } = await supabase.storage
                .from('job-photos')
                .upload(filePath, photo)

              if (uploadError) {
                console.error('[SUBMIT] Photo upload error:', uploadError)
                continue
              }

              const { data: publicUrlData } = supabase.storage
                .from('job-photos')
                .getPublicUrl(filePath)

              if (publicUrlData?.publicUrl) {
                uploadedUrls.push(publicUrlData.publicUrl)
              }
            }

            if (uploadedUrls.length > 0) {
              await supabase
                .from('homeowner_jobs')
                .update({ photo_urls: uploadedUrls })
                .eq('id', insertedJob.id)

              console.log('[SUBMIT] Photo URLs saved:', uploadedUrls.length)
            }
          } catch (photoErr) {
            console.error('[SUBMIT] Photo upload failed (non-blocking):', photoErr)
          }
        })()
      }

      // Notify contractors in the area via email (fire and forget - don't block redirect)
      // NOTE: Phone number is NOT sent - only shared after bid is accepted
      fetch('/api/notify-contractors-new-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: insertedJob.id,
          jobTitle: insertedJob.title,
          jobCategory: insertedJob.category,
          jobAddress: insertedJob.address || insertedJob.zip_code,
          jobZip: insertedJob.zip_code,
          paymentType: paymentType,
          directAmount: paymentType === 'direct' ? parseFloat(directAmount) : null
        })
      }).catch(err => console.error('[SUBMIT] Email notification error:', err))

      // For Direct Payment: Open InstantMatchOverlay to find contractors
      if (paymentType === 'direct') {
        console.log('[SUBMIT] Direct payment job - opening InstantMatchOverlay')
        setCreatedJobId(insertedJob.id)
        setSending(false)
        setShowInstantMatch(true)
        return
      }

      // For Bids: Show real-time bids overlay with 5-minute timer
      console.log('[SUBMIT] Bids mode - opening BidsWaitingOverlay')
      setCreatedJobId(insertedJob.id)
      setCreatedJobTitle(insertedJob.title || autoTitle)
      setSending(false)
      setShowBidsOverlay(true)

    } catch (err) {
      console.error('[SUBMIT] Error submitting job:', err)
      setErrorPopup('Failed to submit emergency request. Please try again.')
      setSending(false)
    }
  }

  // Handle contractor selection from map for direct offer
  async function handleSelectContractorFromMap(contractor: any) {
    console.log('[POST-JOB] Contractor selected from map:', contractor)

    // Check if user is logged in
    if (!userId) {
      // Save selection to localStorage and prompt login
      localStorage.setItem('rushr_pending_direct_offer', JSON.stringify({
        contractor,
        category: emergencyType || category,
        address,
        userLocation,
        timestamp: Date.now()
      }))
      openAuth('/post-job')
      return
    }

    // Create direct offer
    setSending(true)
    try {
      const emergencyTypeLabels: Record<string, string> = {
        'plumbing': 'Plumbing Service',
        'electrical': 'Electrical Service',
        'hvac': 'HVAC Service',
        'roofing': 'Roofing Service',
        'water-damage': 'Water Damage Service',
        'locksmith': 'Locksmith Service',
        'appliance': 'Appliance Repair',
        'other': 'Home Service Request',
      }
      const serviceTitle = emergencyTypeLabels[emergencyType] || emergencyTypeLabels[category] || 'Home Service Request'

      const { data: directOffer, error } = await supabase
        .from('direct_offers')
        .insert({
          homeowner_id: userId,
          contractor_id: contractor.id,
          title: serviceTitle,
          description: details || `${serviceTitle} needed`,
          category: emergencyType || category || 'other',
          priority: 'normal',
          offered_amount: (contractor.hourly_rate || 65) * 2, // 2-hour estimate
          status: 'pending',
          address: address || null,
          latitude: userLocation ? userLocation[0] : null,
          longitude: userLocation ? userLocation[1] : null,
          homeowner_notes: details || null,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error('[POST-JOB] Error creating direct offer:', error)
        setErrorPopup('Failed to create direct offer. Please try again.')
        setSending(false)
        return
      }

      console.log('[POST-JOB] Direct offer created:', directOffer)

      // Notify contractor via email
      try {
        await fetch('/api/notify-contractor-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contractorId: contractor.id,
            contractorName: contractor.business_name || contractor.name,
            category: emergencyType || category,
            jobDescription: details || serviceTitle,
            userLocation: userLocation ? { lat: userLocation[0], lng: userLocation[1] } : null,
            locationName: address,
            homeownerId: userId,
            hourlyRate: contractor.hourly_rate || 65,
            estimatedAmount: (contractor.hourly_rate || 65) * 2
          })
        })
      } catch (emailErr) {
        console.error('[POST-JOB] Email notification error:', emailErr)
      }

      // Redirect to homeowner dashboard direct offers
      router.push('/dashboard/homeowner?tab=offers')

    } catch (err) {
      console.error('[POST-JOB] Error creating direct offer:', err)
      setErrorPopup('Failed to create direct offer. Please try again.')
      setSending(false)
    }
  }

  // For iOS native, wrap in fixed container with proper safe area handling
  if (isNative) {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <TopProgress active={sending} />

        {/* InstantMatchOverlay for Direct Payment Jobs */}
        <InstantMatchOverlay
          isOpen={showInstantMatch}
          onClose={() => {
            setShowInstantMatch(false)
            if (createdJobId) {
              router.push(`/jobs/${createdJobId}`)
            }
          }}
          category={emergencyType || category || 'Service'}
          searchQuery={details || emergencyType || ''}
          userLocation={userLocation ? { lat: userLocation[0], lng: userLocation[1], zip: address.match(/\d{5}/)?.[0] } : undefined}
          jobId={createdJobId || undefined}
          directAmount={paymentType === 'direct' ? parseFloat(directAmount) : undefined}
          paymentHoldId={paymentHoldId || undefined}
          onSwitchToBids={handleSwitchToBids}
        />

        {/* BidsWaitingOverlay for Bids-mode Jobs */}
        {createdJobId && userId && (
          <BidsWaitingOverlay
            isOpen={showBidsOverlay}
            onClose={() => {
              setShowBidsOverlay(false)
              setCreatedJobId(null)
            }}
            jobId={createdJobId}
            jobTitle={createdJobTitle}
            homeownerId={userId}
            onBidAccepted={(bid) => {
              setShowBidsOverlay(false)
              showGlobalToast(`Bid accepted! ${bid.contractor?.business_name || bid.contractor?.name || 'Contractor'} is on the way.`, 'success')
              router.push(`/jobs/${createdJobId}`)
            }}
          />
        )}

        {/* Full-screen sending overlay - Same style as splash */}
        {sending && (
          <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(160deg, #10b981 0%, #059669 50%, #047857 100%)' }}
          >
            <div className="relative">
              <div
                className="absolute inset-0 w-24 h-24 rounded-3xl"
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
                }}
              />
              <div className="relative w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-2xl p-3">
                <img
                  src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg"
                  alt="Rushr"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
            <p className="text-white font-semibold text-lg mt-6">Submitting Request...</p>
            <p className="text-white/70 text-sm mt-1">Finding available pros in your area</p>
            <style jsx>{`
              @keyframes ping {
                0% { transform: scale(1); opacity: 0.8; }
                75%, 100% { transform: scale(1.3); opacity: 0; }
              }
            `}</style>
          </div>
        )}

        {/* iOS Native Header with back button - uses safe-area-inset-top */}
        <div
          className="relative z-50 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
          }}
        >
          <div className="flex items-center px-4 py-3">
            <button
              onClick={() => safeBack(router, '/')}
              className="flex items-center text-white active:opacity-60"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <ChevronLeft className="w-6 h-6" />
              <span className="ml-1 font-medium">Back</span>
            </button>
            <h1 className="flex-1 text-center text-white font-semibold text-lg pr-12">
              Post a Job
            </h1>
          </div>
        </div>

        {/* Scrollable content area with bottom safe area */}
        <div
          className="flex-1 overflow-auto"
          style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 34px))' }}
        >
          <div className="container-max section">
        <ConfirmModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={actuallySend}
          title="Send Emergency Request?"
          body={
            sendAll
              ? 'We will instantly alert all active emergency pros in your area. The first to accept will be shown with live ETA tracking.'
              : selectedContractor
                ? `We will notify ${selectedContractor.name} immediately about your emergency.`
                : 'Please select a contractor or choose "Alert All Nearby" option.'
          }
        />

        <ErrorPopup
          message={errorPopup}
          onClose={() => setErrorPopup('')}
        />

        {/* Add Card Modal */}
        {userId && (
          <AddCardModal
            open={showAddCardModal}
            userId={userId}
            onSuccess={handleCardAdded}
            onClose={() => setShowAddCardModal(false)}
          />
        )}

        {/* Contact Details Banner */}
        <div className="card p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <span className="text-sm text-slate-600 flex-shrink-0">Location:</span>
              <button
                onClick={() => setShowLocationModal(true)}
                className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium truncate"
              >
                {address || 'Set location'}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Phone className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <span className="text-sm text-slate-600 flex-shrink-0">Phone:</span>
              <button
                onClick={() => setShowPhoneModal(true)}
                className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
              >
                {phone || 'Set phone'}
              </button>
            </div>
          </div>
        </div>

        {/* Location Modal */}
        {showLocationModal && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/80 backdrop-blur-lg rounded-xl shadow-2xl max-w-md w-full p-6 border border-white/70" style={{ backdropFilter: 'blur(12px)' }}>
              <h3 className="text-xl font-bold mb-4 text-gray-900">Set Emergency Location</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main St, City, State ZIP"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    fetchCurrentLocation()
                    setShowLocationModal(false)
                  }}
                  className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2"
                >
                  <MapPin className="h-5 w-5" />
                  Use My Current Location
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowLocationModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      validateField('address', address)
                      setShowLocationModal(false)
                    }}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phone Modal */}
        {showPhoneModal && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/80 backdrop-blur-lg rounded-xl shadow-2xl max-w-md w-full p-6 border border-white/70" style={{ backdropFilter: 'blur(12px)' }}>
              <h3 className="text-xl font-bold mb-4 text-gray-900">Set Contact Number</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPhoneModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      validateField('phone', phone)
                      savePhoneToProfile(phone)
                      setShowPhoneModal(false)
                    }}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* iOS Mobile Layout: Form + Map */}
        <div className="space-y-4">
          {/* Form */}
          <PostJobMultiStep
            address={address}
            setAddress={setAddress}
            phone={phone}
            setPhone={setPhone}
            category={category}
            setCategory={setCategory}
            emergencyType={emergencyType}
            setEmergencyType={setEmergencyType}
            details={details}
            setDetails={setDetails}
            sendAll={sendAll}
            setSendAll={setSendAll}
            picked={picked}
            setPicked={setPicked}
            paymentType={paymentType}
            setPaymentType={setPaymentType}
            directAmount={directAmount}
            setDirectAmount={setDirectAmount}
            hasSavedCard={hasSavedCard}
            checkingCard={checkingCard}
            errors={errors}
            touched={touched}
            validateField={validateField}
            handleFieldBlur={handleFieldBlur}
            emergencyCategories={EMERGENCY_CATEGORIES}
            emergencyTypesMap={EMERGENCY_TYPES_MAP}
            nearbyContractors={nearbyContractors}
            selectedContractor={selectedContractor}
            getCurrentLocation={fetchCurrentLocation}
            onSubmit={submit}
            onAddCard={() => setShowAddCardModal(true)}
            photos={photos}
            setPhotos={setPhotos}
            onUpload={onUpload}
            uploadError={uploadError}
            userId={userId}
            initialStep={category && emergencyType ? 2 : 1}
          />

          {/* Map */}
          <div className="card p-0 overflow-hidden relative" style={{ height: '300px' }}>
            <ProMap
              centerZip={address.match(/\d{5}/)?.[0] || '10001'}
              category={category}
              radiusMiles={1}
              searchCenter={userLocation || undefined}
              contractors={[]}
            />

            {!userLocation && !address.match(/\d{5}/) && (
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/95 to-white/95 z-10 grid place-items-center">
                <div className="text-center px-4">
                  <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="font-medium text-slate-900 text-sm">Enter your address above</div>
                  <button
                    type="button"
                    onClick={fetchCurrentLocation}
                    className="mt-2 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium"
                  >
                    Use My Location
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
          </div>
        </div>
      </div>
    )
  }

  // Web version - standard layout without iOS safe areas
  return (
    <>
      <TopProgress active={sending} />

      {/* InstantMatchOverlay for Direct Payment Jobs */}
      <InstantMatchOverlay
        isOpen={showInstantMatch}
        onClose={() => {
          setShowInstantMatch(false)
          // Redirect to job page when overlay closes
          if (createdJobId) {
            router.push(`/jobs/${createdJobId}`)
          }
        }}
        category={emergencyType || category || 'Service'}
        searchQuery={details || emergencyType || ''}
        userLocation={userLocation ? { lat: userLocation[0], lng: userLocation[1], zip: address.match(/\d{5}/)?.[0] } : undefined}
        jobId={createdJobId || undefined}
        directAmount={paymentType === 'direct' ? parseFloat(directAmount) : undefined}
        paymentHoldId={paymentHoldId || undefined}
        onSwitchToBids={handleSwitchToBids}
      />

      {/* BidsWaitingOverlay for Bids-mode Jobs */}
      {createdJobId && userId && (
        <BidsWaitingOverlay
          isOpen={showBidsOverlay}
          onClose={() => {
            setShowBidsOverlay(false)
            setCreatedJobId(null)
          }}
          jobId={createdJobId}
          jobTitle={createdJobTitle}
          homeownerId={userId}
          onBidAccepted={(bid) => {
            setShowBidsOverlay(false)
            showGlobalToast(`Bid accepted! ${bid.contractor?.business_name || bid.contractor?.name || 'Contractor'} is on the way.`, 'success')
            router.push(`/jobs/${createdJobId}`)
          }}
        />
      )}

      <div className="container-max section">
        <ConfirmModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={actuallySend}
          title="Send Emergency Request?"
          body={
            sendAll
              ? 'We will instantly alert all active emergency pros in your area. The first to accept will be shown with live ETA tracking.'
              : selectedContractor
                ? `We will notify ${selectedContractor.name} immediately about your emergency.`
                : 'Please select a contractor or choose "Alert All Nearby" option.'
          }
        />

        <ErrorPopup
          message={errorPopup}
          onClose={() => setErrorPopup('')}
        />

        {/* Add Card Modal */}
        {userId && (
          <AddCardModal
            open={showAddCardModal}
            userId={userId}
            onSuccess={handleCardAdded}
            onClose={() => setShowAddCardModal(false)}
          />
        )}

        {/* Contact Details Banner */}
        <div className="card p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <span className="text-sm text-slate-600 flex-shrink-0">Location:</span>
              <button
                onClick={() => setShowLocationModal(true)}
                className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium truncate"
              >
                {address || 'Set location'}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Phone className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <span className="text-sm text-slate-600 flex-shrink-0">Phone:</span>
              <button
                onClick={() => setShowPhoneModal(true)}
                className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
              >
                {phone || 'Set phone'}
              </button>
            </div>
          </div>
        </div>

        {/* Location Modal */}
        {showLocationModal && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/80 backdrop-blur-lg rounded-xl shadow-2xl max-w-md w-full p-6 border border-white/70" style={{ backdropFilter: 'blur(12px)' }}>
              <h3 className="text-xl font-bold mb-4 text-gray-900">Set Emergency Location</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main St, City, State ZIP"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    fetchCurrentLocation()
                    setShowLocationModal(false)
                  }}
                  className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2"
                >
                  <MapPin className="h-5 w-5" />
                  Use My Current Location
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowLocationModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      validateField('address', address)
                      setShowLocationModal(false)
                    }}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phone Modal */}
        {showPhoneModal && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/80 backdrop-blur-lg rounded-xl shadow-2xl max-w-md w-full p-6 border border-white/70" style={{ backdropFilter: 'blur(12px)' }}>
              <h3 className="text-xl font-bold mb-4 text-gray-900">Set Contact Number</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPhoneModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      validateField('phone', phone)
                      savePhoneToProfile(phone)
                      setShowPhoneModal(false)
                    }}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Grid layout: Form on left, Map on right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Form */}
          <PostJobMultiStep
            address={address}
            setAddress={setAddress}
            phone={phone}
            setPhone={setPhone}
            category={category}
            setCategory={setCategory}
            emergencyType={emergencyType}
            setEmergencyType={setEmergencyType}
            details={details}
            setDetails={setDetails}
            sendAll={sendAll}
            setSendAll={setSendAll}
            picked={picked}
            setPicked={setPicked}
            paymentType={paymentType}
            setPaymentType={setPaymentType}
            directAmount={directAmount}
            setDirectAmount={setDirectAmount}
            hasSavedCard={hasSavedCard}
            checkingCard={checkingCard}
            errors={errors}
            touched={touched}
            validateField={validateField}
            handleFieldBlur={handleFieldBlur}
            emergencyCategories={EMERGENCY_CATEGORIES}
            emergencyTypesMap={EMERGENCY_TYPES_MAP}
            nearbyContractors={nearbyContractors}
            selectedContractor={selectedContractor}
            getCurrentLocation={fetchCurrentLocation}
            onSubmit={submit}
            onAddCard={() => setShowAddCardModal(true)}
            photos={photos}
            setPhotos={setPhotos}
            onUpload={onUpload}
            uploadError={uploadError}
            userId={userId}
            initialStep={category && emergencyType ? 2 : 1}
          />

          {/* Right: Map */}
          <div className="card p-0 overflow-hidden relative lg:sticky lg:top-6" style={{ minHeight: '450px' }}>
            <ProMap
              centerZip={address.match(/\d{5}/)?.[0] || '10001'}
              category={category}
              radiusMiles={1}
              searchCenter={userLocation || undefined}
              contractors={[]}
            />

            {!userLocation && !address.match(/\d{5}/) && (
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/95 to-white/95 z-10 grid place-items-center">
                <div className="text-center">
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div className="font-medium text-slate-900">Your job location</div>
                  <p className="mt-1 text-sm text-slate-500">Set your location above</p>
                  <button
                    type="button"
                    onClick={fetchCurrentLocation}
                    className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                  >
                    Use My Location
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}