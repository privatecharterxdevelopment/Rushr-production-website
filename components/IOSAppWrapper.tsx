// components/IOSAppWrapper.tsx
// Unified iOS app wrapper that handles switching between homeowner and contractor modes
'use client'

import React, { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import IOSHomeView from './IOSHomeView'
import IOSContractorHomeView from './IOSContractorHomeView'
import { Preferences } from '@capacitor/preferences'

type AppMode = 'homeowner' | 'contractor'

// Hook to safely check if running in native app
function useIsNative() {
  const [isNative, setIsNative] = useState(false)
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])
  return isNative
}

// Storage key for persisting mode preference
const MODE_STORAGE_KEY = 'rushr_app_mode'

export default function IOSAppWrapper() {
  const isNative = useIsNative()
  const [appMode, setAppMode] = useState<AppMode>('homeowner')
  const [isLoading, setIsLoading] = useState(true)

  // Load saved mode preference on mount
  useEffect(() => {
    const loadSavedMode = async () => {
      try {
        const { value } = await Preferences.get({ key: MODE_STORAGE_KEY })
        if (value === 'contractor' || value === 'homeowner') {
          setAppMode(value)
        }
      } catch (e) {
        // Default to homeowner if preference can't be loaded
        console.log('Could not load mode preference, defaulting to homeowner')
      } finally {
        setIsLoading(false)
      }
    }

    if (isNative) {
      loadSavedMode()
    } else {
      setIsLoading(false)
    }
  }, [isNative])

  // Save mode preference when it changes
  const switchToContractor = async () => {
    setAppMode('contractor')
    try {
      await Preferences.set({ key: MODE_STORAGE_KEY, value: 'contractor' })
    } catch (e) {
      console.log('Could not save mode preference')
    }
  }

  const switchToHomeowner = async () => {
    setAppMode('homeowner')
    try {
      await Preferences.set({ key: MODE_STORAGE_KEY, value: 'homeowner' })
    } catch (e) {
      console.log('Could not save mode preference')
    }
  }

  // Don't render on web
  if (!isNative) {
    return null
  }

  // Show loading state while checking preference
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          <div
            className="absolute w-16 h-16 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(16, 185, 129, 0.1))',
              animation: 'pulse-ring 1.5s ease-in-out infinite'
            }}
          />
          <div className="relative w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-xl">R</span>
          </div>
        </div>
        <style jsx>{`
          @keyframes pulse-ring {
            0% { transform: scale(0.95); opacity: 0.7; }
            50% { transform: scale(1.1); opacity: 0.3; }
            100% { transform: scale(0.95); opacity: 0.7; }
          }
        `}</style>
      </div>
    )
  }

  // Render the appropriate view based on mode
  if (appMode === 'contractor') {
    return <IOSContractorHomeView onSwitchToHomeowner={switchToHomeowner} />
  }

  return <IOSHomeView onSwitchToContractor={switchToContractor} />
}
