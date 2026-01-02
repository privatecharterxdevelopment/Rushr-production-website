'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from '../lib/supabaseClient'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

interface LiveTrackingMapProps {
  jobId: string
  jobAddress: string
  jobLatitude: number
  jobLongitude: number
  contractorName: string
  onArrival?: () => void
}

export default function LiveTrackingMap({
  jobId,
  jobAddress,
  jobLatitude,
  jobLongitude,
  contractorName,
  onArrival
}: LiveTrackingMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const contractorMarker = useRef<mapboxgl.Marker | null>(null)
  const jobMarker = useRef<mapboxgl.Marker | null>(null)

  const [contractorLocation, setContractorLocation] = useState<any>(null)
  const [eta, setEta] = useState<string>('')
  const [distance, setDistance] = useState<string>('')

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [jobLongitude, jobLatitude],
      zoom: 13
    })

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    // Add job location marker (home icon)
    const jobEl = document.createElement('div')
    jobEl.className = 'job-marker'
    jobEl.innerHTML = '🏠'
    jobEl.style.fontSize = '32px'

    jobMarker.current = new mapboxgl.Marker(jobEl)
      .setLngLat([jobLongitude, jobLatitude])
      .setPopup(new mapboxgl.Popup().setHTML(`<strong>Job Location</strong><br>${jobAddress}`))
      .addTo(map.current)

    return () => {
      map.current?.remove()
    }
  }, [])

  useEffect(() => {
    if (!map.current) return

    // Subscribe to contractor location updates
    const channel = supabase
      .channel(`job-tracking-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contractor_locations',
          filter: `job_id=eq.${jobId}`
        },
        (payload) => {
          console.log('[LiveTracking] Location update:', payload)
          const location = payload.new as any

          if (location && map.current) {
            setContractorLocation(location)

            // Update or create contractor marker (car icon)
            if (!contractorMarker.current) {
              const contractorEl = document.createElement('div')
              contractorEl.className = 'contractor-marker'
              contractorEl.innerHTML = '🚗'
              contractorEl.style.fontSize = '32px'
              contractorEl.style.transform = `rotate(${location.heading || 0}deg)`

              contractorMarker.current = new mapboxgl.Marker(contractorEl)
                .setLngLat([location.longitude, location.latitude])
                .setPopup(
                  new mapboxgl.Popup().setHTML(
                    `<strong>${contractorName}</strong><br>
                    ${location.is_en_route ? '🚗 En route' : ''}
                    ${location.has_arrived ? '✅ Arrived' : ''}`
                  )
                )
                .addTo(map.current)
            } else {
              // Update existing marker
              contractorMarker.current.setLngLat([location.longitude, location.latitude])
              const el = contractorMarker.current.getElement()
              el.style.transform = `rotate(${location.heading || 0}deg)`
            }

            // Fit bounds to show both markers
            if (jobMarker.current) {
              const bounds = new mapboxgl.LngLatBounds()
              bounds.extend([jobLongitude, jobLatitude])
              bounds.extend([location.longitude, location.latitude])
              map.current.fitBounds(bounds, { padding: 100, maxZoom: 15 })
            }

            // Update ETA and distance
            if (location.estimated_arrival_time) {
              const etaDate = new Date(location.estimated_arrival_time)
              const now = new Date()
              const minutesLeft = Math.round((etaDate.getTime() - now.getTime()) / 60000)
              setEta(minutesLeft > 0 ? `${minutesLeft} min` : 'Arriving soon')
            }

            if (location.distance_to_destination) {
              const distanceKm = (location.distance_to_destination / 1000).toFixed(1)
              setDistance(`${distanceKm} km`)
            }

            // Trigger arrival callback
            if (location.has_arrived && onArrival) {
              onArrival()
            }
          }
        }
      )
      .subscribe()

    // Fetch initial location
    fetchInitialLocation()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobId])

  async function fetchInitialLocation() {
    const { data, error } = await supabase
      .from('contractor_locations')
      .select('*')
      .eq('job_id', jobId)
      .eq('is_active', true)
      .single()

    if (data && map.current) {
      setContractorLocation(data)

      // Create contractor marker
      const contractorEl = document.createElement('div')
      contractorEl.className = 'contractor-marker'
      contractorEl.innerHTML = '🚗'
      contractorEl.style.fontSize = '32px'

      contractorMarker.current = new mapboxgl.Marker(contractorEl)
        .setLngLat([data.longitude, data.latitude])
        .addTo(map.current)

      // Fit bounds
      const bounds = new mapboxgl.LngLatBounds()
      bounds.extend([jobLongitude, jobLatitude])
      bounds.extend([data.longitude, data.latitude])
      map.current.fitBounds(bounds, { padding: 100, maxZoom: 15 })
    }
  }

  return (
    <div className="relative w-full h-full">
      {/* Map Container */}
      <div ref={mapContainer} className="w-full h-full rounded-lg" />

      {/* Status Overlay */}
      {contractorLocation && (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-xs">
          <div className="flex items-center gap-3">
            <div className="text-3xl">
              {contractorLocation.has_arrived ? '✅' : contractorLocation.is_en_route ? '🚗' : '📍'}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{contractorName}</div>
              <div className="text-sm text-gray-600">
                {contractorLocation.has_arrived
                  ? 'Arrived at location'
                  : contractorLocation.is_en_route
                  ? 'On the way'
                  : 'Getting ready'}
              </div>
            </div>
          </div>

          {contractorLocation.is_en_route && !contractorLocation.has_arrived && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">ETA:</span>
                <span className="font-semibold text-blue-600">{eta || 'Calculating...'}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-600">Distance:</span>
                <span className="font-semibold text-gray-900">{distance || 'Calculating...'}</span>
              </div>
            </div>
          )}

          {contractorLocation.has_arrived && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-sm text-green-600 font-medium">
                🎉 Your contractor has arrived!
              </div>
            </div>
          )}
        </div>
      )}

      {!contractorLocation && (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4">
          <div className="flex items-center gap-2">
            <div className="animate-pulse text-blue-600">📍</div>
            <div className="text-sm text-gray-600">Waiting for contractor to start navigation...</div>
          </div>
        </div>
      )}
    </div>
  )
}
