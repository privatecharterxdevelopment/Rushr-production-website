'use client'

import React from 'react'
import { Capacitor } from '@capacitor/core'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  text?: string
  fullScreen?: boolean
  className?: string
  color?: 'blue' | 'emerald'
}

// Rushr logo URL (static SVG)
const RUSHR_LOGO_URL = 'https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg'

// ========================================
// UNIFIED LOADER - Logo with spinner ring
// Use this ONE loader throughout the app
// ========================================
export function RushrLoader({
  size = 'md',
  text
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  text?: string
}) {
  const sizes = {
    sm: { container: 40, logo: 24, border: 2 },
    md: { container: 56, logo: 32, border: 3 },
    lg: { container: 72, logo: 44, border: 3 },
    xl: { container: 96, logo: 56, border: 4 }
  }

  const s = sizes[size]

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex items-center justify-center"
        style={{ width: s.container, height: s.container }}
      >
        {/* Spinning ring */}
        <div
          className="absolute inset-0 rounded-full border-emerald-200 border-t-emerald-600 animate-spin"
          style={{ borderWidth: s.border }}
        />
        {/* Logo in center */}
        <img
          src={RUSHR_LOGO_URL}
          alt="Rushr"
          style={{ width: s.logo, height: s.logo }}
          className="object-contain"
        />
      </div>
      {text && (
        <p className="text-slate-600 text-sm mt-3">{text}</p>
      )}
    </div>
  )
}

// Full screen loader with white background
export function FullScreenLoading({ text }: { text?: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
    >
      <RushrLoader size="lg" text={text} />
    </div>
  )
}

// iOS Native Loading Component - Splash style with pulsing logo
function IOSNativeLoader({ size = 'lg', text }: { size?: 'sm' | 'md' | 'lg' | 'xl', text?: string }) {
  const logoSizes = {
    sm: 64,
    md: 80,
    lg: 96,
    xl: 112
  }

  const logoSize = logoSizes[size]

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: logoSize, height: logoSize }}>
        {/* Pulsing background - matches splash screen */}
        <div
          className="absolute inset-0 rounded-3xl"
          style={{
            background: 'rgba(255,255,255,0.2)',
            animation: 'rushr-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
          }}
        />
        {/* White container with logo */}
        <div
          className="relative bg-white rounded-3xl flex items-center justify-center shadow-2xl"
          style={{ width: logoSize, height: logoSize, padding: logoSize * 0.125 }}
        >
          <img
            src={RUSHR_LOGO_URL}
            alt="Rushr"
            className="w-full h-full object-contain"
          />
        </div>
      </div>
      {text && (
        <p className="text-white/80 text-sm mt-4">{text}</p>
      )}
      <style jsx>{`
        @keyframes rushr-ping {
          0% { transform: scale(1); opacity: 0.8; }
          75%, 100% { transform: scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

export default function LoadingSpinner({
  size = 'md',
  text,
  fullScreen = false,
  className = ''
}: LoadingSpinnerProps) {
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

  // iOS Native: Green gradient fullscreen with pulsing Rushr logo (matches splash)
  if (isNative) {
    if (fullScreen) {
      return (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'linear-gradient(160deg, #10b981 0%, #059669 50%, #047857 100%)' }}
        >
          <IOSNativeLoader size={size} text={text} />
        </div>
      )
    }

    return (
      <div
        className={`min-h-screen flex items-center justify-center ${className}`}
        style={{ background: 'linear-gradient(160deg, #10b981 0%, #059669 50%, #047857 100%)' }}
      >
        <IOSNativeLoader size={size} text={text} />
      </div>
    )
  }

  // Web: Use RushrLoader (logo with spinner ring) - same as iOS just different background
  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <RushrLoader size={size} text={text} />
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <RushrLoader size={size} text={text} />
    </div>
  )
}

// Inline loading spinner for buttons - simple spinner ring
export function ButtonSpinner({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <div className={`${className} relative`}>
      <div className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin" />
    </div>
  )
}

// Page loading wrapper - iOS native aware
export function PageLoading({ children, isLoading, loadingText }: {
  children: React.ReactNode
  isLoading: boolean
  loadingText?: string
}) {
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

  if (isLoading) {
    if (isNative) {
      // iOS: Green gradient fullscreen with pulsing Rushr logo (matches splash)
      return (
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: 'linear-gradient(160deg, #10b981 0%, #059669 50%, #047857 100%)' }}
        >
          <IOSNativeLoader size="lg" text={loadingText} />
        </div>
      )
    }

    // Web: White background with RushrLoader
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <RushrLoader size="lg" text={loadingText} />
      </div>
    )
  }

  return <>{children}</>
}

// Dedicated iOS native loading screen component - Green gradient splash style
export function IOSLoadingScreen({ size = 'lg', text }: { size?: 'sm' | 'md' | 'lg' | 'xl', text?: string }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #10b981 0%, #059669 50%, #047857 100%)' }}
    >
      <IOSNativeLoader size={size} text={text} />
    </div>
  )
}
