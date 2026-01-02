// app/find-pro/page.tsx
// Two-row header. Hours of Operation = multi-select popover.
// Now using Mapbox instead of Leaflet - Mobile optimized for iOS
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useApp } from '../../lib/state'
import { useAuth } from '../../contexts/AuthContext'
import dynamic from 'next/dynamic'
import OfferJobModal from '../../components/OfferJobModal'
import { openAuth } from '../../components/AuthModal'
import { Capacitor } from '@capacitor/core'
import { getCurrentLocation } from '../../lib/nativeLocation'
import { safeBack } from '../../lib/safeBack'
import IOSTabBar, { TabId } from '../../components/IOSTabBar'

// Dynamically import the Mapbox component to avoid SSR issues
const FindProMapbox = dynamic(() => import('../../components/FindProMapbox'), {
  ssr: false,
  loading: () => (
    <div className="h-[360px] w-full rounded-2xl bg-slate-100 flex items-center justify-center">
      <div className="text-slate-400">Loading map...</div>
    </div>
  )
})

type LatLng = [number, number]
type HoursTag =
  | 'open_now'
  | 'open_today'
  | 'weekends'
  | 'evenings'
  | 'early_morning'
  | '24_7'

/* Keep in sync with map legend - comprehensive emergency categories */
const CAT_EMOJI: Record<string, string> = {
  // Home emergencies
  Plumbing: '🚿',
  Electrical: '⚡',
  HVAC: '❄️',
  Roofing: '🏠',
  'Water Damage': '💧',
  Locksmith: '🔒',
  'Appliance Repair': '🔧',
  Handyman: '🔨',

  // Auto emergencies
  'Auto Battery': '🔋',
  'Auto Tire': '🔧',
  'Auto Lockout': '🗝️',
  Tow: '🚗',
  'Fuel Delivery': '⛽',
  'Mobile Mechanic': '⚙️',

  // Other services
  Carpentry: '🔨',
  Landscaping: '🌿',
}

/* Optional ZIP presets (fast, no geocoding) */
const ZIP_COORDS: Record<string, LatLng> = {
  '10001': [40.7506, -73.9972],
  '10002': [40.717, -73.989],
  '10017': [40.7522, -73.9725],
  '10018': [40.7557, -73.9925],
  '11201': [40.6955, -73.989],
  '11205': [40.6976, -73.9713],
  '11215': [40.6673, -73.985],
}

