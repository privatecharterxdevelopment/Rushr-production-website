// components/Hero.tsx
'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { openAuth } from './AuthModal'
import { supabase } from '../lib/supabaseClient'
import toast, { Toaster } from 'react-hot-toast'
import styles from './Hero.module.css'

// Props for triggering instant match overlay
interface HeroProps {
  onInstantMatch?: (category: string, searchQuery: string, location: { lat: number; lng: number; zip?: string }) => void
}

// Emergency scenarios for typing effect
const EMERGENCY_SCENARIOS = [
  'Water pump broken?',
  'Kitchen flooded?',
  'Flat tire?',
  'Power outage?',
  'Pipe burst?',
  'AC not working?',
  'Heater broken?',
  'Toilet clogged?',
  'Lock broken?',
]

// Emergency categories for scrolling banner
const EMERGENCY_CATEGORIES = [
  { label: 'Plumbing', href: '/post-job?category=Plumber&urgent=1' },
  { label: 'Electrical', href: '/post-job?category=Electrician&urgent=1' },
  { label: 'HVAC', href: '/post-job?category=HVAC&urgent=1' },
  { label: 'Roof Leak', href: '/post-job?category=Roofer&urgent=1' },
  { label: 'Water Damage', href: '/post-job?category=Water%20Damage%20Restoration&urgent=1' },
  { label: 'Locksmith', href: '/post-job?category=Locksmith&urgent=1' },
  { label: 'Appliance Repair', href: '/post-job?category=Appliance%20Repair&urgent=1' },
  { label: 'Jump Start', href: '/post-job?category=Auto%20Battery&urgent=1' },
  { label: 'Flat Tire', href: '/post-job?category=Auto%20Tire&urgent=1' },
  { label: 'Car Lockout', href: '/post-job?category=Auto%20Lockout&urgent=1' },
  { label: 'Towing', href: '/post-job?category=Tow&urgent=1' },
  { label: 'Fuel Delivery', href: '/post-job?category=Fuel%20Delivery&urgent=1' },
  { label: 'Mobile Mechanic', href: '/post-job?category=Mobile%20Mechanic&urgent=1' },
]

// Category mapping based on keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Plumber': ['plumb', 'leak', 'pipe', 'drain', 'water', 'toilet', 'sink', 'faucet', 'sewer'],
  'Electrician': ['electric', 'power', 'outlet', 'breaker', 'wiring', 'light', 'switch'],
  'HVAC': ['hvac', 'heat', 'cool', 'ac', 'furnace', 'thermostat', 'air condition'],
  'Roofer': ['roof', 'shingle', 'gutter', 'ceiling leak'],
  'Locksmith': ['lock', 'key', 'locked out', 'door lock'],
  'Appliance Repair': ['appliance', 'fridge', 'washer', 'dryer', 'dishwasher', 'oven', 'stove'],
  'Pest Control': ['pest', 'bug', 'rat', 'mouse', 'termite', 'roach', 'ant'],
  'Cleaner': ['clean', 'mold', 'carpet', 'deep clean'],
  'Handyman': ['handyman', 'repair', 'fix']
}

function detectCategory(searchText: string): string | null {
  const lowerText = searchText.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return category
    }
  }
  return null
}

