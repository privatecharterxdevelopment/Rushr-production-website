'use client'

import React, { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Set Mapbox token
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

interface Contractor {
  id: string
  name: string
  business_name: string
  rating: number
  total_jobs: number
  hourly_rate: number
  latitude: number
  longitude: number
  distance_miles: number
  eta_minutes: number
  availability: 'online' | 'busy' | 'offline'
}

interface ContractorMapProps {
  contractors: Contractor[]
  userLocation?: { lat: number; lng: number }
  selectedContractor?: Contractor | null
  onSelectContractor?: (contractor: Contractor) => void
  onRouteCalculated?: (eta: number, distance: number) => void
  radiusMiles?: number
}

// Create a GeoJSON circle polygon (works properly with 3D/pitch)
function createGeoJSONCircle(center: [number, number], radiusKm: number, points: number = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = []
  const distanceX = radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180))
  const distanceY = radiusKm / 110.574

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI)
    const x = distanceX * Math.cos(theta)
    const y = distanceY * Math.sin(theta)
    coords.push([center[0] + x, center[1] + y])
  }
  coords.push(coords[0]) // Close the polygon

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    }
  }
}

export default function ContractorMap({
  contractors,
  userLocation,
  selectedContractor,
  onSelectContractor,
  onRouteCalculated,
  radiusMiles = 5
}: ContractorMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<{ [key: string]: mapboxgl.Marker }>({})
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const onRouteCalculatedRef = useRef(onRouteCalculated)
  const lastFitContractorId = useRef<string | null>(null)
  onRouteCalculatedRef.current = onRouteCalculated

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const initialCenter: [number, number] = userLocation
      ? [userLocation.lng, userLocation.lat]
      : [-74.006, 40.7128] // Default to NYC

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: initialCenter,
      zoom: 13,
      pitch: 45,
      bearing: 0,
      attributionControl: false,
      antialias: true,
      minZoom: 8,
      maxZoom: 19 // Allow street-level zoom
    })

    map.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right')

    map.current.on('load', () => {
      if (!map.current) return

      // Add 3D buildings layer
      const layers = map.current.getStyle().layers
      const labelLayerId = layers?.find(
        (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
      )?.id

      map.current.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 12,
          paint: {
            'fill-extrusion-color': '#ddd',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.6
          }
        },
        labelLayerId
      )

      // Add radius circle source (as polygon for 3D compatibility)
      const radiusKm = radiusMiles * 1.60934
      map.current.addSource('radius-circle', {
        type: 'geojson',
        data: createGeoJSONCircle(initialCenter, radiusKm)
      })

      // Add radius fill layer
      map.current.addLayer({
        id: 'radius-fill',
        type: 'fill',
        source: 'radius-circle',
        paint: {
          'fill-color': '#10B981',
          'fill-opacity': 0.1
        }
      })

      // Add radius outline layer
      map.current.addLayer({
        id: 'radius-outline',
        type: 'line',
        source: 'radius-circle',
        paint: {
          'line-color': '#10B981',
          'line-width': 2,
          'line-opacity': 0.6
        }
      })

      // Add connection line source
      map.current.addSource('connection-line', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        }
      })

      // Add connection line layer (actual route)
      map.current.addLayer({
        id: 'connection-line',
        type: 'line',
        source: 'connection-line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#10B981',
          'line-width': 4,
          'line-opacity': 0.85
        }
      })

      // Add route outline for better visibility
      map.current.addLayer({
        id: 'connection-line-outline',
        type: 'line',
        source: 'connection-line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#065F46',
          'line-width': 6,
          'line-opacity': 0.3
        }
      }, 'connection-line')

      setMapLoaded(true)
    })

    return () => {
      try {
        if (map.current) {
          map.current.remove()
          map.current = null
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, [])

  // Update radius circle when user location or radius changes
  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation) return

    const radiusKm = radiusMiles * 1.60934
    const source = map.current.getSource('radius-circle') as mapboxgl.GeoJSONSource
    if (source) {
      source.setData(createGeoJSONCircle([userLocation.lng, userLocation.lat], radiusKm))
    }
  }, [userLocation, mapLoaded, radiusMiles])

  // Fetch real driving route and draw it
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const source = map.current.getSource('connection-line') as mapboxgl.GeoJSONSource
    if (!source) return

    if (!userLocation || !selectedContractor) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: []
        }
      })
      return
    }

    // Fetch real driving directions from Mapbox
    const fetchRoute = async () => {
      const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!MAPBOX_TOKEN) {
        // Fallback to straight line
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [selectedContractor.longitude, selectedContractor.latitude],
              [userLocation.lng, userLocation.lat]
            ]
          }
        })
        const etaMinutes = Math.max(1, Math.ceil((selectedContractor.distance_miles / 30) * 60))
        onRouteCalculatedRef.current?.(etaMinutes, selectedContractor.distance_miles)
        return
      }

      try {
        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${selectedContractor.longitude},${selectedContractor.latitude};${userLocation.lng},${userLocation.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
        )
        const data = await response.json()

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0]

          // Draw the actual driving route
          source.setData({
            type: 'Feature',
            properties: {},
            geometry: route.geometry
          })

          // Calculate real ETA (duration is in seconds)
          const durationMinutes = Math.ceil(route.duration / 60)
          const distanceMiles = route.distance / 1609.34 // meters to miles

          onRouteCalculatedRef.current?.(durationMinutes, distanceMiles)
        }
      } catch (err) {
        console.error('Error fetching route:', err)
        // Fallback to straight line
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [selectedContractor.longitude, selectedContractor.latitude],
              [userLocation.lng, userLocation.lat]
            ]
          }
        })
      }
    }

    fetchRoute()

    // Only fit bounds when the selected contractor changes (not on every render)
    if (selectedContractor.id !== lastFitContractorId.current) {
      lastFitContractorId.current = selectedContractor.id
      const bounds = new mapboxgl.LngLatBounds()
      bounds.extend([userLocation.lng, userLocation.lat])
      bounds.extend([selectedContractor.longitude, selectedContractor.latitude])

      map.current.fitBounds(bounds, {
        padding: { top: 100, bottom: 100, left: 400, right: 100 },
        maxZoom: 15,
        duration: 800
      })
    }
  }, [selectedContractor, userLocation, mapLoaded])

  // Add/update user location marker
  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation) return

    if (userMarkerRef.current) {
      userMarkerRef.current.remove()
    }

    const el = document.createElement('div')
    el.className = 'user-marker'
    el.innerHTML = `
      <div style="
        width: 20px;
        height: 20px;
        background: #10B981;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        position: relative;
      ">
        <div style="
          position: absolute;
          inset: -6px;
          border: 2px solid rgba(16, 185, 129, 0.4);
          border-radius: 50%;
          animation: pulse 2s infinite;
        "></div>
      </div>
      <style>
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
      </style>
    `

    userMarkerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current)

    map.current.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 12,
      pitch: 45,
      duration: 1000
    })
  }, [userLocation, mapLoaded])

  // Add/update contractor markers as dots
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const currentIds = new Set(contractors.map(c => c.id))

    Object.keys(markersRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        markersRef.current[id].remove()
        delete markersRef.current[id]
      }
    })

    contractors.forEach((contractor) => {
      const isSelected = selectedContractor?.id === contractor.id
      const isOffline = contractor.availability !== 'online'
      const baseColor = isOffline ? '#94A3B8' : '#10B981'
      const selectedColor = isOffline ? '#64748B' : '#059669'
      const activeColor = isSelected ? selectedColor : baseColor

      if (markersRef.current[contractor.id]) {
        const el = markersRef.current[contractor.id].getElement()
        if (el) {
          const markerEl = el.querySelector('.contractor-marker') as HTMLElement
          if (markerEl) {
            markerEl.style.transform = isSelected ? 'scale(1.2)' : 'scale(1)'
            const dot = markerEl.querySelector('.marker-dot') as HTMLElement
            if (dot) {
              dot.style.background = activeColor
              dot.style.boxShadow = isSelected ? `0 0 0 4px ${isOffline ? 'rgba(148, 163, 184, 0.4)' : 'rgba(16, 185, 129, 0.4)'}` : '0 2px 8px rgba(0,0,0,0.3)'
            }
            // Update ETA text to sync with sidebar
            const etaLabel = el.querySelector('.eta-label') as HTMLElement
            if (etaLabel) {
              etaLabel.textContent = isOffline ? `${contractor.distance_miles.toFixed(1)} mi` : `${contractor.eta_minutes} min`
              etaLabel.style.color = activeColor
            }
          }
        }
        return
      }

      const el = document.createElement('div')
      el.className = 'contractor-marker-wrapper'
      el.style.cursor = 'pointer'

      el.innerHTML = `
        <div class="contractor-marker" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: transform 0.2s ease;
          transform: ${isSelected ? 'scale(1.2)' : 'scale(1)'};
        ">
          <div class="marker-dot" style="
            width: ${isOffline ? '28px' : '32px'};
            height: ${isOffline ? '28px' : '32px'};
            background: ${activeColor};
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: ${isSelected ? `0 0 0 4px ${isOffline ? 'rgba(148, 163, 184, 0.4)' : 'rgba(16, 185, 129, 0.4)'}` : '0 2px 8px rgba(0,0,0,0.3)'};
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: ${isOffline ? '12px' : '14px'};
            transition: all 0.2s ease;
          ">${contractor.business_name?.charAt(0) || 'P'}</div>
          <div class="eta-label" style="
            margin-top: 4px;
            background: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            color: ${activeColor};
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            white-space: nowrap;
          ">${isOffline ? `${contractor.distance_miles.toFixed(1)} mi` : `${contractor.eta_minutes} min`}</div>
        </div>
      `

      el.addEventListener('click', () => {
        onSelectContractor?.(contractor)
      })

      el.addEventListener('mouseenter', () => {
        const markerEl = el.querySelector('.contractor-marker') as HTMLElement
        if (markerEl) markerEl.style.transform = 'scale(1.2)'
      })

      el.addEventListener('mouseleave', () => {
        const markerEl = el.querySelector('.contractor-marker') as HTMLElement
        if (markerEl && !isSelected) markerEl.style.transform = 'scale(1)'
      })

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([contractor.longitude, contractor.latitude])
        .addTo(map.current!)

      markersRef.current[contractor.id] = marker
    })
  }, [contractors, selectedContractor, mapLoaded, onSelectContractor])

  // Resize map when container size changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const resizeObserver = new ResizeObserver(() => {
      map.current?.resize()
    })

    if (mapContainer.current) {
      resizeObserver.observe(mapContainer.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [mapLoaded])

  return (
    <div ref={mapContainer} className="w-full h-full" />
  )
}
