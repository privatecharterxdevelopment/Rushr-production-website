import React from 'react'
import { Capacitor } from '@capacitor/core'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  text?: string
  fullScreen?: boolean
  className?: string
  color?: 'blue' | 'emerald'
}

// Animated logo URL - consistent across the app
const LOADING_LOGO_URL = 'https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif'

// Universal Full-Screen Loading Component - Pure white background with animated logo
// Matches the iOS native splash screen exactly - no safe area padding to avoid colored gaps
export function FullScreenLoading() {
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
      <img
        src={LOADING_LOGO_URL}
        alt="Loading..."
        style={{ width: 64, height: 64, objectFit: 'contain' }}
      />
    </div>
  )
}

// Rushr logo URL
const RUSHR_LOGO_URL = 'https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg'

// iOS Native Loading Component - Rushr logo with circular spinner
function IOSNativeLoader({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const containerSizes = {
    sm: 'w-16 h-16',
    md: 'w-20 h-20',
    lg: 'w-24 h-24',
    xl: 'w-32 h-32'
  }

  const logoSizes = {
    sm: 48,
    md: 64,
    lg: 80,
    xl: 100
  }

  return (
    <div className={`relative ${containerSizes[size]} flex items-center justify-center`}>
      {/* Spinning circle border */}
      <div
        className={`absolute inset-0 rounded-full border-4 border-emerald-200/30 border-t-emerald-500 animate-spin`}
        style={{ animationDuration: '1s' }}
      />
      {/* Rushr logo in center */}
      <img
        src={RUSHR_LOGO_URL}
        alt="Rushr"
        width={logoSizes[size]}
        height={logoSizes[size]}
        style={{ objectFit: 'contain' }}
      />
    </div>
  )
}

export default function LoadingSpinner({
  size = 'md',
  text = 'Loading...',
  fullScreen = false,
  className = '',
  color = 'blue'
}: LoadingSpinnerProps) {
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  }

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  }

  // iOS Native: White fullscreen with Rushr logo and circular spinner
  if (isNative) {
    if (fullScreen) {
      return (
        <div
          className="fixed inset-0 bg-white flex items-center justify-center z-50"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <IOSNativeLoader size={size} />
        </div>
      )
    }

    return (
      <div
        className={`min-h-screen bg-white flex items-center justify-center ${className}`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <IOSNativeLoader size={size} />
      </div>
    )
  }

  // Web: Original behavior with text
  const spinner = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <img
        src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
        alt="Loading..."
        className={`${sizeClasses[size]} object-contain`}
      />
      {text && (
        <p className={`${textSizes[size]} text-gray-600 font-medium`}>
          {text}
        </p>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50">
        {spinner}
      </div>
    )
  }

  return spinner
}

// Inline loading spinner for buttons
export function ButtonSpinner({ className = 'w-5 h-5' }: { className?: string }) {
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

  if (isNative) {
    // iOS: Simple white spinner for buttons
    return (
      <div className={`${className} relative`}>
        <div className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      </div>
    )
  }

  return (
    <img
      src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
      alt="Loading..."
      className={`${className} object-contain`}
    />
  )
}

// Page loading wrapper - iOS native aware
export function PageLoading({ children, isLoading, loadingText = 'Loading...' }: {
  children: React.ReactNode
  isLoading: boolean
  loadingText?: string
}) {
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

  if (isLoading) {
    if (isNative) {
      // iOS: White fullscreen with Rushr logo and spinner
      return (
        <div
          className="min-h-screen bg-white flex items-center justify-center"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <IOSNativeLoader size="lg" />
        </div>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text={loadingText} />
      </div>
    )
  }

  return <>{children}</>
}

// Dedicated iOS native loading screen component
export function IOSLoadingScreen({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <div
      className="min-h-screen bg-white flex items-center justify-center"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <IOSNativeLoader size={size} />
    </div>
  )
}
