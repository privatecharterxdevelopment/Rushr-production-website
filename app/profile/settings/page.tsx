'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../../../contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import { Capacitor } from '@capacitor/core'
import { safeBack } from '../../../lib/safeBack'
import {
  User,
  Mail,
  Phone,
  MapPin,
  Camera,
  Shield,
  CheckCircle2,
  Circle,
  ArrowLeft,
  Save,
  AlertCircle,
  Home,
  FileText,
  Bell,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react'
import { FullScreenLoading } from '../../../components/LoadingSpinner'

// Hook to safely check if running in native app (avoids hydration mismatch)
function useIsNative() {
  const [isNative, setIsNative] = React.useState(false)
  React.useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])
  return isNative
}

interface ProfileFormData {
  name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zipCode: string
  emergencyContact: string
  emergencyPhone: string
  notifications: {
    email: boolean
    sms: boolean
    push: boolean
  }
}

export default function ProfileSettingsPage() {
  const { user, userProfile, refreshProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const isNative = useIsNative()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showEmergencyContact, setShowEmergencyContact] = useState(false)


  const [formData, setFormData] = useState<ProfileFormData>({
    name: userProfile?.name || '',
    email: user?.email || '',
    phone: (userProfile as any)?.phone || '',
    address: (userProfile as any)?.address || '',
    city: (userProfile as any)?.city || '',
    state: (userProfile as any)?.state || '',
    zipCode: (userProfile as any)?.zip_code || '',
    emergencyContact: (userProfile as any)?.emergency_contact || '',
    emergencyPhone: (userProfile as any)?.emergency_phone || '',
    notifications: (userProfile as any)?.notification_preferences || {
      email: true,
      sms: false,
      push: true
    }
  })

  // Update form data when userProfile changes
  React.useEffect(() => {
    if (userProfile && user) {
      setFormData({
        name: userProfile.name || '',
        email: user.email || '',
        phone: userProfile.phone || '',
        address: userProfile.address || '',
        city: userProfile.city || '',
        state: userProfile.state || '',
        zipCode: userProfile.zip_code || '',
        emergencyContact: userProfile.emergency_contact || '',
        emergencyPhone: userProfile.emergency_phone || '',
        notifications: userProfile.notification_preferences || {
          email: true,
          sms: false,
          push: true
        }
      })
    }
  }, [userProfile, user])

  // Show full-screen loading while auth is loading
  if (authLoading) {
    return <FullScreenLoading />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Please sign in to access profile settings</h2>
          <Link href="/?auth=signin" className="btn-primary">Sign In</Link>
        </div>
      </div>
    )
  }

  // Allow access even if userProfile is missing - we'll create it on save

  // Calculate profile completeness
  const completenessItems = [
    { key: 'email', label: 'Verify email', done: !!user.email_confirmed_at, weight: 15 },
    { key: 'phone', label: 'Add phone number', done: !!formData.phone, weight: 15 },
    { key: 'address', label: 'Add property address', done: !!formData.address, weight: 20 },
    { key: 'avatar', label: 'Profile photo', done: !!(userProfile as any)?.avatar_url, weight: 10 },
    { key: 'kyc', label: 'Identity verification (KYC)', done: !!(userProfile as any)?.kyc_verified, weight: 25 },
    { key: 'first', label: 'Book first emergency service', done: !!(userProfile as any)?.first_job_completed, weight: 15 },
  ]

  const completedWeight = completenessItems.filter(item => item.done).reduce((sum, item) => sum + item.weight, 0)
  const totalWeight = completenessItems.reduce((sum, item) => sum + item.weight, 0)
  const completenessPercentage = Math.round((completedWeight / totalWeight) * 100)

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleNotificationChange = (type: keyof ProfileFormData['notifications'], value: boolean) => {
    setFormData(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [type]: value
      }
    }))
  }

  const handleSave = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    // Force loading to stop after 10 seconds as failsafe
    const timeoutId = setTimeout(() => {
      setLoading(false)
      setError('Save operation timed out')
    }, 10000)

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        setError('Name is required')
        return
      }

      if (!user?.id) {
        setError('User not authenticated')
        return
      }


      // Ensure we have an email for NOT NULL constraint
      if (!user.email) {
        setError('User email is missing. Please sign out and sign back in.')
        return
      }

      // Prepare profile data - include email to satisfy NOT NULL constraint
      const profileData = {
        name: formData.name.trim(),
        email: user.email, // Include email from user auth data (required)
        phone: formData.phone.trim() || null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        zip_code: formData.zipCode.trim() || null,
        emergency_contact: formData.emergencyContact.trim() || null,
        emergency_phone: formData.emergencyPhone.trim() || null,
        notification_preferences: formData.notifications,
        updated_at: new Date().toISOString()
      }


      // Use upsert to handle both insert and update cases
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id, // Include the user ID for upsert
          ...profileData
        })
        .eq('id', user.id)

      if (error) {
        setError(`Save failed: ${error.message}`)
        return
      }

      setSuccess('✅ Profile saved successfully!')

      // Refresh profile in background - don't wait for it
      refreshProfile().catch(console.error)

      // Auto-hide success message
      setTimeout(() => setSuccess(null), 3000)

    } catch (err: any) {
      setError(`Unexpected error: ${err.message || err}`)
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-slate-900"
      style={{
        paddingTop: isNative ? 'env(safe-area-inset-top)' : undefined,
        paddingBottom: isNative ? 'calc(80px + env(safe-area-inset-bottom))' : undefined
      }}
    >
      {/* iOS Native Header */}
      {isNative && (
        <div
          className="sticky top-0 z-50"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
          }}
        >
          <div className="flex items-center px-4 py-3">
            <button
              onClick={() => safeBack(router, '/dashboard')}
              className="flex items-center text-white active:opacity-60"
            >
              <ArrowLeft className="w-6 h-6" />
              <span className="ml-1 font-medium">Back</span>
            </button>
            <h1 className="flex-1 text-center text-white font-semibold text-lg pr-12">
              Profile Settings
            </h1>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          {!isNative && (
            <Link
              href="/dashboard/homeowner"
              className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          )}

          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900">
              <User className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Profile Settings</h1>
              <p className="text-slate-600 dark:text-slate-400">Manage your personal information and preferences</p>
            </div>
          </div>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-red-700 dark:text-red-300">{error}</span>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">Check the browser console for more details</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-200">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 animate-pulse" />
            <span className="text-green-700 dark:text-green-300 font-medium">{success}</span>
          </div>
        )}

        {loading && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center gap-3">
            <img
            src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
            alt="Loading..."
            className="w-5 h-5 object-contain flex-shrink-0"
          />
            <span className="text-blue-700 dark:text-blue-300">Saving your profile...</span>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Main Settings Form */}
          <div className="xl:col-span-2 space-y-6">
            {/* Profile Photo Section */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Profile Photo</h2>

              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center">
                  {(userProfile as any)?.avatar_url ? (
                    <img
                      src={(userProfile as any).avatar_url}
                      alt="Profile avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="h-10 w-10 text-white" />
                  )}
                </div>

                <div className="flex-1">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                    Upload a profile photo to help service providers recognize you
                  </p>
                  <Link
                    href="/profile/avatar"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                  >
                    <Camera className="h-4 w-4" />
                    Upload Photo
                  </Link>
                </div>
              </div>
            </div>

            {/* Basic Information */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Basic Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="Enter your full name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      value={formData.email}
                      disabled
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-100 dark:bg-slate-600 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Email cannot be changed here</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Property Address */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Property Address</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Street Address
                  </label>
                  <div className="relative">
                    <Home className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="123 Main Street"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      City
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="New York"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      State
                    </label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="NY"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      ZIP Code
                    </label>
                    <input
                      type="text"
                      value={formData.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="10001"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Emergency Contact</h2>
                <button
                  onClick={() => setShowEmergencyContact(!showEmergencyContact)}
                  className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  {showEmergencyContact ? 'Hide' : 'Add Emergency Contact'}
                </button>
              </div>

              {showEmergencyContact && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Emergency Contact Name
                    </label>
                    <input
                      type="text"
                      value={formData.emergencyContact}
                      onChange={(e) => handleInputChange('emergencyContact', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Emergency Contact Phone
                    </label>
                    <input
                      type="tel"
                      value={formData.emergencyPhone}
                      onChange={(e) => handleInputChange('emergencyPhone', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="(555) 987-6543"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Notification Preferences */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Notification Preferences</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">Email Notifications</p>
                      <p className="text-sm text-slate-500">Service updates, job confirmations</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleNotificationChange('email', !formData.notifications.email)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.notifications.email ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        formData.notifications.email ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">SMS Notifications</p>
                      <p className="text-sm text-slate-500">Emergency alerts, arrival notifications</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleNotificationChange('sms', !formData.notifications.sms)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.notifications.sms ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        formData.notifications.sms ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">Push Notifications</p>
                      <p className="text-sm text-slate-500">Real-time updates on your device</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleNotificationChange('push', !formData.notifications.push)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.notifications.push ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        formData.notifications.push ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-3">

              <button
                onClick={handleSave}
                disabled={loading}
                className={`inline-flex items-center gap-2 px-6 py-3 font-medium rounded-lg transition-all duration-200 ${
                  success
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white'
                } ${loading ? 'scale-95' : 'hover:scale-105'}`}
              >
                {loading ? (
                  <>
                    <img
                    src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
                    alt="Loading..."
                    className="w-4 h-4 object-contain"
                  />
                    Saving...
                  </>
                ) : success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Profile Completeness Sidebar */}
          <div className="space-y-6">
            {/* Profile Completeness Card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-emerald-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Profile Completeness</h3>
                <Link href="/dashboard/homeowner" className="text-emerald-600 dark:text-emerald-400 hover:underline text-sm">
                  Dashboard
                </Link>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Overall</span>
                  <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">{completenessPercentage}%</span>
                </div>
                <div className="w-full bg-emerald-100 dark:bg-emerald-900 rounded-full h-3">
                  <div
                    className="bg-emerald-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${completenessPercentage}%` }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {completenessItems.map((item) => (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      item.done
                        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                        : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {item.key === 'email' && <Mail className="h-4 w-4 text-slate-500" />}
                        {item.key === 'phone' && <Phone className="h-4 w-4 text-slate-500" />}
                        {item.key === 'address' && <MapPin className="h-4 w-4 text-slate-500" />}
                        {item.key === 'avatar' && <User className="h-4 w-4 text-slate-500" />}
                        {item.key === 'kyc' && <Shield className="h-4 w-4 text-slate-500" />}
                        {item.key === 'first' && <FileText className="h-4 w-4 text-slate-500" />}
                      </div>
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</span>
                    </div>
                    {item.done ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Quick Actions</h3>

              <div className="space-y-3">
                <Link
                  href="/profile/avatar"
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Camera className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Upload Profile Photo</span>
                </Link>

                <Link
                  href="/profile/kyc"
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Shield className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Complete KYC Verification</span>
                </Link>

                <Link
                  href="/post-job"
                  className="flex items-center gap-3 p-3 rounded-lg border border-emerald-200 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                >
                  <FileText className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Post Your First Job</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}