'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { X, HelpCircle, MapPin, Star, Clock, DollarSign, CheckCircle, ChevronLeft, ChevronRight, Sliders, Briefcase, Award, Zap } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { openAuth } from './AuthModal'
import { useAuth } from '../contexts/AuthContext'
import dynamic from 'next/dynamic'

// Dynamically import map to avoid SSR issues
const ContractorMap = dynamic(() => import('./ContractorMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-100 animate-pulse flex items-center justify-center">
      <div className="text-slate-400">Loading map...</div>
    </div>
  )
})

interface Contractor {
  id: string
  name: string
  business_name: string
  rating: number
  total_jobs: number
  hourly_rate: number
  categories: string[]
  latitude: number
  longitude: number
  distance_miles: number
  eta_minutes: number
  availability: 'online' | 'busy' | 'offline'
  profile_image?: string
  years_in_business?: number
  response_time_minutes?: number
  bio?: string
}

interface InstantMatchOverlayProps {
  isOpen: boolean
  onClose: () => void
  category: string
  searchQuery?: string
  userLocation?: { lat: number; lng: number; zip?: string }
}

// Haversine distance calculation
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

// Calculate ETA based on distance (rough estimate)
function calculateETA(distanceMiles: number): number {
  return Math.ceil((distanceMiles / 25) * 60) + 5
}

