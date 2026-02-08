// components/OfferJobModal.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { X, DollarSign, Clock, Calendar, MapPin, Loader2, Home, Navigation, CheckCircle, Camera } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'

interface SavedAddress {
  id: string
  label: string
  address: string
  city: string
  state: string
  zip: string
  source: 'profile' | 'job' | 'current'
}

// All Rushr categories
const ALL_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Roofing',
  'Water Damage',
  'Locksmith',
  'Appliance Repair',
  'Handyman',
  'Auto Battery',
  'Auto Tire',
  'Auto Lockout',
  'Tow',
  'Fuel Delivery',
  'Mobile Mechanic',
  'Carpentry',
  'Landscaping',
  'General',
]

interface Contractor {
  id: string
  name: string
  services: string[]
  city?: string
  state?: string
  rating?: number
}

interface OfferJobModalProps {
  contractor: Contractor
  onClose: () => void
  onSuccess?: () => void
}

export default function OfferJobModal({ contractor, onClose, onSuccess }: OfferJobModalProps) {
  const { user, session } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(contractor.services[0] || '')
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'emergency'>('normal')
  const [offeredAmount, setOfferedAmount] = useState('')
  const [estimatedDuration, setEstimatedDuration] = useState('')
  const [preferredStartDate, setPreferredStartDate] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [notes, setNotes] = useState('')
  const [fetchingAddress, setFetchingAddress] = useState(false)
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [showAddressDropdown, setShowAddressDropdown] = useState(false)
  const [loadingLocation, setLoadingLocation] = useState(false)

  // Photo upload state
  const [photos, setPhotos] = useState<File[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)

  // Load all saved addresses on mount
  useEffect(() => {
    if (user) {
      loadSavedAddresses()
    }
  }, [user])

  // Load saved addresses from profile and recent jobs
  const loadSavedAddresses = async () => {
    if (!user) return

    try {
      const addresses: SavedAddress[] = []

      // 1. Get primary address from user profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('address, city, state, zip_code')
        .eq('id', user.id)
        .single()

      if (profile && profile.address) {
        addresses.push({
          id: 'profile-primary',
          label: 'My Home Address',
          address: profile.address,
          city: profile.city || '',
          state: profile.state || '',
          zip: profile.zip_code || '',
          source: 'profile'
        })
      }

      // 2. Get recent job addresses (last 5 unique addresses)
      const { data: jobs } = await supabase
        .from('homeowner_jobs')
        .select('id, address, city, state, zip, title')
        .eq('homeowner_id', user.id)
        .not('address', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10)

      if (jobs) {
        const uniqueAddresses = new Map<string, SavedAddress>()

        jobs.forEach((job) => {
          const key = `${job.address}-${job.city}-${job.zip}`.toLowerCase()
          if (!uniqueAddresses.has(key) && uniqueAddresses.size < 5) {
            uniqueAddresses.set(key, {
              id: `job-${job.id}`,
              label: job.title || 'Previous Job Location',
              address: job.address || '',
              city: job.city || '',
              state: job.state || '',
              zip: job.zip || '',
              source: 'job'
            })
          }
        })

        addresses.push(...Array.from(uniqueAddresses.values()))
      }

      setSavedAddresses(addresses)
    } catch (err) {
      console.error('Error loading saved addresses:', err)
    }
  }

  // Select a saved address
  const selectAddress = (addr: SavedAddress) => {
    setAddress(addr.address)
    setCity(addr.city)
    setState(addr.state)
    setZip(addr.zip)
    setShowAddressDropdown(false)
  }

  // Get current location
  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser')
      return
    }

    setLoadingLocation(true)
    setError('')

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords

          // Use reverse geocoding to get complete address with house number
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&zoom=18`
          )
          const data = await response.json()

          if (data && data.address) {
            const addr = data.address

            // Build complete street address with house number
            let streetAddress = ''
            if (addr.house_number) {
              streetAddress = addr.house_number
            }
            if (addr.road || addr.street) {
              streetAddress = streetAddress
                ? `${streetAddress} ${addr.road || addr.street}`
                : (addr.road || addr.street)
            }

            // Fallback to display_name if no structured address
            if (!streetAddress && data.display_name) {
              // Extract first part of display_name (usually the street address)
              const parts = data.display_name.split(',')
              streetAddress = parts[0] || ''
            }

            setAddress(streetAddress)
            setCity(addr.city || addr.town || addr.village || addr.municipality || '')
            setState(addr.state || addr.region || '')
            setZip(addr.postcode || '')
          } else {
            setError('Could not determine address from your location')
          }
        } catch (err) {
          console.error('Error geocoding location:', err)
          setError('Failed to get address from location')
        } finally {
          setLoadingLocation(false)
        }
      },
      (err) => {
        console.error('Geolocation error:', err)
        setError('Failed to get your location. Please check permissions.')
        setLoadingLocation(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
  }

  // Legacy function - keep for compatibility
  const handleFetchAddress = async () => {
    if (!user) return

    setFetchingAddress(true)
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('address, city, state, zip_code')
        .eq('id', user.id)
        .single()

      if (error) throw error

      if (profile) {
        setAddress(profile.address || '')
        setCity(profile.city || '')
        setState(profile.state || '')
        setZip(profile.zip_code || '')
      }
    } catch (err) {
      console.error('Error fetching address:', err)
      setError('Failed to fetch your saved address')
    } finally {
      setFetchingAddress(false)
    }
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setPhotos(prev => [...prev, ...files].slice(0, 3)) // Max 3 photos
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const uploadPhotos = async (): Promise<string[]> => {
    if (photos.length === 0 || !user) return []

    setUploadingPhotos(true)
    const urls: string[] = []

    for (const photo of photos) {
      const ext = photo.name.split('.').pop() || 'jpg'
      const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(path, photo, { contentType: photo.type })

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('job-photos')
          .getPublicUrl(path)
        if (urlData?.publicUrl) {
          urls.push(urlData.publicUrl)
        }
      }
    }

    setUploadingPhotos(false)
    return urls
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!user) {
      setError('You must be logged in to send an offer')
      return
    }

    if (!title.trim() || !description.trim() || !offeredAmount || !category) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)

    try {
      if (!session?.access_token) {
        throw new Error('No session token available. Please log in again.')
      }

      // Upload photos if any
      let photoUrls: string[] = []
      if (photos.length > 0) {
        photoUrls = await uploadPhotos()
      }

      // Append photo URLs to notes if uploaded
      let finalNotes = notes.trim() || ''
      if (photoUrls.length > 0) {
        const photoSection = photoUrls.map(url => url).join('\n')
        finalNotes = finalNotes ? `${finalNotes}\n\nPhotos:\n${photoSection}` : `Photos:\n${photoSection}`
      }

      const response = await fetch('/api/direct-offers/create', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          contractor_id: contractor.id,
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          offered_amount: parseFloat(offeredAmount),
          estimated_duration_hours: estimatedDuration ? parseInt(estimatedDuration) : null,
          preferred_start_date: preferredStartDate || null,
          address: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          zip: zip.trim() || null,
          homeowner_notes: finalNotes || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create offer')
      }

      // Success - show confirmation
      setSuccess(true)
      onSuccess?.()

      // Auto-close after 3 seconds
      setTimeout(() => {
        onClose()
      }, 3000)
    } catch (err: any) {
      console.error('Error creating offer:', err)
      setError(err.message || 'Failed to send offer. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {success ? (
          /* Success Confirmation */
          <div className="p-12 text-center">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-emerald-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">
              Offer Sent Successfully!
            </h2>
            <p className="text-lg text-slate-700 mb-2">
              Custom offer sent to <span className="font-semibold text-emerald-600">{contractor.name}</span>
            </p>
            <p className="text-sm text-slate-600 mb-8">
              The contractor will be notified and can review your offer shortly.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Send Job Offer</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Offer a job directly to <span className="font-semibold">{contractor.name}</span>
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Job Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Job Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Fix Leaking Faucet in Kitchen"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              required
            />
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                required
              >
                <option value="">Select a category</option>
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the job in detail..."
              rows={4}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
              required
            />
          </div>

          {/* Photos */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Camera className="inline h-4 w-4 mr-1" />
              Photos of the Job
            </label>
            <div className="flex items-center gap-3">
              {photos.map((photo, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
                  <img src={URL.createObjectURL(photo)} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-0 right-0 w-5 h-5 bg-black/60 text-white flex items-center justify-center text-xs rounded-bl-lg"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {photos.length < 3 && (
                <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 hover:border-emerald-400 flex items-center justify-center cursor-pointer transition-colors">
                  <Camera className="w-5 h-5 text-slate-400" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">Up to 3 photos (optional)</p>
          </div>

          {/* Offered Amount & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <DollarSign className="inline h-4 w-4 mr-1" />
                Offered Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={offeredAmount}
                onChange={(e) => setOfferedAmount(e.target.value)}
                placeholder="250.00"
                step="0.01"
                min="0"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Clock className="inline h-4 w-4 mr-1" />
                Est. Duration (hours)
              </label>
              <input
                type="number"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                placeholder="2"
                min="0"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Preferred Start Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Calendar className="inline h-4 w-4 mr-1" />
              Preferred Start Date
            </label>
            <input
              type="datetime-local"
              value={preferredStartDate}
              onChange={(e) => setPreferredStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Location */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">
                <MapPin className="inline h-4 w-4 mr-1" />
                Job Location
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={loadingLocation}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingLocation ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Locating...
                    </>
                  ) : (
                    <>
                      <Navigation className="h-4 w-4" />
                      Current Location
                    </>
                  )}
                </button>
                {savedAddresses.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowAddressDropdown(!showAddressDropdown)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      <Home className="h-4 w-4" />
                      Saved Addresses
                    </button>
                    {showAddressDropdown && (
                      <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-slate-200 z-10 max-h-64 overflow-y-auto">
                        {savedAddresses.map((addr) => (
                          <button
                            key={addr.id}
                            type="button"
                            onClick={() => selectAddress(addr)}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition-colors"
                          >
                            <div className="font-medium text-slate-900 text-sm">{addr.label}</div>
                            <div className="text-xs text-slate-600 mt-1">
                              {addr.address}, {addr.city}, {addr.state} {addr.zip}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street Address (or use options above)"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />

            <div className="grid grid-cols-3 gap-4">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
                maxLength={2}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none uppercase"
              />
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="ZIP"
                maxLength={10}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Additional Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requirements or additional information..."
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={loading || uploadingPhotos}
            >
              {loading || uploadingPhotos ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploadingPhotos ? 'Uploading Photos...' : 'Sending Offer...'}
                </>
              ) : (
                'Send Offer'
              )}
            </button>
          </div>
        </form>
        </>
      )}
      </div>
    </div>
  )
}
