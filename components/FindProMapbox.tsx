// components/FindProMapbox.tsx
'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import mapboxgl from 'mapbox-gl'

type LatLng = [number, number]
type HoursTag =
  | 'open_now'
  | 'open_today'
  | 'weekends'
  | 'evenings'
  | 'early_morning'
  | '24_7'

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
  // Other
  Carpentry: '🔨',
  Landscaping: '🌿',
}

interface Props {
  items: any[]
  radiusMiles: number
  searchCenter: LatLng
  onSearchHere?: (center: LatLng) => void
  onContractorSelect?: (contractor: any) => void
  category?: string
  fullscreen?: boolean
  hideSearchButton?: boolean
  hideControls?: boolean
  userLocation?: LatLng | null  // User's exact GPS location for green dot
  trackingMarker?: { lat: number; lng: number; bearing: number } | null  // Directional arrow for live contractor tracking
}

export interface FindProMapboxHandle {
  zoomIn: () => void
  zoomOut: () => void
  showRoute: (fromLat: number, fromLng: number, toLat: number, toLng: number) => void
  clearRoute: () => void
  flyToLocation: (lat: number, lng: number, zoom?: number) => void
  hideRadiusCircle: () => void
  showRadiusCircle: () => void
  resize: () => void
}

const FindProMapbox = forwardRef<FindProMapboxHandle, Props>(({
  items = [],
  radiusMiles = 10,
  searchCenter,
  onSearchHere,
  onContractorSelect,
  category,
  fullscreen = false,
  hideSearchButton = false,
  hideControls = false,
  userLocation = null,
  trackingMarker = null,
}, ref) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapObjRef = useRef<mapboxgl.Map | null>(null)
  const mapReadyRef = useRef(false)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const routeStartRef = useRef<[number, number] | null>(null)  // [lng, lat] of route start for snapping arrow
  const radiusLayerId = 'radius-circle'
  const radiusSourceId = 'radius-source'

  // Helper function to create a circle GeoJSON
  const createRadiusCircle = (center: LatLng, radiusMiles: number) => {
    const points = 64
    const coords = []
    const distanceInMeters = radiusMiles * 1609.34 // Convert miles to meters
    const earthRadius = 6371000 // Earth's radius in meters

    const lat = center[0] * Math.PI / 180
    const lng = center[1] * Math.PI / 180

    for (let i = 0; i < points; i++) {
      const angle = (i * 360 / points) * Math.PI / 180

      const dx = distanceInMeters * Math.cos(angle)
      const dy = distanceInMeters * Math.sin(angle)

      const deltaLat = dy / earthRadius
      const deltaLng = dx / (earthRadius * Math.cos(lat))

      const pointLat = lat + deltaLat
      const pointLng = lng + deltaLng

      coords.push([
        pointLng * 180 / Math.PI,
        pointLat * 180 / Math.PI
      ])
    }

    // Close the circle
    coords.push(coords[0])

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      }
    }
  }

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapObjRef.current) return

    const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!MAPBOX_TOKEN) {
      console.error('MAPBOX_TOKEN not configured')
      return
    }

    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [searchCenter[1], searchCenter[0]], // Mapbox uses [lng, lat]
      zoom: 11,
      pitch: 45, // Enable 3D view with 45 degree tilt
      bearing: 0, // No rotation
      antialias: true, // Smooth edges for 3D buildings
      logoPosition: 'bottom-right',
      attributionControl: false,
    })
    // Hide Mapbox logo via CSS
    map.on('load', () => {
      const container = map.getContainer()
      const logos = container.querySelectorAll('.mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib')
      logos.forEach((el: Element) => (el as HTMLElement).style.display = 'none')
    })

    // Add navigation controls (unless hidden)
    if (!hideControls) {
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    }

    // Add radius circle when map loads
    map.on('load', () => {
      mapReadyRef.current = true
      // Add source for radius circle
      map.addSource(radiusSourceId, {
        type: 'geojson',
        data: createRadiusCircle(searchCenter, radiusMiles) as any
      })

      // Add fill layer for radius circle
      map.addLayer({
        id: radiusLayerId,
        type: 'fill',
        source: radiusSourceId,
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.1
        }
      })

      // Add outline for radius circle
      map.addLayer({
        id: `${radiusLayerId}-outline`,
        type: 'line',
        source: radiusSourceId,
        paint: {
          'line-color': '#10b981',
          'line-width': 2,
          'line-opacity': 0.5
        }
      })

      // Add 3D buildings layer
      try {
        const layers = map.getStyle()?.layers
        const labelLayerId = layers?.find(
          (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
        )?.id

        map.addLayer(
          {
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', 'extrude', 'true'],
            type: 'fill-extrusion',
            minzoom: 15,
            paint: {
              'fill-extrusion-color': '#aaa',
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15,
                0,
                15.05,
                ['get', 'height']
              ],
              'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15,
                0,
                15.05,
                ['get', 'min_height']
              ],
              'fill-extrusion-opacity': 0.6
            }
          },
          labelLayerId
        )
      } catch {}
    })

    // Add search here button (only if not hidden)
    if (!hideSearchButton) {
      const searchHereBtn = document.createElement('button')
      searchHereBtn.className = 'mapboxgl-ctrl-search-here'
      searchHereBtn.textContent = '🔍 Search this area'
      searchHereBtn.style.cssText = `
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        border: 1px solid #ddd;
        padding: 8px 16px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        z-index: 1;
      `
      searchHereBtn.addEventListener('click', () => {
        const center = map.getCenter()
        onSearchHere?.([center.lat, center.lng])
      })
      mapRef.current.appendChild(searchHereBtn)
    }

    mapObjRef.current = map

    return () => {
      map.remove()
      mapObjRef.current = null
    }
  }, [])

  // Update markers when items change
  useEffect(() => {
    const map = mapObjRef.current
    if (!map || !mapReadyRef.current) return

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []

    // Add new markers
    items.forEach((item: any) => {
      // Support both loc.lat/lng format and direct latitude/longitude fields
      const lat = Number(item?.loc?.lat ?? item?.latitude)
      const lng = Number(item?.loc?.lng ?? item?.longitude)
      if (!isFinite(lat) || !isFinite(lng)) return

      const svcs: string[] = Array.isArray(item?.services) ? item.services : []
      const svc = category && svcs.includes(category) ? category : svcs[0]
      const emoji = CAT_EMOJI[svc as keyof typeof CAT_EMOJI] ?? '🔧'

      // Create marker element
      const el = document.createElement('div')
      el.className = 'custom-marker'
      el.innerHTML = `
        <div style="
          background: #d1fae5;
          border: 2px solid #10b981;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        ">
          ${emoji}
        </div>
      `

      // Handle click - call callback if provided, otherwise show popup
      if (onContractorSelect) {
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onContractorSelect(item)
        })
      }

      // Create popup (only if no callback)
      const popup = onContractorSelect ? undefined : new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div style="padding: 8px;">
          <h3 style="font-weight: 600; margin: 0 0 4px 0;">${item?.name || 'Contractor'}</h3>
          <p style="margin: 0; font-size: 12px; color: #666;">${item?.city || ''}</p>
          ${item?.rating ? `<p style="margin: 4px 0 0 0; font-size: 12px;">⭐ ${Number(item.rating).toFixed(1)}</p>` : ''}
        </div>
      `)

      const marker = new mapboxgl.Marker({
        element: el,
        anchor: 'center' // Center the marker exactly on coordinates
      })
        .setLngLat([lng, lat])

      if (popup) {
        marker.setPopup(popup)
      }

      marker.addTo(map)

      markersRef.current.push(marker)
    })

    // Fit bounds to markers if we have items
    if (items.length > 0) {
      const bounds = new mapboxgl.LngLatBounds()
      items.forEach((item: any) => {
        const lat = Number(item?.loc?.lat ?? item?.latitude)
        const lng = Number(item?.loc?.lng ?? item?.longitude)
        if (isFinite(lat) && isFinite(lng)) {
          bounds.extend([lng, lat])
        }
      })
      try { if (bounds.getSouthWest()) map.fitBounds(bounds, { padding: 50, maxZoom: 13 }) } catch {}
    }
  }, [items, category])

  // Update center when searchCenter changes (skip when tracking — route fitBounds handles viewport)
  useEffect(() => {
    const map = mapObjRef.current
    if (!map || trackingMarker) return
    map.flyTo({ center: [searchCenter[1], searchCenter[0]], zoom: 11 })
  }, [searchCenter, trackingMarker])

  // Update radius circle when radius or center changes
  useEffect(() => {
    const map = mapObjRef.current
    if (!map || !mapReadyRef.current) return

    try {
      const source = map.getSource(radiusSourceId) as mapboxgl.GeoJSONSource
      if (source) {
        source.setData(createRadiusCircle(searchCenter, radiusMiles) as any)
      }
    } catch {}
  }, [radiusMiles, searchCenter])

  // Expose zoom and route methods to parent via ref
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const map = mapObjRef.current
      if (map) {
        map.zoomIn()
      }
    },
    zoomOut: () => {
      const map = mapObjRef.current
      if (map) {
        map.zoomOut()
      }
    },
    showRoute: async (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
      const map = mapObjRef.current
      if (!map || !mapReadyRef.current) return

      const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!MAPBOX_TOKEN) return

      try {
        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`
        )
        const data = await response.json()

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0].geometry
          const coords = route.coordinates

          try { if (map.getLayer('route')) map.removeLayer('route') } catch {}
          try { if (map.getSource('route')) map.removeSource('route') } catch {}

          map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: route }
          })

          map.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#10b981', 'line-width': 5, 'line-opacity': 0.8 }
          })

          // Create tracking arrow at exact route start using native map layers
          if (coords && coords.length >= 2) {
            const startCoord = coords[0] as [number, number]
            routeStartRef.current = startCoord

            // Calculate bearing from first few route segments
            const idx = Math.min(5, coords.length - 1)
            const [lng1, lat1] = coords[0]
            const [lng2, lat2] = coords[idx]
            const toRad = (d: number) => d * Math.PI / 180
            const toDeg = (r: number) => r * 180 / Math.PI
            const dLon = toRad(lng2 - lng1)
            const la1 = toRad(lat1)
            const la2 = toRad(lat2)
            const y = Math.sin(dLon) * Math.cos(la2)
            const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)
            const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360

            // Remove old arrow layers
            try { if (map.getLayer('tracking-arrow-symbol')) map.removeLayer('tracking-arrow-symbol') } catch {}
            try { if (map.getLayer('tracking-arrow-glow')) map.removeLayer('tracking-arrow-glow') } catch {}
            try { if (map.getSource('tracking-arrow-src')) map.removeSource('tracking-arrow-src') } catch {}

            // Create arrow image on canvas (once)
            if (!map.hasImage('contractor-arrow')) {
              const size = 64
              const canvas = document.createElement('canvas')
              canvas.width = size
              canvas.height = size
              const ctx = canvas.getContext('2d')!
              // Green circle
              ctx.beginPath()
              ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2)
              ctx.fillStyle = '#10b981'
              ctx.fill()
              ctx.strokeStyle = '#ffffff'
              ctx.lineWidth = 4
              ctx.stroke()
              // White arrow pointing up
              ctx.fillStyle = '#ffffff'
              ctx.beginPath()
              ctx.moveTo(size / 2, 12)
              ctx.lineTo(size / 2 + 13, size / 2 + 10)
              ctx.lineTo(size / 2, size / 2 - 2)
              ctx.lineTo(size / 2 - 13, size / 2 + 10)
              ctx.closePath()
              ctx.fill()
              map.addImage('contractor-arrow', { width: size, height: size, data: ctx.getImageData(0, 0, size, size).data } as any)
            }

            // Add point source at route start
            map.addSource('tracking-arrow-src', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: { bearing: bearing },
                geometry: { type: 'Point', coordinates: startCoord }
              }
            })

            // Outer glow circle
            map.addLayer({
              id: 'tracking-arrow-glow',
              type: 'circle',
              source: 'tracking-arrow-src',
              paint: {
                'circle-radius': 22,
                'circle-color': 'rgba(16, 185, 129, 0.15)',
                'circle-stroke-width': 0
              }
            })

            // Arrow symbol
            map.addLayer({
              id: 'tracking-arrow-symbol',
              type: 'symbol',
              source: 'tracking-arrow-src',
              layout: {
                'icon-image': 'contractor-arrow',
                'icon-size': 0.6,
                'icon-rotate': ['get', 'bearing'],
                'icon-rotation-alignment': 'map',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true
              }
            })
          }

          const bounds = new mapboxgl.LngLatBounds()
          bounds.extend([fromLng, fromLat])
          bounds.extend([toLng, toLat])
          map.fitBounds(bounds, { padding: 80, maxZoom: 14 })
        }
      } catch (error) {
        console.error('Error fetching route:', error)
      }
    },
    clearRoute: () => {
      const map = mapObjRef.current
      if (!map || !mapReadyRef.current) return
      try { if (map.getLayer('route')) map.removeLayer('route') } catch {}
      try { if (map.getSource('route')) map.removeSource('route') } catch {}
      try { if (map.getLayer('tracking-arrow-symbol')) map.removeLayer('tracking-arrow-symbol') } catch {}
      try { if (map.getLayer('tracking-arrow-glow')) map.removeLayer('tracking-arrow-glow') } catch {}
      try { if (map.getSource('tracking-arrow-src')) map.removeSource('tracking-arrow-src') } catch {}
      routeStartRef.current = null
    },
    flyToLocation: (lat: number, lng: number, zoom: number = 14) => {
      const map = mapObjRef.current
      if (map) {
        map.flyTo({
          center: [lng, lat],
          zoom: zoom,
          pitch: 45,
          bearing: -17.6,
          duration: 1500
        })
      }
    },
    hideRadiusCircle: () => {
      const map = mapObjRef.current
      if (!map || !mapReadyRef.current) return
      try { if (map.getLayer(radiusLayerId)) map.setLayoutProperty(radiusLayerId, 'visibility', 'none') } catch {}
      try { if (map.getLayer(radiusLayerId + '-outline')) map.setLayoutProperty(radiusLayerId + '-outline', 'visibility', 'none') } catch {}
    },
    showRadiusCircle: () => {
      const map = mapObjRef.current
      if (!map || !mapReadyRef.current) return
      try { if (map.getLayer(radiusLayerId)) map.setLayoutProperty(radiusLayerId, 'visibility', 'visible') } catch {}
      try { if (map.getLayer(radiusLayerId + '-outline')) map.setLayoutProperty(radiusLayerId + '-outline', 'visibility', 'visible') } catch {}
    },
    resize: () => {
      const map = mapObjRef.current
      if (map) map.resize()
    }
  }), [])

  // Green pulsing dot for user's exact location
  useEffect(() => {
    const map = mapObjRef.current
    if (!map) return

    // Remove existing user marker
    if (userMarkerRef.current) {
      userMarkerRef.current.remove()
      userMarkerRef.current = null
    }

    // Add new marker if userLocation exists
    if (userLocation) {
      const el = document.createElement('div')
      el.className = 'user-location-marker'
      el.innerHTML = `
        <div style="position: relative; width: 20px; height: 20px;">
          <div style="position: absolute; width: 20px; height: 20px; background: rgba(16, 185, 129, 0.3); border-radius: 50%; animation: pulse 2s infinite;"></div>
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 12px; height: 12px; background: #10b981; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>
        </div>
        <style>
          @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.8); opacity: 0.5; }
            100% { transform: scale(2.5); opacity: 0; }
          }
        </style>
      `
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([userLocation[1], userLocation[0]])
        .addTo(map)
      userMarkerRef.current = marker
    }
  }, [userLocation])

  // Cleanup tracking arrow layers when trackingMarker prop becomes null (tracking view closed)
  useEffect(() => {
    if (!trackingMarker) {
      const map = mapObjRef.current
      if (map && mapReadyRef.current) {
        try { if (map.getLayer('tracking-arrow-symbol')) map.removeLayer('tracking-arrow-symbol') } catch {}
        try { if (map.getLayer('tracking-arrow-glow')) map.removeLayer('tracking-arrow-glow') } catch {}
        try { if (map.getSource('tracking-arrow-src')) map.removeSource('tracking-arrow-src') } catch {}
      }
      routeStartRef.current = null
    }
  }, [trackingMarker])

  return (
    <div className={fullscreen ? "absolute inset-0" : "relative"}>
      <div
        ref={mapRef}
        className={`${fullscreen ? 'h-full' : 'h-[360px]'} w-full ${fullscreen ? '' : 'rounded-2xl'} overflow-hidden bg-slate-100`}
        style={{ zIndex: 0 }}
      />
      {!fullscreen && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-3 px-2.5 py-1.5 rounded-xl bg-white/90 text-xs border border-slate-200 shadow"
          style={{ zIndex: 1100 }}
        >
          Radius: {radiusMiles} mi
        </div>
      )}
    </div>
  )
})

FindProMapbox.displayName = 'FindProMapbox'

export default FindProMapbox
