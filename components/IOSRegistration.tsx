// components/IOSRegistration.tsx
// iOS app registration - Pure native, no web elements
'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

type Screen = 'splash' | 'welcome' | 'signin' | 'signup'

// Haptic feedback
const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Light) => {
  try { await Haptics.impact({ style }) } catch (e) {}
}

const triggerNotification = async (type: NotificationType) => {
  try { await Haptics.notification({ type }) } catch (e) {}
}

interface Props {
  onSwitchToContractor?: () => void
}

export default function IOSRegistration({ onSwitchToContractor }: Props) {
  const { signIn, signUp } = useAuth()

  const [screen, setScreen] = useState<Screen>('splash')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-advance from splash
  useEffect(() => {
    const timer = setTimeout(() => setScreen('welcome'), 2000)
    return () => clearTimeout(timer)
  }, [])

  const handleSignIn = async () => {
    if (!email || !password) {
      await triggerNotification(NotificationType.Error)
      setError('Please enter email and password')
      return
    }
    setLoading(true)
    setError(null)
    const result = await signIn(email, password)
    if (result.error) {
      await triggerNotification(NotificationType.Error)
      setError(result.error)
      setLoading(false)
    } else {
      await triggerNotification(NotificationType.Success)
    }
  }

  const handleSignUp = async () => {
    if (!email || !password || !name) {
      await triggerNotification(NotificationType.Error)
      setError('Please fill in all fields')
      return
    }
    if (password.length < 8) {
      await triggerNotification(NotificationType.Error)
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError(null)
    const result = await signUp(email, password, name, 'homeowner')
    if (result.error) {
      await triggerNotification(NotificationType.Error)
      setError(result.error)
      setLoading(false)
    } else if (result.needsConfirmation) {
      await triggerNotification(NotificationType.Warning)
      setError('Check your email to confirm your account')
      setLoading(false)
    } else {
      await triggerNotification(NotificationType.Success)
    }
  }

  const navigateTo = async (newScreen: Screen) => {
    await triggerHaptic()
    setError(null)
    setScreen(newScreen)
  }

  // ============= SPLASH SCREEN =============
  if (screen === 'splash') {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #10b981 0%, #059669 50%, #047857 100%)' }}
      >
        {/* Animated Logo */}
        <div className="relative">
          <div
            className="absolute inset-0 w-28 h-28 rounded-3xl"
            style={{
              background: 'rgba(255,255,255,0.2)',
              animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
            }}
          />
          <div className="relative w-28 h-28 bg-white rounded-3xl flex items-center justify-center shadow-2xl p-3">
            <img
              src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg"
              alt="Rushr"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
        <p className="text-white/70 text-sm mt-6">Get help fast</p>

        <style jsx>{`
          @keyframes ping {
            0% { transform: scale(1); opacity: 0.8; }
            75%, 100% { transform: scale(1.3); opacity: 0; }
          }
        `}</style>
      </div>
    )
  }

  // ============= WELCOME SCREEN =============
  if (screen === 'welcome') {
    return (
      <div className="fixed inset-0 bg-white flex flex-col">
        {/* Hero Section - Map Background with Green Overlay */}
        <div
          className="flex-1 flex flex-col items-center justify-center px-8 relative overflow-hidden"
          style={{ minHeight: '60%' }}
        >
          {/* Map Background Image */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'url(https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/-74.006,40.7128,12,0/800x1200@2x?access_token=pk.eyJ1IjoicnVzaHJhcHAiLCJhIjoiY200OHFyZTR1MDRoNzJrcjNjOWR2NDhzNyJ9.AJC5_k3SJyFNgKb0c5WDCQ)',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          />
          {/* Green Gradient Overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.85) 0%, rgba(5, 150, 105, 0.92) 100%)'
            }}
          />

          {/* Headline - No logo needed, shown in splash */}
          <h1 className="text-white text-[32px] font-bold text-center tracking-tight relative z-10 leading-tight">
            Emergency help,{'\n'}on demand
          </h1>
          <p className="text-white/80 text-base text-center mt-3 relative z-10">
            Connect with verified pros in minutes
          </p>
        </div>

        {/* Bottom Section - Just Buttons */}
        <div
          className="bg-white px-6 pt-6 pb-6"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 34px), 34px)' }}
        >
          {/* Buttons Only */}
          <button
            onClick={() => navigateTo('signup')}
            className="w-full py-4 rounded-2xl font-semibold text-[17px] text-white mb-3 active:scale-[0.98] transition-transform"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
            }}
          >
            Get Started
          </button>

          <button
            onClick={() => navigateTo('signin')}
            className="w-full py-4 bg-gray-100 rounded-2xl font-semibold text-[17px] text-gray-900 active:bg-gray-200 active:scale-[0.98] transition-all"
          >
            I already have an account
          </button>

          {/* Switch to Contractor */}
          {onSwitchToContractor && (
            <button
              onClick={onSwitchToContractor}
              className="w-full text-center text-gray-500 text-sm mt-4 py-2"
            >
              Are you a pro? <span className="text-emerald-600 font-medium">Join as contractor</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  // ============= SIGN IN SCREEN =============
  if (screen === 'signin') {
    return (
      <div className="fixed inset-0 bg-white flex flex-col">
        {/* Back button - floating */}
        <div
          className="absolute left-4 z-20"
          style={{ top: 'max(calc(env(safe-area-inset-top, 44px) + 12px), 56px)' }}
        >
          <button
            onClick={() => navigateTo('welcome')}
            className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center active:bg-black/10"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 44px) + 80px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 100px)'
          }}
        >
          <div className="px-6 pt-6">
            {/* Title */}
            <h1 className="text-[28px] font-bold text-gray-900 mb-2">Welcome back</h1>
            <p className="text-gray-500 text-[15px] mb-8">Sign in to continue</p>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 rounded-xl border border-red-100">
                <p className="text-red-600 text-[14px]">{error}</p>
              </div>
            )}

            {/* Form */}
            <div className="space-y-5">
              <div>
                <label className="block text-gray-600 text-[13px] font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-gray-600 text-[13px] font-medium mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-4 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>

              <button className="text-emerald-600 text-[14px] font-medium">
                Forgot password?
              </button>
            </div>
          </div>
        </div>

        {/* Fixed bottom button */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 pt-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 16px)' }}
        >
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full py-4 rounded-2xl font-semibold text-[17px] text-white active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </div>
    )
  }

  // ============= SIGN UP SCREEN =============
  if (screen === 'signup') {
    return (
      <div className="fixed inset-0 bg-white flex flex-col">
        {/* Back button - floating */}
        <div
          className="absolute left-4 z-20"
          style={{ top: 'max(calc(env(safe-area-inset-top, 44px) + 12px), 56px)' }}
        >
          <button
            onClick={() => navigateTo('welcome')}
            className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center active:bg-black/10"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Scrollable content - includes button at bottom so it's always visible when scrolled */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 44px) + 60px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 34px) + 20px)'
          }}
        >
          <div className="px-6 pt-6">
            {/* Title - reduced spacing */}
            <h1 className="text-[28px] font-bold text-gray-900 mb-2">Create account</h1>
            <p className="text-gray-500 text-[15px] mb-6">Get started in seconds</p>

            {/* Error */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 rounded-xl border border-red-100">
                <p className="text-red-600 text-[14px]">{error}</p>
              </div>
            )}

            {/* Form - constrained width for better proportions */}
            <div className="space-y-4 max-w-sm mx-auto">
              <div>
                <label className="block text-gray-600 text-[13px] font-medium mb-2">Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  autoCapitalize="words"
                  className="w-full px-4 py-3.5 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-gray-600 text-[13px] font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full px-4 py-3.5 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-gray-600 text-[13px] font-medium mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-4 py-3.5 bg-gray-50 rounded-xl text-gray-900 text-[16px] placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>

              {/* Create Account Button - inline with form so it scrolls into view */}
              <button
                onClick={handleSignUp}
                disabled={loading}
                className="w-full py-4 rounded-2xl font-semibold text-[17px] text-white active:scale-[0.98] transition-transform disabled:opacity-50 mt-6"
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                }}
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>

              <p className="text-gray-400 text-[12px] text-center mt-4 pb-4">
                By continuing, you agree to our Terms & Privacy Policy
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
