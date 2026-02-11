'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { X, HelpCircle, MapPin, Star, Clock, DollarSign, CheckCircle, ChevronLeft, ChevronRight, Sliders, Briefcase, Award, Zap, CreditCard, Navigation, AlertTriangle, Phone, MessageCircle, Shield, Users } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { authFetch } from '../lib/authFetch'
import { openAuth } from './AuthModal'
import { useAuth } from '../contexts/AuthContext'
import dynamic from 'next/dynamic'
import OfferJobModal from './OfferJobModal'

// Dynamically import map to avoid SSR issues
const ContractorMap = dynamic(() => import('./ContractorMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-100 animate-pulse flex items-center justify-center">
      <div className="text-slate-400">Loading map...</div>
    </div>
  )
})

const tradePluralMap: Record<string, string> = {
  // Card names (from page.tsx trade cards)
  'Plumbing': 'Plumbers',
  'Electrical': 'Electricians',
  'HVAC': 'HVAC Technicians',
  'Roof leak': 'Roofers',
  'Water damage': 'Restoration Pros',
  'Locksmith': 'Locksmiths',
  'Appliance repair': 'Appliance Technicians',
  'Jump start': 'Auto Technicians',
  'Tire change': 'Tire Technicians',
  'Lockout': 'Locksmiths',
  'Tow request': 'Tow Services',
  'Fuel delivery': 'Fuel Delivery Services',
  'Mobile mechanic': 'Mobile Mechanics',
  // Hero search detection names (from Hero.tsx detectCategory)
  'Plumber': 'Plumbers',
  'Electrician': 'Electricians',
  'Roofer': 'Roofers',
  'Appliance Repair': 'Appliance Technicians',
  'Pest Control': 'Pest Control Pros',
  'Cleaner': 'Cleaners',
  'Handyman': 'Handymen',
}

function getTradePlural(category: string | undefined): string {
  if (!category) return 'Pros'
  return tradePluralMap[category] || 'Pros'
}

interface Contractor {
  id: string
  name: string
  business_name: string
  rating: number
  total_jobs: number
  hourly_rate: number
  peak_rate?: number
  off_peak_rate?: number
  surge_rate?: number
  visit_fee?: number
  diagnostic_fee?: number
  rate_type?: 'Hourly' | 'Flat' | 'Visit fee'
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
  // Direct Payment Job props
  jobId?: string           // Existing job ID for direct payment
  directAmount?: number    // Fixed price to display
  paymentHoldId?: string   // Already created payment hold
  onSwitchToBids?: () => void  // Called when no contractor found, auto-switching to bids
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

// Calculate ETA based on distance (rough estimate, ~30mph avg with 1min minimum)
function calculateETA(distanceMiles: number): number {
  return Math.max(1, Math.ceil((distanceMiles / 30) * 60))
}

export default function InstantMatchOverlay({
  isOpen,
  onClose,
  category,
  searchQuery,
  userLocation,
  jobId,
  directAmount,
  paymentHoldId,
  onSwitchToBids
}: InstantMatchOverlayProps) {
  const router = useRouter()
  const { user } = useAuth()

  // State
  const [phase, setPhase] = useState<'searching' | 'found' | 'connected' | 'tracking' | 'no_pros'>('searching')
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
  const [searchRadius, setSearchRadius] = useState(5)

  // Real ETA from route calculation
  const [realEta, setRealEta] = useState<number | null>(null)
  const [realDistance, setRealDistance] = useState<number | null>(null)

  // Saved payment method
  const [savedCard, setSavedCard] = useState<{ brand: string; last4: string } | null>(null)

  // Add card modal state
  const [showAddCardModal, setShowAddCardModal] = useState(false)

  // Booking confirmation state
  const [bookingConfirmed, setBookingConfirmed] = useState(false)
  const [bookingLoading, setBookingLoading] = useState(false)

  // Tracking state (Uber-style live tracking)
  const [trackingData, setTrackingData] = useState<{
    paymentHoldId: string
    bookingId: string
    amount: number
    etaMinutes: number
    contractorLocation: { lat: number; lng: number } | null
    conversationId: string | null
  } | null>(null)
  const [trackingEtaCountdown, setTrackingEtaCountdown] = useState(0)
  const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Live job tracking state
  const [trackingJobStatus, setTrackingJobStatus] = useState<'confirmed' | 'in_progress' | 'completed'>('confirmed')
  const [contractorMarkedComplete, setContractorMarkedComplete] = useState(false)
  const [proposedFinalPrice, setProposedFinalPrice] = useState<number | null>(null)
  const [finalPriceAccepted, setFinalPriceAccepted] = useState(false)
  const [finalPriceReason, setFinalPriceReason] = useState<string | null>(null)
  const [completionSubmitting, setCompletionSubmitting] = useState(false)
  const [jobCompleted, setJobCompleted] = useState(false)

  // Payment error state
  const [paymentError, setPaymentError] = useState<string | null>(null)

  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)

  // Job description from homeowner
  const [jobDescription, setJobDescription] = useState('')

  // Nearby contractors (offline/busy) shown when no online pros found
  const [nearbyContractors, setNearbyContractors] = useState<Contractor[]>([])
  const [showOfferModal, setShowOfferModal] = useState(false)

  // Direct Payment Job state
  const [isDirectPaymentJob, setIsDirectPaymentJob] = useState(!!jobId)
  const [directJobStatus, setDirectJobStatus] = useState<'pending' | 'accepted' | 'expired'>('pending')
  const [acceptedContractorId, setAcceptedContractorId] = useState<string | null>(null)
  const [directJobExpiry, setDirectJobExpiry] = useState<Date | null>(null)
  const [expiryCountdown, setExpiryCountdown] = useState<number>(15) // 15 seconds to find a contractor

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

  // Sync isDirectPaymentJob with jobId prop
  useEffect(() => {
    setIsDirectPaymentJob(!!jobId)
  }, [jobId])

