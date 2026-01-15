// components/IOSProWizardWrapper.tsx
// Wrapper to make Pro Wizard mobile-friendly on iOS
'use client'

import React, { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import Link from 'next/link'

interface IOSProWizardWrapperProps {
  children: React.ReactNode
}

// Simple loading spinner
const LoadingLogo = () => (
  <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    <p className="text-gray-500 text-sm mt-4">Loading...</p>
  </div>
)

export default function IOSProWizardWrapper({ children }: IOSProWizardWrapperProps) {
  const [isNative, setIsNative] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
    setLoading(false)
  }, [])

  if (loading) {
    return <LoadingLogo />
  }

  // If not native, just render children normally
  if (!isNative) {
    return <>{children}</>
  }

  // iOS native wrapper with proper mobile styling
  return (
    <div className="fixed inset-0 bg-gray-50 flex flex-col">
      {/* iOS Header */}
      <div className="bg-white border-b border-gray-100 pt-safe">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-gray-600 text-sm">Back</span>
          </Link>
          <h1 className="text-base font-semibold text-gray-900">Become a Pro</h1>
          <div className="w-16" /> {/* Spacer for balance */}
        </div>
      </div>

      {/* Content with iOS-optimized styling */}
      <div className="flex-1 overflow-y-auto pb-safe ios-wizard-content">
        <style jsx global>{`
          /* iOS Pro Wizard optimizations */
          .ios-wizard-content .section {
            min-height: auto !important;
            padding-top: 1rem !important;
            padding-bottom: 2rem !important;
          }

          .ios-wizard-content .container {
            padding-left: 1rem !important;
            padding-right: 1rem !important;
          }

          /* Hide desktop header row on iOS */
          .ios-wizard-content .mb-5.flex.items-center.justify-between {
            display: none !important;
          }

          /* Make form cards fit better */
          .ios-wizard-content form {
            border-radius: 1rem !important;
            padding: 1rem !important;
          }

          /* Optimize inputs for mobile */
          .ios-wizard-content input,
          .ios-wizard-content textarea,
          .ios-wizard-content select {
            font-size: 16px !important; /* Prevents zoom on iOS */
            padding: 0.75rem !important;
            border-radius: 0.75rem !important;
          }

          /* Buttons */
          .ios-wizard-content button {
            padding: 0.75rem 1rem !important;
            border-radius: 0.75rem !important;
            font-size: 14px !important;
          }

          /* Labels */
          .ios-wizard-content label {
            font-size: 13px !important;
          }

          /* Grid to single column on mobile */
          .ios-wizard-content .grid.md\\:grid-cols-2 {
            grid-template-columns: 1fr !important;
          }

          /* Progress bar */
          .ios-wizard-content .h-2.rounded-full {
            height: 4px !important;
          }

          /* Step navigation buttons */
          .ios-wizard-content .flex.justify-between.mt-4 button,
          .ios-wizard-content .flex.justify-between.mt-6 button {
            flex: 1;
            margin: 0 0.25rem;
          }

          /* Make checkboxes/radios tappable */
          .ios-wizard-content input[type="checkbox"],
          .ios-wizard-content input[type="radio"] {
            width: 20px !important;
            height: 20px !important;
          }

          /* Tag inputs */
          .ios-wizard-content .flex.flex-wrap.gap-2 button {
            padding: 0.5rem 0.75rem !important;
            font-size: 13px !important;
          }
        `}</style>
        {children}
      </div>
    </div>
  )
}
