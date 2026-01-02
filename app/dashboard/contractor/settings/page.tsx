'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useProAuth } from '../../../../contexts/ProAuthContext'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import toast, { Toaster } from 'react-hot-toast'
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building,
  FileText,
  Shield,
  CheckCircle2,
  ArrowLeft,
  Save,
  AlertCircle,
  Settings,
  DollarSign,
  Clock,
  Plus,
  X,
  Briefcase,
  LogOut,
  Bell
} from 'lucide-react'

interface ContractorProfileData {
  name: string
  email: string
  businessName: string
  phone: string
  licenseNumber: string
  licenseState: string
  insuranceCarrier: string
  baseZip: string
  serviceAreaZips: string[]
  categories: string[]
  hourlyRate: number
  minimumJobAmount: number
  serviceRadiusMiles: number
  bio: string
  emergencyAvailable: boolean
  weekendAvailable: boolean
  notifications: {
    email: boolean
    sms: boolean
    push: boolean
  }
}

const serviceCategories = [
  'Plumbing', 'Electrical', 'HVAC', 'Locksmith', 'Garage Door',
  'Glass Repair', 'Appliance Repair', 'Handyman', 'Roofing',
  'Fencing', 'Gas', 'Snow Removal', 'Security', 'Water Damage', 'Drywall'
]

const stateOptions = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]