export default function Hero({ onInstantMatch }: HeroProps = {}){
  const router = useRouter()
  const { user, userProfile } = useAuth()
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [location, setLocation] = useState('')
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [placeholderText, setPlaceholderText] = useState('')
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [jobCount, setJobCount] = useState<number | null>(null)

  // Fetch job count from database
  useEffect(() => {
    async function fetchJobCount() {
      try {
        const { count, error } = await supabase
          .from('homeowner_jobs')
          .select('*', { count: 'exact', head: true })

        if (!error && count !== null) {
          setJobCount(count)
        }
      } catch (err) {
        console.error('Error fetching job count:', err)
      }
    }
    fetchJobCount()
  }, [])

  // Typing animation effect - pauses when user is typing or input is focused
  useEffect(() => {
    // Stop animation if user has typed something or input is focused
    if (searchQuery.length > 0 || isInputFocused) {
      return
    }

    const currentScenario = EMERGENCY_SCENARIOS[currentScenarioIndex]
    const typingSpeed = isDeleting ? 30 : 60
    const pauseAfterComplete = 1000
    const pauseAfterDelete = 300

    const timer = setTimeout(() => {
      if (!isDeleting) {
        // Typing
        if (placeholderText.length < currentScenario.length) {
          setPlaceholderText(currentScenario.slice(0, placeholderText.length + 1))
        } else {
          // Finished typing, pause then start deleting
          setTimeout(() => setIsDeleting(true), pauseAfterComplete)
        }
      } else {
        // Deleting
        if (placeholderText.length > 0) {
          setPlaceholderText(placeholderText.slice(0, -1))
        } else {
          // Finished deleting, move to next scenario
          setIsDeleting(false)
          setCurrentScenarioIndex((prev) => (prev + 1) % EMERGENCY_SCENARIOS.length)
        }
      }
    }, typingSpeed)

    return () => clearTimeout(timer)
  }, [placeholderText, isDeleting, currentScenarioIndex, searchQuery, isInputFocused])

  // Get user's location and convert to ZIP
  const getUserLocation = async (): Promise<{ lat: number; lng: number; zip?: string } | null> => {
    setLoadingLocation(true)

    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      setLoadingLocation(false)
      return null
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords
          let zip: string | undefined

          try {
            // Reverse geocode to get ZIP code
            const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            if (MAPBOX_TOKEN) {
              const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&types=postcode`
              )
              const data = await response.json()

              if (data.features && data.features.length > 0) {
                zip = data.features[0].text
                setLocation(zip)
                localStorage.setItem('housecall.defaultZip', zip)
              } else {
                setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
              }
            }
          } catch (error) {
            console.error('Error reverse geocoding:', error)
            setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
          }

          setLoadingLocation(false)
          const coords = { lat: latitude, lng: longitude, zip }
          setUserCoords(coords)
          resolve(coords)
        },
        (error) => {
          console.error('Geolocation error:', error)
          alert('Unable to get your location. Please enter your ZIP code manually.')
          setLoadingLocation(false)
          resolve(null)
        }
      )
    })
  }

  const onFindPro = async (e: React.FormEvent) => {
    e.preventDefault()

    // Detect category from search query
    const detectedCategory = detectCategory(searchQuery)

    // Check if category is selected
    if (!detectedCategory && !searchQuery.trim()) {
      toast.error('Please choose the service you need', {
        duration: 3000,
        position: 'top-center',
        style: {
          background: '#fef2f2',
          color: '#dc2626',
          border: '1px solid #fecaca',
        },
      })
      return
    }

    // If onInstantMatch callback is provided, use the new Uber-style flow
    if (onInstantMatch) {
      // Get user's location first
      let coords = userCoords

      if (!coords) {
        // Try to get location from GPS
        coords = await getUserLocation()
      }

      // If still no coords, try to geocode the ZIP
      if (!coords && location.trim()) {
        const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (MAPBOX_TOKEN) {
          try {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location.trim())}.json?access_token=${MAPBOX_TOKEN}&limit=1`
            )
            const data = await response.json()
            if (data.features && data.features.length > 0) {
              const [lng, lat] = data.features[0].center
              coords = { lat, lng, zip: location.trim() }
            }
          } catch (err) {
            console.error('Geocoding error:', err)
          }
        }
      }

      if (coords) {
        // Trigger the instant match overlay
        onInstantMatch(detectedCategory || searchQuery || 'General', searchQuery, coords)
        return
      } else {
        alert('Please enable location access or enter a ZIP code to find pros near you.')
        return
      }
    }

    // Fallback: Original navigation behavior
    const finalLocation = location.trim() || (typeof window !== 'undefined' ? localStorage.getItem('housecall.defaultZip') : '') || ''
    const zipMatch = (finalLocation + ' ' + searchQuery).match(/\b\d{5}\b/)
    const zip = zipMatch ? zipMatch[0] : finalLocation

    if (zip && typeof window !== 'undefined') {
      try { localStorage.setItem('housecall.defaultZip', zip) } catch {}
    }

    const q = new URLSearchParams()
    if (zip) q.set('near', zip)
    if (detectedCategory) q.set('category', detectedCategory)

    router.push(`/find-pro${q.toString() ? `?${q.toString()}` : ''}`)
  }

  return (
    <section className={`relative ${styles.gradientContainer}`}>
      <Toaster />
      {/* Animated gradient layers */}
      <div className={styles.waveLayer1}></div>
      <div className={styles.waveLayer2}></div>

      <div className={`relative mx-auto max-w-7xl px-6 py-6 lg:py-6 ${styles.contentWrapper}`}>
        {/* Two-column layout: content left, phone mockup right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
          {/* Left side - content */}
          <div className="text-white text-center lg:text-left space-y-2">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
              Emergency help,<br />
              <span className="text-emerald-200">on the way in minutes</span>
            </h1>

            <p className="text-sm md:text-base text-emerald-50">
              Tap once. Get matched with a vetted pro. Track their live ETA.
            </p>

            {/* Search Form */}
            <form onSubmit={onFindPro} className="max-w-xl lg:mx-0 mx-auto">
            {/* Mobile: stacked layout */}
            <div className="sm:hidden bg-white rounded-xl shadow-lg overflow-hidden">
              <input
                type="text"
                placeholder={placeholderText || 'What do you need help with?'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full px-4 py-3 text-gray-900 placeholder-gray-500 focus:outline-none text-base border-b border-gray-200"
              />
              <div className="flex items-center">
                <input
                  type="text"
                  placeholder="ZIP"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-20 px-3 py-3 text-gray-900 placeholder-gray-500 focus:outline-none text-base border-r border-gray-200"
                />
                <button
                  type="button"
                  onClick={getUserLocation}
                  disabled={loadingLocation}
                  className="px-3 py-3 hover:bg-gray-50 transition-colors disabled:opacity-50 border-r border-gray-200"
                  title="Use my location"
                >
                  {loadingLocation ? (
                    <div className="w-5 h-5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                  ) : (
                    <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
                <button
                  type="submit"
                  disabled={loadingLocation}
                  className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white font-semibold transition-colors whitespace-nowrap text-base disabled:opacity-50"
                >
                  Find a Pro
                </button>
              </div>
            </div>

            {/* Desktop: horizontal layout */}
            <div className="hidden sm:flex items-center bg-white rounded-xl shadow-lg overflow-hidden">
              <input
                type="text"
                placeholder={placeholderText || 'What do you need help with?'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="flex-1 px-5 py-4 text-gray-900 placeholder-gray-500 focus:outline-none text-lg border-r border-gray-200"
              />
              <input
                type="text"
                placeholder="ZIP"
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="w-28 px-4 py-4 text-gray-900 placeholder-gray-500 focus:outline-none text-lg border-r border-gray-200"
              />
              <button
                type="button"
                onClick={getUserLocation}
                disabled={loadingLocation}
                className="px-3 py-4 hover:bg-gray-50 transition-colors disabled:opacity-50 border-r border-gray-200"
                title="Use my location"
              >
                {loadingLocation ? (
                  <div className="w-6 h-6 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                ) : (
                  <svg className="h-6 w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
              <button
                type="submit"
                disabled={loadingLocation}
                className="px-6 py-4 bg-gray-900 hover:bg-black text-white font-semibold transition-colors whitespace-nowrap text-lg disabled:opacity-50"
              >
                Find a Pro
              </button>
            </div>
          </form>

            {/* Trust indicators - compact single row */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 text-emerald-100 text-xs md:text-sm">
              <span className="flex items-center gap-1">
                <span>★★★★★</span>
                <span>4.5 avg</span>
              </span>
              <span>•</span>
              <span>{jobCount !== null ? jobCount.toLocaleString() : '10k+'} jobs</span>
              <span>•</span>
              <span>Background-checked</span>
              <span>•</span>
              <span>Upfront pricing</span>
            </div>
          </div>

          {/* Right side - phone mockup */}
          <div className="hidden lg:flex justify-center items-end -mb-40">
            <img
              src="/PHOTO-2025-10-24-16-31-22-removebg-preview.png"
              alt="Rushr app on phone"
              className="h-[520px] w-auto object-contain drop-shadow-2xl"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
