'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import OfferJobModal from '../../../components/OfferJobModal'
import { openAuth } from '../../../components/AuthModal'
import { getCurrentLocation } from '../../../lib/nativeLocation'
import {
  MapPin,
  Star,
  BadgeCheck,
  DollarSign,
  Briefcase,
  Award,
  Shield,
  ChevronLeft,
  Clock,
  Navigation
} from 'lucide-react'
import { safeBack } from '../../../lib/safeBack'
import { Capacitor } from '@capacitor/core'

// Dynamically import Mapbox to avoid SSR issues
let mapboxgl: any = null
if (typeof window !== 'undefined') {
  import('mapbox-gl').then((module) => {
    mapboxgl = module.default
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  })
  import('mapbox-gl/dist/mapbox-gl.css')
}

interface ContractorProfile {
  id: string
  name: string
  email: string
  phone?: string
  business_name?: string
  description?: string
  specialties?: string[]
  rating?: number
  total_reviews?: number
  completed_jobs?: number
  years_experience?: number
  hourly_rate?: number
  base_zip?: string
  city?: string
  state?: string
  service_area_zips?: string[]
  license_number?: string
  insurance_carrier?: string
  verified?: boolean
  kyc_status?: string
  avatar_url?: string
  latitude?: number
  longitude?: number
}

interface RouteInfo {
  eta: number // minutes
  distance: string // e.g., "5.2 mi"
  geometry: any // GeoJSON for route line
}

