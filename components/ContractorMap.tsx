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
  radiusMiles = 25
}: ContractorMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<{ [key: string]: mapboxgl.Marker }>({})
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

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
      zoom: 11,
      pitch: 45, // Enable 3D tilt
      bearing: 0,
      attributionControl: false,
      antialias: true
    })

    map.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right')

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

      // Add connection line layer
      map.current.addLayer({
        id: 'connection-line',
        type: 'line',
        source: 'connection-line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3B82F6',
          'line-width': 3,
          'line-dasharray': [2, 2]
        }
      })

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

  // Draw connection line when contractor is selected
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

    // Draw straight line from contractor to user
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

    // Calculate ETA based on distance
    const etaMinutes = Math.ceil((selectedContractor.distance_miles / 25) * 60) + 5
    onRouteCalculated?.(etaMinutes, selectedContractor.distance_miles)

    // Fit bounds to show both points
    const bounds = new mapboxgl.LngLatBounds()
    bounds.extend([userLocation.lng, userLocation.lat])
    bounds.extend([selectedContractor.longitude, selectedContractor.latitude])

    map.current.fitBounds(bounds, {
      padding: { top: 80, bottom: 80, left: 80, right: 80 },
      maxZoom: 14,
      duration: 500
    })
  }, [selectedContractor, userLocation, mapLoaded, onRouteCalculated])

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

      if (markersRef.current[contractor.id]) {
        const el = markersRef.current[contractor.id].getElement()
        if (el) {
          const dot = el.querySelector('.contractor-dot') as HTMLElement
          if (dot) {
            dot.style.width = isSelected ? '16px' : '12px'
            dot.style.height = isSelected ? '16px' : '12px'
            dot.style.background = isSelected ? '#1D4ED8' : '#3B82F6'
            dot.style.boxShadow = isSelected ? '0 0 0 4px rgba(59, 130, 246, 0.3)' : '0 2px 6px rgba(0,0,0,0.2)'
          }
        }
        return
      }

      const el = document.createElement('div')
      el.className = 'contractor-marker-wrapper'
      el.style.cursor = 'pointer'

      el.innerHTML = `
        <div class="contractor-dot" style="
          width: ${isSelected ? '16px' : '12px'};
          height: ${isSelected ? '16px' : '12px'};
          background: ${isSelected ? '#1D4ED8' : '#3B82F6'};
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: ${isSelected ? '0 0 0 4px rgba(59, 130, 246, 0.3)' : '0 2px 6px rgba(0,0,0,0.2)'};
          transition: all 0.2s ease;
        "></div>
      `

      el.addEventListener('click', () => {
        onSelectContractor?.(contractor)
      })

      el.addEventListener('mouseenter', () => {
        const dot = el.querySelector('.contractor-dot') as HTMLElement
        if (dot) dot.style.transform = 'scale(1.3)'
      })

      el.addEventListener('mouseleave', () => {
        const dot = el.querySelector('.contractor-dot') as HTMLElement
        if (dot && !isSelected) dot.style.transform = 'scale(1)'
      })

      const marker = new mapboxgl.Marker({ element: el })
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