  // Fetch saved payment method when user is logged in
  useEffect(() => {
    if (user && isOpen) {
      authFetch(`/api/stripe/customer/payment-methods?userId=${user.id}`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.paymentMethods?.length > 0) {
            const defaultPm = data.paymentMethods.find((pm: any) => pm.id === data.defaultPaymentMethodId) || data.paymentMethods[0]
            if (defaultPm?.card) {
              setSavedCard({ brand: defaultPm.card.brand, last4: defaultPm.card.last4 })
            }
          }
        })
        .catch(err => console.error('Error fetching payment methods:', err))
    }
  }, [user, isOpen])

  // Search countdown timer (15 seconds to find a contractor)
  const [searchCountdown, setSearchCountdown] = useState(15)
  const searchCountdownRef = useRef<NodeJS.Timeout | null>(null)

  // Refs
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const revealRef = useRef<NodeJS.Timeout | null>(null)
  const notificationsSentRef = useRef(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const visibleContractorsRef = useRef<Contractor[]>([])
  const connectedContractorRef = useRef<Contractor | null>(null)

  // Keep refs in sync with state for use inside subscription callbacks
  useEffect(() => { visibleContractorsRef.current = visibleContractors }, [visibleContractors])
  useEffect(() => { connectedContractorRef.current = connectedContractor }, [connectedContractor])

  // Real-time subscription for direct payment jobs — listen for contractor bids (acceptances)
  useEffect(() => {
    if (!jobId || !isOpen) return

    setIsDirectPaymentJob(true)

    // Subscribe to new bids on this job (contractors accepting the direct payment)
    const bidsChannel = supabase
      .channel(`direct-job-bids-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_bids',
          filter: `job_id=eq.${jobId}`
        },
        async (payload) => {
          console.log('[DirectJob] New bid/acceptance:', payload.new)

          const bid = payload.new as any
          const contractorId = bid.contractor_id

          // Check if we already have this contractor (use ref to avoid stale closure)
          const alreadyExists = visibleContractorsRef.current.some(c => c.id === contractorId)
          if (alreadyExists) return

          // Fetch contractor info
          const { data: contractor } = await supabase
            .from('pro_contractors')
            .select('*')
            .eq('id', contractorId)
            .single()

          if (contractor) {
            const distance = currentLocation
              ? calculateDistance(currentLocation.lat, currentLocation.lng, Number(contractor.latitude), Number(contractor.longitude))
              : 5
            const eta = calculateETA(distance)

            const contractorData: Contractor = {
              id: contractor.id,
              name: contractor.name || '',
              business_name: contractor.business_name || contractor.name || 'Contractor',
              rating: contractor.rating || 4.5,
              total_jobs: contractor.total_jobs || 0,
              hourly_rate: contractor.hourly_rate || directAmount || 0,
              categories: contractor.categories || [],
              latitude: Number(contractor.latitude),
              longitude: Number(contractor.longitude),
              distance_miles: distance,
              eta_minutes: eta,
              availability: 'online',
              profile_image: contractor.profile_image,
              years_in_business: contractor.years_in_business || 1,
              response_time_minutes: contractor.response_time_minutes || 5,
              bio: contractor.bio || `Professional service provider.`
            }

            // Add contractor to visible list
            setVisibleContractors(prev => [...prev, contractorData])
            setContractors(prev => [...prev, contractorData])

            // Auto-select the first contractor that appears (use ref to avoid stale closure)
            if (!connectedContractorRef.current) {
              setConnectedContractor(contractorData)
              setSelectedContractor(contractorData)
            }

            // Switch to connected phase — contractors are available
            setPhase('connected')
          }
        }
      )
      .subscribe()

    // Also fetch any existing bids that arrived before subscription started
    supabase
      .from('job_bids')
      .select('*, pro_contractors(*)')
      .eq('job_id', jobId)
      .eq('status', 'pending')
      .then(({ data: existingBids, error }) => {
        if (!error && existingBids && existingBids.length > 0) {
          const contractorsList: Contractor[] = existingBids
            .filter((bid: any) => bid.pro_contractors)
            .map((bid: any) => {
              const c = bid.pro_contractors
              const distance = currentLocation
                ? calculateDistance(currentLocation.lat, currentLocation.lng, Number(c.latitude), Number(c.longitude))
                : 5
              return {
                id: c.id,
                name: c.name || '',
                business_name: c.business_name || c.name || 'Contractor',
                rating: c.rating || 4.5,
                total_jobs: c.total_jobs || 0,
                hourly_rate: c.hourly_rate || directAmount || 0,
                categories: c.categories || [],
                latitude: Number(c.latitude),
                longitude: Number(c.longitude),
                distance_miles: distance,
                eta_minutes: calculateETA(distance),
                availability: 'online' as const,
                profile_image: c.profile_image,
                years_in_business: c.years_in_business || 1,
                response_time_minutes: c.response_time_minutes || 5,
                bio: c.bio || `Professional service provider.`
              }
            })

          if (contractorsList.length > 0) {
            setVisibleContractors(contractorsList)
            setContractors(contractorsList)
            setConnectedContractor(contractorsList[0])
            setSelectedContractor(contractorsList[0])
            setPhase('connected')
          }
        }
      })

    return () => {
      supabase.removeChannel(bidsChannel)
    }
  }, [jobId, isOpen, directAmount, currentLocation])

  // 15-second countdown for direct payment jobs
  // If contractors accepted: stop timer, keep tabs open for HO to browse
  // If no contractors after 15s: switch to bids mode
  useEffect(() => {
    if (!isDirectPaymentJob || !isOpen) return
    // Don't run timer if already expired or if we're in connected/tracking phase
    if (directJobStatus === 'expired') return
    if (phase === 'connected' || phase === 'tracking') return

    setExpiryCountdown(15)
    const interval = setInterval(() => {
      setExpiryCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          // Check if contractors have appeared (use ref to avoid stale closure)
          if (visibleContractorsRef.current.length > 0) {
            // Contractors available — keep tabs open, don't switch to bids
            return 0
          } else {
            // No contractors — switch to bids
            setDirectJobStatus('expired')
            if (onSwitchToBids) onSwitchToBids()
            return 0
          }
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isDirectPaymentJob, isOpen, directJobStatus, phase])

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
    setSearchCountdown(15)

    // Start countdown interval (ticks every second)
    if (searchCountdownRef.current) clearInterval(searchCountdownRef.current)
    searchCountdownRef.current = setInterval(() => {
      setSearchCountdown(prev => {
        if (prev <= 1) {
          if (searchCountdownRef.current) clearInterval(searchCountdownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Set 15-second timeout - if no contractors found by then, switch to bids
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      if (searchCountdownRef.current) clearInterval(searchCountdownRef.current)
      setPhase('no_pros')
    }, 15000)

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

      const maxRadius = searchRadius || 5
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
            peak_rate: c.peak_rate || null,
            off_peak_rate: c.off_peak_rate || null,
            surge_rate: c.surge_rate || null,
            visit_fee: c.visit_fee || null,
            diagnostic_fee: c.diagnostic_fee || null,
            rate_type: c.rate_type || 'Hourly',
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
        // No online contractors found - fetch ALL approved contractors nearby (including offline/busy)
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

        // Fetch ALL approved contractors regardless of availability
        const { data: allApproved } = await supabase
          .from('pro_contractors')
          .select('*')
          .eq('status', 'approved')

        const nearbyWithDistance = (allApproved || [])
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
              peak_rate: c.peak_rate || null,
              off_peak_rate: c.off_peak_rate || null,
              surge_rate: c.surge_rate || null,
              visit_fee: c.visit_fee || null,
              diagnostic_fee: c.diagnostic_fee || null,
              rate_type: c.rate_type || 'Hourly',
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
          // No category filter — show ALL nearby approved contractors as fallback
          // Use wider radius (up to 15mi) since no online pros matched
          .filter(c => c.distance_miles <= Math.max(maxRadius, 15))
          .sort((a, b) => a.distance_miles - b.distance_miles)

        if (nearbyWithDistance.length > 0) {
          setNearbyContractors(nearbyWithDistance)
          setVisibleContractors(nearbyWithDistance) // Show them on the map
        }

        // Let the timeout handle showing no_pros phase
        return
      }

      // Found contractors - clear the timeout and countdown
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
      if (searchCountdownRef.current) {
        clearInterval(searchCountdownRef.current)
        searchCountdownRef.current = null
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
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      if (searchCountdownRef.current) clearInterval(searchCountdownRef.current)
      setPhase('no_pros')
    }
  }, [currentLocation, userLocation, category, hasFetched, searchRadius, minPrice, maxPrice])

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
    // No auto-confirm countdown for direct payment jobs — HO must click "Start Job"
    if (isDirectPaymentJob) return

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

  // Ref to hold the active contractor for booking (avoids stale state in async flows)
  const activeContractorRef = useRef<Contractor | null>(null)

  const handleConfirmConnection = async (overrideContractor?: Contractor) => {
    const contractor = overrideContractor || connectedContractor
    if (!contractor) return

    // Set both state and ref so createBookingRequest always has the right contractor
    setConnectedContractor(contractor)
    activeContractorRef.current = contractor

    if (!user) {
      localStorage.setItem('rushr_pending_match', JSON.stringify({
        contractorId: contractor.id,
        category,
        searchQuery,
        userLocation,
        jobDescription,
        timestamp: Date.now()
      }))
      openAuth('/post-job')
      return
    }

    // Check if user has a saved payment method
    if (!savedCard) {
      setShowAddCardModal(true)
      // Stop the countdown while modal is open
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
      }
      return
    }

    // User has a saved card - proceed with booking
    await createBookingRequest()
  }

  const createBookingRequest = async () => {
    const activeContractor = connectedContractor || activeContractorRef.current
    if (!activeContractor || !user) return

    setBookingLoading(true)
    setPaymentError(null)

    // Stop the countdown while processing
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
    }

    try {
      // DIRECT PAYMENT FLOW: Call /api/jobs/start-direct to create escrow + assign contractor
      if (isDirectPaymentJob && jobId && directAmount) {
        // Find the bid ID for this contractor
        const { data: bid } = await supabase
          .from('job_bids')
          .select('id')
          .eq('job_id', jobId)
          .eq('contractor_id', activeContractor.id)
          .single()

        const response = await fetch('/api/jobs/start-direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            contractorId: activeContractor.id,
            bidId: bid?.id || null,
            amount: directAmount,
            homeownerId: user.id
          })
        })

        const data = await response.json()

        if (!response.ok || !data.success) {
          setPaymentError(data.error || 'Failed to start job')
          setBookingLoading(false)
          return
        }

        // Success! Transition to live tracking phase
        setTrackingData({
          paymentHoldId: data.paymentHoldId,
          bookingId: jobId,
          amount: directAmount,
          etaMinutes: realEta ?? activeContractor.eta_minutes,
          contractorLocation: {
            lat: activeContractor.latitude,
            lng: activeContractor.longitude
          },
          conversationId: data.conversationId || null
        })

        setTrackingEtaCountdown((realEta ?? activeContractor.eta_minutes) * 60)
        setPhase('tracking')
        setBookingLoading(false)
        return
      }

      // REGULAR BOOKING FLOW (non-direct payment)
      // Calculate estimated amount (visit fee + 1 hour base, or 2 hour estimate)
      const visitFee = activeContractor.visit_fee || 0
      const diagnosticFee = activeContractor.diagnostic_fee || 0
      const baseAmount = (visitFee + diagnosticFee) || (activeContractor.hourly_rate * 2)
      const estimatedAmount = Math.max(baseAmount, activeContractor.hourly_rate)

      // Step 1: Create the booking first to get booking ID
      const bookingResponse = await fetch('/api/notify-contractor-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId: activeContractor.id,
          contractorName: activeContractor.business_name,
          category,
          jobDescription: jobDescription || `${category} service needed`,
          userLocation: currentLocation,
          locationName: locationName || searchZip,
          homeownerId: user.id,
          homeownerEmail: user.email,
          hourlyRate: activeContractor.hourly_rate,
          estimatedAmount
        })
      })

      const bookingData = await bookingResponse.json()

      if (!bookingResponse.ok || !bookingData.success) {
        throw new Error(bookingData.error || 'Failed to create booking')
      }

      // Step 2: Create the Stripe escrow payment hold
      const escrowResponse = await fetch('/api/stripe/escrow/create-hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeownerId: user.id,
          contractorId: activeContractor.id,
          amount: estimatedAmount,
          jobDescription: jobDescription || `${category} service needed`,
          category,
          bookingId: bookingData.bookingId
        })
      })

      const escrowData = await escrowResponse.json()

      if (!escrowResponse.ok || !escrowData.success) {
        // Payment failed - show error but don't fail completely
        setPaymentError(escrowData.error || 'Payment authorization failed')
        setBookingLoading(false)
        startCountdown() // Resume countdown
        return
      }

      // Step 3: Success! Transition to live tracking phase
      setTrackingData({
        paymentHoldId: escrowData.paymentHoldId,
        bookingId: bookingData.bookingId,
        amount: estimatedAmount,
        etaMinutes: realEta ?? activeContractor.eta_minutes,
        contractorLocation: {
          lat: activeContractor.latitude,
          lng: activeContractor.longitude
        },
        conversationId: escrowData.conversationId || null
      })

      // Start ETA countdown
      setTrackingEtaCountdown((realEta ?? activeContractor.eta_minutes) * 60)

      // Transition to tracking phase
      setPhase('tracking')

    } catch (err: any) {
      console.error('Error in booking flow:', err)
      setPaymentError(err.message || 'Failed to process booking. Please try again.')
      startCountdown() // Resume countdown
    } finally {
      setBookingLoading(false)
    }
  }

  const handleCancel = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
    }
    onClose()
  }

  // Handle job cancellation during tracking phase
  const handleJobCancellation = async () => {
    if (!cancelReason.trim()) {
      alert('Please provide a reason for cancellation')
      return
    }

    if (!trackingData || !connectedContractor || !user) return

    setCancelLoading(true)

    try {
      const response = await fetch('/api/booking/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: trackingData.bookingId,
          paymentHoldId: trackingData.paymentHoldId,
          cancelledBy: 'homeowner',
          cancelledById: user.id,
          cancelledByName: user.email,
          contractorId: connectedContractor.id,
          contractorName: connectedContractor.business_name,
          reason: cancelReason.trim(),
          amount: trackingData.amount
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Show success and close
        alert('Job cancelled successfully. The contractor has been notified.')
        setShowCancelModal(false)
        setCancelReason('')
        onClose()
      } else {
        alert(data.error || 'Failed to cancel job. Please try again.')
      }
    } catch (err) {
      console.error('Error cancelling job:', err)
      alert('Failed to cancel job. Please try again.')
    } finally {
      setCancelLoading(false)
    }
  }

  // ETA countdown for tracking phase
  useEffect(() => {
    if (phase === 'tracking' && trackingEtaCountdown > 0) {
      trackingIntervalRef.current = setInterval(() => {
        setTrackingEtaCountdown(prev => {
          if (prev <= 1) {
            if (trackingIntervalRef.current) {
              clearInterval(trackingIntervalRef.current)
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current)
      }
    }
  }, [phase, trackingEtaCountdown])

  // Real-time subscription for job status changes during tracking
  useEffect(() => {
    if (phase !== 'tracking' || !jobId) return

    const channel = supabase
      .channel(`ho-tracking-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'homeowner_jobs',
          filter: `id=eq.${jobId}`
        },
        (payload) => {
          if (payload.new) {
            const updated = payload.new as any
            // Status transitions
            if (updated.status === 'in_progress' && trackingJobStatus !== 'in_progress') {
              setTrackingJobStatus('in_progress')
              // Stop ETA countdown when contractor arrives
              if (trackingIntervalRef.current) {
                clearInterval(trackingIntervalRef.current)
                trackingIntervalRef.current = null
              }
              setTrackingEtaCountdown(0)
            }
            if (updated.status === 'completed') {
              setTrackingJobStatus('completed')
              setJobCompleted(true)
            }
            // Contractor marked complete / proposed final price
            if (updated.contractor_marked_complete) {
              setContractorMarkedComplete(true)
            }
            if (updated.final_price !== undefined && updated.final_price !== null) {
              setProposedFinalPrice(updated.final_price)
              setFinalPriceReason(updated.final_price_reason || null)
              setFinalPriceAccepted(updated.final_price_accepted || false)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [phase, jobId])

  // Handle homeowner accepting or declining proposed final price
  const handleFinalPriceResponse = async (accepted: boolean) => {
    if (!jobId || !user) return
    setCompletionSubmitting(true)
    try {
      const response = await fetch('/api/jobs/accept-final-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          homeownerId: user.id,
          accepted
        })
      })
      const data = await response.json()
      if (data.success) {
        if (accepted) {
          setFinalPriceAccepted(true)
        } else {
          // Declined — contractor needs to re-propose
          setContractorMarkedComplete(false)
          setProposedFinalPrice(null)
          setFinalPriceReason(null)
        }
      }
    } catch (err) {
      console.error('Error responding to final price:', err)
    } finally {
      setCompletionSubmitting(false)
    }
  }

  // Handle homeowner confirming job completion
  const handleConfirmCompletion = async () => {
    if (!jobId || !user) return
    setCompletionSubmitting(true)
    try {
      const response = await fetch('/api/payments/confirm-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          userId: user.id,
          userType: 'homeowner'
        })
      })
      const data = await response.json()
      if (data.success) {
        if (data.bothConfirmed) {
          setJobCompleted(true)
          setTrackingJobStatus('completed')
        }
      } else if (data.needsPriceAcceptance) {
        // Homeowner needs to accept price first
        setProposedFinalPrice(data.finalPrice)
      }
    } catch (err) {
      console.error('Error confirming completion:', err)
    } finally {
      setCompletionSubmitting(false)
    }
  }

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (revealRef.current) clearTimeout(revealRef.current)
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      if (searchCountdownRef.current) clearInterval(searchCountdownRef.current)
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current)
    }
  }, [])

  // When no pros found, notify parent to switch job to bids mode
  useEffect(() => {
    if (phase === 'no_pros' && onSwitchToBids) {
      onSwitchToBids()
    }
  }, [phase, onSwitchToBids])

  useEffect(() => {
    if (isOpen && userLocation && !currentLocation) {
      setCurrentLocation(userLocation)
      setSearchZip(userLocation.zip || '')
    }
  }, [isOpen, userLocation])

  useEffect(() => {
    // Skip contractor search for direct payment jobs - we're just waiting for acceptance
    if (isOpen && currentLocation && !hasFetched && !jobId) {
      fetchContractors()
    }
  }, [isOpen, currentLocation, hasFetched, fetchContractors, jobId])

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
      setRealEta(null)
      setRealDistance(null)
      setSidebarCollapsed(false)
      setSavedCard(null)
      setJobDescription('')
      setShowAddCardModal(false)
      setBookingConfirmed(false)
      setBookingLoading(false)
      setTrackingData(null)
      setTrackingEtaCountdown(0)
      setPaymentError(null)
      setShowCancelModal(false)
      setCancelReason('')
      setCancelLoading(false)
      // Reset direct payment state
      setIsDirectPaymentJob(false)
      setDirectJobStatus('pending')
      setAcceptedContractorId(null)
      setDirectJobExpiry(null)
      setExpiryCountdown(15)
      setSearchCountdown(15)
      notificationsSentRef.current = false
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      if (searchCountdownRef.current) clearInterval(searchCountdownRef.current)
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
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
                {phase === 'tracking' ? (
                  <>
                    <span className="px-3 py-1.5 bg-emerald-600 text-white rounded-full text-sm font-semibold flex-shrink-0 flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 animate-pulse" />
                      En Route
                    </span>
                    <span className="text-xs text-slate-500 truncate flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      ETA: {Math.floor(trackingEtaCountdown / 60)} min
                    </span>
                  </>
                ) : isDirectPaymentJob ? (
                  <>
                    <span className="px-3 py-1.5 bg-emerald-600 text-white rounded-full text-sm font-semibold flex-shrink-0 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      Direct Payment
                    </span>
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                      ${directAmount?.toFixed(0)}
                    </span>
                    {directJobStatus === 'pending' && (
                      <span className={`text-xs flex items-center gap-1 ml-2 font-medium ${expiryCountdown <= 5 ? 'text-red-600' : 'text-slate-500'}`}>
                        <Clock className="w-3 h-3" />
                        {expiryCountdown}s
                      </span>
                    )}
                    {directJobStatus === 'accepted' && (
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Accepted
                      </span>
                    )}
                  </>
                ) : (
                  <>
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
                  </>
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

            {/* Add Card Modal */}
            <AnimatePresence>
              {showAddCardModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
                  onClick={() => {
                    setShowAddCardModal(false)
                    startCountdown() // Resume countdown
                  }}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-slate-900">Payment Method Required</h3>
                      <button
                        onClick={() => {
                          setShowAddCardModal(false)
                          startCountdown()
                        }}
                        className="p-1 hover:bg-slate-100 rounded-lg"
                      >
                        <X className="w-5 h-5 text-slate-500" />
                      </button>
                    </div>

                    <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CreditCard className="w-8 h-8 text-amber-600" />
                      </div>
                      <p className="text-slate-600">
                        To book <strong>{connectedContractor?.business_name}</strong>, please add a payment method first.
                      </p>
                      <p className="text-sm text-slate-500 mt-2">
                        Your card will only be charged when the contractor accepts your request.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          setShowAddCardModal(false)
                          router.push('/dashboard/homeowner/billing?return=' + encodeURIComponent(window.location.pathname))
                        }}
                        className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <CreditCard className="w-5 h-5" />
                        Add Payment Method
                      </button>
                      <button
                        onClick={() => {
                          setShowAddCardModal(false)
                          startCountdown()
                        }}
                        className="w-full py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Booking Confirmed Modal */}
            <AnimatePresence>
              {bookingConfirmed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 text-center"
                  >
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="w-10 h-10 text-emerald-600" />
                    </div>

                    <h3 className="text-xl font-bold text-slate-900 mb-2">Booking Request Sent!</h3>

                    <p className="text-slate-600 mb-4">
                      We've notified <strong>{connectedContractor?.business_name}</strong> about your request.
                    </p>

                    <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
                      <div className="flex items-center gap-3 text-sm text-slate-600 mb-2">
                        <MapPin className="w-4 h-4 text-slate-400" />
                        <span>{locationName || searchZip || 'Your location'}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-600 mb-2">
                        <DollarSign className="w-4 h-4 text-slate-400" />
                        <span>~${((connectedContractor?.hourly_rate || 65) * 2).toFixed(0)} estimated</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-600">
                        <CreditCard className="w-4 h-4 text-slate-400" />
                        <span className="capitalize">{savedCard?.brand} •••• {savedCard?.last4}</span>
                      </div>
                    </div>

                    <p className="text-sm text-slate-500 mb-6">
                      When they accept, your card will be charged and held in escrow until the job is complete.
                    </p>

                    <div className="space-y-3">
                      <button
                        onClick={() => router.push('/dashboard/homeowner')}
                        className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        View in Dashboard
                      </button>
                      <button
                        onClick={onClose}
                        className="w-full py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                      >
                        Close
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
                    <div className="border-b border-slate-200 bg-white flex-shrink-0">
                      <div className="px-3 py-2">
                        <p className="text-[11px] text-slate-400 mb-1.5">{visibleContractors.length} pro{visibleContractors.length > 1 ? 's' : ''} nearby</p>
                        <div className="flex overflow-x-auto gap-1.5 scrollbar-hide">
                          {visibleContractors.map((contractor) => (
                            <button
                              key={contractor.id}
                              onClick={() => handleSwitchContractor(contractor)}
                              className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                selectedContractor?.id === contractor.id
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                              }`}
                            >
                              {contractor.profile_image ? (
                                <img src={contractor.profile_image} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                  selectedContractor?.id === contractor.id ? 'bg-white/20' : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {contractor.business_name?.charAt(0) || 'P'}
                                </div>
                              )}
                              <span className="truncate max-w-[80px]">{contractor.business_name?.split(' ')[0] || 'Pro'}</span>
                              <span className={`text-[10px] flex-shrink-0 ${selectedContractor?.id === contractor.id ? 'text-emerald-200' : 'text-slate-400'}`}>
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

                        {/* Pricing & Stats */}
                        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                          {/* Main Rate */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Base rate</span>
                            <span className="text-lg font-bold text-emerald-600">${selectedContractor.hourly_rate}/hr</span>
                          </div>

                          {/* Rate Grid - Only show if rates exist */}
                          {(selectedContractor.peak_rate || selectedContractor.off_peak_rate || selectedContractor.surge_rate) && (
                            <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100">
                              {selectedContractor.off_peak_rate && (
                                <div className="text-center p-1.5 bg-slate-50 rounded-lg">
                                  <div className="text-xs font-semibold text-slate-700">${selectedContractor.off_peak_rate}</div>
                                  <div className="text-[9px] text-slate-400">Off-peak</div>
                                </div>
                              )}
                              {selectedContractor.peak_rate && (
                                <div className="text-center p-1.5 bg-amber-50 rounded-lg">
                                  <div className="text-xs font-semibold text-amber-700">${selectedContractor.peak_rate}</div>
                                  <div className="text-[9px] text-amber-500">Peak</div>
                                </div>
                              )}
                              {selectedContractor.surge_rate && (
                                <div className="text-center p-1.5 bg-red-50 rounded-lg">
                                  <div className="text-xs font-semibold text-red-700">${selectedContractor.surge_rate}</div>
                                  <div className="text-[9px] text-red-400">Surge</div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Fees - Visit & Diagnostic */}
                          {(selectedContractor.visit_fee || selectedContractor.diagnostic_fee) && (
                            <div className="flex gap-2 pt-1 border-t border-slate-100">
                              {selectedContractor.visit_fee && (
                                <div className="flex-1 flex items-center justify-between px-2 py-1.5 bg-blue-50 rounded-lg">
                                  <span className="text-[10px] text-blue-600">Visit fee</span>
                                  <span className="text-xs font-semibold text-blue-700">${selectedContractor.visit_fee}</span>
                                </div>
                              )}
                              {selectedContractor.diagnostic_fee && (
                                <div className="flex-1 flex items-center justify-between px-2 py-1.5 bg-purple-50 rounded-lg">
                                  <span className="text-[10px] text-purple-600">Diagnostic</span>
                                  <span className="text-xs font-semibold text-purple-700">${selectedContractor.diagnostic_fee}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Quick Stats */}
                          <div className="flex gap-2 pt-1 border-t border-slate-100">
                            <div className="flex-1 text-center">
                              <div className="text-sm font-bold text-slate-900">{selectedContractor.years_in_business}+</div>
                              <div className="text-[9px] text-slate-400">years exp.</div>
                            </div>
                            <div className="flex-1 text-center">
                              <div className="text-sm font-bold text-slate-900">{selectedContractor.response_time_minutes}m</div>
                              <div className="text-[9px] text-slate-400">response</div>
                            </div>
                            <div className="flex-1 text-center">
                              <div className="text-sm font-bold text-slate-900">{selectedContractor.total_jobs}</div>
                              <div className="text-[9px] text-slate-400">jobs done</div>
                            </div>
                          </div>
                        </div>

                        {/* Job Description Input */}
                        <div className="bg-white rounded-lg border border-slate-200 p-3">
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Describe your issue
                          </label>
                          <textarea
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            placeholder={`What ${category?.toLowerCase() || 'service'} help do you need?`}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                            rows={2}
                          />
                        </div>

                        {/* Payment Method Card */}
                        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${savedCard ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${savedCard ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                            <CreditCard className={`w-4 h-4 ${savedCard ? 'text-emerald-600' : 'text-amber-600'}`} />
                          </div>
                          {savedCard ? (
                            <div className="flex-1">
                              <div className="text-xs font-medium text-emerald-800">Payment method</div>
                              <div className="text-sm text-emerald-700 capitalize">{savedCard.brand} •••• {savedCard.last4}</div>
                            </div>
                          ) : (
                            <div className="flex-1">
                              <div className="text-xs font-medium text-amber-800">No payment method</div>
                              <button
                                onClick={() => router.push('/dashboard/homeowner/billing')}
                                className="text-sm text-amber-700 underline hover:text-amber-800"
                              >
                                Connect a card to book
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Payment Error Display */}
                        {paymentError && (
                          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <div className="text-xs font-medium text-red-800">Payment failed</div>
                              <div className="text-sm text-red-700">{paymentError}</div>
                            </div>
                            <button
                              onClick={() => setPaymentError(null)}
                              className="text-red-400 hover:text-red-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {/* Start Job Button - triggers escrow + tracking */}
                        <button
                          onClick={handleConfirmConnection}
                          disabled={bookingLoading}
                          className={`w-full py-3.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg ${
                            bookingLoading
                              ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-slate-300/25'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/25'
                          }`}
                        >
                          {bookingLoading ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Starting Job...
                            </>
                          ) : (
                            <>
                              <Zap className="w-5 h-5" />
                              Start Job with {selectedContractor.business_name?.split(' ')[0]}
                            </>
                          )}
                        </button>

                        {/* Send Direct Offer - alternative option */}
                        {!isDirectPaymentJob && !bookingLoading && (
                          <button
                            onClick={() => setShowOfferModal(true)}
                            className="w-full py-2.5 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          >
                            <DollarSign className="w-4 h-4" />
                            Send Direct Offer Instead
                          </button>
                        )}

                        <p className="text-center text-xs text-slate-500">
                          {bookingLoading ? (
                            'Please wait...'
                          ) : isDirectPaymentJob ? (
                            <>Click to start this job • ${directAmount?.toFixed(0)} held in escrow</>
                          ) : (
                            'Escrow payment held until job is complete'
                          )}
                        </p>

                        {/* Search for another pro link */}
                        {!bookingLoading && (
                          <button
                            onClick={() => {
                              // Stop countdown
                              if (countdownRef.current) {
                                clearInterval(countdownRef.current)
                              }
                              // Reset to searching state
                              setPhase('searching')
                              setConnectedContractor(null)
                              setSelectedContractor(null)
                              setContractors([])
                              setVisibleContractors([])
                              setCountdown(60)
                              // Re-trigger search
                              setHasFetched(false)
                            }}
                            className="w-full mt-2 py-2 text-sm text-slate-500 hover:text-emerald-600 transition-colors"
                          >
                            Search for another pro →
                          </button>
                        )}
                      </motion.div>
                    )}

                    {/* Live Tracking Phase (Uber-style) */}
                    {phase === 'tracking' && connectedContractor && trackingData && !jobCompleted && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        {/* Status Header — changes based on job status */}
                        {trackingJobStatus === 'confirmed' && (
                          <div className="bg-emerald-600 rounded-xl p-4 text-white text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <Navigation className="w-6 h-6" />
                              <span className="font-bold text-lg">Contractor En Route</span>
                            </div>
                            <p className="text-emerald-100 text-sm">Payment held securely in escrow</p>
                          </div>
                        )}
                        {trackingJobStatus === 'in_progress' && !contractorMarkedComplete && (
                          <div className="bg-blue-600 rounded-xl p-4 text-white text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <Briefcase className="w-6 h-6" />
                              <span className="font-bold text-lg">Contractor Has Arrived</span>
                            </div>
                            <p className="text-blue-100 text-sm">Work is now in progress</p>
                          </div>
                        )}
                        {contractorMarkedComplete && (
                          <div className="bg-amber-500 rounded-xl p-4 text-white text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <CheckCircle className="w-6 h-6" />
                              <span className="font-bold text-lg">Work Complete</span>
                            </div>
                            <p className="text-amber-100 text-sm">Contractor marked this job as complete</p>
                          </div>
                        )}

                        {/* ETA Countdown — only show when en route */}
                        {trackingJobStatus === 'confirmed' && (
                          <div className="bg-slate-900 rounded-xl p-6 text-center">
                            <div className="flex items-center justify-center gap-2 mb-3">
                              <Navigation className="w-5 h-5 text-emerald-400 animate-pulse" />
                              <span className="text-slate-400 text-sm font-medium">EN ROUTE</span>
                            </div>
                            <div className="text-5xl font-bold text-white mb-1">
                              {Math.floor(trackingEtaCountdown / 60)}:{(trackingEtaCountdown % 60).toString().padStart(2, '0')}
                            </div>
                            <p className="text-slate-400 text-sm">Estimated arrival</p>
                            <div className="mt-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-emerald-500"
                                initial={{ width: '0%' }}
                                animate={{
                                  width: `${100 - ((trackingEtaCountdown / (trackingData.etaMinutes * 60)) * 100)}%`
                                }}
                                transition={{ duration: 1 }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Final Price Proposal — homeowner needs to accept/decline */}
                        {contractorMarkedComplete && proposedFinalPrice !== null && !finalPriceAccepted && Math.abs(proposedFinalPrice - trackingData.amount) >= 0.01 && (
                          <div className="bg-white rounded-xl border-2 border-amber-300 p-4">
                            <h4 className="font-semibold text-slate-900 mb-3">Price Adjustment Proposed</h4>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm text-slate-500">Original price</span>
                              <span className="text-slate-700 font-medium">${trackingData.amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm text-slate-500">Proposed price</span>
                              <span className="text-slate-900 font-bold text-lg">${proposedFinalPrice.toFixed(2)}</span>
                            </div>
                            {proposedFinalPrice > trackingData.amount && (
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm text-slate-500">Additional charge</span>
                                <span className="text-red-600 font-medium">+${(proposedFinalPrice - trackingData.amount).toFixed(2)}</span>
                              </div>
                            )}
                            {finalPriceReason && (
                              <div className="bg-slate-50 rounded-lg p-3 mt-2 mb-3">
                                <p className="text-xs text-slate-500 mb-1">Reason</p>
                                <p className="text-sm text-slate-700">{finalPriceReason}</p>
                              </div>
                            )}
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={() => handleFinalPriceResponse(false)}
                                disabled={completionSubmitting}
                                className="flex-1 py-3 rounded-xl font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                              >
                                Decline
                              </button>
                              <button
                                onClick={() => handleFinalPriceResponse(true)}
                                disabled={completionSubmitting}
                                className="flex-1 py-3 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {completionSubmitting ? 'Processing...' : 'Accept Price'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Confirm Completion — after price accepted or no price change */}
                        {contractorMarkedComplete && (finalPriceAccepted || proposedFinalPrice === null || Math.abs((proposedFinalPrice || 0) - trackingData.amount) < 0.01) && (
                          <button
                            onClick={handleConfirmCompletion}
                            disabled={completionSubmitting}
                            className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold text-base hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            {completionSubmitting ? 'Confirming...' : 'Confirm & Release Payment'}
                          </button>
                        )}

                        {/* Contractor Card - Compact */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <div className="flex items-center gap-3">
                            {connectedContractor.profile_image ? (
                              <img
                                src={connectedContractor.profile_image}
                                alt={connectedContractor.business_name}
                                className="w-14 h-14 rounded-full object-cover border-2 border-emerald-500"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center border-2 border-emerald-500">
                                <span className="text-white font-bold text-xl">
                                  {connectedContractor.business_name?.charAt(0) || 'P'}
                                </span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-slate-900 truncate">
                                {connectedContractor.business_name}
                              </h3>
                              <div className="flex items-center gap-1.5">
                                <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                                <span className="text-sm text-slate-600">{connectedContractor.rating.toFixed(1)}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-sm text-slate-500">{connectedContractor.total_jobs} jobs</span>
                              </div>
                            </div>
                          </div>

                          {/* Contact Actions */}
                          <div className="flex gap-2 mt-4">
                            <button
                              onClick={() => {
                                alert('Calling contractor... (feature coming soon)')
                              }}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                            >
                              <Phone className="w-4 h-4" />
                              <span className="text-sm font-medium">Call</span>
                            </button>
                            <button
                              onClick={() => {
                                if (trackingData?.conversationId) {
                                  router.push(`/messages/real-time?conversation=${trackingData.conversationId}`)
                                } else {
                                  router.push('/messages/real-time')
                                }
                              }}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg transition-colors"
                            >
                              <MessageCircle className="w-4 h-4" />
                              <span className="text-sm font-medium">Message</span>
                            </button>
                          </div>
                        </div>

                        {/* Payment Summary */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Amount held</span>
                            <span className="font-semibold text-slate-900">${(proposedFinalPrice && finalPriceAccepted ? proposedFinalPrice : trackingData.amount).toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Payment method</span>
                            <span className="text-sm text-slate-700 capitalize">{savedCard?.brand} •••• {savedCard?.last4}</span>
                          </div>
                          <div className="pt-2 border-t border-slate-100">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Shield className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{contractorMarkedComplete ? 'Confirm completion to release payment' : 'Funds held in escrow until job completion'}</span>
                            </div>
                          </div>
                        </div>

                        {!contractorMarkedComplete && (
                          <div className="flex gap-2">
                            <button
                              onClick={onClose}
                              className="flex-1 py-2.5 text-slate-500 hover:text-slate-700 transition-colors text-sm"
                            >
                              Close & track later
                            </button>
                            {trackingJobStatus === 'confirmed' && (
                              <button
                                onClick={() => setShowCancelModal(true)}
                                className="flex-1 py-2.5 text-red-500 hover:text-red-700 transition-colors text-sm font-medium"
                              >
                                Cancel Job
                              </button>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* Job Complete Success */}
                    {phase === 'tracking' && jobCompleted && connectedContractor && trackingData && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-4"
                      >
                        <div className="text-center py-4">
                          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-12 h-12 text-emerald-600" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900 mb-1">Job Complete!</h3>
                          <p className="text-slate-500 text-sm">Payment has been released to {connectedContractor.business_name}</p>
                        </div>

                        <div className="bg-emerald-50 rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600">Total paid</span>
                            <span className="font-bold text-slate-900 text-lg">${(proposedFinalPrice && finalPriceAccepted ? proposedFinalPrice : trackingData.amount).toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600">Contractor</span>
                            <span className="text-sm text-slate-700">{connectedContractor.business_name}</span>
                          </div>
                        </div>

                        <button
                          onClick={onClose}
                          className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
                        >
                          Done
                        </button>
                      </motion.div>
                    )}

                    {/* Cancellation Modal */}
                    <AnimatePresence>
                      {showCancelModal && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
                          onClick={() => !cancelLoading && setShowCancelModal(false)}
                        >
                          <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
                          >
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-lg font-semibold text-slate-900">Cancel Job</h3>
                              <button
                                onClick={() => !cancelLoading && setShowCancelModal(false)}
                                className="p-1 hover:bg-slate-100 rounded-lg"
                                disabled={cancelLoading}
                              >
                                <X className="w-5 h-5 text-slate-500" />
                              </button>
                            </div>

                            <div className="text-center mb-4">
                              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <AlertTriangle className="w-7 h-7 text-red-600" />
                              </div>
                              <p className="text-slate-600">
                                Are you sure you want to cancel this job with <strong>{connectedContractor?.business_name}</strong>?
                              </p>
                              <p className="text-sm text-slate-500 mt-2">
                                The payment hold will be released and the contractor will be notified.
                              </p>
                            </div>

                            <div className="mb-4">
                              <label className="block text-sm font-medium text-slate-700 mb-2">
                                Reason for cancellation <span className="text-red-500">*</span>
                              </label>
                              <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Please explain why you're cancelling..."
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                                rows={3}
                                disabled={cancelLoading}
                              />
                            </div>

                            <div className="flex gap-3">
                              <button
                                onClick={() => setShowCancelModal(false)}
                                disabled={cancelLoading}
                                className="flex-1 py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                              >
                                Keep Job
                              </button>
                              <button
                                onClick={handleJobCancellation}
                                disabled={cancelLoading || !cancelReason.trim()}
                                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                              >
                                {cancelLoading ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Cancelling...
                                  </>
                                ) : (
                                  'Confirm Cancel'
                                )}
                              </button>
                            </div>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Direct Payment Job - Waiting for Contractors (searching phase) */}
                    {isDirectPaymentJob && phase === 'searching' && directJobStatus === 'pending' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        {/* Direct Payment Header */}
                        <div className="bg-emerald-600 rounded-xl p-4 text-white text-center">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <DollarSign className="w-6 h-6" />
                            <span className="font-bold text-lg">Direct Payment Job</span>
                          </div>
                          <p className="text-emerald-100 text-sm">Waiting for contractors to accept</p>
                        </div>

                        {/* Amount Display */}
                        <div className="bg-white rounded-xl border-2 border-emerald-200 p-6 text-center">
                          <div className="text-sm text-slate-500 mb-1">Your Offer</div>
                          <div className="text-4xl font-bold text-emerald-600">${directAmount?.toFixed(2) || '0.00'}</div>
                          <div className="text-xs text-slate-400 mt-1">Fixed price - no bidding</div>
                        </div>

                        {/* Countdown Timer */}
                        <div className="bg-white rounded-xl p-5 text-center border-2 border-slate-200">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <Clock className="w-4 h-4 text-emerald-600" />
                            <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">Finding Pros</span>
                          </div>
                          <div className={`text-5xl font-bold font-mono ${expiryCountdown <= 5 ? 'text-red-600' : expiryCountdown <= 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {expiryCountdown}s
                          </div>
                          <p className="text-slate-500 text-xs mt-2">
                            Switching to bids if no contractors accept
                          </p>

                          {/* Progress Bar */}
                          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full ${expiryCountdown <= 5 ? 'bg-red-500' : expiryCountdown <= 10 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              initial={{ width: '100%' }}
                              animate={{
                                width: `${(expiryCountdown / 15) * 100}%`
                              }}
                              transition={{ duration: 1 }}
                            />
                          </div>
                        </div>

                        {/* Status Indicator */}
                        <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
                          <div className="relative">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <Zap className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-blue-800">Broadcasting to nearby pros</div>
                            <div className="text-xs text-blue-600">Contractors can accept your offer</div>
                          </div>
                        </div>

                        {/* What Happens Next */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <h4 className="text-sm font-semibold text-slate-700 mb-3">What happens next?</h4>
                          <div className="space-y-2.5">
                            <div className="flex items-start gap-2.5">
                              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-xs font-bold text-emerald-600">1</span>
                              </div>
                              <p className="text-xs text-slate-600">Contractors in your area see the job and accept</p>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-xs font-bold text-emerald-600">2</span>
                              </div>
                              <p className="text-xs text-slate-600">You browse profiles and click "Start Job" on the one you want</p>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-xs font-bold text-emerald-600">3</span>
                              </div>
                              <p className="text-xs text-slate-600">Payment is held in escrow until job completion</p>
                            </div>
                          </div>
                        </div>

                        {/* Cancel Button */}
                        <button
                          onClick={handleCancel}
                          className="w-full py-2.5 text-slate-500 hover:text-red-600 transition-colors text-sm border border-slate-200 rounded-lg hover:border-red-300"
                        >
                          Cancel job
                        </button>
                      </motion.div>
                    )}

                    {/* Direct Payment Job - Expired */}
                    {isDirectPaymentJob && directJobStatus === 'expired' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        <div className="bg-emerald-600 rounded-xl p-4 text-white text-center">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <CheckCircle className="w-6 h-6" />
                            <span className="font-bold text-lg">Switched to Bids</span>
                          </div>
                          <p className="text-emerald-100 text-sm">Your job is now open for bids</p>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Users className="w-7 h-7 text-emerald-600" />
                          </div>
                          <h3 className="font-semibold text-slate-900 mb-1">You'll receive bids shortly</h3>
                          <p className="text-sm text-slate-600">
                            Contractors have been notified. They'll submit bids and you can choose the best offer.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <button
                            onClick={() => router.push('/dashboard/homeowner')}
                            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
                          >
                            View Job in Dashboard
                          </button>
                          <button
                            onClick={onClose}
                            className="w-full py-2.5 text-slate-500 hover:text-slate-700 transition-colors text-sm"
                          >
                            Close
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* Searching State */}
                    {phase === 'searching' && !isDirectPaymentJob && (
                      <div className="flex flex-col items-center justify-center h-full">
                        {currentLocation || userLocation ? (
                          <>
                            {/* Spinner with countdown */}
                            <div className="relative w-16 h-16 mb-4">
                              <div className="absolute inset-0 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-bold text-emerald-700">{searchCountdown}s</span>
                              </div>
                            </div>
                            <p className="text-slate-900 font-semibold">Finding {getTradePlural(category)}...</p>
                            <p className="text-slate-500 text-sm mt-1">Searching nearby professionals</p>
                          </>
                        ) : (
                          <>
                            <MapPin className="w-14 h-14 text-slate-300 mb-4" />
                            <p className="text-slate-900 font-semibold">Location Required</p>
                            <p className="text-slate-500 text-sm mt-1 text-center px-4">
                              We need your location to find nearby professionals
                            </p>
                          </>
                        )}

                        <button
                          onClick={() => {
                            onClose()
                            router.push('/post-job?category=' + encodeURIComponent(category))
                          }}
                          className="mt-6 px-4 py-2 text-sm text-slate-600 hover:text-emerald-600 border border-slate-200 hover:border-emerald-300 rounded-lg transition-colors"
                        >
                          Post a job instead →
                        </button>
                      </div>
                    )}

                    {/* No Pros State */}
                    {phase === 'no_pros' && (
                      <div className="flex flex-col h-full">
                        {nearbyContractors.length > 0 && !selectedContractor ? (
                          /* Nearby contractors list */
                          <>
                            <div className="px-4 pt-4 pb-2">
                              <p className="text-slate-900 font-semibold text-lg">
                                {nearbyContractors.length} {getTradePlural(category)} in Your Area
                              </p>
                              <p className="text-slate-500 text-sm mt-1">
                                Not instantly available — send a direct offer
                              </p>
                            </div>

                            <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-2">
                              {nearbyContractors.map((c) => (
                                <div
                                  key={c.id}
                                  className="w-full bg-white rounded-xl p-3 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors text-left"
                                >
                                  <button
                                    onClick={() => setSelectedContractor(c)}
                                    className="w-full text-left"
                                  >
                                    <div className="flex items-center gap-3">
                                      {c.profile_image ? (
                                        <img src={c.profile_image} alt={c.business_name} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                                      ) : (
                                        <div className="w-11 h-11 rounded-xl bg-slate-500 flex items-center justify-center flex-shrink-0">
                                          <span className="text-white font-bold text-lg">{c.business_name?.charAt(0) || 'P'}</span>
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-slate-900 text-sm truncate">{c.business_name}</h4>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          <div className="flex items-center gap-0.5">
                                            <Star className="w-3 h-3 text-amber-500 fill-current" />
                                            <span className="text-xs font-medium text-slate-700">{c.rating.toFixed(1)}</span>
                                          </div>
                                          <span className="text-slate-300">·</span>
                                          <span className="text-xs text-slate-500">{c.distance_miles.toFixed(1)} mi</span>
                                          <span className="text-slate-300">·</span>
                                          <span className="text-xs font-medium text-slate-600">${c.hourly_rate}/hr</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${c.availability === 'online' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                          <span className="text-[10px] text-slate-400 capitalize">{c.availability}</span>
                                          {c.categories?.[0] && (
                                            <>
                                              <span className="text-slate-300">·</span>
                                              <span className="text-[10px] text-slate-400">{c.categories[0]}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                                    </div>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedContractor(c)
                                      setShowOfferModal(true)
                                    }}
                                    className="w-full mt-2 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
                                  >
                                    <DollarSign className="w-3.5 h-3.5" />
                                    Send Direct Offer
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="px-4 py-3 space-y-2 border-t border-slate-100">
                              <button
                                onClick={() => {
                                  onClose()
                                  router.push(`/post-job${category ? `?category=${encodeURIComponent(category)}` : ''}`)
                                }}
                                className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors text-sm"
                              >
                                Post a Job Instead
                              </button>
                              <button
                                onClick={onClose}
                                className="w-full px-4 py-2 text-slate-500 hover:text-slate-700 transition-colors text-xs"
                              >
                                Close
                              </button>
                            </div>
                          </>
                        ) : nearbyContractors.length > 0 && selectedContractor ? (
                          /* Selected contractor profile */
                          <div className="flex flex-col h-full">
                            <div className="px-4 pt-3 pb-2">
                              <button
                                onClick={() => setSelectedContractor(null)}
                                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                              >
                                <ChevronLeft className="w-4 h-4" />
                                Back to list
                              </button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-4 space-y-3">
                              {/* Profile Card */}
                              <div className="bg-white rounded-xl p-4 border border-slate-200">
                                <div className="flex items-start gap-3">
                                  {selectedContractor.profile_image ? (
                                    <img src={selectedContractor.profile_image} alt={selectedContractor.business_name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                                  ) : (
                                    <div className="w-14 h-14 rounded-xl bg-slate-500 flex items-center justify-center flex-shrink-0">
                                      <span className="text-white font-bold text-xl">{selectedContractor.business_name?.charAt(0) || 'P'}</span>
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-slate-900 truncate">{selectedContractor.business_name}</h3>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                                      <span className="font-medium text-sm text-slate-900">{selectedContractor.rating.toFixed(1)}</span>
                                      <span className="text-slate-300 ml-1">·</span>
                                      <span className="text-xs text-slate-500 ml-1">{selectedContractor.total_jobs} jobs</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Verified
                                      </span>
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        selectedContractor.availability === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                      }`}>
                                        {selectedContractor.availability === 'online' ? 'Online' : 'Offline'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Distance & Rate */}
                              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-lg font-bold text-slate-700">{selectedContractor.distance_miles.toFixed(1)} mi</div>
                                    <div className="text-xs text-slate-500">away</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-lg font-bold text-emerald-600">${selectedContractor.hourly_rate}/hr</div>
                                    <div className="text-xs text-slate-500">Base rate</div>
                                  </div>
                                </div>
                              </div>

                              {/* Categories */}
                              {selectedContractor.categories?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedContractor.categories.map((cat, i) => (
                                    <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs">{cat}</span>
                                  ))}
                                </div>
                              )}

                              {/* Bio */}
                              {selectedContractor.bio && (
                                <p className="text-sm text-slate-600">{selectedContractor.bio}</p>
                              )}

                              {/* Stats */}
                              <div className="grid grid-cols-2 gap-2">
                                {selectedContractor.years_in_business && (
                                  <div className="bg-white rounded-lg p-2 border border-slate-100 text-center">
                                    <div className="text-sm font-semibold text-slate-900">{selectedContractor.years_in_business} yrs</div>
                                    <div className="text-[10px] text-slate-400">Experience</div>
                                  </div>
                                )}
                                {selectedContractor.response_time_minutes && (
                                  <div className="bg-white rounded-lg p-2 border border-slate-100 text-center">
                                    <div className="text-sm font-semibold text-slate-900">{selectedContractor.response_time_minutes} min</div>
                                    <div className="text-[10px] text-slate-400">Avg. response</div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="px-4 py-3 space-y-2 border-t border-slate-100">
                              {/* Start Job - primary action: triggers escrow + booking */}
                              <button
                                onClick={() => handleConfirmConnection(selectedContractor)}
                                disabled={bookingLoading}
                                className={`w-full py-3.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg ${
                                  bookingLoading
                                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/25'
                                }`}
                              >
                                {bookingLoading ? (
                                  <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Starting Job...
                                  </>
                                ) : (
                                  <>
                                    <Zap className="w-5 h-5" />
                                    Start Job with {selectedContractor.business_name?.split(' ')[0]}
                                  </>
                                )}
                              </button>
                              {/* Send Direct Offer - secondary option */}
                              <button
                                onClick={() => setShowOfferModal(true)}
                                className="w-full py-2.5 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              >
                                <DollarSign className="w-4 h-4" />
                                Send Direct Offer Instead
                              </button>
                              <button
                                onClick={() => {
                                  onClose()
                                  router.push(`/post-job${category ? `?category=${encodeURIComponent(category)}` : ''}`)
                                }}
                                className="w-full py-2 text-slate-400 hover:text-slate-600 transition-colors text-xs"
                              >
                                Post a Job Instead
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* No contractors at all */
                          <div className="flex flex-col items-center justify-center h-full text-center px-4">
                            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                              <Users className="w-8 h-8 text-amber-600" />
                            </div>
                            <p className="text-slate-900 font-semibold text-lg">No {getTradePlural(category)} Available Right Now</p>
                            <p className="text-slate-500 text-sm mt-2 max-w-xs">
                              No {getTradePlural(category).toLowerCase()} are in your area yet. Post a job and receive bids from contractors shortly.
                            </p>
                            <div className="mt-6 space-y-3 w-full max-w-xs">
                              <button
                                onClick={() => {
                                  onClose()
                                  router.push(`/post-job${category ? `?category=${encodeURIComponent(category)}` : ''}`)
                                }}
                                className="w-full px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors"
                              >
                                Post a Job
                              </button>
                              <button
                                onClick={onClose}
                                className="w-full px-6 py-2.5 text-slate-500 hover:text-slate-700 transition-colors text-sm"
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Map Area - takes all remaining space */}
              <div className="flex-1 h-full min-w-0 bg-slate-100">
                <ContractorMap
                  contractors={visibleContractors}
                  userLocation={currentLocation || userLocation || undefined}
                  selectedContractor={selectedContractor}
                  radiusMiles={searchRadius}
                  onSelectContractor={(c) => {
                    // ContractorMap returns its own simpler Contractor type — cast to full type
                    const fullContractor = visibleContractors.find(vc => vc.id === c.id) || c as any as Contractor
                    if (phase === 'connected') {
                      handleSwitchContractor(fullContractor)
                    } else {
                      setSelectedContractor(fullContractor)
                    }
                  }}
                  onRouteCalculated={(eta, distance) => {
                    setRealEta(eta)
                    setRealDistance(distance)
                    // Update the selected contractor's ETA in the arrays to sync map markers
                    if (selectedContractor) {
                      setVisibleContractors(prev => prev.map(c =>
                        c.id === selectedContractor.id
                          ? { ...c, eta_minutes: eta, distance_miles: distance }
                          : c
                      ))
                      setContractors(prev => prev.map(c =>
                        c.id === selectedContractor.id
                          ? { ...c, eta_minutes: eta, distance_miles: distance }
                          : c
                      ))
                    }
                  }}
                />
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>

    {/* Direct Offer Modal - rendered via portal to escape stacking context */}
    {showOfferModal && selectedContractor && typeof document !== 'undefined' && createPortal(
      <OfferJobModal
        contractor={{
          id: selectedContractor.id,
          name: selectedContractor.business_name,
          services: selectedContractor.categories,
          rating: selectedContractor.rating
        }}
        onClose={() => setShowOfferModal(false)}
        onSuccess={() => {
          setShowOfferModal(false)
          onClose()
          router.push('/dashboard/homeowner/offers')
        }}
      />,
      document.body
    )}
    </>
  )
}