export default function ContractorProfilePage() {
  const params = useParams()
  const router = useRouter()
  const contractorId = params.id as string
  const { user, userProfile, loading: authLoading } = useAuth()

  const [contractor, setContractor] = useState<ContractorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false)

  // Map refs
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const contractorMarker = useRef<any>(null)
  const userMarker = useRef<any>(null)
  const [mapboxReady, setMapboxReady] = useState(false)

  // Detect iOS native platform - check immediately for correct initial render
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

  // Load mapbox dynamically
  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('mapbox-gl').then((module) => {
        mapboxgl = module.default
        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
        setMapboxReady(true)
      })
    }
  }, [])

  // Fetch contractor profile
  useEffect(() => {
    const loadContractorProfile = async () => {
      try {
        setLoading(true)

        const { data: proContractor, error: proError } = await supabase
          .from('pro_contractors')
          .select('*')
          .eq('id', contractorId)
          .single()

        if (proError && proError.code !== 'PGRST116') {
          throw proError
        }

        if (proContractor) {
          setContractor({
            id: proContractor.id,
            name: proContractor.name || 'Professional Contractor',
            email: proContractor.email,
            phone: proContractor.phone,
            business_name: proContractor.business_name,
            description: proContractor.bio || proContractor.description,
            specialties: proContractor.specialties || [],
            rating: proContractor.rating || 0,
            total_reviews: proContractor.total_reviews || 0,
            completed_jobs: proContractor.completed_jobs || 0,
            years_experience: proContractor.years_experience || 0,
            hourly_rate: proContractor.hourly_rate,
            base_zip: proContractor.base_zip,
            city: proContractor.city,
            state: proContractor.state,
            service_area_zips: proContractor.service_area_zips || [],
            license_number: proContractor.license_number,
            insurance_carrier: proContractor.insurance_carrier,
            verified: proContractor.kyc_status === 'completed',
            kyc_status: proContractor.kyc_status,
            avatar_url: proContractor.logo_url || proContractor.avatar_url,
            latitude: proContractor.latitude,
            longitude: proContractor.longitude
          })
        } else {
          setError('Contractor not found')
        }
      } catch (err: any) {
        console.error('Error loading contractor:', err)
        setError(err.message || 'Failed to load contractor profile')
      } finally {
        setLoading(false)
      }
    }

    if (contractorId) {
      loadContractorProfile()
    }
  }, [contractorId])

  // Get user's current location
  useEffect(() => {
    const fetchUserLocation = async () => {
      try {
        const result = await getCurrentLocation()
        if (result.success && result.coordinates) {
          setUserLocation({
            lat: result.coordinates.latitude,
            lng: result.coordinates.longitude
          })
        }
      } catch (error) {
        console.error('[ContractorProfile] Location error:', error)
      }
    }

    fetchUserLocation()
  }, [])

  // Initialize map when contractor data is available and mapbox is loaded
  useEffect(() => {
    if (!mapContainer.current || !contractor || map.current || !mapboxReady || !mapboxgl) return
    if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return

    // Use contractor location or default to NYC
    const contractorLat = contractor.latitude || 40.7128
    const contractorLng = contractor.longitude || -74.006

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [contractorLng, contractorLat],
        zoom: 13,
        attributionControl: false
      })

      // Add contractor marker (truck icon)
      const contractorEl = document.createElement('div')
      contractorEl.innerHTML = `
        <div style="
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #10b981, #059669);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
          border: 3px solid white;
        ">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
          </svg>
        </div>
      `

      contractorMarker.current = new mapboxgl.Marker(contractorEl)
        .setLngLat([contractorLng, contractorLat])
        .addTo(map.current)
    } catch (error) {
      console.error('[ContractorProfile] Error initializing map:', error)
    }

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [contractor, mapboxReady])

  // Add user marker and calculate route when user location is available
  useEffect(() => {
    if (!map.current || !userLocation || !contractor || !mapboxgl) return

    const contractorLat = contractor.latitude || 40.7128
    const contractorLng = contractor.longitude || -74.006

    try {
      // Add user marker (home icon)
      if (!userMarker.current) {
        const userEl = document.createElement('div')
        userEl.innerHTML = `
          <div style="
            width: 40px;
            height: 40px;
            background: #3b82f6;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
            border: 3px solid white;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
          </div>
        `

        userMarker.current = new mapboxgl.Marker(userEl)
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map.current)
      }

      // Fit map bounds to show both markers
      const bounds = new mapboxgl.LngLatBounds()
      bounds.extend([contractorLng, contractorLat])
      bounds.extend([userLocation.lng, userLocation.lat])
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 14 })

      // Fetch driving directions and draw route
      fetchRoute(contractorLat, contractorLng, userLocation.lat, userLocation.lng)
    } catch (error) {
      console.error('[ContractorProfile] Error adding user marker:', error)
    }
  }, [userLocation, contractor, mapboxReady])

  // Fetch route from Mapbox Directions API
  const fetchRoute = async (
    contractorLat: number,
    contractorLng: number,
    userLat: number,
    userLng: number
  ) => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${contractorLng},${contractorLat};${userLng},${userLat}?geometries=geojson&overview=full&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
      )
      const data = await response.json()

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0]
        const etaMinutes = Math.round(route.duration / 60)
        const distanceMiles = (route.distance / 1609.34).toFixed(1)

        setRouteInfo({
          eta: etaMinutes,
          distance: `${distanceMiles} mi`,
          geometry: route.geometry
        })

        // Draw route on map
        if (map.current && map.current.getSource('route')) {
          // Update existing source
          ;(map.current.getSource('route') as any).setData(route.geometry)
        } else if (map.current) {
          // Add new source and layer
          map.current.on('load', () => {
            addRouteToMap(route.geometry)
          })

          // If map already loaded
          if (map.current.isStyleLoaded()) {
            addRouteToMap(route.geometry)
          }
        }
      }
    } catch (error) {
      console.error('[ContractorProfile] Route fetch error:', error)
    }
  }

  const addRouteToMap = (geometry: any) => {
    if (!map.current) return

    // Remove existing route if any
    if (map.current.getLayer('route')) {
      map.current.removeLayer('route')
    }
    if (map.current.getSource('route')) {
      map.current.removeSource('route')
    }

    // Add route source
    map.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: geometry
      }
    })

    // Add route layer (dashed line like Uber)
    map.current.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#10b981',
        'line-width': 5,
        'line-opacity': 0.8
      }
    })
  }

  // Loading state
  if (loading) {
    if (isNative) {
      return (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center"
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
          <p className="text-white/80 text-sm mt-6">Loading contractor...</p>
          <style jsx>{`
            @keyframes ping {
              0% { transform: scale(1); opacity: 0.8; }
              75%, 100% { transform: scale(1.3); opacity: 0; }
            }
          `}</style>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col items-center">
          <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
            <div className="absolute inset-0 rounded-full border-emerald-200 border-t-emerald-600 animate-spin" style={{ borderWidth: 3 }} />
            <img
              src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg"
              alt="Rushr"
              style={{ width: 44, height: 44 }}
              className="object-contain"
            />
          </div>
          <p className="text-slate-600 text-sm mt-3">Loading contractor...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !contractor) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Contractor Not Found</h2>
            <p className="text-slate-600 mb-6">{error || 'The contractor profile you are looking for does not exist.'}</p>
          </div>
          <div className="space-y-3">
            <button onClick={() => router.push('/find-pro')} className="block w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium">
              Find Other Contractors
            </button>
            <button onClick={() => safeBack(router, '/')} className="block w-full bg-slate-100 text-slate-700 px-6 py-3 rounded-lg hover:bg-slate-200 transition-colors font-medium">
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  const displayRating = contractor.rating || 0
  const displayReviews = contractor.total_reviews || 0

  // iOS Native Layout with Full-Screen Map + Bottom Sheet
  if (isNative) {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        {/* iOS Native Green Header */}
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
              <ChevronLeft className="w-6 h-6" />
              <span className="ml-1 font-medium">Home</span>
            </button>
            <h1 className="flex-1 text-center text-white font-semibold text-lg pr-12">
              Contractor
            </h1>
          </div>
        </div>

        {/* Full-Screen Map */}
        <div className="flex-1 relative">
          <div ref={mapContainer} className="w-full h-full" />

          {/* ETA Overlay Card */}
          {routeInfo && (
            <div
              className="absolute top-4 left-4 right-4 bg-white rounded-2xl shadow-lg p-4"
              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                  >
                    <Clock className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{routeInfo.eta} min</div>
                    <div className="text-gray-500 text-sm">away from you</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-gray-600">
                    <Navigation className="w-4 h-4" />
                    <span className="font-medium">{routeInfo.distance}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">driving</div>
                </div>
              </div>
            </div>
          )}

          {/* Loading route indicator */}
          {!routeInfo && userLocation && (
            <div className="absolute top-4 left-4 right-4 bg-white rounded-2xl shadow-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center animate-pulse">
                  <Clock className="w-4 h-4 text-emerald-600" />
                </div>
                <span className="text-gray-600">Calculating route...</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Sheet - Contractor Profile */}
        <div
          className={`bg-white rounded-t-3xl shadow-2xl transition-all duration-300 ${
            bottomSheetExpanded ? 'max-h-[70vh]' : 'max-h-[45vh]'
          } overflow-hidden`}
          style={{
            boxShadow: '0 -8px 30px rgba(0,0,0,0.15)',
            paddingBottom: 'env(safe-area-inset-bottom, 34px)'
          }}
        >
          {/* Drag Handle */}
          <div
            className="py-3 flex justify-center cursor-pointer"
            onClick={() => setBottomSheetExpanded(!bottomSheetExpanded)}
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Profile Content */}
          <div className="px-5 pb-4 overflow-auto" style={{ maxHeight: bottomSheetExpanded ? '60vh' : '35vh' }}>
            {/* Header Row */}
            <div className="flex gap-4 mb-4">
              {/* Avatar */}
              {contractor.avatar_url ? (
                <img
                  src={contractor.avatar_url}
                  alt={contractor.business_name || contractor.name}
                  className="w-16 h-16 rounded-2xl object-contain border border-gray-200 bg-white p-1"
                />
              ) : (
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-xl font-bold text-emerald-600">
                  {contractor.name.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900">
                    {contractor.business_name || contractor.name}
                  </h2>
                  {contractor.verified && (
                    <BadgeCheck className="h-5 w-5 text-blue-500" />
                  )}
                </div>
                {contractor.business_name && (
                  <p className="text-gray-500 text-sm">{contractor.name}</p>
                )}

                {/* Rating */}
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    <span className="font-semibold text-gray-900">{displayRating.toFixed(1)}</span>
                  </div>
                  <span className="text-gray-400 text-sm">({displayReviews} reviews)</span>
                </div>
              </div>
            </div>

            {/* Location */}
            {(contractor.city || contractor.state) && (
              <div className="flex items-center gap-1 text-gray-500 text-sm mb-4">
                <MapPin className="h-4 w-4" />
                <span>{contractor.city}, {contractor.state}</span>
              </div>
            )}

            {/* Specialties */}
            {contractor.specialties && contractor.specialties.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {contractor.specialties.slice(0, 5).map((specialty, idx) => (
                  <span key={idx} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
                    {specialty}
                  </span>
                ))}
                {contractor.specialties.length > 5 && (
                  <span className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                    +{contractor.specialties.length - 5}
                  </span>
                )}
              </div>
            )}

            {/* Quick Stats */}
            <div className="flex gap-4 mb-4 py-3 border-t border-b border-gray-100">
              {contractor.completed_jobs ? (
                <div className="flex items-center gap-1.5 text-gray-600 text-sm">
                  <Briefcase className="h-4 w-4" />
                  <span>{contractor.completed_jobs} jobs</span>
                </div>
              ) : null}
              {contractor.years_experience ? (
                <div className="flex items-center gap-1.5 text-gray-600 text-sm">
                  <Award className="h-4 w-4" />
                  <span>{contractor.years_experience} years</span>
                </div>
              ) : null}
              {contractor.hourly_rate ? (
                <div className="flex items-center gap-1.5 text-gray-600 text-sm">
                  <DollarSign className="h-4 w-4" />
                  <span>${contractor.hourly_rate}/hr</span>
                </div>
              ) : null}
            </div>

            {/* About Section */}
            {contractor.description && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">About</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{contractor.description}</p>
              </div>
            )}

            {/* Credentials */}
            {(contractor.license_number || contractor.insurance_carrier || contractor.verified) && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Credentials
                </h3>
                <div className="space-y-2">
                  {contractor.license_number && contractor.license_number !== 'pending' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">License</span>
                      <span className="text-gray-900 font-medium">{contractor.license_number}</span>
                    </div>
                  )}
                  {contractor.insurance_carrier && contractor.insurance_carrier !== 'pending' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Insurance</span>
                      <span className="text-gray-900 font-medium">{contractor.insurance_carrier}</span>
                    </div>
                  )}
                  {contractor.verified && (
                    <div className="flex items-center gap-2 text-green-600 text-sm">
                      <BadgeCheck className="h-4 w-4" />
                      <span className="font-medium">Verified Professional</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Send Offer Button (No Call Button - Message only after job accepted & paid) */}
            <button
              onClick={() => {
                if (!user || !userProfile) {
                  openAuth('signin')
                } else {
                  setShowOfferModal(true)
                }
              }}
              className="w-full py-4 rounded-2xl font-semibold text-white active:scale-[0.98] transition-transform mb-2"
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
              }}
            >
              Send Offer
            </button>

            {/* Note about messaging */}
            <p className="text-center text-xs text-gray-400 mt-2">
              Message available after job is accepted & paid
            </p>
          </div>
        </div>

        {/* Offer Job Modal */}
        {showOfferModal && contractor && (
          <OfferJobModal
            contractor={{
              id: contractor.id,
              name: contractor.business_name || contractor.name,
              services: contractor.specialties || [],
            }}
            onClose={() => setShowOfferModal(false)}
            onSuccess={() => {
              setShowOfferModal(false)
              router.push('/dashboard/homeowner/offers')
            }}
          />
        )}
      </div>
    )
  }

  // Web Layout
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Back Button */}
        <button
          onClick={() => safeBack(router, '/find-pro')}
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-6"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Search
        </button>

        {/* Map Section for Web */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 mb-6 overflow-hidden">
          <div ref={mapContainer} className="w-full h-64" />
          {routeInfo && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">{routeInfo.eta} min away</div>
                  <div className="text-sm text-slate-500">{routeInfo.distance} driving distance</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Header Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-8 border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Logo/Avatar */}
            <div className="flex-shrink-0">
              {contractor.avatar_url ? (
                <img
                  src={contractor.avatar_url}
                  alt={contractor.business_name || contractor.name}
                  className="w-24 h-24 rounded-xl object-contain border-2 border-slate-200 dark:border-slate-600 bg-white p-2"
                />
              ) : (
                <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {contractor.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    {contractor.business_name || contractor.name}
                    {contractor.verified && (
                      <BadgeCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    )}
                  </h1>
                  {contractor.business_name && (
                    <p className="text-slate-600 dark:text-slate-400">{contractor.name}</p>
                  )}
                </div>
              </div>

              {/* Rating */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-1">
                  <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {displayRating.toFixed(1)}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-sm">
                    ({displayReviews} {displayReviews === 1 ? 'review' : 'reviews'})
                  </span>
                </div>
                {contractor.completed_jobs ? (
                  <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400 text-sm">
                    <Briefcase className="h-4 w-4" />
                    {contractor.completed_jobs} jobs completed
                  </div>
                ) : null}
              </div>

              {/* Location */}
              {(contractor.city || contractor.state) && (
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-4">
                  <MapPin className="h-4 w-4" />
                  <span>{contractor.city}, {contractor.state}</span>
                </div>
              )}

              {/* Specialties */}
              {contractor.specialties && contractor.specialties.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {contractor.specialties.map((specialty, idx) => (
                    <span key={idx} className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {specialty}
                    </span>
                  ))}
                </div>
              )}

              {/* Quick Stats */}
              <div className="flex flex-wrap gap-4 text-sm">
                {contractor.years_experience ? (
                  <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <Award className="h-4 w-4" />
                    {contractor.years_experience} years experience
                  </div>
                ) : null}
                {contractor.hourly_rate ? (
                  <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <DollarSign className="h-4 w-4" />
                    ${contractor.hourly_rate}/hr
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Action Button - Request Quote only (Call/Message available after job accepted & paid) */}
          <div className="mt-6">
            <button
              onClick={() => {
                if (!user || !userProfile) {
                  openAuth('signin')
                } else {
                  setShowOfferModal(true)
                }
              }}
              className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              Request Quote
            </button>
            <p className="text-sm text-slate-500 mt-2">Message available after job is accepted & paid</p>
          </div>
        </div>

        {/* About Section */}
        {contractor.description && (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 mb-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">About</h2>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
              {contractor.description}
            </p>
          </div>
        )}

        {/* Credentials Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 mb-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Credentials & Verification
          </h2>
          <div className="space-y-3">
            {contractor.license_number && contractor.license_number !== 'pending' && (
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">License Number</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{contractor.license_number}</span>
              </div>
            )}
            {contractor.insurance_carrier && contractor.insurance_carrier !== 'pending' && (
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Insurance Carrier</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{contractor.insurance_carrier}</span>
              </div>
            )}
            {contractor.verified && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <BadgeCheck className="h-5 w-5" />
                <span className="font-medium">Verified Professional</span>
              </div>
            )}
          </div>
        </div>

        {/* Service Area */}
        {contractor.service_area_zips && contractor.service_area_zips.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Service Area
            </h2>
            <div className="flex flex-wrap gap-2">
              {contractor.service_area_zips.map((zip, idx) => (
                <span key={idx} className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 text-sm text-slate-700 dark:text-slate-300">
                  {zip}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Offer Job Modal */}
      {showOfferModal && contractor && (
        <OfferJobModal
          contractor={{
            id: contractor.id,
            name: contractor.business_name || contractor.name,
            services: contractor.specialties || [],
          }}
          onClose={() => setShowOfferModal(false)}
          onSuccess={() => {
            setShowOfferModal(false)
            router.push('/dashboard/homeowner/offers')
          }}
        />
      )}
    </div>
  )
}
