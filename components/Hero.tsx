// components/Hero.tsx
'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { openAuth } from './AuthModal'
import styles from './Hero.module.css'

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

export default function Hero(){
  const router = useRouter()
  const { user, userProfile } = useAuth()

  const [searchQuery, setSearchQuery] = useState('')
  const [location, setLocation] = useState('')
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [placeholderText, setPlaceholderText] = useState('')
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  // Typing animation effect
  useEffect(() => {
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
  }, [placeholderText, isDeleting, currentScenarioIndex])

  // Get user's location and convert to ZIP
  const getUserLocation = async () => {
    setLoadingLocation(true)

    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      setLoadingLocation(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords

        try {
          // Reverse geocode to get ZIP code
          const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
          if (MAPBOX_TOKEN) {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&types=postcode`
            )
            const data = await response.json()

            if (data.features && data.features.length > 0) {
              const zip = data.features[0].text
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
      },
      (error) => {
        console.error('Geolocation error:', error)
        alert('Unable to get your location. Please enter your ZIP code manually.')
        setLoadingLocation(false)
      }
    )
  }

  const onFindPro = async (e: React.FormEvent)=>{
    e.preventDefault()
    // No login check here - user can browse and will be prompted at Step 4

    // If location is empty and geolocation is available, try to get it
    let finalLocation = location.trim()
    if (!finalLocation && navigator.geolocation) {
      setLoadingLocation(true)
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject)
        })

        const { latitude, longitude } = position.coords
        const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

        if (MAPBOX_TOKEN) {
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&types=postcode`
          )
          const data = await response.json()

          if (data.features && data.features.length > 0) {
            finalLocation = data.features[0].text
            setLocation(finalLocation)
            localStorage.setItem('housecall.defaultZip', finalLocation)
          }
        }
      } catch (error) {
        console.error('Error getting location:', error)
      }
      setLoadingLocation(false)
    }

    // Extract zip code from location or search query
    const zipMatch = (finalLocation + ' ' + searchQuery).match(/\b\d{5}\b/)
    const zip = zipMatch ? zipMatch[0] : finalLocation

    if (zip && typeof window !== 'undefined') {
      try { localStorage.setItem('housecall.defaultZip', zip) } catch {}
    }

    // Detect category from search query
    const detectedCategory = detectCategory(searchQuery)

    const q = new URLSearchParams()
    if(zip) q.set('near', zip)
    if(detectedCategory) q.set('category', detectedCategory)

    router.push(`/find-pro${q.toString() ? `?${q.toString()}` : ''}`)
  }

  return (
    <section className={`relative ${styles.gradientContainer}`}>
      {/* Animated gradient layers */}
      <div className={styles.waveLayer1}></div>
      <div className={styles.waveLayer2}></div>

      <div className={`relative mx-auto max-w-7xl px-6 py-16 lg:py-24 ${styles.contentWrapper}`}>
        {/* Centered content - no map */}
        <div className="text-white text-center max-w-3xl mx-auto space-y-6">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
            Emergency help,<br />
            <span className="text-emerald-200">on the way in minutes</span>
          </h1>

          <p className="text-base md:text-lg text-emerald-50">
            Tap once. Get matched with a vetted pro. Track their live ETA.
            Upfront pricing and no hidden fees.
          </p>

          {/* Search Form - centered */}
          <form onSubmit={onFindPro} className="max-w-xl mx-auto">
            <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center bg-white rounded-xl shadow-lg overflow-hidden">
              <input
                type="text"
                placeholder={placeholderText}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 px-5 py-4 text-gray-900 placeholder-gray-500 focus:outline-none text-base md:text-lg border-b sm:border-b-0 sm:border-r border-gray-200"
              />
              <div className="flex items-center">
                <input
                  type="text"
                  placeholder="ZIP"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-24 sm:w-28 px-4 py-4 text-gray-900 placeholder-gray-500 focus:outline-none text-base md:text-lg border-r border-gray-200"
                />
                <button
                  type="button"
                  onClick={getUserLocation}
                  disabled={loadingLocation}
                  className="px-3 py-4 hover:bg-gray-50 transition-colors disabled:opacity-50 border-r border-gray-200"
                  title="Use my location"
                >
                  {loadingLocation ? (
                    <img
                      src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
                      alt="Loading..."
                      className="w-6 h-6 object-contain"
                    />
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
                  className="px-6 py-4 bg-gray-900 hover:bg-black text-white font-semibold transition-colors whitespace-nowrap text-base md:text-lg disabled:opacity-50"
                >
                  Find a Pro
                </button>
              </div>
            </div>
          </form>

          {/* Trust indicators - centered */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-emerald-100">
            <div className="flex items-center gap-1">
              <span className="text-lg">★★★★★</span>
              <span className="text-sm md:text-base ml-1">4.5 average</span>
            </div>
            <span className="text-sm md:text-base">(10k+ jobs)</span>
            <span className="text-sm md:text-base">Background-checked pros</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-2 text-emerald-100">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm md:text-base">Upfront pricing</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-100">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-sm md:text-base">Secure payments</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
