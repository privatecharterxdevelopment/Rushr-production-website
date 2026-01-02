// components/ProMapInner.tsx
'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../lib/state'

type Props = {
  items: any[]
  category?: string
  radiusMiles?: number
  searchCenter?: [number, number]
  onSearchHere?: (center: [number, number]) => void
  hasArea?: boolean
  onClearArea?: () => void
  onAreaChange?: (gj: any) => void
  // Sidebar controls
  searchQuery?: string
  onSearchQueryChange?: (q: string) => void
  zipCode?: string
  onZipCodeChange?: (z: string) => void
  onApplyZip?: () => void
  onLocateMe?: () => void
  selectedCategory?: string
  onCategoryChange?: (cat: string) => void
  sortBy?: string
  onSortChange?: (sort: string) => void
  onMoreFilters?: () => void
  showMoreFilters?: boolean
  onReset?: () => void
  onToggleList?: () => void
  showList?: boolean
  radius?: number
  onRadiusChange?: (r: number) => void
  minRating?: number
  onMinRatingChange?: (r: number) => void
  filteredCount?: number
  hideSidebar?: boolean // NEW: Hide the sidebar for simple map view
}

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

export default function ProMapInner({
  items = [],
  category,
  radiusMiles = 10,
  searchCenter,
  onSearchHere,
  onAreaChange,
  onClearArea,
  searchQuery = '',
  onSearchQueryChange,
  zipCode = '',
  onZipCodeChange,
  onApplyZip,
  onLocateMe,
  selectedCategory = '',
  onCategoryChange,
  sortBy = 'best',
  onSortChange,
  onMoreFilters,
  showMoreFilters = false,
  onReset,
  onToggleList,
  showList = false,
  radius = 15,
  onRadiusChange,
  minRating = 0,
  onMinRatingChange,
  filteredCount = 0,
  hideSidebar = false, // NEW: Default to showing sidebar
}: Props) {
  const addToast = useApp()?.addToast

  // --- Sidebar page state (Uber-style two-page flow) ---
  const [sidebarPage, setSidebarPage] = useState<'search' | 'results'>('search')
  const [sidebarOpen, setSidebarOpen] = useState(false) // Sidebar closed by default

  // --- Distance calculation (Haversine formula) ---
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

  // --- Data filter ---
  const safeItems = Array.isArray(items) ? items : []
  const pros = useMemo(() => {
    let filtered = safeItems

    // Filter by category if specified
    if (category) {
      filtered = filtered.filter((c: any) => Array.isArray(c?.services) && c.services.includes(category))
    }

    // Filter by radius if searchCenter is provided
    if (searchCenter && radiusMiles) {
      const [centerLat, centerLng] = searchCenter
      filtered = filtered.filter((c: any) => {
        const lat = Number(c?.loc?.lat)
        const lng = Number(c?.loc?.lng)
        if (!isFinite(lat) || !isFinite(lng)) return false

        const distance = calculateDistance(centerLat, centerLng, lat, lng)
        return distance <= radiusMiles
      })
    }

    return filtered
  }, [safeItems, category, searchCenter, radiusMiles])

  // --- Leaflet + map refs ---
  const mapRef = useRef<HTMLDivElement>(null)
  const mapObjRef = useRef<any>(null)
  const LRef = useRef<any>(null) // store Leaflet module
  const layerRef = useRef<any>(null)

  // --- Drawing state ---
  const drawingsLayerRef = useRef<any>(null)
  const tempLineRef = useRef<any>(null)
  const tempPtsRef = useRef<[number, number][]>([])
  const isDrawingRef = useRef(false)
  const [isDrawing, setIsDrawing] = useState(false)

  const clickHandlerRef = useRef<any>(null)
  const mouseMoveHandlerRef = useRef<any>(null)
  const dblHandlerRef = useRef<any>(null)

  const suppressFitRef = useRef(false)

  // ===== Drawing helpers =====
  function disableMapInteractions(map: any) {
    map.dragging?.disable()
    map.doubleClickZoom?.disable()
    map.scrollWheelZoom?.disable()
    map.boxZoom?.disable()
    map.touchZoom?.disable()
    map.keyboard?.disable()
    map._container.style.cursor = 'crosshair'
  }
  function enableMapInteractions(map: any) {
    map.dragging?.enable()
    map.doubleClickZoom?.enable()
    map.scrollWheelZoom?.enable()
    map.boxZoom?.enable()
    map.touchZoom?.enable()
    map.keyboard?.enable()
    map._container.style.cursor = ''
  }

  function startFreshDrawing(L: any, map: any) {
    if (!drawingsLayerRef.current) drawingsLayerRef.current = L.layerGroup().addTo(map)
    tempPtsRef.current = []
    if (tempLineRef.current) {
      try { map.removeLayer(tempLineRef.current) } catch {}
      tempLineRef.current = null
    }
  }

  function clearTempLine(map: any) {
    if (tempLineRef.current) {
      try { map.removeLayer(tempLineRef.current) } catch {}
      tempLineRef.current = null
    }
  }

  function clearAllDrawings(L: any, map: any) {
    tempPtsRef.current = []
    clearTempLine(map)
    if (drawingsLayerRef.current) {
      try { drawingsLayerRef.current.clearLayers() } catch {}
    }
    emitDrawingsGeoJSON()
  }

  function finalizeCurrentIfPossible(L: any, map: any) {
    const pts = tempPtsRef.current
    if (pts.length >= 3) {
      const poly = L.polygon(pts, {
        color: '#10b981',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 0.15,
      })
      drawingsLayerRef.current.addLayer(poly)
      emitDrawingsGeoJSON()
    }
    tempPtsRef.current = []
    clearTempLine(map)
  }

  function emitDrawingsGeoJSON() {
    if (!onAreaChange) return
    const fc = { type: 'FeatureCollection', features: [] as any[] }
    if (drawingsLayerRef.current) {
      drawingsLayerRef.current.eachLayer((l: any) => {
        if (typeof l.toGeoJSON === 'function') fc.features.push(l.toGeoJSON())
      })
    }
    onAreaChange(fc)
  }

  function toggleDrawMode(L: any, map: any, turnOn?: boolean) {
    const next = typeof turnOn === 'boolean' ? turnOn : !isDrawingRef.current
    isDrawingRef.current = next
    setIsDrawing(next)

    if (next) {
      disableMapInteractions(map)
      startFreshDrawing(L, map)

      const onClick = (e: any) => {
        tempPtsRef.current.push([e.latlng.lat, e.latlng.lng])
        if (!tempLineRef.current) {
          tempLineRef.current = L.polyline(tempPtsRef.current, { color: '#10b981', weight: 2 }).addTo(map)
        } else {
          tempLineRef.current.setLatLngs(tempPtsRef.current)
        }
      }
      const onMove = (e: any) => {
        if (!tempLineRef.current || tempPtsRef.current.length === 0) return
        const preview = [...tempPtsRef.current, [e.latlng.lat, e.latlng.lng]]
        tempLineRef.current.setLatLngs(preview)
      }
      const onDbl = (e: any) => {
        if (tempPtsRef.current.length >= 2) tempPtsRef.current.push([e.latlng.lat, e.latlng.lng])
        finalizeCurrentIfPossible(L, map)
      }

      map.on('click', onClick)
      map.on('mousemove', onMove)
      map.on('dblclick', onDbl)
      clickHandlerRef.current = onClick
      mouseMoveHandlerRef.current = onMove
      dblHandlerRef.current = onDbl
    } else {
      enableMapInteractions(map)
      if (clickHandlerRef.current) map.off('click', clickHandlerRef.current)
      if (mouseMoveHandlerRef.current) map.off('mousemove', mouseMoveHandlerRef.current)
      if (dblHandlerRef.current) map.off('dblclick', dblHandlerRef.current)
      clickHandlerRef.current = null
      mouseMoveHandlerRef.current = null
      dblHandlerRef.current = null
      clearTempLine(map)
      tempPtsRef.current = []
    }
  }

  // Refresh markers for Mapbox
  const markersRef = useRef<any[]>([])
  const userLocationMarkerRef = useRef<any>(null)
  const radiusCircleRef = useRef<any>(null)

  // Function to add user location marker - green pulsing dot
  async function addUserLocationMarker(map: any, location: [number, number]) {
    if (!map || !location) return

    // Remove existing user marker
    if (userLocationMarkerRef.current) {
      userLocationMarkerRef.current.remove()
      userLocationMarkerRef.current = null
    }

    const mapboxgl = (await import('mapbox-gl')).default

    // Create green pulsing dot (matching FindProMapbox style)
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
      .setLngLat([location[1], location[0]]) // Mapbox uses [lng, lat]
      .setPopup(
        new mapboxgl.Popup({ offset: 25 })
          .setHTML('<div style="padding: 8px; font-weight: 600;">📍 Your Location</div>')
      )
      .addTo(map)

    userLocationMarkerRef.current = marker
    console.log('User location marker added at:', location)
  }

  // Function to update radius circle - works with 3D pitch
  function updateRadiusCircle(map: any, center: [number, number], radiusMiles: number) {
    if (!map) return

    // Check if map style is loaded
    if (!map.isStyleLoaded()) {
      // Wait for style to load, then try again
      map.once('style.load', () => {
        updateRadiusCircle(map, center, radiusMiles)
      })
      return
    }

    // Remove existing circle
    if (radiusCircleRef.current) {
      try {
        if (map.getLayer('radius-circle-layer')) map.removeLayer('radius-circle-layer')
        if (map.getSource('radius-circle')) map.removeSource('radius-circle')
      } catch (e) {}
      radiusCircleRef.current = null
    }

    if (!center || !radiusMiles) return

    // Create circle point
    const circleGeoJSON = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [center[1], center[0]] // lng, lat
        }
      }]
    }

    try {
      map.addSource('radius-circle', {
        type: 'geojson',
        data: circleGeoJSON
      })

      // Use circle layer with pitch alignment for 3D perspective
      map.addLayer({
        id: 'radius-circle-layer',
        type: 'circle',
        source: 'radius-circle',
        paint: {
          'circle-radius': {
            stops: [
              [0, 0],
              [10, radiusMiles * 10],
              [15, radiusMiles * 50],
              [18, radiusMiles * 150]
            ],
            base: 2
          },
          'circle-color': '#10b981',
          'circle-opacity': 0.06, // Much lighter
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#10b981',
          'circle-stroke-opacity': 0.25, // Lighter stroke
          'circle-pitch-alignment': 'map', // Adjusts with map pitch/tilt
          'circle-pitch-scale': 'map' // Scales with map perspective
        }
      })

      radiusCircleRef.current = true
    } catch (e) {
      console.error('Error adding radius circle:', e)
    }
  }

  function refreshMarkersMapbox(map: any, items: any[], selectedCategory?: string) {
    // Remove existing markers
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []

    if (!map || !items || items.length === 0) {
      console.log('No items to display on map:', { map: !!map, items: items?.length })
      return
    }

    console.log('Refreshing markers for items:', items.length)

    items.forEach((c: any) => {
      const lat = Number(c?.loc?.lat)
      const lng = Number(c?.loc?.lng)
      if (!isFinite(lat) || !isFinite(lng)) return

      const svcs: string[] = Array.isArray(c?.services) ? c.services : []
      const svc = selectedCategory && svcs.includes(selectedCategory) ? selectedCategory : svcs[0]
      const emoji = CAT_EMOJI[svc as keyof typeof CAT_EMOJI] ?? '🔧'

      // Create marker element matching FindProMapbox style
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

      // Import mapboxgl dynamically for Marker class
      ;(async () => {
        // Check if map still exists before adding marker
        if (!map) {
          console.warn('Map undefined when trying to add marker')
          return
        }

        const mapboxgl = (await import('mapbox-gl')).default

        // Create popup matching FindProMapbox style
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 8px;">
            <h3 style="font-weight: 600; margin: 0 0 4px 0;">${c?.name || 'Contractor'}</h3>
            <p style="margin: 0; font-size: 12px; color: #666;">${c?.city || ''}</p>
            ${c?.rating ? `<p style="margin: 4px 0 0 0; font-size: 12px;">⭐ ${Number(c.rating).toFixed(1)}</p>` : ''}
          </div>
        `)

        const marker = new mapboxgl.Marker({
          element: el,
          anchor: 'center' // Center the marker exactly on coordinates
        })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map)

        markersRef.current.push(marker)
      })()
    })
  }

  // ===== Map init =====
  useEffect(() => {
    let map: any = null
    ;(async () => {
      if (!mapRef.current || mapObjRef.current) return
      try {
        const mapboxgl = (await import('mapbox-gl')).default
        ;(mapboxgl as any).accessToken = 'pk.eyJ1IjoicnVzaHJhZG1pbiIsImEiOiJjbWdiaTlobmcwdHc3MmtvbHhhOTJjNnJvIn0.st2PXkQQtqnh3tHrjp9pzw'

        // searchCenter is [lat, lng], but Mapbox needs [lng, lat]
        const initialCenter: [number, number] = searchCenter
          ? [searchCenter[1], searchCenter[0]]
          : [-74.006, 40.7128]

        map = new mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/light-v11',
          center: initialCenter,
          zoom: 11,
          pitch: 0,
          bearing: 0,
          antialias: false,
          trackResize: true,
          renderWorldCopies: false,
          maxPitch: 0
        })

        // Disable pitch and rotation immediately
        map.touchZoomRotate.disableRotation()
        map.dragRotate.disable()

        mapObjRef.current = map

        // Add navigation controls (skip if sidebar is hidden, like in hero preview)
        if (!hideSidebar) {
          map.addControl(new mapboxgl.NavigationControl(), 'top-right')
        }

        // Add markers when map loads
        map.on('load', () => {
          // Add markers immediately (skip 3D buildings for better performance)
          console.log('Map loaded, adding initial markers:', pros.length)
          refreshMarkersMapbox(map, pros, category)

          // Add user location marker if searchCenter is provided
          if (searchCenter && radiusMiles) {
            console.log('Adding user location marker at:', searchCenter)
            addUserLocationMarker(map, searchCenter)
            updateRadiusCircle(map, searchCenter, radiusMiles)
          }
        })

      } catch (e) {
        if (process.env.NODE_ENV !== 'production') console.warn('Mapbox init failed:', e)
      }
    })()

    return () => {
      if (map) {
        map.remove()
      }
      // Clean up user location marker
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.remove()
        userLocationMarkerRef.current = null
      }
      // Clean up contractor markers
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []

      mapObjRef.current = null
      layerRef.current = null
      drawingsLayerRef.current = null
      tempLineRef.current = null
      tempPtsRef.current = []
      isDrawingRef.current = false
      setIsDrawing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update markers when pros or category changes
  useEffect(() => {
    const map = mapObjRef.current
    if (!map) return

    console.log('Updating markers due to pros/category change:', pros.length, category)
    refreshMarkersMapbox(map, pros, category)
  }, [pros, category])

  // Update radius circle and user marker when searchCenter or radius changes
  useEffect(() => {
    const map = mapObjRef.current
    if (!map || !searchCenter || !radiusMiles) return

    console.log('SearchCenter changed, updating user marker and radius:', searchCenter)
    addUserLocationMarker(map, searchCenter)
    updateRadiusCircle(map, searchCenter, radiusMiles)
  }, [searchCenter, radiusMiles])

  // Recenter/refresh on props change
  useEffect(() => {
    const map = mapObjRef.current
    if (!map) return
    try {
      if (searchCenter) {
        // searchCenter is [lat, lng], Mapbox needs [lng, lat]
        map.flyTo({
          center: [searchCenter[1], searchCenter[0]],
          zoom: map.getZoom() || 11
        })
      }
      refreshMarkersMapbox(map, pros, category)
      suppressFitRef.current = false
    } catch {}
  }, [pros, searchCenter, category])

  // ===== Button handlers (React overlay) =====
  const handleLocate = () => {
    const map = mapObjRef.current
    if (!map) return
    if (!navigator.geolocation) { addToast?.('Geolocation not supported', 'error'); return }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude]

        // Fly to user location
        map.flyTo({
          center: [ll[1], ll[0]], // Mapbox uses [lng, lat]
          zoom: 14,
          pitch: 0
        })

        // Use the same addUserLocationMarker function to avoid duplicate code
        await addUserLocationMarker(map, ll)

        onSearchHere?.(ll)
        suppressFitRef.current = true

        // Add radius circle around user location
        if (radiusMiles) {
          updateRadiusCircle(map, ll, radiusMiles)
        }
      },
      () => addToast?.('Unable to retrieve your location', 'error'),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const handleSearchHere = () => {
    const map = mapObjRef.current
    if (!map) return
    const c = map.getCenter()
    const ll: [number, number] = [c.lat, c.lng]
    onSearchHere?.(ll)
    suppressFitRef.current = true
  }

  const handleDrawToggleOn = () => {
    const map = mapObjRef.current
    const L = LRef.current
    if (!map || !L) return
    toggleDrawMode(L, map, true)
  }

  const handleAddArea = () => {
    const map = mapObjRef.current
    const L = LRef.current
    if (!map || !L) return
    finalizeCurrentIfPossible(L, map)
    startFreshDrawing(L, map) // stay in draw mode
  }

  const handleEraseLast = () => {
    const map = mapObjRef.current
    if (!map) return
    if (tempPtsRef.current.length > 0) {
      tempPtsRef.current.pop()
      if (tempPtsRef.current.length === 0 && tempLineRef.current) {
        try { map.removeLayer(tempLineRef.current) } catch {}
        tempLineRef.current = null
      } else if (tempLineRef.current) {
        tempLineRef.current.setLatLngs(tempPtsRef.current)
      }
    }
  }

  return (
    <div className="relative h-full w-full">
      {/* Map */}
      <div
        ref={mapRef}
        className="absolute inset-0 h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-800"
        style={{ zIndex: 0 }}
      />

      {/* Toggle Sidebar Button */}
      {!hideSidebar && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-4 left-4 z-20 bg-white rounded-lg shadow-lg p-3 hover:bg-slate-50 transition-colors"
          title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          <svg className="h-5 w-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            )}
          </svg>
        </button>
      )}

      {/* Uber-style Floating Left Sidebar - Two Page Flow (only if not hidden and open) */}
      {!hideSidebar && sidebarOpen && (
        <div
          className="absolute top-4 left-16 bottom-4 w-96 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ zIndex: 10, maxHeight: 'calc(100vh - 120px)' }}
        >
        {/* PAGE 1: Search Page */}
        {sidebarPage === 'search' && (
          <>
            {/* Title */}
            <div className="p-4 pb-3 flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-800">Find Emergency Help Within Minutes</h2>
            </div>

            {/* Search Input and ZIP */}
            <div className="px-4 pb-3 border-b border-slate-200 flex-shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange?.(e.target.value)}
                  placeholder="What service do you need?"
                  className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                />
                <div className="relative">
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => onZipCodeChange?.(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="ZIP"
                    maxLength={5}
                    className="w-24 pl-2 pr-8 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm text-center font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      handleLocate()
                      onLocateMe?.()
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-md transition-colors"
                    title="Use my location"
                  >
                    <svg className="h-4 w-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Category Bubbles */}
            <div className="px-4 pt-3 flex-shrink-0">
              <div className="text-xs font-semibold text-slate-600 mb-2">Select a Category (Optional)</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(CAT_EMOJI).map(([label, emoji]) => (
                  <button
                    key={label}
                    onClick={() => onCategoryChange?.(label)}
                    className={`px-2 py-1 rounded-full border font-normal text-xs transition-all duration-200 flex items-center gap-0.5 ${
                      selectedCategory === label
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                        : 'bg-white border-slate-300 text-slate-700 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    <span className="text-xs">{emoji}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Radius Filter */}
            <div className="px-4 pt-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600 w-14">Radius</label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={radius}
                  onChange={(e) => onRadiusChange?.(Number(e.target.value))}
                  className="flex-1"
                />
                <div className="w-12 text-right text-xs font-semibold text-slate-700">{radius} mi</div>
              </div>
            </div>

            {/* Search Button - Directly below radius */}
            <div className="p-4 flex-shrink-0 bg-white">
              <button
                onClick={() => setSidebarPage('results')}
                className="w-full px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm"
              >
                Search
              </button>
            </div>
          </>
        )}

        {/* PAGE 2: Results Page */}
        {sidebarPage === 'results' && (
          <>
            {/* Header with Back Arrow */}
            <div className="p-4 border-b border-slate-200 flex-shrink-0 flex items-center gap-3">
              <button
                onClick={() => setSidebarPage('search')}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex-1">
                <h2 className="font-semibold text-slate-900">{selectedCategory}</h2>
                <p className="text-xs text-slate-500">{filteredCount} available</p>
              </div>
            </div>

            {/* Filters */}
            <div className="p-3 border-b border-slate-200 flex-shrink-0">
              <div className="flex gap-2 mb-2">
                <select
                  value={sortBy}
                  onChange={(e) => onSortChange?.(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                >
                  <option value="best">Best Match</option>
                  <option value="distance">Closest</option>
                  <option value="rating">Top Rated</option>
                </select>
                <button
                  onClick={onMoreFilters}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-medium transition-colors"
                >
                  Filters {showMoreFilters ? '▲' : '▼'}
                </button>
              </div>

              {/* Advanced Filters */}
              {showMoreFilters && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-600 w-14">Radius</label>
                    <input
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={radius}
                      onChange={(e) => onRadiusChange?.(Number(e.target.value))}
                      className="flex-1"
                    />
                    <div className="w-12 text-right text-xs font-semibold text-slate-700">{radius} mi</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-600 w-14">Rating</label>
                    <select
                      value={minRating}
                      onChange={(e) => onMinRatingChange?.(Number(e.target.value))}
                      className="flex-1 px-2 py-1 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                    >
                      <option value={0}>Any</option>
                      <option value={3}>3.0+</option>
                      <option value={3.5}>3.5+</option>
                      <option value={4}>4.0+</option>
                      <option value={4.5}>4.5+</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Contractor List - Scrollable */}
            {filteredCount > 0 ? (
              <div className="flex-1 overflow-y-auto">
                <div className="p-3">
                  <div className="space-y-3">
                    {items.map((contractor: any) => {
                      const distance = (contractor as any).__distance as number | undefined
                      const rating = Number(contractor?.rating) || 0
                      const services: string[] = Array.isArray(contractor?.services) ? contractor.services : []

                      return (
                        <div
                          key={contractor?.id || contractor?.name}
                          className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => {
                            window.location.href = `/contractor/${contractor?.id}`
                          }}
                        >
                          {/* Header */}
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-semibold text-sm text-slate-900">
                                {contractor?.business_name || contractor?.name || 'Contractor'}
                              </h4>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {contractor?.city || 'Location not specified'}
                              </p>
                            </div>
                            {typeof distance === 'number' && (
                              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full whitespace-nowrap ml-2">
                                {distance.toFixed(1)} mi
                              </span>
                            )}
                          </div>

                          {/* Rating */}
                          {rating > 0 && (
                            <div className="flex items-center gap-1 mb-2">
                              <span className="text-yellow-500 text-sm">★</span>
                              <span className="text-xs font-medium text-slate-700">{rating.toFixed(1)}</span>
                            </div>
                          )}

                          {/* Services */}
                          {services.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {services.slice(0, 2).map((s: string, i: number) => (
                                <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                window.location.href = `/contractor/${contractor?.id}`
                              }}
                              className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                            >
                              View Profile
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                window.location.href = `/messages?to=${contractor?.id}`
                              }}
                              className="flex-1 px-3 py-1.5 border border-blue-600 text-blue-600 hover:bg-blue-50 text-xs font-medium rounded-lg transition-colors"
                            >
                              Contact
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="text-4xl mb-3">🔍</div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">No contractors found</h3>
                  <p className="text-xs text-slate-500">Try expanding the search radius</p>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      )}
    </div>
  )
}

/* ---------- Markers ---------- */
function refreshMarkers(
  L: any,
  map: any,
  itemsIn: any[],
  layerRef: React.MutableRefObject<any>,
  selectedCategory?: string,
  opts?: { fit?: boolean }
) {
  const items = Array.isArray(itemsIn) ? itemsIn : []
  const shouldFit = opts?.fit ?? true

  try {
    if (layerRef.current) {
      layerRef.current.clearLayers?.()
      map.removeLayer?.(layerRef.current)
      layerRef.current = null
    }
  } catch {}

  const group = L.layerGroup()
  items.forEach((c: any) => {
    const lat = Number(c?.loc?.lat)
    const lng = Number(c?.loc?.lng)
    if (!isFinite(lat) || !isFinite(lng)) return

    const svcs: string[] = Array.isArray(c?.services) ? c.services : []
    const svc = selectedCategory && svcs.includes(selectedCategory) ? selectedCategory : svcs[0]
    const emoji = CAT_EMOJI[svc as keyof typeof CAT_EMOJI] ?? '🔧'

    const m = createPinMarker(L, map, [lat, lng], { emoji, data: c })
    m.addTo(group)
  })

  group.addTo(map)
  layerRef.current = group

  if (shouldFit) {
    const pts = group.getLayers().map((l: any) => l.getLatLng && l.getLatLng()).filter(Boolean)
    if (pts.length > 1) {
      const b = L.latLngBounds(pts)
      map.fitBounds(b, { padding: [24, 24], maxZoom: 13 })
    } else if (pts.length === 1) {
      map.setView(pts[0], 12, { animate: false })
    }
  }
}

/* ---------- Icon helpers ---------- */
function createPinMarker(
  L: any,
  map: any,
  latlng: [number, number],
  payload: { emoji: string; data: any }
) {
  const icon = makePinIcon(L, payload)
  const m = L.marker(latlng, { icon, riseOnHover: true }) as any
  ;(m as any)._al = { ...payload }
  ;(m as any)._map = map
  return m
}

function makePinIcon(L: any, opts: { emoji: string; data: any }) {
  const { emoji, data } = opts
  const bubble = 24
  const tipH = 8
  const tipW = 12
  const border = '#10b981'
  const fill = '#d1fae5'

  const imgSize = Math.floor(bubble * 0.7)
  const iconHeight = bubble + tipH + 2

  const name = escapeHtml(String(data?.name ?? 'Contractor'))
  const city = escapeHtml(String(data?.city ?? ''))

  const html = `
    <div style="position:relative; width:${bubble}px; height:${iconHeight}px;">
      <div class="al-pin-bubble" style="
        position:absolute; left:50%; top:0; transform:translateX(-50%);
        width:${bubble}px; height:${bubble}px; background:${fill};
        border:1.5px solid ${border}; border-radius:9999px;
        box-shadow:0 2px 4px rgba(0,0,0,.18); z-index:20;">
        <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
          width:${bubble}px; height:${bubble}px; display:flex; align-items:center; justify-content:center;">
          <div style="font-size:${imgSize}px; line-height:1;">${escapeHtml(emoji)}</div>
        </div>
      </div>
      <div style="
        position:absolute; left:50%; top:${bubble - 1}px; transform:translateX(-50%);
        width:0; height:0; border-left:${tipW/2 + 1}px solid transparent;
        border-right:${tipW/2 + 1}px solid transparent; border-top:${tipH + 2}px solid ${border};
        z-index:16;"></div>
      <div style="
        position:absolute; left:50%; top:${bubble}px; transform:translateX(-50%);
        width:0; height:0; border-left:${tipW/2}px solid transparent;
        border-right:${tipW/2}px solid transparent; border-top:${tipH}px solid ${fill};
        z-index:17;"></div>
    </div>
  `
  return L.divIcon({
    className: 'al-emoji-pin',
    html,
    iconSize: [bubble, iconHeight],
    iconAnchor: [Math.floor(bubble / 2), bubble + tipH + 2],
    popupAnchor: [0, -(bubble / 2)],
  })
}

/* ---------- Tiny UI helpers ---------- */
function btnStyle(primary = false): React.CSSProperties {
  return {
    cursor: 'pointer',
    padding: '8px 12px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    background: primary ? '#10b981' : 'rgba(255,255,255,.95)',
    color: primary ? '#fff' : '#0f172a',
    border: primary ? '1px solid #10b981' : '1px solid rgba(15,23,42,.12)',
    boxShadow: '0 1px 3px rgba(2,6,23,.08)',
  }
}
function ghostStyle(): React.CSSProperties {
  return {
    cursor: 'pointer',
    padding: '8px 12px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    background: '#fff',
    color: '#0f172a',
    border: '1px dashed rgba(15,23,42,.25)',
    boxShadow: '0 1px 3px rgba(2,6,23,.06)',
  }
}

/* ---------- utils ---------- */
function twemojiUrl(emoji: string) {
  const override: Record<string, string> = { '❄️': '2744' }
  const code = override[emoji] ?? toCodePoints(emoji).join('-')
  return `https://twemoji.maxcdn.com/v/latest/svg/${code}.svg`
}
function toCodePoints(str: string) {
  const cps: string[] = []
  for (const ch of Array.from(str)) cps.push(ch.codePointAt(0)!.toString(16))
  return cps
}
function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, m =>
    m === '&' ? '&amp;'
      : m === '<' ? '&lt;'
      : m === '>' ? '&gt;'
      : m === '"' ? '&quot;'
      : '&#39;'
  )
}
