'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '../../lib/supabaseClient'
import { openAuth } from '../../components/AuthModal'
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
} from 'lucide-react'

const ProMap = dynamic(() => import('../../components/ProMap'), { ssr: false })
const PostJobMultiStep = dynamic(() => import('../../components/PostJobMultiStep'), { ssr: false })

type Props = { userId: string | null }

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

function EmergencyBanner() {
  return (
    <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        <div>
          <div className="font-semibold">Life-threatening emergency?</div>
          <div className="text-sm">If this is an immediate danger or life-threatening emergency, call 911 first.</div>
        </div>
      </div>
    </div>
  )
}

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

/** Emergency categories and services */
const EMERGENCY_CATEGORIES = [
  { key: 'home', label: '🏠 Home Emergency' },
  { key: 'auto', label: '🚗 Auto Emergency' }
] as const

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
  ],
  'auto': [
    { key: 'battery', label: 'Dead Battery', icon: '🔋' },
    { key: 'tire', label: 'Flat Tire', icon: '🚗' },
    { key: 'lockout', label: 'Car Lockout', icon: '🔑' },
    { key: 'tow', label: 'Need Towing', icon: '🚚' },
    { key: 'fuel', label: 'Out of Fuel', icon: '⛽' },
    { key: 'mechanic', label: 'Breakdown/Repair', icon: '⚙️' },
    { key: 'other', label: 'Other Auto Emergency', icon: '🆘' }
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

export default function PostJobInner({ userId }: Props) {
  const router = useRouter()

  // Detect iOS native platform
  const [isNative, setIsNative] = useState(false)
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])

  // Form state
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [category, setCategory] = useState('')
  const [emergencyType, setEmergencyType] = useState('')
  const [details, setDetails] = useState('')
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [showPhoneModal, setShowPhoneModal] = useState(false)

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
        }
        // Clear the saved data
        localStorage.removeItem('rushr_pending_job')
      } catch (e) {
        console.error('[RESTORE] Failed to parse saved form data:', e)
      }
    }
  }, [])

  // Fetch user profile data (phone number)
  useEffect(() => {
    if (!userId) return

    async function fetchUserProfile() {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('phone')
        .eq('id', userId)
        .single()

      if (!error && data?.phone) {
        setPhone(data.phone)
      }
    }

    fetchUserProfile()
  }, [userId])

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
      // Map category names from URL to internal category keys
      const categoryMap: Record<string, { category: string, type: string }> = {
        'Plumber': { category: 'home', type: 'plumbing' },
        'Electrician': { category: 'home', type: 'electrical' },
        'HVAC': { category: 'home', type: 'hvac' },
        'Roofer': { category: 'home', type: 'roofing' },
        'Water Damage Restoration': { category: 'home', type: 'water-damage' },
        'Locksmith': { category: 'home', type: 'locksmith' },
        'Appliance Repair': { category: 'home', type: 'appliance' },
        'Other': { category: 'home', type: 'other' },
        'Auto Battery': { category: 'auto', type: 'battery' },
        'Auto Tire': { category: 'auto', type: 'tire' },
        'Auto Lockout': { category: 'auto', type: 'lockout' },
        'Tow': { category: 'auto', type: 'tow' },
        'Fuel Delivery': { category: 'auto', type: 'fuel' },
        'Mobile Mechanic': { category: 'auto', type: 'mechanic' },
        'Auto Other': { category: 'auto', type: 'other' },
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

  // Fetch nearby contractors - Filter by radius and category
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    async function fetchNearbyContractors() {
      // Need either userLocation or address with ZIP
      const zipMatch = address.match(/\b\d{5}\b/)
      const homeownerZip = zipMatch ? zipMatch[0] : null

      if (!userLocation && !homeownerZip) {
        console.log('[POST-JOB] No location yet, waiting for address or geolocation')
        setNearbyContractors([])
        return
      }

      setLoadingContractors(true)

      try {
        // Get ALL contractors first - we'll filter client-side
        const { data: allContractors, error } = await supabase
          .from('pro_contractors')
          .select('*')
          .limit(200)

        if (error) {
          console.error('[POST-JOB] Database error:', error)
          console.error('[POST-JOB] Error details:', JSON.stringify(error, null, 2))
          setNearbyContractors([])
          return
        }

        // Client-side filter by emergency type or category
        let contractors = allContractors || []

        // Use emergencyType if available, otherwise fall back to category
        const filterKey = emergencyType || category

        if (filterKey && contractors.length > 0) {
          // Map emergency type/category keys to actual contractor category values
          const emergencyTypeToCategory: Record<string, string[]> = {
            // Specific emergency types
            'plumbing': ['Plumbing'],
            'electrical': ['Electrical'],
            'hvac': ['HVAC'],
            'roofing': ['Roofing'],
            'water-damage': ['Plumbing', 'Water Damage'],
            'locksmith': ['Locksmith'],
            'appliance': ['Appliance Repair'],
            // Broader categories - include multiple contractor types
            'home': ['Plumbing', 'Electrical', 'HVAC', 'Roofing', 'Locksmith', 'Appliance Repair', 'Water Damage', 'General Contractor'],
            'auto': ['Auto Repair', 'Towing', 'Locksmith'],
          }

          const targetCategories = emergencyTypeToCategory[filterKey]
          console.log('[POST-JOB] Filtering by:', filterKey, '→ Categories:', targetCategories)

          if (targetCategories && targetCategories.length > 0) {
            contractors = contractors.filter(c => {
              const cats = c.categories || []
              // Case-insensitive match - check if contractor has ANY of the target categories
              return Array.isArray(cats) && cats.some((cat: string) =>
                targetCategories.some(targetCat =>
                  cat.toLowerCase().includes(targetCat.toLowerCase()) ||
                  targetCat.toLowerCase().includes(cat.toLowerCase())
                )
              )
            })
            console.log('[POST-JOB] After category filter:', contractors.length, 'contractors match', filterKey)
          }
        }

        if (contractors && contractors.length > 0) {
          console.log('[POST-JOB] Fetched contractors:', contractors.length)
          console.log('[POST-JOB] Sample contractor:', contractors[0])

          const DEFAULT_RADIUS_MILES = 15

          // Filter contractors by radius if we have userLocation
          let matchingContractors = contractors

          if (userLocation) {
            console.log('[POST-JOB] Filtering by userLocation:', userLocation)
            // Filter by distance using lat/lng
            matchingContractors = contractors.filter(c => {
              // Check if contractor has lat/lng (support both field name formats)
              const lat = c.latitude || c.lat
              const lng = c.longitude || c.lng || c.lon

              if (!lat || !lng) {
                console.log(`[POST-JOB] Contractor ${c.id} missing location data`)
                return false
              }

              const distance = calculateDistance(
                userLocation[0],
                userLocation[1],
                Number(lat),
                Number(lng)
              )
              console.log(`[POST-JOB] Contractor ${c.business_name || c.name}: ${distance.toFixed(2)} miles`)
              return distance <= DEFAULT_RADIUS_MILES
            })
            console.log(`[POST-JOB] After radius filter: ${matchingContractors.length} contractors`)
          } else if (homeownerZip) {
            console.log('[POST-JOB] Filtering by ZIP:', homeownerZip)
            // Fallback to ZIP matching if no userLocation
            matchingContractors = contractors.filter(c => {
              const serviceZips = c.service_area_zips || []
              const baseZip = c.base_zip
              return serviceZips.includes(homeownerZip) || baseZip === homeownerZip
            })
            console.log(`[POST-JOB] After ZIP filter: ${matchingContractors.length} contractors`)
          }

          // Map database contractors to UI Contractor type with actual distances
          const mappedContractors: Contractor[] = matchingContractors.map((c) => {
            let distanceKm = 0
            const lat = c.latitude || c.lat
            const lng = c.longitude || c.lng || c.lon

            if (userLocation && lat && lng) {
              const distanceMiles = calculateDistance(
                userLocation[0],
                userLocation[1],
                Number(lat),
                Number(lng)
              )
              distanceKm = distanceMiles * 1.60934 // Convert miles to km
            }

            return {
              id: c.id,
              name: c.business_name || c.name || 'Contractor',
              rating: c.rating || (4.5 + (Math.random() * 0.5)),
              jobs: Math.floor(Math.random() * 500),
              distanceKm,
              etaMin: Math.ceil(distanceKm * 2) + 5, // Estimate ETA based on distance
              trades: c.categories || [],
              insured: true,
              backgroundChecked: true,
              activeNow: true,
            }
          })

          // Sort by distance
          mappedContractors.sort((a, b) => a.distanceKm - b.distanceKm)

          // Also store contractors with full location data for the map
          const contractorsWithLocation = matchingContractors.map(c => ({
            ...c,
            latitude: c.latitude || c.lat,
            longitude: c.longitude || c.lng || c.lon,
          }))

          console.log(`[POST-JOB] Found ${mappedContractors.length} contractors, category: ${emergencyType || 'ALL'}`)
          setNearbyContractors(mappedContractors)
          setNearbyContractorsWithLocation(contractorsWithLocation)
        } else {
          console.log(`[POST-JOB] No contractors found for category: ${emergencyType || 'ALL'}`)
          setNearbyContractors([])
        }
      } catch (err) {
        console.error('[POST-JOB] Error fetching contractors:', err)
        setNearbyContractors([])
      } finally {
        setLoadingContractors(false)
      }
    }

    fetchNearbyContractors()
  }, [category, emergencyType, address, userLocation])

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

    // Check address and phone first (they're in modals now)
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

    // Mark all fields as touched to show validation errors
    setTouched({
      address: true,
      phone: true,
      category: true,
      emergencyType: true,
    })

    // Validate category and emergency type
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

    // Auth check - require login before actual submission
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

    // Set sending state FIRST to show loading indicator
    setSending(true)
    console.log('[SUBMIT] Starting job submission, sending=true')

    try {
      console.log('Submitting emergency job to database...')

      // Auto-generate title from emergency type
      const emergencyTypeLabels: Record<string, string> = {
        'plumbing': 'Plumbing Emergency',
        'electrical': 'Electrical Emergency',
        'hvac': 'HVAC Emergency',
        'roofing': 'Roof Emergency',
        'water-damage': 'Water Damage Emergency',
        'locksmith': 'Lockout Emergency',
        'appliance': 'Appliance Emergency',
        'battery': 'Dead Battery Emergency',
        'tire': 'Flat Tire Emergency',
        'lockout': 'Car Lockout Emergency',
        'tow': 'Towing Emergency',
        'fuel': 'Out of Fuel Emergency',
        'mechanic': 'Breakdown Emergency',
        'other': 'Other Emergency',
      }
      const autoTitle = emergencyTypeLabels[emergencyType] || `${category || 'Home'} Emergency`

      // Prepare job data
      const jobData = {
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

      // Redirect to job success page with real-time bid notifications
      // Don't set sending to false before redirect - keep the loading state
      const jobId = insertedJob.job_number || insertedJob.id
      console.log('[SUBMIT] Redirecting to:', `/jobs/${jobId}/success`)
      router.push(`/jobs/${jobId}/success`)

    } catch (err) {
      console.error('[SUBMIT] Error submitting job:', err)
      setErrorPopup('Failed to submit emergency request. Please try again.')
      setSending(false)
    }
  }

  // For iOS native, wrap in fixed container with proper safe area handling
  if (isNative) {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <TopProgress active={sending} />

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

        {/* Emergency banner */}
        <EmergencyBanner />

        {/* Contact Details Section */}
        <div className="card p-4 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600">Location:</span>
                <button
                  onClick={() => setShowLocationModal(true)}
                  className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
                >
                  {address || 'Set location'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600">Phone:</span>
                <button
                  onClick={() => setShowPhoneModal(true)}
                  className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
                >
                  {phone || 'Set phone'}
                </button>
              </div>
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

        {/* iOS Mobile Layout: Map -> Form -> Contractors */}
        <div className="space-y-4">
          {/* 1. Map at top - shorter height for mobile */}
          <div className="card p-0 overflow-hidden relative" style={{ height: '180px' }}>
            <ProMap
              centerZip={address.match(/\d{5}/)?.[0] || '10001'}
              category={category}
              radiusMiles={15}
              searchCenter={userLocation || undefined}
              contractors={nearbyContractorsWithLocation}
            />

            {/* Overlay prompt when no location */}
            {!userLocation && !address.match(/\d{5}/) && (
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/95 to-white/95 z-10 grid place-items-center">
                <div className="text-center px-4">
                  <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="font-medium text-slate-900 text-sm">See nearby pros on the map</div>
                  <button
                    type="button"
                    onClick={fetchCurrentLocation}
                    className="mt-2 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium"
                  >
                    📍 Use My Location
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Form - right below the map */}
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
            photos={photos}
            setPhotos={setPhotos}
            onUpload={onUpload}
            uploadError={uploadError}
            userId={userId}
            initialStep={category && emergencyType ? 2 : 1}
          />

          {/* 3. Finding contractors section - below the form */}
          <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-base font-semibold text-slate-900">Live Contractors for Direct Offers</div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
              >
                <option value="eta">Response Time</option>
                <option value="distance">Distance</option>
                <option value="rating">Rating</option>
              </select>
            </div>

            {/* Contractors list with Rushr animation */}
            {sending ? (
              <ListSkeleton rows={3} />
            ) : !userLocation && !address.match(/\d{5}/) ? (
              <div className="bg-white rounded-xl p-6 text-center border border-slate-100">
                <MapPin className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-slate-900 mb-1">Set your location</h3>
                <p className="text-xs text-slate-500 mb-3">
                  We'll find available pros nearby
                </p>
                <button
                  type="button"
                  onClick={fetchCurrentLocation}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium"
                >
                  📍 Use My Location
                </button>
              </div>
            ) : loadingContractors ? (
              <div className="bg-white rounded-xl p-6 text-center border border-slate-100">
                <div className="relative w-16 h-16 mx-auto mb-3">
                  <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-25" />
                  <div className="absolute inset-2 rounded-full bg-emerald-200 animate-ping opacity-25" style={{ animationDelay: '0.2s' }} />
                  <div className="absolute inset-4 rounded-full bg-emerald-300 animate-ping opacity-25" style={{ animationDelay: '0.4s' }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <p className="text-slate-600 font-medium text-sm">Finding available pros...</p>
                <p className="text-slate-400 text-xs mt-1">Usually takes 30-60 seconds</p>
              </div>
            ) : filteredNearby.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center border border-slate-100">
                <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-slate-900 mb-1">No Pros Available</h3>
                <p className="text-xs text-slate-500">
                  No contractors found in your area right now
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredNearby.slice(0, showCount).map((c) => (
                  <ContractorCard
                    key={c.id}
                    c={c}
                    selected={picked === c.id}
                    onPick={() => setPicked(c.id)}
                  />
                ))}

                {filteredNearby.length > showCount && (
                  <button
                    onClick={() => setShowCount(prev => prev + 5)}
                    className="w-full px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg text-sm"
                  >
                    Show More ({filteredNearby.length - showCount} remaining)
                  </button>
                )}
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

        {/* Emergency banner */}
        <EmergencyBanner />

        {/* Contact Details Section */}
        <div className="card p-4 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600">Location:</span>
                <button
                  onClick={() => setShowLocationModal(true)}
                  className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
                >
                  {address || 'Set location'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600">Phone:</span>
                <button
                  onClick={() => setShowPhoneModal(true)}
                  className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
                >
                  {phone || 'Set phone'}
                </button>
              </div>
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

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* Left column: Multi-step form */}
          <div className="lg:col-span-2">
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
              photos={photos}
              setPhotos={setPhotos}
              onUpload={onUpload}
              uploadError={uploadError}
              userId={userId}
              initialStep={category && emergencyType ? 2 : 1}
            />
          </div>

          {/* Right column: Map and emergency pros */}
          <div className="space-y-6 lg:col-span-3">
            <div className="card p-0 overflow-hidden relative">
              <ProMap
                centerZip={address.match(/\d{5}/)?.[0] || '10001'}
                category={category}
                radiusMiles={15}
                searchCenter={userLocation || undefined}
                contractors={nearbyContractorsWithLocation}
              />

              {!userLocation && !address.match(/\d{5}/) && (
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/95 to-white/95 z-10 grid place-items-center">
                  <div className="text-center">
                    <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
                      <MapPin className="h-6 w-6" />
                    </div>
                    <div className="font-medium text-slate-900">Click to see nearby pros on the map</div>
                    <p className="mt-1 text-sm text-slate-500">Use your location or enter an address above</p>
                    <button
                      type="button"
                      onClick={fetchCurrentLocation}
                      className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                    >
                      📍 Use My Current Location
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-lg font-semibold text-slate-900">Emergency Professionals Nearby</div>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-emerald-600"
                    checked={onlyActive}
                    onChange={(e) => setOnlyActive(e.target.checked)}
                  />
                  <span className="text-sm text-slate-600">Available now</span>
                </label>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="eta">Sort: Response Time</option>
                  <option value="distance">Sort: Distance</option>
                  <option value="rating">Sort: Rating</option>
                </select>
              </div>
            </div>

            {sending ? (
              <ListSkeleton rows={3} />
            ) : !userLocation && !address.match(/\d{5}/) ? (
              <div className="card p-8 text-center bg-slate-50">
                <MapPin className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">Provide Your Location</h3>
                <p className="text-slate-600 mb-4">
                  Enter your address or use your current location to see available emergency professionals nearby.
                </p>
                <button
                  type="button"
                  onClick={fetchCurrentLocation}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                >
                  📍 Use My Current Location
                </button>
              </div>
            ) : loadingContractors ? (
              <div className="card p-8 text-center bg-slate-50">
                <img
                  src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
                  alt="Loading..."
                  className="w-16 h-16 object-contain mx-auto mb-4"
                />
                <h3 className="text-lg font-medium text-slate-900 mb-2">Finding Emergency Professionals</h3>
                <p className="text-slate-600">
                  Searching for available contractors in your area...
                </p>
              </div>
            ) : filteredNearby.length === 0 ? (
              <div className="card p-8 text-center bg-slate-50">
                <Users className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">No Contractors Available</h3>
                <p className="text-slate-600">
                  No emergency professionals found in your area at this time.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredNearby.slice(0, showCount).map((c) => (
                  <ContractorCard
                    key={c.id}
                    c={c}
                    selected={picked === c.id}
                    onPick={() => setPicked(c.id)}
                  />
                ))}

                {filteredNearby.length > showCount && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCount(prev => prev + 5)}
                      className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
                    >
                      Show More ({filteredNearby.length - showCount} remaining)
                    </button>
                    <button
                      onClick={() => window.location.href = `/find-pro?near=${address.match(/\d{5}/)?.[0] || ''}&category=${emergencyType || ''}`}
                      className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
                    >
                      See All Pros
                    </button>
                  </div>
                )}

                {filteredNearby.length > 5 && showCount >= filteredNearby.length && (
                  <button
                    onClick={() => window.location.href = `/find-pro?near=${address.match(/\d{5}/)?.[0] || ''}&category=${emergencyType || ''}`}
                    className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
                  >
                    See All Pros
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}