export default function ContractorSettingsPage() {
  const { user, contractorProfile, refreshProfile, signOut } = useProAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [newZip, setNewZip] = useState('')
  const [profileData, setProfileData] = useState<ContractorProfileData>({
    name: '',
    email: '',
    businessName: '',
    phone: '',
    licenseNumber: '',
    licenseState: '',
    insuranceCarrier: '',
    baseZip: '',
    serviceAreaZips: [],
    categories: [],
    hourlyRate: 75,
    minimumJobAmount: 100,
    serviceRadiusMiles: 25,
    bio: '',
    emergencyAvailable: true,
    weekendAvailable: true,
    notifications: {
      email: true,
      sms: true,
      push: true
    }
  })

  // Load existing profile data
  useEffect(() => {
    if (contractorProfile && user) {
      setProfileData({
        name: contractorProfile.name || '',
        email: contractorProfile.email || user.email || '',
        businessName: contractorProfile.business_name || '',
        phone: contractorProfile.phone || '',
        licenseNumber: contractorProfile.license_number || '',
        licenseState: contractorProfile.license_state || '',
        insuranceCarrier: contractorProfile.insurance_carrier || '',
        baseZip: contractorProfile.base_zip || '',
        serviceAreaZips: contractorProfile.service_area_zips || [],
        categories: contractorProfile.categories || [],
        hourlyRate: contractorProfile.hourly_rate || 75,
        minimumJobAmount: 100,
        serviceRadiusMiles: contractorProfile.service_radius_miles || 25,
        bio: '',
        emergencyAvailable: contractorProfile.emergency_services ?? true,
        weekendAvailable: contractorProfile.weekend_services ?? true,
        notifications: (contractorProfile as any).notification_preferences || {
          email: true,
          sms: true,
          push: true
        }
      })
    }
  }, [contractorProfile, user])

  // Redirect if not contractor
  if (!user || !contractorProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Contractor access required</h2>
          <Link href="/pro" className="btn-primary">Go to Pro Dashboard</Link>
        </div>
      </div>
    )
  }

  const handleInputChange = (field: keyof ContractorProfileData, value: any) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const addServiceZip = () => {
    if (newZip && !profileData.serviceAreaZips.includes(newZip)) {
      setProfileData(prev => ({
        ...prev,
        serviceAreaZips: [...prev.serviceAreaZips, newZip]
      }))
      setNewZip('')
    }
  }

  const removeServiceZip = (zipToRemove: string) => {
    setProfileData(prev => ({
      ...prev,
      serviceAreaZips: prev.serviceAreaZips.filter(zip => zip !== zipToRemove)
    }))
  }

  const toggleCategory = (category: string) => {
    setProfileData(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }))
  }

  const handleNotificationChange = async (type: keyof ContractorProfileData['notifications'], value: boolean) => {
    // Update local state immediately for responsive UI
    const newNotifications = {
      ...profileData.notifications,
      [type]: value
    }

    setProfileData(prev => ({
      ...prev,
      notifications: newNotifications
    }))

    // Show toast feedback
    const typeLabel = type === 'email' ? 'Email' : type === 'sms' ? 'SMS' : 'Push'
    toast.success(
      value
        ? `${typeLabel} notifications switched on`
        : `${typeLabel} notifications switched off`,
      {
        duration: 2000,
        style: {
          background: '#1e293b',
          color: '#fff',
          borderRadius: '8px',
        },
      }
    )

    // Auto-save preference to database
    if (user?.id) {
      try {
        await supabase
          .from('pro_contractors')
          .update({ notification_preferences: newNotifications })
          .eq('id', user.id)
      } catch (err) {
        console.error('Failed to save notification preference:', err)
      }
    }
  }

  const handleSave = async () => {
    if (!user?.email) {
      setError('User email is missing. Please sign out and sign back in.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Update contractor profile
      const { error: profileError } = await supabase
        .from('pro_contractors')
        .update({
          name: profileData.name,
          business_name: profileData.businessName,
          phone: profileData.phone,
          license_number: profileData.licenseNumber,
          license_state: profileData.licenseState,
          insurance_carrier: profileData.insuranceCarrier,
          base_zip: profileData.baseZip,
          service_area_zips: profileData.serviceAreaZips,
          service_radius_miles: profileData.serviceRadiusMiles,
          hourly_rate: profileData.hourlyRate,
          categories: profileData.categories,
          emergency_services: profileData.emergencyAvailable,
          weekend_services: profileData.weekendAvailable,
          notification_preferences: profileData.notifications,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (profileError) {
        setError(profileError.message)
        return
      }

      setSuccess('Profile updated successfully!')

      // Refresh the profile context
      await refreshProfile()

      // Auto-clear success message
      setTimeout(() => setSuccess(null), 3000)

    } catch (err: any) {
      setError(err.message || 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Toast notifications */}
      <Toaster position="top-center" />

      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/contractor"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-blue-100">
            <Settings className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contractor Settings</h1>
            <p className="text-gray-600">Manage your business profile and service settings</p>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <span className="text-green-700">{success}</span>
        </div>
      )}

      <div className="space-y-8">
        {/* Business Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Building className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Business Information</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                value={profileData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Business Name *
              </label>
              <input
                type="text"
                value={profileData.businessName}
                onChange={(e) => handleInputChange('businessName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={profileData.email}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed here</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                value={profileData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>
        </div>

        {/* License & Insurance */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">License & Insurance</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                License Number *
              </label>
              <input
                type="text"
                value={profileData.licenseNumber}
                onChange={(e) => handleInputChange('licenseNumber', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                License State *
              </label>
              <select
                value={profileData.licenseState}
                onChange={(e) => handleInputChange('licenseState', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select State</option>
                {stateOptions.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Insurance Carrier *
              </label>
              <input
                type="text"
                value={profileData.insuranceCarrier}
                onChange={(e) => handleInputChange('insuranceCarrier', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>
        </div>

        {/* Service Areas */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <MapPin className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Service Areas</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Base ZIP Code *
              </label>
              <input
                type="text"
                value={profileData.baseZip}
                onChange={(e) => handleInputChange('baseZip', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="10001"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Service Radius (miles)
              </label>
              <input
                type="number"
                value={profileData.serviceRadiusMiles}
                onChange={(e) => handleInputChange('serviceRadiusMiles', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                min="1"
                max="100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Additional Service ZIP Codes
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newZip}
                onChange={(e) => setNewZip(e.target.value)}
                placeholder="Add ZIP code"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={addServiceZip}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {profileData.serviceAreaZips.map((zip) => (
                <span
                  key={zip}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                >
                  {zip}
                  <button
                    onClick={() => removeServiceZip(zip)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Service Categories */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Briefcase className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Service Categories</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {serviceCategories.map((category) => (
              <label
                key={category}
                className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={profileData.categories.includes(category)}
                  onChange={() => toggleCategory(category)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{category}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Rates & Availability */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <DollarSign className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Rates & Availability</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hourly Rate ($)
              </label>
              <input
                type="number"
                value={profileData.hourlyRate}
                onChange={(e) => handleInputChange('hourlyRate', parseFloat(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                min="25"
                max="500"
                step="5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Job Amount ($)
              </label>
              <input
                type="number"
                value={profileData.minimumJobAmount}
                onChange={(e) => handleInputChange('minimumJobAmount', parseFloat(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                min="50"
                max="1000"
                step="25"
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={profileData.emergencyAvailable}
                onChange={(e) => handleInputChange('emergencyAvailable', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Available for emergency calls</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={profileData.weekendAvailable}
                onChange={(e) => handleInputChange('weekendAvailable', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Available on weekends</span>
            </label>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Bell className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">Email Notifications</p>
                  <p className="text-sm text-gray-500">New job alerts, bid updates, messages</p>
                </div>
              </div>
              <button
                onClick={() => handleNotificationChange('email', !profileData.notifications.email)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  profileData.notifications.email ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    profileData.notifications.email ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">SMS Notifications</p>
                  <p className="text-sm text-gray-500">Urgent job alerts, bid accepted notifications</p>
                </div>
              </div>
              <button
                onClick={() => handleNotificationChange('sms', !profileData.notifications.sms)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  profileData.notifications.sms ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    profileData.notifications.sms ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">Push Notifications</p>
                  <p className="text-sm text-gray-500">Real-time updates on your device</p>
                </div>
              </div>
              <button
                onClick={() => handleNotificationChange('push', !profileData.notifications.push)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  profileData.notifications.push ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    profileData.notifications.push ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-between items-center">
          <button
            onClick={async () => {
              if (confirm('Are you sure you want to log out?')) {
                await signOut()
              }
            }}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Log Out
          </button>

          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            <Save className="h-4 w-4" />
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}