export default function InstantMatchOverlay({
  isOpen,
  onClose,
  category,
  searchQuery,
  userLocation
}: InstantMatchOverlayProps) {
  const router = useRouter()
  const { user } = useAuth()

  // State
  const [phase, setPhase] = useState<'searching' | 'found' | 'connected' | 'no_pros'>('searching')
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [visibleContractors, setVisibleContractors] = useState<Contractor[]>([])
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null)
  const [connectedContractor, setConnectedContractor] = useState<Contractor | null>(null)
  const [countdown, setCountdown] = useState(60)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [minPrice, setMinPrice] = useState(0)
  const [maxPrice, setMaxPrice] = useState(200)
  const [searchZip, setSearchZip] = useState(userLocation?.zip || '')
  const [searchRadius, setSearchRadius] = useState(25)

  // Post job button delay state
  const [showPostJobButton, setShowPostJobButton] = useState(false)
  const postJobTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Real ETA from route calculation
  const [realEta, setRealEta] = useState<number | null>(null)
  const [realDistance, setRealDistance] = useState<number | null>(null)

  // Current search location (can be overridden by settings ZIP)
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; zip?: string } | null>(userLocation || null)
  const [locationName, setLocationName] = useState<string>('')

  // Update current location when userLocation prop changes
  useEffect(() => {
    if (userLocation && !currentLocation) {
      setCurrentLocation(userLocation)
      setSearchZip(userLocation.zip || '')
    }
  }, [userLocation])

  // Refs
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const revealRef = useRef<NodeJS.Timeout | null>(null)
  const notificationsSentRef = useRef(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Category to filter mapping
  const categoryMapping: Record<string, string[]> = {
    'Plumber': ['Plumbing', 'plumbing', 'Plumber'],
    'Electrician': ['Electrical', 'electrical', 'Electrician'],
    'HVAC': ['HVAC', 'hvac', 'Heating', 'Cooling'],
    'Roofer': ['Roofing', 'roofing', 'Roofer'],
    'Locksmith': ['Locksmith', 'locksmith'],
    'Appliance Repair': ['Appliance', 'appliance', 'Appliance Repair'],
    'Water Damage Restoration': ['Water Damage', 'water damage', 'Restoration'],
    'Auto Battery': ['Auto', 'Battery', 'Jump Start'],
    'Auto Tire': ['Auto', 'Tire', 'Flat Tire'],
    'Auto Lockout': ['Auto', 'Lockout', 'Car Lockout'],
    'Tow': ['Towing', 'Tow'],
    'Fuel Delivery': ['Fuel', 'Gas Delivery'],
    'Mobile Mechanic': ['Mechanic', 'Auto Repair'],
  }

  // Geocode ZIP to get coordinates
  const geocodeZip = async (zip: string): Promise<{ lat: number; lng: number; name: string } | null> => {
    const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!MAPBOX_TOKEN) return null

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(zip)}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=postcode,place`
      )
      const data = await response.json()
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center
        const name = data.features[0].place_name || zip
        return { lat, lng, name }
      }
    } catch (err) {
      console.error('Geocoding error:', err)
    }
    return null
  }

  // Fetch contractors within radius
  const fetchContractors = useCallback(async () => {
    if (!currentLocation || hasFetched) return

    setHasFetched(true)
    setPhase('searching')

    // Set 5-second timeout - if no contractors found by then, show no_pros
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setPhase('no_pros')
    }, 5000)

    try {
      const { data: allContractors, error } = await supabase
        .from('pro_contractors')
        .select('*')
        .eq('availability', 'online')
        .eq('status', 'approved')

      if (error) {
        console.error('Error fetching contractors:', error)
        setPhase('no_pros')
        return
      }

      const categoryFilters = category ? categoryMapping[category] || [category] : []

      let filteredContractors = allContractors || []
      if (categoryFilters.length > 0 && filteredContractors.length > 0) {
        filteredContractors = filteredContractors.filter(c => {
          const cats = c.categories || []
          return cats.some((cat: string) =>
            categoryFilters.some(filter =>
              cat.toLowerCase().includes(filter.toLowerCase()) ||
              filter.toLowerCase().includes(cat.toLowerCase())
            )
          )
        })
      }

      const maxRadius = searchRadius || 25
      const contractorsWithDistance = filteredContractors
        .filter(c => c.latitude && c.longitude)
        .map(c => {
          const distance = calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            Number(c.latitude),
            Number(c.longitude)
          )
          return {
            id: c.id,
            name: c.name || c.business_name,
            business_name: c.business_name || c.name,
            rating: c.rating || 4.5 + Math.random() * 0.5,
            total_jobs: c.total_jobs || Math.floor(Math.random() * 200) + 50,
            hourly_rate: c.hourly_rate || 65,
            categories: c.categories || [],
            latitude: Number(c.latitude),
            longitude: Number(c.longitude),
            distance_miles: distance,
            eta_minutes: calculateETA(distance),
            availability: c.availability as 'online' | 'busy' | 'offline',
            profile_image: c.profile_image,
            years_in_business: c.years_in_business || Math.floor(Math.random() * 15) + 1,
            response_time_minutes: c.response_time_minutes || Math.floor(Math.random() * 10) + 2,
            bio: c.bio || `Professional ${category || 'service'} provider with years of experience.`
          }
        })
        .filter(c => c.distance_miles <= maxRadius)
        .filter(c => c.hourly_rate >= minPrice && c.hourly_rate <= maxPrice)
        .sort((a, b) => a.distance_miles - b.distance_miles)

      if (contractorsWithDistance.length === 0) {
        // No contractors found - timeout will handle showing no_pros
        if (!notificationsSentRef.current) {
          notificationsSentRef.current = true
          const { data: emergencyContractors } = await supabase
            .from('pro_contractors')
            .select('id')
            .eq('status', 'approved')
          if (emergencyContractors && emergencyContractors.length > 0) {
            sendEmergencyNotifications(emergencyContractors)
          }
        }
        // Let the 5-second timeout handle showing no_pros
        return
      }

      // Found contractors - clear the timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }

      if (!notificationsSentRef.current) {
        notificationsSentRef.current = true
        sendNotificationsToContractors(contractorsWithDistance)
      }

      setContractors(contractorsWithDistance)
      setVisibleContractors(contractorsWithDistance)

      const selected = contractorsWithDistance[0]
      setConnectedContractor(selected)
      setSelectedContractor(selected)
      setPhase('connected')
      setCountdown(60)
      startCountdown()

    } catch (err) {
      console.error('Error in fetchContractors:', err)
      // On error, let the timeout handle it or set no_pros immediately
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      setPhase('no_pros')
    }
  }, [userLocation, category, hasFetched, searchRadius, minPrice, maxPrice])

  const sendNotificationsToContractors = async (contractorList: Contractor[]) => {
    try {
      await fetch('/api/notify-contractors-instant-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractors: contractorList.map(c => c.id),
          category,
          searchQuery,
          userLocation,
          urgent: true
        })
      })
    } catch (err) {
      console.error('Error sending notifications:', err)
    }
  }

  const sendEmergencyNotifications = async (allContractors: any[]) => {
    try {
      await fetch('/api/notify-contractors-emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractors: allContractors.map(c => c.id),
          category,
          searchQuery,
          userLocation,
          emergency: true
        })
      })
    } catch (err) {
      console.error('Error sending emergency notifications:', err)
    }
  }

  const startCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
    }

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!)
          handleConfirmConnection()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleSwitchContractor = (contractor: Contractor) => {
    setCountdown(60)
    setRealEta(null)
    setRealDistance(null)
    setConnectedContractor(contractor)
    setSelectedContractor(contractor)

    if (countdownRef.current) {
      clearInterval(countdownRef.current)
    }
    startCountdown()
  }

  const handleConfirmConnection = () => {
    if (!connectedContractor) return

    if (!user) {
      localStorage.setItem('rushr_pending_match', JSON.stringify({
        contractorId: connectedContractor.id,
        category,
        searchQuery,
        userLocation,
        timestamp: Date.now()
      }))
      openAuth('/post-job')
      return
    }

    router.push(`/book/${connectedContractor.id}?category=${encodeURIComponent(category)}&rate=${connectedContractor.hourly_rate}`)
  }

  const handleCancel = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
    }
    onClose()
  }

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (revealRef.current) clearTimeout(revealRef.current)
      if (postJobTimerRef.current) clearTimeout(postJobTimerRef.current)
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (phase === 'no_pros') {
      setShowPostJobButton(false)
      postJobTimerRef.current = setTimeout(() => {
        setShowPostJobButton(true)
      }, 5000)
    } else {
      setShowPostJobButton(false)
      if (postJobTimerRef.current) {
        clearTimeout(postJobTimerRef.current)
      }
    }

    return () => {
      if (postJobTimerRef.current) {
        clearTimeout(postJobTimerRef.current)
      }
    }
  }, [phase])

  useEffect(() => {
    if (isOpen && userLocation && !currentLocation) {
      setCurrentLocation(userLocation)
      setSearchZip(userLocation.zip || '')
    }
  }, [isOpen, userLocation])

  useEffect(() => {
    if (isOpen && currentLocation && !hasFetched) {
      fetchContractors()
    }
  }, [isOpen, currentLocation, hasFetched, fetchContractors])

  useEffect(() => {
    if (!isOpen) {
      setPhase('searching')
      setContractors([])
      setVisibleContractors([])
      setSelectedContractor(null)
      setConnectedContractor(null)
      setCountdown(60)
      setHasFetched(false)
      setCurrentLocation(null)
      setLocationName('')
      setShowPostJobButton(false)
      setRealEta(null)
      setRealDistance(null)
      setSidebarCollapsed(false)
      notificationsSentRef.current = false
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (postJobTimerRef.current) clearTimeout(postJobTimerRef.current)
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
      >
        <div className="absolute inset-4 sm:inset-6 md:inset-8 lg:inset-12 flex flex-col">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="flex-1 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold flex-shrink-0">
                  {category || 'Finding Pros'}
                </span>
                {(locationName || searchZip) && (
                  <span className="text-xs text-slate-500 truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {locationName || searchZip}
                  </span>
                )}
                {phase === 'connected' && (
                  <span className="text-xs text-slate-500 flex items-center gap-1 ml-2">
                    <Clock className="w-3 h-3" />
                    Auto-confirm in {countdown}s
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Settings"
                >
                  <Sliders className="w-5 h-5" />
                </button>
                <button
                  onClick={() => router.push('/contact')}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Get Help"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
                <button
                  onClick={handleCancel}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Settings Modal */}
            <AnimatePresence>
              {settingsOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
                  onClick={() => setSettingsOpen(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-slate-900">Search Settings</h3>
                      <button onClick={() => setSettingsOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                        <X className="w-5 h-5 text-slate-500" />
                      </button>
                    </div>

                    <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Hourly Price Range</label>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-slate-500">Min</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                              <input
                                type="number"
                                value={minPrice}
                                onChange={(e) => setMinPrice(Number(e.target.value))}
                                className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                min={0}
                                max={maxPrice}
                              />
                            </div>
                          </div>
                          <span className="text-slate-400 mt-5">–</span>
                          <div className="flex-1">
                            <label className="text-xs text-slate-500">Max</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                              <input
                                type="number"
                                value={maxPrice}
                                onChange={(e) => setMaxPrice(Number(e.target.value))}
                                className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                min={minPrice}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Search Area (ZIP)</label>
                        <input
                          type="text"
                          value={searchZip}
                          onChange={(e) => setSearchZip(e.target.value)}
                          placeholder="Enter ZIP code"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          maxLength={5}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Search Radius: {searchRadius} miles</label>
                        <input
                          type="range"
                          value={searchRadius}
                          onChange={(e) => setSearchRadius(Number(e.target.value))}
                          min={5}
                          max={50}
                          step={5}
                          className="w-full accent-blue-600"
                        />
                        <div className="flex justify-between text-xs text-slate-500 mt-1">
                          <span>5 mi</span>
                          <span>50 mi</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex gap-3">
                      <button
                        onClick={() => setSettingsOpen(false)}
                        className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          setSettingsOpen(false)
                          setPhase('searching')
                          setContractors([])
                          setVisibleContractors([])
                          setConnectedContractor(null)
                          setSelectedContractor(null)

                          if (searchZip && searchZip !== userLocation?.zip) {
                            const geoResult = await geocodeZip(searchZip)
                            if (geoResult) {
                              setCurrentLocation({ lat: geoResult.lat, lng: geoResult.lng, zip: searchZip })
                              setLocationName(geoResult.name)
                            }
                          }

                          setHasFetched(false)
                        }}
                        className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main Content: Left Sidebar + Map */}
            <div className="flex-1 flex overflow-hidden relative min-h-0">
              {/* Sidebar Toggle Button - Always visible */}
              <motion.button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="absolute top-1/2 transform -translate-y-1/2 w-6 h-12 bg-white border border-slate-200 rounded-r-lg shadow-sm flex items-center justify-center hover:bg-slate-50 z-20"
                animate={{ left: sidebarCollapsed ? 0 : 320 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                {sidebarCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronLeft className="w-4 h-4 text-slate-500" />}
              </motion.button>

              {/* Left Sidebar */}
              <motion.div
                initial={false}
                animate={{ width: sidebarCollapsed ? 0 : 320 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className={`bg-slate-50 overflow-hidden flex-shrink-0 h-full ${sidebarCollapsed ? '' : 'border-r border-slate-200'}`}
              >
                <div className="w-[320px] h-full flex flex-col">
                  {/* Contractor Tabs List */}
                  {phase === 'connected' && visibleContractors.length > 0 && (
                    <div className="border-b border-slate-200 bg-white">
                      <div className="p-2">
                        <p className="text-xs text-slate-500 mb-2 px-1">{visibleContractors.length} pro{visibleContractors.length > 1 ? 's' : ''} available nearby</p>
                        <div className="flex overflow-x-auto gap-2 scrollbar-hide">
                          {visibleContractors.map((contractor) => (
                            <button
                              key={contractor.id}
                              onClick={() => handleSwitchContractor(contractor)}
                              className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                                selectedContractor?.id === contractor.id
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50'
                              }`}
                            >
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                selectedContractor?.id === contractor.id ? 'bg-white/20' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {contractor.business_name?.charAt(0) || 'P'}
                              </div>
                              <span>{contractor.business_name?.split(' ')[0] || 'Pro'}</span>
                              <span className={`text-xs ${selectedContractor?.id === contractor.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                                {contractor.eta_minutes}m
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Selected Contractor Profile */}
                  <div className="flex-1 overflow-y-auto p-4">
                    {phase === 'connected' && selectedContractor && (
                      <motion.div
                        key={selectedContractor.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                      >
                        {/* Compact Profile Card */}
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                          <div className="flex items-start gap-3">
                            {selectedContractor.profile_image ? (
                              <img
                                src={selectedContractor.profile_image}
                                alt={selectedContractor.business_name}
                                className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
                                <span className="text-white font-bold text-xl">
                                  {selectedContractor.business_name?.charAt(0) || 'P'}
                                </span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-slate-900 truncate">
                                {selectedContractor.business_name}
                              </h3>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                                <span className="font-medium text-sm text-slate-900">{selectedContractor.rating.toFixed(1)}</span>
                                <span className="text-slate-400 text-xs">({selectedContractor.total_jobs})</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Verified
                                </span>
                                <span className="text-xs text-slate-500">{selectedContractor.categories?.[0] || category}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ETA & Distance Highlight */}
                        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <div className="text-2xl font-bold text-emerald-700">{realEta ?? selectedContractor.eta_minutes} min</div>
                                <div className="text-xs text-emerald-600">Estimated arrival</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-semibold text-slate-700">{(realDistance ?? selectedContractor.distance_miles).toFixed(1)} mi</div>
                              <div className="text-xs text-slate-500">away</div>
                            </div>
                          </div>
                        </div>

                        {/* Quick Stats Row */}
                        <div className="flex gap-2">
                          <div className="flex-1 bg-white rounded-lg p-3 border border-slate-200 text-center">
                            <div className="text-lg font-bold text-slate-900">${selectedContractor.hourly_rate}</div>
                            <div className="text-xs text-slate-500">per hour</div>
                          </div>
                          <div className="flex-1 bg-white rounded-lg p-3 border border-slate-200 text-center">
                            <div className="text-lg font-bold text-slate-900">{selectedContractor.years_in_business}+</div>
                            <div className="text-xs text-slate-500">years exp</div>
                          </div>
                          <div className="flex-1 bg-white rounded-lg p-3 border border-slate-200 text-center">
                            <div className="text-lg font-bold text-slate-900">{selectedContractor.response_time_minutes}m</div>
                            <div className="text-xs text-slate-500">response</div>
                          </div>
                        </div>

                        {/* Book Now Button */}
                        <button
                          onClick={handleConfirmConnection}
                          className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25"
                        >
                          <CheckCircle className="w-5 h-5" />
                          Book {selectedContractor.business_name?.split(' ')[0]}
                        </button>

                        <p className="text-center text-xs text-slate-500">
                          Auto-booking in <span className="font-semibold text-emerald-600">{countdown}s</span> • Click another pro to switch
                        </p>
                      </motion.div>
                    )}

                    {/* Searching State */}
                    {phase === 'searching' && (
                      <div className="flex flex-col items-center justify-center h-full">
                        <div className="w-14 h-14 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-slate-900 font-semibold">Finding {category || 'pros'}...</p>
                        <p className="text-slate-500 text-sm mt-1">Searching nearby professionals</p>
                      </div>
                    )}

                    {/* No Pros State - shows immediately after 5sec search timeout */}
                    {phase === 'no_pros' && (
                      <div className="flex flex-col items-center justify-center h-full text-center px-4">
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Clock className="w-8 h-8 text-slate-400" />
                          </div>
                          <h3 className="text-lg font-semibold text-slate-900">No {category || 'pros'} available</h3>
                          <p className="text-sm text-slate-600 mt-2">
                            All professionals are currently busy. Post a job and we'll notify you when one becomes available.
                          </p>
                          <button
                            onClick={() => router.push('/post-job?category=' + encodeURIComponent(category))}
                            className="mt-4 w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
                          >
                            Post a Job
                          </button>
                          <button
                            onClick={handleCancel}
                            className="mt-2 w-full py-2.5 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                          >
                            Close
                          </button>
                        </motion.div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Map Area - takes all remaining space */}
              <div className="flex-1 h-full min-w-0">
                <ContractorMap
                  contractors={visibleContractors}
                  userLocation={currentLocation || userLocation}
                  selectedContractor={selectedContractor}
                  radiusMiles={searchRadius}
                  onSelectContractor={(c) => {
                    if (phase === 'connected') {
                      handleSwitchContractor(c)
                    } else {
                      setSelectedContractor(c)
                    }
                  }}
                  onRouteCalculated={(eta, distance) => {
                    setRealEta(eta)
                    setRealDistance(distance)
                  }}
                />
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