export default function FindProPage() {
  const { state } = useApp()
  const { user, userProfile, loading: authLoading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const allContractors: any[] = Array.isArray((state as any)?.contractors)
    ? (state as any).contractors
    : []

  // Detect iOS native platform
  const [isNative, setIsNative] = useState(false)
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])

  // Offer modal state
  const [offerModalContractor, setOfferModalContractor] = useState<any | null>(null)

  // Check if user is logged in as homeowner
  const isLoggedInHomeowner = !authLoading && user && userProfile

  // Debug logging
  if (typeof window !== 'undefined') {
    console.log('[FindPro] Auth State:', {
      authLoading,
      hasUser: !!user,
      hasProfile: !!userProfile,
      isLoggedInHomeowner
    })
  }

  // Top bar — line 1
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  // multi-select services
  const [services, setServices] = useState<string[]>([])

  // Top bar — line 2 (filters)
  const [radius, setRadius] = useState(15) // miles
  const [minRating, setMinRating] = useState(0)
  const [minYears, setMinYears] = useState(0) // 0,3,5,10
  const [hoursTags, setHoursTags] = useState<HoursTag[]>([]) // multi-select

  // Map + ZIP
  const [center, setCenter] = useState<LatLng>(() => {
    // Check URL params for lat/lng
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    if (lat && lng) {
      return [parseFloat(lat), parseFloat(lng)]
    }
    return [40.7128, -74.006] // Default to NYC
  })
  const [zip, setZip] = useState('')
  const [fetchingLocation, setFetchingLocation] = useState(false)

  // Fetch user's current location using native Capacitor on iOS
  const fetchUserLocation = async () => {
    setFetchingLocation(true)
    try {
      // Use native location helper (works for both iOS native and web)
      const result = await getCurrentLocation()

      if (result.success && result.coordinates) {
        const { latitude, longitude } = result.coordinates
        console.log('[FindPro] Got location:', latitude, longitude)
        setCenter([latitude, longitude])
        setZip('') // Clear ZIP when using precise location
      } else {
        console.error('[FindPro] Location error:', result.error)
        alert(result.error || 'Unable to get your location. Please ensure location permissions are enabled.')
      }
    } catch (error) {
      console.error('[FindPro] Location error:', error)
      alert('Unable to get your location. Please try again.')
    } finally {
      setFetchingLocation(false)
    }
  }

  // Initialize from URL parameters
  useEffect(() => {
    const category = searchParams.get('category')
    const near = searchParams.get('near')
    const search = searchParams.get('search')

    if (category) {
      setServices([category])
    }
    if (near) {
      setZip(near)
    }
    // Handle search query from iOS app
    if (search) {
      setQuery(search)
    }
  }, [searchParams])

  // Results sort (BELOW the map)
  const [sort, setSort] = useState<'best' | 'distance' | 'rating' | 'experience'>('best')

  // State for iOS filter modals
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [showServicesModal, setShowServicesModal] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('home')

  // Handle tab navigation for iOS native
  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab)
    switch (tab) {
      case 'home':
        router.push('/')
        break
      case 'jobs':
        router.push('/dashboard/homeowner')
        break
      case 'messages':
        router.push('/messages')
        break
      case 'notifications':
        router.push('/notifications')
        break
      case 'profile':
        router.push('/profile')
        break
    }
  }

  // Debounce query so typing is smooth
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 140)
    return () => clearTimeout(t)
  }, [query])

  // Auto-center when a known 5-digit ZIP is typed
  useEffect(() => {
    const z = zip.trim()
    if (z.length === 5 && ZIP_COORDS[z]) setCenter(ZIP_COORDS[z])
  }, [zip])

  const activeCenter = center

  // Distance helper
  function distMiles(a: LatLng, b: LatLng) {
    const toRad = (d: number) => (d * Math.PI) / 180
    const R = 3958.8
    const dLat = toRad(b[0] - a[0])
    const dLng = toRad(b[1] - a[1])
    const s1 = Math.sin(dLat / 2)
    const s2 = Math.sin(dLng / 2)
    const t = s1 * s1 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * s2 * s2
    const c = 2 * Math.atan2(Math.sqrt(t), Math.sqrt(1 - t))
    return R * c
  }

  // Hours matching — STRICT when selected: require affirmative data to match
  function matchesHours(c: any): boolean {
    if (!hoursTags.length) return true
    const h = c?.hours || {}
    const weekend = h.weekend === true || c?.weekendAvailable === true
    const evenings = h.evenings === true || c?.eveningAvailable === true
    const early = h.early === true || c?.earlyMorning === true
    const openNow = h.openNow === true || c?.openNow === true
    const openToday = h.openToday === true || c?.openToday === true
    const is247 = c?.twentyFourSeven === true || c?.['24_7'] === true

    for (const tag of hoursTags) {
      if (tag === 'weekends' && !weekend) return false
      if (tag === 'evenings' && !evenings) return false
      if (tag === 'early_morning' && !early) return false
      if (tag === 'open_now' && !openNow) return false
      if (tag === 'open_today' && !openToday) return false
      if (tag === '24_7' && !is247) return false
    }
    return true
  }

  // Filter + sort
  const filtered = useMemo(() => {
    const q = debouncedQuery

    let items = (allContractors || [])
      .map((c) => ({ ...c }))
      .filter((c) => {
        const name = String(c?.name || '').toLowerCase()
        const city = String(c?.city || '').toLowerCase()
        const svc: string[] = Array.isArray(c?.services) ? c.services : []
        const rating = Number(c?.rating) || 0
        const years = Number(c?.years) || 0

        // TEXT SEARCH FIRST (searches name, city, AND services)
        // This allows city search to work independently of category filter
        if (q) {
          const hay = `${name} ${city} ${svc.join(' ')}`.toLowerCase()

          // Debug logging (can be removed after testing)
          if (typeof window !== 'undefined' && window.location.search.includes('debug')) {
            console.log('Search:', { query: q, name, city, services: svc, haystack: hay, matches: hay.includes(q) })
          }

          if (!hay.includes(q)) return false
        }

        // CATEGORY FILTER (only if categories are selected)
        // If search query matched above, now check if category matches (if any selected)
        if (services.length && !svc.some((s) => services.includes(s))) return false

        // RATING FILTER
        if (minRating > 0 && rating < minRating) return false

        // YEARS FILTER
        if (minYears > 0 && years < minYears) return false

        // HOURS FILTER
        if (!matchesHours(c)) return false

        // LOCATION FILTER (radius)
        // Support both loc.lat/lng format and direct latitude/longitude fields
        const lat = Number(c?.loc?.lat ?? c?.latitude)
        const lng = Number(c?.loc?.lng ?? c?.longitude)
        if (!isFinite(lat) || !isFinite(lng)) return false

        const d = distMiles(activeCenter, [lat, lng])
        ;(c as any).__distance = d
        if (d > radius) return false

        return true
      })

    if (sort === 'distance') {
      items.sort((a, b) => (a.__distance ?? 1e9) - (b.__distance ?? 1e9))
    } else if (sort === 'rating') {
      items.sort((a, b) => (Number(b?.rating) || 0) - (Number(a?.rating) || 0))
    } else if (sort === 'experience') {
      items.sort((a, b) => (Number(b?.years) || 0) - (Number(a?.years) || 0))
    } else {
      items.sort((a, b) => {
        const r = (Number(b?.rating) || 0) - (Number(a?.rating) || 0)
        if (r !== 0) return r
        return (a.__distance ?? 1e9) - (b.__distance ?? 1e9)
      })
    }

    return items
  }, [
    allContractors,
    debouncedQuery,
    services,
    minRating,
    minYears,
    hoursTags,
    radius,
    sort,
    activeCenter,
  ])

  function resetAll() {
    setQuery('')
    setServices([])
    setRadius(15)
    setMinRating(0)
    setMinYears(0)
    setHoursTags([])
    setZip('')
    // keep polygon until user clears via map "Clear All"
  }

  // Categorized service options
  const serviceCategories = {
    'Home': ['Plumbing', 'Electrical', 'HVAC', 'Roofing', 'Water Damage', 'Locksmith', 'Appliance Repair', 'Handyman'],
    'Auto': ['Auto Battery', 'Auto Tire', 'Auto Lockout', 'Tow', 'Fuel Delivery', 'Mobile Mechanic']
  }

  // Hours options for dropdown
  const HOURS_OPTIONS: { value: HoursTag; label: string }[] = [
    { value: 'open_now', label: 'Open now' },
    { value: 'open_today', label: 'Open today' },
    { value: 'weekends', label: 'Open weekends' },
    { value: 'evenings', label: 'Evenings' },
    { value: 'early_morning', label: 'Early morning' },
    { value: '24_7', label: '24/7' },
  ]

  const prettyHours = (t: HoursTag) => HOURS_OPTIONS.find((o) => o.value === t)?.label ?? t

  const toggleHoursTag = (tag: HoursTag) => {
    setHoursTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  // Shared content renderer for both iOS and web layouts
  const renderContent = () => (
    <>
      {/* TOP BAR — TWO ROWS */}
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        {/* LINE 1 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px] grow">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, city, or service"
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-[13px] outline-none transition focus:border-emerald-400"
            />
          </div>

          {/* Services dropdown with checkboxes */}
          <details className="relative">
            <summary className="inline-flex select-none items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] leading-none text-slate-800 hover:bg-slate-50 cursor-pointer min-w-[220px]">
              <span className="truncate">
                {services.length ? `Services: ${services.join(', ')}` : 'Services: Any'}
              </span>
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 opacity-60">
                <path d="M5.5 7.5l4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>

            <button
              type="button"
              aria-hidden="true"
              className="fixed inset-0 z-[2500] cursor-default bg-transparent"
              onClick={(e) => {
                e.preventDefault()
                ;(e.currentTarget.closest('details') as HTMLDetailsElement)?.removeAttribute('open')
              }}
            />

            <div className="absolute z-[3000] mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="text-[12px] font-medium text-slate-700">Select services</div>
                <button
                  className="rounded-lg px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-50"
                  onClick={(e) => {
                    e.preventDefault()
                    setServices([])
                  }}
                >
                  Clear All
                </button>
              </div>

              <div className="space-y-3">
                {Object.entries(serviceCategories).map(([categoryName, categoryServices]) => (
                  <div key={categoryName}>
                    <div className="text-[11px] font-semibold text-emerald-700 mb-1.5 px-1 uppercase tracking-wide">
                      {categoryName}
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 px-1">
                      {categoryServices.map((opt) => {
                        const checked = services.includes(opt)
                        return (
                          <label key={opt} className="flex items-center gap-2 rounded-md px-1 py-1 text-[12px] hover:bg-slate-50">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-slate-300 accent-emerald-500"
                              checked={checked}
                              onChange={(e) => {
                                e.stopPropagation()
                                setServices((prev) =>
                                  checked ? prev.filter((s) => s !== opt) : [...prev, opt]
                                )
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-slate-800">{opt}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex justify-end">
                <button
                  className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white"
                  onClick={(e) => {
                    e.preventDefault()
                    ;(e.currentTarget.closest('details') as HTMLDetailsElement)?.removeAttribute('open')
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </details>

          <div className="flex items-center gap-2">
            <input
              value={zip}
              onChange={(e) =>
                setZip(e.target.value.replace(/\D/g, '').slice(0, 5))
              }
              placeholder="ZIP"
              maxLength={5}
              className="w-[78px] rounded-xl border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none transition focus:border-emerald-400"
            />
            <button
              onClick={fetchUserLocation}
              disabled={fetchingLocation}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[13px] text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              title="Use my current location"
            >
              {fetchingLocation ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Finding...</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Use My Location</span>
                </>
              )}
            </button>
          </div>

          <button
            onClick={resetAll}
            className="ml-auto rounded-xl border border-slate-200 px-2.5 py-1.5 text-[13px] hover:bg-slate-50"
            title="Reset filters"
          >
            Reset
          </button>
        </div>

        {/* LINE 2 */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2 grow">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Radius</span>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="accent-emerald-500"
              />
              <div className="w-12 text-right text-[11px] text-slate-700">
                {radius} mi
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Min rating</span>
              <select
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-[13px]"
              >
                <option value={0}>Any</option>
                <option value={3}>3.0+</option>
                <option value={3.5}>3.5+</option>
                <option value={4}>4.0+</option>
                <option value={4.5}>4.5+</option>
              </select>

              <span className="ml-1 text-[11px] text-slate-500">Experience</span>
              <select
                value={minYears}
                onChange={(e) => setMinYears(Number(e.target.value))}
                className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-[13px]"
                title="Minimum years in business"
              >
                <option value={0}>Any</option>
                <option value={3}>3+ yrs</option>
                <option value={5}>5+ yrs</option>
                <option value={10}>10+ yrs</option>
              </select>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setMinRating(minRating >= 4.5 ? 0 : 4.5)}
              className={
                'rounded-full px-3 py-1.5 text-[12px] font-medium transition ' +
                (minRating >= 4.5
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100')
              }
              title="Only show 4.5 and up"
            >
              Top rated
            </button>

            <details className="relative">
              <summary className="inline-flex select-none items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] leading-none text-slate-800 hover:bg-slate-50 cursor-pointer">
                <span className="truncate max-w-[220px]">
                  {hoursTags.length ? `Hours: ${hoursTags.map(prettyHours).join(', ')}` : 'Hours: Any'}
                </span>
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 opacity-60">
                  <path d="M5.5 7.5l4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>

              <button
                type="button"
                aria-hidden="true"
                className="fixed inset-0 z-[2500] cursor-default bg-transparent"
                onClick={(e) => {
                  e.preventDefault()
                  ;(e.currentTarget.closest('details') as HTMLDetailsElement)?.removeAttribute('open')
                }}
              />

              <div className="absolute right-0 z-[3000] mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <button
                  className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-slate-50"
                  onClick={(e) => {
                    e.preventDefault()
                    setHoursTags([])
                    ;(e.currentTarget.closest('details') as HTMLDetailsElement)?.removeAttribute('open')
                  }}
                >
                  Any
                </button>
                <div className="my-1 h-px bg-slate-100" />
                <div className="max-h-48 overflow-auto pr-1">
                  {HOURS_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-300 accent-emerald-500"
                        checked={hoursTags.includes(opt.value)}
                        onChange={() => toggleHoursTag(opt.value)}
                      />
                      <span className="text-slate-800">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* MAP (Mapbox component) */}
      <FindProMapbox
        items={filtered}
        category={services[0] || undefined}
        radiusMiles={radius}
        searchCenter={activeCenter}
        onSearchHere={(c) => setCenter(c)}
      />

      {/* Results header + sort */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] text-slate-600">
          Showing{' '}
          <span className="font-semibold text-slate-900">{filtered.length}</span>{' '}
          {services.length > 0 && (
            <span>
              for <span className="font-semibold text-slate-900">{services.join(', ')}</span>{' '}
            </span>
          )}
          within <span className="font-semibold text-slate-900">{radius} mi</span>
          <span className="ml-2 text-slate-500">
            (from {allContractors.length} total)
          </span>
          {filtered.length === 0 && (
            <span className="ml-2">
              {' '}
              <Link
                href="/get-help-now"
                className="font-semibold text-emerald-600 hover:text-emerald-700 underline"
              >
                Get Help Now
              </Link>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-slate-500">Sort</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-[13px]"
            title="Sort results"
          >
            <option value="best">Best match</option>
            <option value="distance">Distance</option>
            <option value="rating">Rating</option>
            <option value="experience">Experience</option>
          </select>
        </div>
      </div>

      {/* Results list */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const d = (c as any).__distance as number | undefined
            const svc: string[] = Array.isArray(c?.services) ? c.services : []
            const logoUrl = c?.logo_url || c?.avatar_url
            return (
              <div
                key={String(c?.id ?? c?.name)}
                className="rounded-xl border border-slate-200 p-2.5 transition hover:shadow-[0_1px_12px_rgba(2,6,23,.06)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {logoUrl && (
                      <img
                        src={logoUrl}
                        alt={c?.business_name || c?.name || 'Contractor'}
                        className="h-10 w-10 rounded-lg object-contain border border-slate-200 bg-white flex-shrink-0"
                      />
                    )}
                    <div className="truncate text-[14px] font-semibold text-slate-900">
                      {c?.name || 'Contractor'}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-slate-500">
                    {typeof d === 'number' ? `${d.toFixed(1)} mi` : ''}
                  </div>
                </div>

                <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                  {c?.city ? c.city : ''}
                  {c?.rating ? ` ${Number(c.rating).toFixed(1)}` : ''}
                  {Number(c?.years) ? ` ${Number(c.years)} yrs` : ''}
                  {c?.emergency || c?.emergencyService ? ' Emergency' : ''}
                  {c?.twentyFourSeven || c?.['24_7'] ? ' 24/7' : ''}
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {svc.slice(0, 5).map((s: string) => (
                    <span
                      key={s}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                <div className="mt-2.5 flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => {
                      if (!user) {
                        openAuth()
                      } else if (userProfile?.role === 'homeowner') {
                        setOfferModalContractor(c)
                      }
                    }}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors"
                  >
                    Offer Job
                  </button>
                  <a
                    href={`/contractors/${encodeURIComponent(String(c?.id ?? ''))}`}
                    className="rounded-lg border border-emerald-600 text-emerald-600 hover:bg-emerald-50 px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
                  >
                    View Pro
                  </a>
                  <a
                    href={`/messages?to=${encodeURIComponent(String(c?.id ?? ''))}`}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
                  >
                    Message
                  </a>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <div className="text-slate-600 mb-4">
                <p className="font-semibold text-slate-900 mb-2">No contractors found</p>
                {services.length > 0 && (
                  <p className="text-sm mb-2">
                    No contractors offering <strong>{services.join(', ')}</strong> within {radius} miles
                  </p>
                )}
                {allContractors.length > 0 && (
                  <p className="text-sm text-slate-500">
                    {allContractors.length} contractors available in database
                  </p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <button
                  onClick={() => {
                    setServices([])
                    setMinRating(0)
                    setMinYears(0)
                    setHoursTags([])
                    setQuery('')
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Clear All Filters
                </button>
                <Link
                  href="/post-job"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Post a Job Instead
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )

  // iOS native layout with proper scrolling and mobile-friendly filters
  if (isNative) {
    return (
      <>
        <div className="fixed inset-0 flex flex-col bg-gray-50">
          {/* iOS Native Header with back button */}
          <div
            className="relative z-50 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
            }}
          >
            <div className="flex items-center px-4 py-3">
              <button
                onClick={() => router.push('/')}
                className="flex items-center text-white active:opacity-60"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="ml-1 font-medium">Home</span>
              </button>
              <h1 className="flex-1 text-center text-white font-semibold text-[17px] pr-12">
                Find a Pro
              </h1>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div
            className="flex-1 overflow-auto"
            style={{
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 34px))'
            }}
          >
            {/* Search Bar */}
            <div className="bg-white border-b border-gray-200 px-4 py-3">
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, city, or service"
                  className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={fetchUserLocation}
                  disabled={fetchingLocation}
                  className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center active:bg-emerald-600 disabled:opacity-50"
                >
                  {fetchingLocation ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* iOS-Friendly Filters - Row 1: Quick filters */}
            <div className="bg-white border-b border-gray-200 px-4 py-2">
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                {/* Services Dropdown */}
                <button
                  onClick={() => setShowServicesModal(true)}
                  className={`flex-shrink-0 px-3 py-2 rounded-full text-[13px] font-medium flex items-center gap-1 ${
                    services.length > 0 ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700'
                  } active:opacity-80`}
                >
                  <span>{services.length > 0 ? `${services.length} Service${services.length > 1 ? 's' : ''}` : 'Services'}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Radius Filter */}
                <button
                  onClick={() => {
                    const options = [5, 10, 15, 25, 50]
                    const currentIndex = options.indexOf(radius)
                    const nextIndex = (currentIndex + 1) % options.length
                    setRadius(options[nextIndex] || 15)
                  }}
                  className="flex-shrink-0 px-3 py-2 rounded-full bg-gray-100 text-[13px] font-medium text-gray-700 active:bg-gray-200"
                >
                  {radius} mi
                </button>

                {/* Rating Filter */}
                <button
                  onClick={() => {
                    const options = [0, 3, 3.5, 4, 4.5]
                    const currentIndex = options.indexOf(minRating)
                    const nextIndex = (currentIndex + 1) % options.length
                    setMinRating(options[nextIndex])
                  }}
                  className={`flex-shrink-0 px-3 py-2 rounded-full text-[13px] font-medium ${
                    minRating > 0 ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-700'
                  } active:opacity-80`}
                >
                  {minRating > 0 ? `${minRating}+ ★` : 'Rating'}
                </button>

                {/* Experience Filter */}
                <button
                  onClick={() => {
                    const options = [0, 3, 5, 10]
                    const currentIndex = options.indexOf(minYears)
                    const nextIndex = (currentIndex + 1) % options.length
                    setMinYears(options[nextIndex])
                  }}
                  className={`flex-shrink-0 px-3 py-2 rounded-full text-[13px] font-medium ${
                    minYears > 0 ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'
                  } active:opacity-80`}
                >
                  {minYears > 0 ? `${minYears}+ yrs` : 'Experience'}
                </button>

                {/* Hours Filter */}
                <button
                  onClick={() => setShowFilterModal(true)}
                  className={`flex-shrink-0 px-3 py-2 rounded-full text-[13px] font-medium flex items-center gap-1 ${
                    hoursTags.length > 0 ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-700'
                  } active:opacity-80`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{hoursTags.length > 0 ? `${hoursTags.length} Hours` : 'Hours'}</span>
                </button>

                {/* Top Rated */}
                <button
                  onClick={() => setMinRating(minRating >= 4.5 ? 0 : 4.5)}
                  className={`flex-shrink-0 px-3 py-2 rounded-full text-[13px] font-medium ${
                    minRating >= 4.5 ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-200'
                  } active:opacity-80`}
                >
                  Top Rated
                </button>

                {/* All Filters Button */}
                <button
                  onClick={() => setShowFilterModal(true)}
                  className="flex-shrink-0 px-3 py-2 rounded-full bg-gray-100 text-[13px] font-medium text-gray-700 active:bg-gray-200 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filters</span>
                </button>

                {/* Reset */}
                {(services.length > 0 || minRating > 0 || minYears > 0 || hoursTags.length > 0 || query) && (
                  <button
                    onClick={resetAll}
                    className="flex-shrink-0 px-3 py-2 rounded-full bg-red-100 text-[13px] font-medium text-red-600 active:bg-red-200"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Sort Row */}
            <div className="bg-white border-b border-gray-200 px-4 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-gray-500">
                  <span className="font-semibold text-gray-900">{filtered.length}</span> pros found
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-gray-500">Sort:</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as any)}
                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-[13px] bg-white"
                  >
                    <option value="best">Best match</option>
                    <option value="distance">Distance</option>
                    <option value="rating">Rating</option>
                    <option value="experience">Experience</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Map Section */}
            <div className="px-4 pt-3">
              <FindProMapbox
                items={filtered}
                category={services[0] || undefined}
                radiusMiles={radius}
                searchCenter={activeCenter}
                onSearchHere={(c) => setCenter(c)}
              />
            </div>

            {/* Results Count */}
            <div className="px-4 py-3">
              <p className="text-[13px] text-gray-500">
                <span className="font-semibold text-gray-900">{filtered.length}</span> pros found
                {services.length > 0 && <span> for {services.slice(0, 2).join(', ')}{services.length > 2 ? '...' : ''}</span>}
                {' '}within <span className="font-semibold">{radius} mi</span>
              </p>
            </div>

            {/* Contractor List - Scrollable */}
            <div className="px-4 space-y-3 pb-4">
              {filtered.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center border border-gray-200">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <h3 className="text-[16px] font-semibold text-gray-900 mb-2">No pros found</h3>
                  <p className="text-[14px] text-gray-500 mb-4">Try expanding your search radius or removing filters</p>
                  <button
                    onClick={resetAll}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[14px] font-medium active:bg-emerald-600"
                  >
                    Clear Filters
                  </button>
                </div>
              ) : (
                filtered.map((c) => {
                  const d = (c as any).__distance as number | undefined
                  const svc: string[] = Array.isArray(c?.services) ? c.services : []
                  const logoUrl = c?.logo_url || c?.avatar_url
                  return (
                    <div
                      key={String(c?.id ?? c?.name)}
                      className="bg-white rounded-2xl p-4 border border-gray-200 active:bg-gray-50"
                    >
                      {/* Header */}
                      <div className="flex items-start gap-3">
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt={c?.business_name || c?.name || 'Contractor'}
                            className="w-12 h-12 rounded-xl object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <span className="text-emerald-700 font-bold text-lg">{(c?.name || 'C')[0]}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[15px] font-semibold text-gray-900 truncate">{c?.name || 'Contractor'}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            {c?.rating && (
                              <span className="text-[13px] text-amber-600 font-medium">★ {Number(c.rating).toFixed(1)}</span>
                            )}
                            {c?.city && (
                              <span className="text-[13px] text-gray-500">{c.city}</span>
                            )}
                            {typeof d === 'number' && (
                              <span className="text-[13px] text-gray-400">{d.toFixed(1)} mi</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Services Tags */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {svc.slice(0, 4).map((s: string) => (
                          <span
                            key={s}
                            className="px-2 py-1 rounded-lg bg-gray-100 text-[12px] text-gray-700"
                          >
                            {CAT_EMOJI[s] || ''} {s}
                          </span>
                        ))}
                        {svc.length > 4 && (
                          <span className="px-2 py-1 rounded-lg bg-gray-100 text-[12px] text-gray-500">
                            +{svc.length - 4} more
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => {
                            if (!user) {
                              openAuth()
                            } else if (userProfile?.role === 'homeowner') {
                              setOfferModalContractor(c)
                            }
                          }}
                          className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-[14px] font-semibold active:bg-emerald-600"
                        >
                          Send Offer
                        </button>
                        <button
                          onClick={() => router.push(`/messages?to=${encodeURIComponent(String(c?.id ?? ''))}`)}
                          className="w-12 h-12 border border-gray-200 rounded-xl flex items-center justify-center active:bg-gray-50"
                        >
                          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => router.push(`/contractors/${encodeURIComponent(String(c?.id ?? ''))}`)}
                          className="w-12 h-12 border border-gray-200 rounded-xl flex items-center justify-center active:bg-gray-50"
                        >
                          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Offer Job Modal */}
        {offerModalContractor && (
          <OfferJobModal
            contractor={offerModalContractor}
            onClose={() => setOfferModalContractor(null)}
            onSuccess={() => {
              setOfferModalContractor(null)
              router.push('/dashboard/homeowner/offers')
            }}
          />
        )}

        {/* Services Selection Modal */}
        {showServicesModal && (
          <div className="fixed inset-0 z-[100] bg-black/50" onClick={() => setShowServicesModal(false)}>
            <div
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[80vh] overflow-hidden"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 34px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
                <button
                  onClick={() => setServices([])}
                  className="text-[15px] text-gray-500 active:text-gray-700"
                >
                  Clear All
                </button>
                <h3 className="text-[17px] font-semibold text-gray-900">Select Services</h3>
                <button
                  onClick={() => setShowServicesModal(false)}
                  className="text-[15px] text-emerald-600 font-semibold active:text-emerald-700"
                >
                  Done
                </button>
              </div>

              {/* Services List */}
              <div className="overflow-auto max-h-[60vh] px-4 py-3">
                {Object.entries(serviceCategories).map(([categoryName, categoryServices]) => (
                  <div key={categoryName} className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-semibold text-emerald-700 uppercase tracking-wide">
                        {categoryName}
                      </span>
                      <button
                        onClick={() => {
                          const allSelected = categoryServices.every(s => services.includes(s))
                          if (allSelected) {
                            setServices(prev => prev.filter(s => !categoryServices.includes(s)))
                          } else {
                            setServices(prev => [...new Set([...prev, ...categoryServices])])
                          }
                        }}
                        className="text-[12px] text-emerald-600 font-medium"
                      >
                        {categoryServices.every(s => services.includes(s)) ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {categoryServices.map((service) => {
                        const isSelected = services.includes(service)
                        return (
                          <button
                            key={service}
                            onClick={() => {
                              setServices(prev =>
                                isSelected ? prev.filter(s => s !== service) : [...prev, service]
                              )
                            }}
                            className={`flex items-center gap-2 px-3 py-3 rounded-xl text-left transition ${
                              isSelected
                                ? 'bg-emerald-100 border-2 border-emerald-500'
                                : 'bg-gray-100 border-2 border-transparent'
                            }`}
                          >
                            <span className="text-lg">{CAT_EMOJI[service] || '🔧'}</span>
                            <span className={`text-[13px] font-medium ${isSelected ? 'text-emerald-700' : 'text-gray-700'}`}>
                              {service}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Full Filter Modal (Hours, Radius, etc.) */}
        {showFilterModal && (
          <div className="fixed inset-0 z-[100] bg-black/50" onClick={() => setShowFilterModal(false)}>
            <div
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[85vh] overflow-hidden"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 34px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
                <button
                  onClick={resetAll}
                  className="text-[15px] text-gray-500 active:text-gray-700"
                >
                  Reset All
                </button>
                <h3 className="text-[17px] font-semibold text-gray-900">Filters</h3>
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="text-[15px] text-emerald-600 font-semibold active:text-emerald-700"
                >
                  Done
                </button>
              </div>

              {/* Filter Options */}
              <div className="overflow-auto max-h-[70vh] px-4 py-4 space-y-6">
                {/* Radius Slider */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[15px] font-semibold text-gray-900">Search Radius</span>
                    <span className="text-[15px] font-bold text-emerald-600">{radius} miles</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex justify-between mt-1 text-[11px] text-gray-400">
                    <span>1 mi</span>
                    <span>25 mi</span>
                    <span>50 mi</span>
                  </div>
                </div>

                {/* Rating */}
                <div>
                  <span className="text-[15px] font-semibold text-gray-900 block mb-3">Minimum Rating</span>
                  <div className="flex gap-2">
                    {[0, 3, 3.5, 4, 4.5].map((rating) => (
                      <button
                        key={rating}
                        onClick={() => setMinRating(rating)}
                        className={`flex-1 py-3 rounded-xl text-[14px] font-medium transition ${
                          minRating === rating
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {rating === 0 ? 'Any' : `${rating}+`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Experience */}
                <div>
                  <span className="text-[15px] font-semibold text-gray-900 block mb-3">Years of Experience</span>
                  <div className="flex gap-2">
                    {[
                      { value: 0, label: 'Any' },
                      { value: 3, label: '3+ yrs' },
                      { value: 5, label: '5+ yrs' },
                      { value: 10, label: '10+ yrs' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setMinYears(opt.value)}
                        className={`flex-1 py-3 rounded-xl text-[14px] font-medium transition ${
                          minYears === opt.value
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hours of Operation */}
                <div>
                  <span className="text-[15px] font-semibold text-gray-900 block mb-3">Hours of Operation</span>
                  <div className="grid grid-cols-2 gap-2">
                    {HOURS_OPTIONS.map((opt) => {
                      const isSelected = hoursTags.includes(opt.value)
                      return (
                        <button
                          key={opt.value}
                          onClick={() => toggleHoursTag(opt.value)}
                          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-left transition ${
                            isSelected
                              ? 'bg-purple-100 border-2 border-purple-500'
                              : 'bg-gray-100 border-2 border-transparent'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                          }`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className={`text-[14px] font-medium ${isSelected ? 'text-purple-700' : 'text-gray-700'}`}>
                            {opt.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Quick Filters */}
                <div>
                  <span className="text-[15px] font-semibold text-gray-900 block mb-3">Quick Filters</span>
                  <button
                    onClick={() => setMinRating(minRating >= 4.5 ? 0 : 4.5)}
                    className={`w-full flex items-center justify-between px-4 py-4 rounded-xl transition ${
                      minRating >= 4.5
                        ? 'bg-amber-100 border-2 border-amber-500'
                        : 'bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⭐</span>
                      <div className="text-left">
                        <span className={`text-[15px] font-semibold ${minRating >= 4.5 ? 'text-amber-700' : 'text-gray-900'}`}>
                          Top Rated Only
                        </span>
                        <p className="text-[12px] text-gray-500">Show only 4.5+ rated pros</p>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      minRating >= 4.5 ? 'border-amber-500 bg-amber-500' : 'border-gray-300'
                    }`}>
                      {minRating >= 4.5 && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* iOS Bottom Tab Bar */}
        <IOSTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      </>
    )
  }

  // Web layout (non-native)
  return (
    <>
      <section className="mx-auto max-w-6xl space-y-3 px-3 py-3">
        {renderContent()}
      </section>

      {/* Offer Job Modal */}
      {offerModalContractor && (
        <OfferJobModal
          contractor={offerModalContractor}
          onClose={() => setOfferModalContractor(null)}
          onSuccess={() => {
            setOfferModalContractor(null)
            router.push('/dashboard/homeowner/offers')
          }}
        />
      )}
    </>
  )
}
