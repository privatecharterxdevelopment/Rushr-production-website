// components/IOSHomeView.tsx
// iOS app main view - True native experience with full database integration
'use client'

import React, { useEffect, useMemo, useState, useCallback, Component, ErrorInfo, ReactNode, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useApp } from '../lib/state'
import { useAuth } from '../contexts/AuthContext'
import { useHomeownerStats, HomeownerJob } from '../lib/hooks/useHomeownerStats'
import { useConversations } from '../lib/hooks/useMessaging'
import { supabase } from '../lib/supabaseClient'
import dynamic from 'next/dynamic'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import IOSRegistration from './IOSRegistration'
import IOSTabBar, { TabId } from './IOSTabBar'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Keyboard } from '@capacitor/keyboard'
import { App } from '@capacitor/app'
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { getCurrentLocation as getNativeLocation, isNativePlatform } from '../lib/nativeLocation'
import type { FindProMapboxHandle } from './FindProMapbox'
import PaymentModal from './PaymentModal'
import OfferJobModal from './OfferJobModal'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { RushrLoader } from './LoadingSpinner'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, { locale: 'en' })

// Error Boundary to catch render errors
interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class IOSErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('IOSHomeView Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-500 text-center mb-4 text-sm">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-emerald-600 text-white rounded-full font-medium active:scale-95 transition-transform"
          >
            Reload App
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Dynamically import the Mapbox component
const FindProMapbox = dynamic(() => import('./FindProMapbox'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
      <LoadingLogo />
    </div>
  )
})

type LatLng = [number, number]

// Haptic feedback helper
const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Light) => {
  try {
    await Haptics.impact({ style })
  } catch (e) {
    // Haptics not available
  }
}

// Loading logo — uses unified Rushr branding (logo + emerald spinner ring)
const LoadingLogo = () => <RushrLoader size="lg" />

// Native iOS List Item component
const ListItem = ({
  icon,
  title,
  subtitle,
  href,
  onClick,
  danger = false,
  showChevron = true
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  href?: string
  onClick?: () => void
  danger?: boolean
  showChevron?: boolean
}) => {
  const handlePress = async () => {
    await triggerHaptic()
    onClick?.()
  }

  const content = (
    <div
      className="flex items-center justify-between py-3.5 px-4 active:bg-gray-100"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="flex items-center gap-3">
        <div className={danger ? 'text-red-500' : 'text-gray-500'}>{icon}</div>
        <div>
          <p className={`text-[15px] ${danger ? 'text-red-500' : 'text-gray-900'}`}>{title}</p>
          {subtitle && <p className="text-[13px] text-gray-400">{subtitle}</p>}
        </div>
      </div>
      {showChevron && (
        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} onClick={handlePress}>
        {content}
      </Link>
    )
  }

  return (
    <button onClick={handlePress} className="w-full text-left">
      {content}
    </button>
  )
}

// Native iOS Card component
const IOSCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`bg-white rounded-xl overflow-hidden ${className}`}
    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
  >
    {children}
  </div>
)

// Divider component
const Divider = () => <div className="h-px bg-gray-100 ml-14" />

// Minimal Bottom Sheet — Uber/Bolt style. Map shows the route, sheet is compact.
interface ContractorBottomSheetProps {
  contractor: any
  onClose: () => void
  onContact: (contractor: any) => void
  onStartJob: (contractor: any) => void
  onViewProfile: (contractor: any) => void
  eta?: string | null
  loadingETA?: boolean
  bookingLoading?: boolean
  savedCard?: { brand: string; last4: string } | null
  enrichedData?: any
  loadingEnrichedData?: boolean
  paymentError?: string | null
  jobDescription?: string
  onJobDescriptionChange?: (val: string) => void
}

function ContractorBottomSheet({ contractor, onClose, onContact, onStartJob, onViewProfile, eta, loadingETA, bookingLoading, savedCard, enrichedData, loadingEnrichedData, paymentError, jobDescription, onJobDescriptionChange }: ContractorBottomSheetProps) {
  const [expanded, setExpanded] = React.useState(false)

  const handleContact = async () => {
    await triggerHaptic(ImpactStyle.Medium)
    onContact(contractor)
  }
  const handleViewProfile = async () => {
    await triggerHaptic()
    onViewProfile(contractor)
  }
  const handleStartJob = async () => {
    await triggerHaptic(ImpactStyle.Medium)
    onStartJob(contractor)
  }
  const toggleExpand = async () => {
    await triggerHaptic()
    setExpanded(prev => !prev)
  }

  const rating = contractor?.rating ? Number(contractor.rating).toFixed(1) : null
  const hourlyRate = enrichedData?.hourly_rate || contractor?.hourly_rate
  const profileImage = enrichedData?.profile_image_url || contractor?.profile_image_url
  const services = Array.isArray(contractor?.services) ? contractor.services : (enrichedData?.categories || [])
  const yearsExp = enrichedData?.years_in_business || contractor?.years
  const city = contractor?.city || ''
  const state = contractor?.state || ''

  // Parse ETA "X.X mi • Y min drive"
  const etaParts = eta ? eta.match(/^([\d.]+)\s*mi\s*•\s*(\d+)\s*min/) : null
  const etaDistance = etaParts ? etaParts[1] : null
  const etaMinutes = etaParts ? etaParts[2] : null

  return (
    <>
      {/* Bottom Sheet — no backdrop so map + route stays visible */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 70px)',
          animation: 'slideUp 0.25s ease-out',
          boxShadow: '0 -4px 30px rgba(0,0,0,0.15)',
          transition: 'max-height 0.3s ease'
        }}
      >
        {/* Handle bar — tap to expand/collapse */}
        <div className="flex items-center justify-between px-5 pt-3 pb-1" onClick={toggleExpand}>
          <div className="w-8" />
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
          <button onClick={(e) => { e.stopPropagation(); onClose() }} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-3">
          {/* === COLLAPSED: image + name + ETA number + Start Job === */}
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {profileImage ? (
                <img src={profileImage} alt="" className="w-12 h-12 rounded-2xl object-cover border border-gray-200" />
              ) : (
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                  <span className="text-white font-bold text-lg">{(contractor?.business_name || contractor?.name || 'C')[0].toUpperCase()}</span>
                </div>
              )}
            </div>

            {/* Name + rating */}
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-bold text-gray-900 truncate">
                {contractor?.business_name || contractor?.name || 'Contractor'}
              </h3>
              {rating && (
                <span className="flex items-center gap-0.5 text-[12px]">
                  <span className="text-amber-400">★</span>
                  <span className="font-medium text-gray-600">{rating}</span>
                </span>
              )}
            </div>

            {/* EAT — large 00:00 format like Uber */}
            <div className="flex-shrink-0 text-right">
              {loadingETA ? (
                <div className="w-14 h-8 rounded bg-gray-100 animate-pulse" />
              ) : etaMinutes ? (
                <>
                  <p className="text-[28px] font-bold text-gray-900 leading-none font-mono tracking-tight">{etaMinutes.padStart(2, '0')}:00</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">EAT</p>
                </>
              ) : null}
            </div>

          </div>

          {/* === EXPANDED: details + buttons === */}
          {expanded && (
            <div style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
              {/* Divider */}
              <div className="h-px bg-gray-100 my-3" />

              {/* Distance + Rate row */}
              <div className="flex items-center gap-3 mb-3">
                {etaDistance && (
                  <span className="text-[13px] text-gray-500">{etaDistance} mi away</span>
                )}
                {etaDistance && hourlyRate && <span className="text-gray-300">•</span>}
                {hourlyRate && (
                  <span className="text-[13px] font-semibold text-emerald-600">${hourlyRate}/hr</span>
                )}
                {(city || state) && (
                  <>
                    <span className="text-gray-300">•</span>
                    <span className="text-[13px] text-gray-500">{[city, state].filter(Boolean).join(', ')}</span>
                  </>
                )}
              </div>

              {/* Services pills */}
              {services.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {services.slice(0, 4).map((s: string, i: number) => (
                    <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-medium">{s}</span>
                  ))}
                  {services.length > 4 && (
                    <span className="px-2.5 py-1 bg-gray-50 text-gray-400 rounded-lg text-[11px]">+{services.length - 4}</span>
                  )}
                </div>
              )}

              {/* Quick stats */}
              {yearsExp && (
                <p className="text-[12px] text-gray-400 mb-3">{yearsExp}+ years experience</p>
              )}

              {/* Saved card (compact) */}
              {savedCard && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl mb-3">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <span className="text-[12px] text-gray-600 capitalize">{savedCard.brand} •••• {savedCard.last4}</span>
                </div>
              )}

              {/* Payment Error */}
              {paymentError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 mb-3">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-[12px] text-red-700">{paymentError}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleContact}
                  className="flex-1 py-2.5 rounded-xl font-medium text-[14px] text-emerald-700 border border-emerald-200 bg-emerald-50 active:bg-emerald-100 transition-colors"
                >
                  Direct Offer
                </button>
                <button
                  onClick={handleStartJob}
                  disabled={bookingLoading}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-[14px] text-white disabled:opacity-60 active:scale-[0.98] transition-transform"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  {bookingLoading ? 'Starting...' : 'Start Job'}
                </button>
              </div>
            </div>
          )}

          {/* Expand hint when collapsed */}
          {!expanded && (
            <button onClick={toggleExpand} className="w-full flex items-center justify-center pt-2">
              <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}

// Full-screen Contractor Profile View — opens inline when "View Profile" is tapped
function ContractorProfileView({ contractor, enrichedData, eta, onClose, onStartJob, onContact }: {
  contractor: any
  enrichedData: any
  eta?: string | null
  onClose: () => void
  onStartJob: (contractor: any) => void
  onContact: (contractor: any) => void
}) {
  const profileImage = enrichedData?.profile_image_url || contractor?.profile_image_url
  const name = contractor?.business_name || contractor?.name || 'Contractor'
  const contactName = contractor?.name
  const rating = contractor?.rating ? Number(contractor.rating).toFixed(1) : null
  const bio = enrichedData?.bio || contractor?.bio || contractor?.description
  const hourlyRate = enrichedData?.hourly_rate || contractor?.hourly_rate
  const services = Array.isArray(contractor?.services) ? contractor.services : (enrichedData?.categories || [])
  const city = contractor?.city || ''
  const state = contractor?.state || ''

  const etaParts = eta ? eta.match(/^([\d.]+)\s*mi\s*•\s*(\d+)\s*min/) : null
  const etaDistance = etaParts ? etaParts[1] : null
  const etaMinutes = etaParts ? etaParts[2] : null

  return (
    <div className="fixed inset-0 z-[60] bg-white" style={{ animation: 'slideUp 0.25s ease-out' }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-5 flex items-center gap-3"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 54px), 54px)',
          paddingBottom: '12px',
          background: 'linear-gradient(135deg, #10b981, #059669)'
        }}
      >
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center active:scale-95 transition-transform">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-white font-semibold text-[17px]">Contractor Profile</h1>
      </div>

      {/* Scrollable content */}
      <div className="overflow-y-auto" style={{ height: 'calc(100vh - max(env(safe-area-inset-top, 54px), 54px) - 12px - 32px)' }}>
        {/* Profile Card */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-4">
            {profileImage ? (
              <img src={profileImage} alt="" className="w-20 h-20 rounded-2xl object-cover border-2 border-gray-200" />
            ) : (
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <span className="text-white font-bold text-2xl">{name[0].toUpperCase()}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-[20px] font-bold text-gray-900 truncate">{name}</h2>
              {contactName && contactName !== name && (
                <p className="text-[13px] text-gray-500">{contactName}</p>
              )}
              {rating && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1">
                    <span className="text-amber-400 text-[16px]">★</span>
                    <span className="text-[16px] font-semibold text-gray-900">{rating}</span>
                  </div>
                  {contractor?.total_reviews && (
                    <span className="text-[13px] text-gray-400">({contractor.total_reviews} reviews)</span>
                  )}
                </div>
              )}
              {(city || state) && (
                <div className="flex items-center gap-1 mt-1 text-[13px] text-gray-500">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{[city, state].filter(Boolean).join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ETA Card */}
        {eta && (
          <div className="mx-5 mb-4 bg-emerald-50 rounded-xl p-4 border border-emerald-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[24px] font-bold text-emerald-700">{etaMinutes || '?'} min</p>
                  <p className="text-[12px] text-emerald-600 -mt-1">Estimated arrival</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[18px] font-semibold text-gray-700">{etaDistance || '?'} mi</p>
                <p className="text-[11px] text-gray-400">driving</p>
              </div>
            </div>
          </div>
        )}

        {/* Services */}
        {services.length > 0 && (
          <div className="px-5 mb-4">
            <div className="flex flex-wrap gap-2">
              {services.map((svc: string) => (
                <span key={svc} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-[13px] font-medium">{svc}</span>
              ))}
            </div>
          </div>
        )}

        {/* Stats Section */}
        <div className="mx-5 mb-4 bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex justify-between">
            {(enrichedData?.years_in_business || contractor?.years_experience) && (
              <div className="text-center flex-1">
                <p className="text-[18px] font-bold text-gray-900">{enrichedData?.years_in_business || contractor.years_experience}+</p>
                <p className="text-[11px] text-gray-500">years exp.</p>
              </div>
            )}
            {enrichedData?.total_jobs != null && (
              <div className="text-center flex-1">
                <p className="text-[18px] font-bold text-gray-900">{enrichedData.total_jobs}</p>
                <p className="text-[11px] text-gray-500">jobs done</p>
              </div>
            )}
            {enrichedData?.response_time_minutes && (
              <div className="text-center flex-1">
                <p className="text-[18px] font-bold text-gray-900">{enrichedData.response_time_minutes}m</p>
                <p className="text-[11px] text-gray-500">response</p>
              </div>
            )}
          </div>
        </div>

        {/* Pricing Section */}
        <div className="mx-5 mb-4 bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 text-[15px]">Pricing</h3>
          {hourlyRate && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-gray-500">Base rate</span>
              <span className="text-[18px] font-bold text-emerald-600">${hourlyRate}/hr</span>
            </div>
          )}
          {(enrichedData?.peak_rate || enrichedData?.off_peak_rate || enrichedData?.surge_rate) && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
              {enrichedData.off_peak_rate && (
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <p className="text-[13px] font-semibold text-slate-700">${enrichedData.off_peak_rate}</p>
                  <p className="text-[10px] text-slate-400">Off-peak</p>
                </div>
              )}
              {enrichedData.peak_rate && (
                <div className="text-center p-2 bg-amber-50 rounded-lg">
                  <p className="text-[13px] font-semibold text-amber-700">${enrichedData.peak_rate}</p>
                  <p className="text-[10px] text-amber-500">Peak</p>
                </div>
              )}
              {enrichedData.surge_rate && (
                <div className="text-center p-2 bg-red-50 rounded-lg">
                  <p className="text-[13px] font-semibold text-red-700">${enrichedData.surge_rate}</p>
                  <p className="text-[10px] text-red-400">Surge</p>
                </div>
              )}
            </div>
          )}
          {(enrichedData?.visit_fee || enrichedData?.diagnostic_fee) && (
            <div className="flex gap-2 pt-2 border-t border-gray-100 mt-2">
              {enrichedData.visit_fee > 0 && (
                <div className="flex-1 flex items-center justify-between px-2 py-1.5 bg-blue-50 rounded-lg">
                  <span className="text-[11px] text-blue-600">Visit fee</span>
                  <span className="text-[13px] font-semibold text-blue-700">${enrichedData.visit_fee}</span>
                </div>
              )}
              {enrichedData.diagnostic_fee > 0 && (
                <div className="flex-1 flex items-center justify-between px-2 py-1.5 bg-purple-50 rounded-lg">
                  <span className="text-[11px] text-purple-600">Diagnostic</span>
                  <span className="text-[13px] font-semibold text-purple-700">${enrichedData.diagnostic_fee}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* About */}
        {bio && (
          <div className="mx-5 mb-4 bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-2 text-[15px]">About</h3>
            <p className="text-[14px] text-gray-600 whitespace-pre-wrap">{bio}</p>
          </div>
        )}

        {/* Credentials */}
        {(enrichedData?.license_number || enrichedData?.insurance_carrier) && (
          <div className="mx-5 mb-4 bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 text-[15px] flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
              Credentials
            </h3>
            <div className="space-y-2">
              {enrichedData.license_number && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-500">License</span>
                  <span className="text-gray-900 font-medium">{enrichedData.license_number}</span>
                </div>
              )}
              {enrichedData.insurance_carrier && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-500">Insurance</span>
                  <span className="text-gray-900 font-medium">{enrichedData.insurance_carrier}</span>
                </div>
              )}
              {enrichedData?.kyc_status === 'completed' && (
                <div className="flex items-center gap-1.5 text-emerald-600 text-[13px] mt-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Verified Professional
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="px-5 pb-8 space-y-2.5">
          <button
            onClick={() => onStartJob(contractor)}
            className="w-full py-4 rounded-2xl font-semibold text-[16px] text-white flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Start Job with {name.split(' ')[0]}
          </button>
          <button
            onClick={() => onContact(contractor)}
            className="w-full py-3.5 rounded-2xl font-medium text-[15px] text-emerald-700 border-2 border-emerald-200 bg-white active:scale-[0.98] transition-transform"
          >
            Send Direct Offer
          </button>
          <p className="text-[11px] text-gray-400 text-center mt-2">
            Payment held securely in escrow until job is complete
          </p>
        </div>
      </div>
    </div>
  )
}

// Full-Screen Contractor Bid Profile View - Shows contractor details with map
interface ContractorBidProfileViewProps {
  bid: Bid
  userLocation: LatLng
  onClose: () => void
  onAccept: () => void
  onDecline: () => void
}

function ContractorBidProfileView({ bid, userLocation, onClose, onAccept, onDecline }: ContractorBidProfileViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapObjRef = useRef<mapboxgl.Map | null>(null)
  const [contractorLocation, setContractorLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [distance, setDistance] = useState<string | null>(null)
  const [etaMinutes, setEtaMinutes] = useState<number | null>(bid.eta_minutes || null)
  const [contractorDetails, setContractorDetails] = useState<{
    name: string
    business_name?: string
    profile_image_url?: string
    rating?: number
    review_count?: number
    years_experience?: number
    services?: string[]
    city?: string
    state?: string
  } | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(true)

  // Fetch full contractor details
  useEffect(() => {
    const fetchContractorDetails = async () => {
      setLoadingDetails(true)
      try {
        const { data } = await supabase
          .from('pro_contractors')
          .select('name, business_name, profile_image_url, rating, review_count, years_experience, services, city, state, latitude, longitude')
          .eq('id', bid.contractor_id)
          .single()

        if (data) {
          setContractorDetails({
            name: data.name,
            business_name: data.business_name,
            profile_image_url: data.profile_image_url,
            rating: data.rating,
            review_count: data.review_count,
            years_experience: data.years_experience,
            services: data.services,
            city: data.city,
            state: data.state
          })

          // Set contractor location from profile or bid
          const lat = bid.contractor_latitude || data.latitude
          const lng = bid.contractor_longitude || data.longitude
          if (lat && lng) {
            setContractorLocation({ lat, lng })
          }
        }
      } catch (error) {
        console.error('Error fetching contractor details:', error)
      }
      setLoadingDetails(false)
    }

    fetchContractorDetails()
  }, [bid.contractor_id, bid.contractor_latitude, bid.contractor_longitude])

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapObjRef.current) return

    const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!MAPBOX_TOKEN) return

    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [userLocation[1], userLocation[0]],
      zoom: 12,
      attributionControl: false
    })

    mapObjRef.current = map

    // Add user location marker (green)
    new mapboxgl.Marker({ color: '#10b981' })
      .setLngLat([userLocation[1], userLocation[0]])
      .addTo(map)

    return () => {
      map.remove()
      mapObjRef.current = null
    }
  }, [userLocation])

  // Add contractor marker when location is available
  useEffect(() => {
    if (!mapObjRef.current || !contractorLocation) return

    const map = mapObjRef.current

    // Add contractor marker (blue)
    const contractorMarker = new mapboxgl.Marker({ color: '#3b82f6' })
      .setLngLat([contractorLocation.lng, contractorLocation.lat])
      .addTo(map)

    // Fit bounds to show both markers
    const bounds = new mapboxgl.LngLatBounds()
    bounds.extend([userLocation[1], userLocation[0]])
    bounds.extend([contractorLocation.lng, contractorLocation.lat])

    map.fitBounds(bounds, {
      padding: { top: 100, bottom: 350, left: 50, right: 50 },
      maxZoom: 14
    })

    // Fetch driving distance and ETA
    const fetchDistanceAndEta = async () => {
      const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!MAPBOX_TOKEN) return

      try {
        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${contractorLocation.lng},${contractorLocation.lat};${userLocation[1]},${userLocation[0]}?access_token=${MAPBOX_TOKEN}`
        )
        const data = await response.json()

        if (data.routes?.[0]) {
          const route = data.routes[0]
          const distanceMiles = (route.distance / 1609.34).toFixed(1)
          const durationMinutes = Math.round(route.duration / 60)

          setDistance(`${distanceMiles} mi`)
          setEtaMinutes(durationMinutes)
        }
      } catch (error) {
        console.error('Error fetching distance:', error)
      }
    }

    fetchDistanceAndEta()

    return () => {
      contractorMarker.remove()
    }
  }, [contractorLocation, userLocation])

  const displayName = contractorDetails?.business_name || contractorDetails?.name || bid.contractor_name || 'Contractor'
  const rating = contractorDetails?.rating || bid.contractor_rating
  const reviewCount = contractorDetails?.review_count || 0
  const services = contractorDetails?.services || []
  const location = contractorDetails?.city && contractorDetails?.state
    ? `${contractorDetails.city}, ${contractorDetails.state}`
    : null

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Full-screen Map */}
      <div
        className="absolute inset-0 w-full h-full"
        ref={mapContainerRef}
        style={{ minHeight: '100%', minWidth: '100%' }}
      />

      {/* Back Button - Floating */}
      <div
        className="absolute left-4 z-10"
        style={{ top: 'calc(env(safe-area-inset-top, 20px) + 10px)' }}
      >
        <button
          onClick={async () => {
            await triggerHaptic()
            onClose()
          }}
          className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Bottom Profile Card */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 20px)'
        }}
      >
        {/* Pull Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Profile Content */}
        <div className="px-5 pb-4">
          {loadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Contractor Info Row */}
              <div className="flex items-center gap-4 mb-4">
                {/* Avatar / Profile Image */}
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center relative overflow-hidden flex-shrink-0">
                  {contractorDetails?.profile_image_url ? (
                    <img
                      src={contractorDetails.profile_image_url}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-emerald-700 font-bold text-[28px]">
                      {displayName[0].toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Name, Rating, Location */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-[20px] font-bold text-gray-900 truncate">{displayName}</h2>

                  {/* Rating */}
                  {rating && (
                    <div className="flex items-center gap-1 mt-1">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <svg
                            key={star}
                            className={`w-4 h-4 ${star <= Math.round(rating) ? 'text-amber-400' : 'text-gray-200'}`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                      <span className="text-[13px] font-medium text-gray-700">{rating.toFixed(1)}</span>
                      {reviewCount > 0 && (
                        <span className="text-[13px] text-gray-500">({reviewCount})</span>
                      )}
                    </div>
                  )}

                  {/* Location & Experience */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {location && (
                      <span className="text-[13px] text-gray-500 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {location}
                      </span>
                    )}
                    {contractorDetails?.years_experience && (
                      <span className="text-[13px] text-gray-500">
                        • {contractorDetails.years_experience}+ yrs exp
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Distance & ETA Card */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[12px] text-gray-500 uppercase font-medium">Distance</p>
                      <p className="text-[18px] font-bold text-gray-900">{distance || 'Calculating...'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] text-gray-500 uppercase font-medium">Can Arrive In</p>
                    <p className="text-[18px] font-bold text-emerald-600">
                      {etaMinutes ? `~${etaMinutes} min` : 'Calculating...'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bid Amount Card */}
              <div className="bg-emerald-50 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] text-emerald-700 uppercase font-medium">Their Bid</p>
                    <p className="text-[32px] font-bold text-gray-900">${bid.bid_amount}</p>
                  </div>
                  {bid.message && (
                    <div className="flex-1 ml-4 text-right">
                      <p className="text-[12px] text-emerald-700 uppercase font-medium">Message</p>
                      <p className="text-[13px] text-gray-600 line-clamp-2">{bid.message}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Services */}
              {services.length > 0 && (
                <div className="mb-5">
                  <p className="text-[12px] text-gray-500 uppercase font-medium mb-2">Services</p>
                  <div className="flex flex-wrap gap-2">
                    {services.slice(0, 6).map((service: string) => (
                      <span
                        key={service}
                        className="px-3 py-1.5 bg-gray-100 rounded-lg text-[13px] text-gray-700"
                      >
                        {service}
                      </span>
                    ))}
                    {services.length > 6 && (
                      <span className="px-3 py-1.5 bg-gray-100 rounded-lg text-[13px] text-gray-500">
                        +{services.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    await triggerHaptic()
                    onDecline()
                  }}
                  className="flex-1 py-4 rounded-xl font-semibold text-[16px] text-gray-700 bg-gray-100 active:scale-95 transition-transform"
                >
                  Decline
                </button>
                <button
                  onClick={async () => {
                    await triggerHaptic(ImpactStyle.Medium)
                    onAccept()
                  }}
                  className="flex-1 py-4 rounded-xl font-semibold text-[16px] text-white active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  Accept Bid
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Full-Screen Contractor Tracking View - Shows when contractor is on the way
interface TrackingJob {
  id: string
  title: string
  status: string
  contractor_id: string | null
  contractor_name?: string
  contractor_image?: string | null
  eta_minutes?: number
  contractor_latitude?: number
  contractor_longitude?: number
  address?: string | null
  estimated_cost?: number | null
  homeowner_confirmed_complete?: boolean
  contractor_confirmed_complete?: boolean
  final_price?: number | null
  final_price_proposed_by?: string | null
  final_price_accepted?: boolean
  final_price_reason?: string | null
  direct_amount?: number | null
  contractor_marked_complete?: boolean
}

interface ContractorTrackingViewProps {
  job: TrackingJob
  userLocation: LatLng
  onBack: () => void
  onJobComplete?: () => void
}

function ContractorTrackingView({ job, userLocation, onBack, onJobComplete }: ContractorTrackingViewProps) {
  const router = useRouter()
  const mapRef = useRef<FindProMapboxHandle>(null)
  const [contractorLocation, setContractorLocation] = useState<{ lat: number; lng: number } | null>(
    job.contractor_latitude && job.contractor_longitude
      ? { lat: job.contractor_latitude, lng: job.contractor_longitude }
      : null
  )
  const [eta, setEta] = useState<number | null>(job.eta_minutes || null)
  const [distance, setDistance] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState(job.status)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [contractorImage, setContractorImage] = useState<string | null>(job.contractor_image || null)
  const [homeownerConfirmed, setHomeownerConfirmed] = useState(job.homeowner_confirmed_complete || false)
  const [contractorConfirmed, setContractorConfirmed] = useState(job.contractor_confirmed_complete || false)
  const [showInlineChat, setShowInlineChat] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelReasonOther, setCancelReasonOther] = useState('')
  const [trackingCard, setTrackingCard] = useState<{ brand: string; last4: string } | null>(null)
  const [pendingFinalPrice, setPendingFinalPrice] = useState<number | null>(job.final_price && !job.final_price_accepted ? job.final_price : null)
  const [acceptingPrice, setAcceptingPrice] = useState(false)

  // Fetch homeowner's saved card
  useEffect(() => {
    const fetchCard = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      try {
        const res = await fetch(`/api/stripe/customer/payment-methods?userId=${user.id}`)
        const data = await res.json()
        if (data.success && data.paymentMethods?.length > 0) {
          const pm = data.paymentMethods.find((p: any) => p.id === data.defaultPaymentMethodId) || data.paymentMethods[0]
          if (pm?.card) setTrackingCard({ brand: pm.card.brand, last4: pm.card.last4 })
        }
      } catch {}
    }
    fetchCard()
  }, [])

  // Fetch contractor profile image
  useEffect(() => {
    if (!job.contractor_id || contractorImage) return

    const fetchContractorImage = async () => {
      const { data } = await supabase
        .from('pro_contractors')
        .select('profile_image_url')
        .eq('id', job.contractor_id)
        .single()

      if (data?.profile_image_url) {
        setContractorImage(data.profile_image_url)
      }
    }

    fetchContractorImage()
  }, [job.contractor_id, contractorImage])

  // Subscribe to contractor location updates
  useEffect(() => {
    if (!job.contractor_id) return

    const channel = supabase
      .channel(`contractor-tracking-${job.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contractor_location_tracking',
          filter: `job_id=eq.${job.id}`
        },
        (payload) => {
          if (payload.new && 'latitude' in payload.new) {
            const loc = payload.new as any
            setContractorLocation({ lat: loc.latitude, lng: loc.longitude })
            if (loc.eta_minutes) setEta(loc.eta_minutes)
            if (loc.distance_to_job_meters) {
              setDistance(`${(loc.distance_to_job_meters / 1609.34).toFixed(1)} mi`)
            }
          }
        }
      )
      .subscribe()

    // Fetch initial location
    const fetchInitialLocation = async () => {
      const { data } = await supabase
        .from('contractor_location_tracking')
        .select('*')
        .eq('job_id', job.id)
        .eq('contractor_id', job.contractor_id)
        .order('last_update_at', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        setContractorLocation({ lat: data.latitude, lng: data.longitude })
        if (data.eta_minutes) setEta(data.eta_minutes)
        if (data.distance_to_job_meters) {
          setDistance(`${(data.distance_to_job_meters / 1609.34).toFixed(1)} mi`)
        }
      }
    }

    fetchInitialLocation()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [job.id, job.contractor_id])

  // Subscribe to job status updates
  useEffect(() => {
    const channel = supabase
      .channel(`job-status-${job.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'homeowner_jobs',
          filter: `id=eq.${job.id}`
        },
        (payload) => {
          if (payload.new) {
            const updatedJob = payload.new as any
            setJobStatus(updatedJob.status)
            setHomeownerConfirmed(updatedJob.homeowner_confirmed_complete || false)
            setContractorConfirmed(updatedJob.contractor_confirmed_complete || false)

            // Check for new final price proposal
            if (updatedJob.final_price && !updatedJob.final_price_accepted) {
              setPendingFinalPrice(updatedJob.final_price)
              triggerHaptic(ImpactStyle.Heavy)
            } else {
              setPendingFinalPrice(null)
            }

            // If contractor confirmed arrival
            if (updatedJob.status === 'in_progress' && jobStatus === 'confirmed') {
              triggerHaptic(ImpactStyle.Heavy)
            }

            // If both confirmed complete, show rating
            if (updatedJob.homeowner_confirmed_complete && updatedJob.contractor_confirmed_complete) {
              setShowRatingModal(true)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [job.id, jobStatus])

  // Calculate ETA with Mapbox Directions API
  useEffect(() => {
    const calculateETA = async () => {
      if (!contractorLocation) return

      try {
        const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (!MAPBOX_TOKEN) return

        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${contractorLocation.lng},${contractorLocation.lat};${userLocation[1]},${userLocation[0]}?overview=full&geometries=geojson&access_token=${MAPBOX_TOKEN}`
        )
        const data = await response.json()
        if (data.routes?.[0]?.duration) {
          const minutes = Math.ceil(data.routes[0].duration / 60)
          setEta(minutes)
        }
        if (data.routes?.[0]?.distance) {
          const miles = (data.routes[0].distance / 1609.34).toFixed(1)
          setDistance(`${miles} mi`)
        }
      } catch (err) {
        console.error('Error calculating ETA:', err)
      }
    }

    if (jobStatus === 'confirmed') {
      calculateETA()
      const interval = setInterval(calculateETA, 30000)
      return () => clearInterval(interval)
    }
  }, [contractorLocation, userLocation, jobStatus])

  // Show route on map
  useEffect(() => {
    if (!contractorLocation || jobStatus !== 'confirmed') return
    const drawRoute = () => {
      if (mapRef.current) {
        mapRef.current.hideRadiusCircle()
        mapRef.current.showRoute(
          contractorLocation.lat,
          contractorLocation.lng,
          userLocation[0],
          userLocation[1]
        )
      }
    }
    // Draw immediately if map ready, also retry after short delay for initial mount
    drawRoute()
    const timer = setTimeout(drawRoute, 1500)
    return () => clearTimeout(timer)
  }, [contractorLocation, userLocation, jobStatus])

  // Build items for the map
  const mapItems = useMemo(() => {
    if (!contractorLocation) return []
    return [{
      id: 'contractor',
      name: job.contractor_name || 'Contractor',
      latitude: contractorLocation.lat,
      longitude: contractorLocation.lng,
      services: ['Contractor'],
    }]
  }, [contractorLocation, job.contractor_name])

  // Handle job completion confirmation
  const handleConfirmComplete = async () => {
    setSubmitting(true)
    try {
      const response = await fetch('/api/payments/confirm-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          userType: 'homeowner'
        })
      })

      const data = await response.json()
      if (data.success) {
        await triggerHaptic(ImpactStyle.Heavy)
        setShowCompleteModal(false)
        setHomeownerConfirmed(true)

        if (data.bothConfirmed) {
          setShowRatingModal(true)
        }
      }
    } catch (err) {
      console.error('Error confirming completion:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle accepting/declining final price
  const handleFinalPriceResponse = async (accepted: boolean) => {
    setAcceptingPrice(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const response = await fetch('/api/jobs/accept-final-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          homeownerId: user.id,
          accepted
        })
      })

      const data = await response.json()
      if (data.success) {
        await triggerHaptic(ImpactStyle.Medium)
        if (accepted) {
          setPendingFinalPrice(null)
          // Now they can proceed to confirm completion
        } else {
          setPendingFinalPrice(null)
        }
      }
    } catch (err) {
      console.error('Error responding to final price:', err)
    } finally {
      setAcceptingPrice(false)
    }
  }

  // Handle rating submission
  const handleSubmitRating = async () => {
    if (rating === 0) return

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      await supabase.from('contractor_reviews').insert({
        contractor_id: job.contractor_id,
        homeowner_id: user?.id,
        job_id: job.id,
        rating,
        review: review.trim() || null
      })

      await triggerHaptic(ImpactStyle.Heavy)
      setShowRatingModal(false)
      onJobComplete?.()
      onBack()
    } catch (err) {
      console.error('Error submitting rating:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle job cancellation with reason
  const handleCancelJob = async (reason: string) => {
    setCancelling(true)
    try {
      // Demo/preview mode — just close and go back
      if (job.id === 'preview-demo') {
        await triggerHaptic(ImpactStyle.Heavy)
        setShowCancelModal(false)
        onBack()
        return
      }

      // Update job status to cancelled with reason
      await supabase
        .from('homeowner_jobs')
        .update({ status: 'cancelled', cancellation_reason: reason })
        .eq('id', job.id)

      // Cancel the payment hold if it exists
      const { data: paymentHold } = await supabase
        .from('payment_holds')
        .select('id, stripe_payment_intent_id')
        .eq('job_id', job.id)
        .in('status', ['captured', 'authorized', 'held'])
        .single()

      if (paymentHold) {
        await supabase
          .from('payment_holds')
          .update({ status: 'cancelled' })
          .eq('id', paymentHold.id)

        // Refund via Stripe if captured
        if (paymentHold.stripe_payment_intent_id) {
          try {
            await fetch('/api/stripe/refund', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentIntentId: paymentHold.stripe_payment_intent_id })
            })
          } catch (refundErr) {
            console.error('Stripe refund error (may need manual refund):', refundErr)
          }
        }
      }

      // Notify contractor
      if (job.contractor_id) {
        await supabase.from('notifications').insert({
          user_id: job.contractor_id,
          type: 'job_cancelled',
          title: 'Job Cancelled',
          message: `The homeowner cancelled the job "${job.title}". Reason: ${reason}`,
          job_id: job.id
        })
      }

      await triggerHaptic(ImpactStyle.Heavy)
      setShowCancelModal(false)
      onBack()
    } catch (err) {
      console.error('Error cancelling job:', err)
    } finally {
      setCancelling(false)
    }
  }

  // Get status display
  const getStatusInfo = () => {
    switch (jobStatus) {
      case 'confirmed':
        return { text: 'Contractor On The Way', color: 'emerald' }
      case 'in_progress':
        return { text: 'Job In Progress', color: 'blue' }
      default:
        return { text: 'Tracking', color: 'gray' }
    }
  }

  const statusInfo = getStatusInfo()

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Map Section - Full screen */}
      <div className="flex-1 relative">
        <FindProMapbox
          ref={mapRef}
          items={[]}
          radiusMiles={10}
          searchCenter={userLocation}
          userLocation={userLocation}
          fullscreen={true}
          hideSearchButton={true}
          hideControls={true}
          trackingMarker={contractorLocation ? { lat: contractorLocation.lat, lng: contractorLocation.lng, bearing: 0 } : null}
        />

        {/* Back Button */}
        <button
          onClick={onBack}
          className="absolute left-4 w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center z-10 active:scale-95 transition-transform"
          style={{ top: 'calc(max(env(safe-area-inset-top, 54px), 54px) + 8px)' }}
        >
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Bottom Card - Contractor Info */}
      <div
        className="bg-white rounded-t-3xl shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-4 pb-4">
          {/* Contractor Profile Row */}
          <div className="flex items-center gap-3 mb-3">
            {/* Profile Image */}
            <div className="relative">
              {contractorImage ? (
                <img
                  src={contractorImage}
                  alt={job.contractor_name || 'Contractor'}
                  className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center border-2 border-emerald-500">
                  <span className="text-white font-bold text-lg">
                    {(job.contractor_name || 'C')[0].toUpperCase()}
                  </span>
                </div>
              )}
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
            </div>

            {/* Name and Status */}
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 font-semibold text-[15px] truncate">{job.contractor_name || 'Contractor'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${jobStatus === 'in_progress' ? 'bg-blue-500' : 'bg-emerald-500'} animate-pulse`} />
                <span className={`text-[11px] font-medium ${jobStatus === 'in_progress' ? 'text-blue-600' : 'text-emerald-600'}`}>
                  {statusInfo.text}
                </span>
              </div>
            </div>

            {/* Chat Button */}
            <button
              onClick={() => setShowInlineChat(true)}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
          </div>

          {/* Compact Stats Row — no colored boxes */}
          <div className="flex items-center justify-between py-2.5 mb-2 border-t border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-gray-500 text-[11px]">ETA</span>
              <span className="text-gray-900 font-semibold text-[13px] ml-0.5">
                {jobStatus === 'in_progress' ? '—' : eta ? `${String(Math.floor(eta / 60)).padStart(2, '0')}:${String(eta % 60).padStart(2, '0')}` : '...'}
              </span>
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              <span className="text-gray-500 text-[11px]">Dist</span>
              <span className="text-gray-900 font-semibold text-[13px] ml-0.5">
                {jobStatus === 'in_progress' ? '—' : distance || '...'}
              </span>
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 text-[11px]">Price</span>
              <span className="text-gray-900 font-semibold text-[13px]">
                ${job.estimated_cost?.toFixed(0) || '—'}
              </span>
            </div>
          </div>

          {/* Job Title — compact */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-gray-400 text-[11px]">Job</span>
            <span className="text-gray-700 font-medium text-[13px]">{job.title}</span>
          </div>

          {/* Payment Card Tab */}
          {trackingCard && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 mb-3">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span className="text-gray-500 text-[12px] capitalize">{trackingCard.brand}</span>
              <span className="text-gray-300 text-[12px]">····</span>
              <span className="text-gray-700 font-semibold text-[12px]">{trackingCard.last4}</span>
              <svg className="w-3.5 h-3.5 text-emerald-500 ml-auto" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            </div>
          )}

          {/* Action Buttons based on status */}
          <div className="space-y-3">
            {/* Final Price Proposal — contractor proposed a different price */}
            {pendingFinalPrice && jobStatus === 'in_progress' && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 space-y-3">
                <div className="text-center">
                  <p className="text-[13px] text-amber-700 font-medium">Contractor proposed a final price</p>
                  <p className="text-[28px] font-bold text-gray-900 mt-1">${Number(pendingFinalPrice).toFixed(2)}</p>
                  {(job.direct_amount || job.final_cost) && Math.abs(Number(pendingFinalPrice) - Number((job.direct_amount || job.final_cost))) >= 0.01 && (
                    <p className="text-[12px] text-gray-500 mt-1">
                      Original: ${Number((job.direct_amount || job.final_cost)).toFixed(2)} — {Number(pendingFinalPrice) > Number((job.direct_amount || job.final_cost)) ? '+' : ''}${(Number(pendingFinalPrice) - Number((job.direct_amount || job.final_cost))).toFixed(2)}
                    </p>
                  )}
                  {job.final_price_reason && (
                    <p className="text-[11px] text-gray-400 mt-1 italic">{job.final_price_reason}</p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleFinalPriceResponse(false)}
                    disabled={acceptingPrice}
                    className="flex-1 py-3 rounded-xl font-semibold text-[14px] text-red-700 bg-red-50 border border-red-200 active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => handleFinalPriceResponse(true)}
                    disabled={acceptingPrice}
                    className="flex-1 py-3 rounded-xl font-semibold text-[14px] text-white active:scale-[0.98] transition-transform disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                  >
                    {acceptingPrice ? 'Processing...' : 'Accept'}
                  </button>
                </div>
              </div>
            )}

            {/* Job Done button - visible when in_progress and no pending price */}
            {jobStatus === 'in_progress' && !homeownerConfirmed && !pendingFinalPrice && (
              <button
                onClick={() => setShowCompleteModal(true)}
                className="w-full py-4 rounded-xl font-bold text-[16px] text-white active:scale-[0.98] transition-transform"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                Job Done
              </button>
            )}

            {/* More info link - opens cancel flow */}
            {(jobStatus === 'confirmed' || jobStatus === 'in_progress') && !homeownerConfirmed && (
              <button
                onClick={() => {
                  triggerHaptic(ImpactStyle.Light)
                  setCancelReason('')
                  setCancelReasonOther('')
                  setShowCancelModal(true)
                }}
                className="w-full text-center text-gray-400 text-[13px] py-2 active:text-gray-600"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                More info
              </button>
            )}

            {homeownerConfirmed && !contractorConfirmed && (
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <p className="text-amber-700 font-medium">Waiting for contractor to confirm completion...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Job Complete Confirmation Modal */}
      {showCompleteModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setShowCompleteModal(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 z-[60] max-w-md mx-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Job Completion</h3>
            <p className="text-gray-600 mb-6">
              Are you satisfied with the work? Once both you and the contractor confirm, the payment will be released.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="flex-1 py-3 rounded-xl font-semibold text-gray-700 bg-gray-100"
              >
                Not Yet
              </button>
              <button
                onClick={handleConfirmComplete}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl font-semibold text-white bg-emerald-600 disabled:opacity-50"
              >
                {submitting ? 'Confirming...' : 'Yes, Complete'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Full-Screen Rating View */}
      {showRatingModal && (
        <div className="fixed inset-0 bg-white z-[60] flex flex-col">
          {/* Header */}
          <div
            className="text-center pt-6 pb-4"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)' }}
          >
            <div className="text-4xl mb-2">🎉</div>
            <h2 className="text-[24px] font-bold text-gray-900">Job Complete!</h2>
          </div>

          {/* Contractor Profile - Centered */}
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            {/* Profile Image */}
            <div className="mb-6">
              {contractorImage ? (
                <img
                  src={contractorImage}
                  alt={job.contractor_name || 'Contractor'}
                  className="w-32 h-32 rounded-full object-cover border-4 border-emerald-500 shadow-xl"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center border-4 border-emerald-500 shadow-xl">
                  <span className="text-white font-bold text-5xl">
                    {(job.contractor_name || 'C')[0].toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Contractor Name */}
            <h3 className="text-[22px] font-bold text-gray-900 mb-2">
              {job.contractor_name || 'Contractor'}
            </h3>
            <p className="text-gray-500 text-[15px] mb-8">How was your experience?</p>

            {/* Star Rating - Large */}
            <div className="flex justify-center gap-4 mb-8">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={async () => {
                    await triggerHaptic(ImpactStyle.Light)
                    setRating(star)
                  }}
                  className="transition-transform active:scale-90"
                >
                  <svg
                    className={`w-12 h-12 ${star <= rating ? 'text-amber-400' : 'text-gray-300'}`}
                    fill={star <= rating ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={star <= rating ? 0 : 1.5}
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                </button>
              ))}
            </div>

            {/* Review Text - Optional */}
            <div className="w-full max-w-sm">
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Write a review (optional)"
                className="w-full p-4 bg-gray-50 border-0 rounded-2xl resize-none h-28 text-[16px] placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Bottom Button */}
          <div
            className="px-6 pb-6"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
          >
            <button
              onClick={handleSubmitRating}
              disabled={rating === 0 || submitting}
              className="w-full py-4 rounded-2xl font-bold text-[17px] text-white active:scale-[0.98] transition-transform disabled:opacity-50"
              style={{ background: rating > 0 ? 'linear-gradient(135deg, #10b981, #059669)' : '#d1d5db' }}
            >
              {submitting ? 'Submitting...' : 'Confirm Review'}
            </button>
            {rating === 0 && (
              <p className="text-center text-gray-400 text-[13px] mt-3">
                Tap the stars to rate your experience
              </p>
            )}
          </div>
        </div>
      )}

      {/* Cancel Job - Full Screen with Reason */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-[70] bg-white flex flex-col"
          style={{ animation: 'slideUp 0.25s ease-out' }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 border-b border-gray-100"
            style={{ paddingTop: 'calc(max(env(safe-area-inset-top, 54px), 54px) + 8px)' }}
          >
            <button
              onClick={() => setShowCancelModal(false)}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center active:scale-95"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-[17px] font-semibold text-gray-900">Cancel Job</h2>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 pt-6">
            <p className="text-gray-500 text-[14px] mb-5">
              Please let us know why you're cancelling. This helps us improve our service.
            </p>

            {/* Reason Options */}
            <div className="space-y-2.5">
              {[
                'Contractor is taking too long',
                'Found another contractor',
                'Job no longer needed',
                'Price too high',
                'Changed my mind',
                'Safety concern',
                'Other'
              ].map((reason) => (
                <button
                  key={reason}
                  onClick={() => {
                    triggerHaptic(ImpactStyle.Light)
                    setCancelReason(reason)
                    if (reason !== 'Other') setCancelReasonOther('')
                  }}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border text-[15px] transition-all active:scale-[0.98] ${
                    cancelReason === reason
                      ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                      : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  {reason}
                </button>
              ))}

              {/* Other reason text input */}
              {cancelReason === 'Other' && (
                <textarea
                  value={cancelReasonOther}
                  onChange={(e) => setCancelReasonOther(e.target.value)}
                  placeholder="Please describe the reason..."
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl text-[15px] text-gray-900 placeholder-gray-400 border border-gray-200 focus:ring-2 focus:ring-red-400 focus:border-transparent outline-none resize-none"
                  rows={3}
                  style={{ fontSize: '16px' }}
                />
              )}
            </div>
          </div>

          {/* Bottom Action */}
          <div
            className="px-5 pt-3 border-t border-gray-100"
            style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom, 34px), 34px) + 8px)' }}
          >
            <p className="text-gray-400 text-[12px] text-center mb-3">
              The contractor will be notified and your payment will be refunded.
            </p>
            <button
              onClick={() => {
                const reason = cancelReason === 'Other' ? (cancelReasonOther.trim() || 'Other') : cancelReason
                handleCancelJob(reason)
              }}
              disabled={cancelling || !cancelReason}
              className="w-full py-4 rounded-xl font-semibold text-[16px] text-white bg-red-500 disabled:opacity-40 active:scale-[0.98] transition-transform"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Job'}
            </button>
          </div>
        </div>
      )}

      {/* Inline Chat View */}
      {showInlineChat && (
        <InlineJobChat
          jobId={job.id}
          contractorId={job.contractor_id}
          contractorName={job.contractor_name || 'Contractor'}
          contractorImage={contractorImage}
          jobStatus={jobStatus}
          onClose={() => setShowInlineChat(false)}
        />
      )}
    </div>
  )
}

// Inline Job Chat — self-contained chat within tracking view (no navigation)
function InlineJobChat({ jobId, contractorId, contractorName, contractorImage, jobStatus, onClose }: {
  jobId: string
  contractorId?: string
  contractorName: string
  contractorImage?: string | null
  jobStatus?: string
  onClose: () => void
}) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isChatEnded = jobStatus === 'completed' || jobStatus === 'cancelled'

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('job_chat_messages')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })
      if (data) {
        setMessages(data)
        setTimeout(scrollToBottom, 100)
        const unread = data.filter(m => m.sender_id !== user?.id && !m.read_at)
        if (unread.length > 0) {
          await supabase
            .from('job_chat_messages')
            .update({ read_at: new Date().toISOString() })
            .in('id', unread.map(m => m.id))
        }
      }
    }
    fetchMessages()

    const channel = supabase
      .channel(`ios-job-chat-${jobId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'job_chat_messages',
        filter: `job_id=eq.${jobId}`
      }, (payload) => {
        const msg = payload.new as any
        setMessages(prev => [...prev, msg])
        setTimeout(scrollToBottom, 100)
        if (msg.sender_id !== user?.id) {
          supabase.from('job_chat_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', msg.id)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [jobId, user?.id])

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || isChatEnded) return
    setSending(true)
    const msgText = newMessage.trim()
    try {
      await supabase.from('job_chat_messages').insert({
        job_id: jobId,
        sender_id: user.id,
        sender_role: 'homeowner',
        message: msgText
      })
      setNewMessage('')

      // Send push notification to contractor (fire-and-forget)
      if (contractorId) {
        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: contractorId,
            title: user.user_metadata?.name || 'Homeowner',
            body: msgText.length > 100 ? msgText.substring(0, 100) + '...' : msgText,
            data: { jobId, contractorId, type: 'chat_message' }
          })
        }).catch(() => {}) // Don't block on push failure
      }
    } catch (err) {
      console.error('Error sending message:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-white" style={{ animation: 'slideUp 0.25s ease-out' }}>
      {/* Chat Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200"
        style={{ paddingTop: 'calc(max(env(safe-area-inset-top, 54px), 54px) + 12px)' }}
      >
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center active:scale-95"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3 flex-1">
          {contractorImage ? (
            <img src={contractorImage} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-200" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
              <span className="text-white font-bold">{(contractorName || 'C')[0].toUpperCase()}</span>
            </div>
          )}
          <div>
            <p className="font-semibold text-[15px] text-gray-900">{contractorName}</p>
            <p className="text-[12px] text-emerald-600">Active now</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Send a message to {contractorName}</p>
          </div>
        ) : (
          messages.map((msg: any) => {
            const isOwn = msg.sender_id === user?.id
            return (
              <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isOwn ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-900'
                }`}>
                  <p className="text-[15px] whitespace-pre-wrap break-words">{msg.message}</p>
                  <p className={`text-[11px] mt-1 ${isOwn ? 'text-emerald-200' : 'text-gray-400'}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input or Chat Ended */}
      <div
        className="p-3 bg-white border-t border-gray-200"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        {isChatEnded ? (
          <div className="flex items-center justify-center gap-2 py-3">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-gray-400 text-[14px]">This conversation has ended</span>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Type a message..."
              className="flex-1 px-4 py-3 bg-gray-100 rounded-full text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              style={{ fontSize: '16px' }}
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !newMessage.trim()}
              className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform flex-shrink-0"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Uber-style Bid Tracking Overlay
interface Bid {
  id: string
  contractor_id: string
  contractor_name: string
  contractor_rating?: number
  bid_amount: number
  message?: string
  eta_minutes?: number
  created_at: string
  // For distance/ETA calculation
  contractor_latitude?: number
  contractor_longitude?: number
  calculated_eta?: number
  calculated_distance?: string
  // Source table for bid management
  source?: 'job_bids' | 'direct_offers'
}

interface BidTrackingOverlayProps {
  job: HomeownerJob | null
  bids: Bid[]
  loading: boolean
  onAccept: (bid: Bid) => void
  onDecline: (bid: Bid) => void
  onClose: () => void
  isMinimized: boolean
  onToggleMinimize: () => void
}

function BidTrackingOverlay({
  job,
  bids,
  loading,
  onAccept,
  onDecline,
  onClose,
  isMinimized,
  onToggleMinimize
}: BidTrackingOverlayProps) {
  const handleAccept = async (bid: Bid) => {
    await triggerHaptic(ImpactStyle.Medium)
    onAccept(bid)
  }

  const handleDecline = async (bid: Bid) => {
    await triggerHaptic()
    onDecline(bid)
  }

  if (!job) return null

  // Minimized state - small pill at top
  if (isMinimized) {
    return (
      <button
        onClick={onToggleMinimize}
        className="fixed top-0 left-4 right-4 z-40 bg-emerald-600 rounded-b-2xl py-3 px-4 flex items-center justify-between active:bg-emerald-700"
        style={{ top: 'calc(env(safe-area-inset-top, 44px) + 110px)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span className="text-white font-medium text-[14px]">
            {loading ? 'Finding pros...' : `${bids.length} bid${bids.length !== 1 ? 's' : ''} received`}
          </span>
        </div>
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    )
  }

  // Full overlay
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top, 44px)' }}
    >
      {/* Semi-transparent map overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onToggleMinimize} />

      {/* Content Container */}
      <div className="relative flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-emerald-600 px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold text-[17px]">Finding Pros</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleMinimize}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-white/80 text-[14px]">{job.title}</p>
        </div>

        {/* Loading Animation */}
        {loading && (
          <div className="bg-white px-4 py-6 flex flex-col items-center">
            <div className="relative w-20 h-20 mb-4">
              {/* Pulsing circles */}
              <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-25" />
              <div className="absolute inset-2 rounded-full bg-emerald-200 animate-ping opacity-25" style={{ animationDelay: '0.2s' }} />
              <div className="absolute inset-4 rounded-full bg-emerald-300 animate-ping opacity-25" style={{ animationDelay: '0.4s' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>
            <p className="text-gray-600 font-medium">Searching for available pros...</p>
            <p className="text-gray-400 text-[13px] mt-1">This usually takes 30-60 seconds</p>
          </div>
        )}

        {/* Bids List */}
        <div
          className="flex-1 bg-gray-50 overflow-auto"
          style={{ paddingBottom: 'calc(65px + env(safe-area-inset-bottom, 20px))' }}
        >
          {bids.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium">Waiting for bids</p>
              <p className="text-gray-400 text-[13px] mt-1 text-center">Pros in your area will respond soon</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {bids.map((bid) => (
                <div
                  key={bid.id}
                  className="bg-white rounded-xl p-4"
                  style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                >
                  {/* Contractor Info */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-emerald-700 font-bold">
                        {(bid.contractor_name || 'C')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-[15px] text-gray-900">{bid.contractor_name}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        {bid.contractor_rating && (
                          <span className="text-[13px] text-gray-600">
                            <span className="text-amber-400">★</span> {bid.contractor_rating.toFixed(1)}
                          </span>
                        )}
                        {bid.eta_minutes && (
                          <span className="text-[13px] text-emerald-600 font-medium">
                            ~{bid.eta_minutes} min away
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[18px] font-bold text-gray-900">${bid.bid_amount}</p>
                      <p className="text-[11px] text-gray-400">quoted</p>
                    </div>
                  </div>

                  {/* Message */}
                  {bid.message && (
                    <p className="text-[13px] text-gray-600 mb-3 line-clamp-2">{bid.message}</p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDecline(bid)}
                      className="flex-1 py-2.5 rounded-lg font-medium text-[14px] text-gray-600 bg-gray-100 active:bg-gray-200 transition-colors"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleAccept(bid)}
                      className="flex-1 py-2.5 rounded-lg font-semibold text-[14px] text-white active:opacity-90 transition-opacity"
                      style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Inline Add Card Modal (Stripe SetupIntent) ───
function AddCardForm({ userId, onSuccess, onCancel }: { userId: string; onSuccess: (card: { brand: string; last4: string }) => void; onCancel: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!stripe || !elements) {
      setError('Payment system not ready. Please wait a moment and try again.')
      return
    }
    setSaving(true)
    setError(null)

    try {
      // 1. Fetch user email/name from Supabase auth
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const userEmail = authUser?.email || ''
      const userName = authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || ''

      // 2. Ensure Stripe customer exists
      const custRes = await fetch('/api/stripe/customer/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email: userEmail, name: userName })
      })
      if (!custRes.ok) throw new Error('Failed to create customer')
      const custData = await custRes.json()
      if (!custData.success) throw new Error(custData.error || 'Failed to create customer')

      // 3. Create SetupIntent
      const siRes = await fetch('/api/stripe/customer/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: custData.customerId })
      })
      if (!siRes.ok) throw new Error('Failed to create setup intent')
      const siData = await siRes.json()
      if (!siData.success || !siData.clientSecret) throw new Error(siData.error || 'Failed to create setup intent')

      // 4. Confirm with card element (with timeout for WKWebView)
      const cardElement = elements.getElement(CardElement)
      if (!cardElement) throw new Error('Card element not found. Please reload and try again.')

      const confirmPromise = stripe.confirmCardSetup(siData.clientSecret, {
        payment_method: { card: cardElement }
      })

      // Timeout after 30s to prevent infinite hang in WKWebView
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Card verification timed out. Please try again.')), 30000)
      )

      const { error: stripeError, setupIntent } = await Promise.race([confirmPromise, timeoutPromise])

      if (stripeError) throw new Error(stripeError.message || 'Card verification failed')
      if (!setupIntent?.payment_method) throw new Error('No payment method returned')

      // 5. Save card to backend
      const pmId = typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method.id
      const saveRes = await fetch('/api/stripe/customer/save-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, paymentMethodId: pmId, setAsDefault: true })
      })
      if (!saveRes.ok) throw new Error('Failed to save card')
      const saveData = await saveRes.json()
      if (!saveData.success) throw new Error(saveData.error || 'Failed to save card')

      // 6. Fetch the saved card details
      const pmRes = await fetch(`/api/stripe/customer/payment-methods?userId=${userId}`)
      const pmData = await pmRes.json()
      if (pmData.success && pmData.paymentMethods?.length > 0) {
        const pm = pmData.paymentMethods.find((p: any) => p.id === pmId) || pmData.paymentMethods[0]
        if (pm?.card) {
          onSuccess({ brand: pm.card.brand, last4: pm.card.last4 })
          return
        }
      }
      onSuccess({ brand: 'card', last4: '••••' })
    } catch (err: any) {
      console.error('[AddCardForm] Error:', err)
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#1f2937',
                '::placeholder': { color: '#9ca3af' },
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              },
              invalid: { color: '#ef4444' }
            },
            hidePostalCode: true
          }}
        />
      </div>
      {error && (
        <p className="text-red-500 text-sm text-center">{error}</p>
      )}
      <button
        onClick={handleSave}
        disabled={saving || !stripe}
        className="w-full py-3 rounded-xl font-semibold text-[15px] text-white disabled:opacity-60 active:scale-[0.98] transition-transform"
        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
      >
        {saving ? 'Saving...' : 'Save Card'}
      </button>
      <button
        onClick={onCancel}
        disabled={saving}
        className="w-full py-3 rounded-xl font-medium text-[15px] text-gray-700 bg-gray-100 active:scale-[0.98] transition-transform"
      >
        Cancel
      </button>
    </div>
  )
}

function AddCardModal({ isOpen, userId, onSuccess, onClose }: { isOpen: boolean; userId: string; onSuccess: (card: { brand: string; last4: string }) => void; onClose: () => void }) {
  if (!isOpen) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[61] bg-white rounded-2xl shadow-xl overflow-hidden max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Add Card</h3>
              <p className="text-xs text-slate-500">Securely processed by Stripe</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 pb-6 pt-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-5">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Your card details are encrypted and never stored on our servers</span>
          </div>
          <Elements stripe={stripePromise}>
            <AddCardForm userId={userId} onSuccess={onSuccess} onCancel={onClose} />
          </Elements>
        </div>
      </div>
    </>
  )
}

// Category bubbles for quick access
const CATEGORY_BUBBLES = [
  { key: 'plumbing', label: 'Plumbing', icon: '🔧' },
  { key: 'electrical', label: 'Electrical', icon: '⚡' },
  { key: 'hvac', label: 'HVAC', icon: '❄️' },
  { key: 'roofing', label: 'Roofing', icon: '🏠' },
  { key: 'water-damage', label: 'Water', icon: '💧' },
  { key: 'locksmith', label: 'Locksmith', icon: '🔐' },
  { key: 'appliance', label: 'Appliance', icon: '🔧' },
]

// Keyword-to-category detection — keys MUST match pro_contractors.categories values from wizard
const CATEGORY_KEYWORDS_MAP: Record<string, string[]> = {
  'Plumbing': ['plumb', 'leak', 'pipe', 'drain', 'water', 'toilet', 'sink', 'faucet', 'sewer'],
  'Electrical': ['electric', 'power', 'outlet', 'breaker', 'wiring', 'light', 'switch'],
  'HVAC': ['hvac', 'heat', 'cool', 'ac', 'furnace', 'thermostat', 'air condition'],
  'Roofing': ['roof', 'shingle', 'gutter', 'ceiling leak'],
  'Locksmith': ['lock', 'key', 'locked out', 'door lock'],
  'Appliance Repair': ['appliance', 'fridge', 'washer', 'dryer', 'dishwasher', 'oven', 'stove'],
  'Pest Control': ['pest', 'bug', 'rat', 'mouse', 'termite', 'roach', 'ant'],
  'Cleaning': ['clean', 'mold', 'carpet', 'deep clean'],
  'Handyman': ['handyman', 'repair', 'fix'],
  'Carpentry': ['carpent', 'wood', 'cabinet', 'deck'],
  'Landscaping': ['landscap', 'lawn', 'garden', 'tree', 'yard'],
  'Painting': ['paint', 'stain', 'wall'],
  'Water Damage Restoration': ['water damage', 'flood', 'restoration'],
  'General Contractor': ['general contract', 'remodel', 'renovation'],
}

function detectCategoryFromSearch(text: string): string | null {
  const lower = text.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS_MAP)) {
    if (keywords.some(kw => lower.includes(kw))) return category
  }
  return null
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00'
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// Home Tab Content - Split view: Map on top half, Jobs with live bids below
function HomeTab({ center, setCenter, filtered, fetchingLocation, setFetchingLocation, firstName, jobs, jobsLoading, activeJob, bids, bidsLoading, onAcceptBid, onDeclineBid, onCloseBidOverlay, user, trackingJob, onOpenTracking, onStartJobSuccess, onFindPro, isVisible }: {
  center: LatLng
  setCenter: (c: LatLng) => void
  filtered: any[]
  fetchingLocation: boolean
  setFetchingLocation: (b: boolean) => void
  firstName: string
  jobs: HomeownerJob[]
  jobsLoading: boolean
  activeJob: HomeownerJob | null
  bids: Bid[]
  bidsLoading: boolean
  onAcceptBid: (bid: Bid) => void
  onDeclineBid: (bid: Bid) => void
  onCloseBidOverlay: () => void
  user: any
  trackingJob: TrackingJob | null
  onOpenTracking: () => void
  onStartJobSuccess: (data: { jobId: string; contractorId: string; contractorName: string; title: string; estimatedAmount: number; etaMinutes?: number }) => void
  onFindPro: (search: string, category: string) => void
  isVisible: boolean
}) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = React.useState('')
  const [selectedContractor, setSelectedContractor] = React.useState<any>(null)
  const [contractorETA, setContractorETA] = React.useState<string | null>(null)
  const [loadingContractorETA, setLoadingContractorETA] = React.useState(false)
  const [selectedBid, setSelectedBid] = React.useState<Bid | null>(null)
  const [bidDistance, setBidDistance] = React.useState<string | null>(null)
  const [bidAddress, setBidAddress] = React.useState<string | null>(null)
  const [loadingDistance, setLoadingDistance] = React.useState(false)
  const [showPaymentModal, setShowPaymentModal] = React.useState(false)
  const [enrichedBids, setEnrichedBids] = React.useState<Bid[]>([])
  const [loadingETAs, setLoadingETAs] = React.useState(false)
  const [showOfferModal, setShowOfferModal] = React.useState(false)
  const [offerContractor, setOfferContractor] = React.useState<any>(null)
  const [enrichedContractorData, setEnrichedContractorData] = React.useState<any>(null)
  const [loadingEnrichedData, setLoadingEnrichedData] = React.useState(false)
  const [savedCard, setSavedCard] = React.useState<{ brand: string; last4: string } | null>(null)
  const [bookingLoading, setBookingLoading] = React.useState(false)
  const [paymentError, setPaymentError] = React.useState<string | null>(null)
  const [showAddCardAlert, setShowAddCardAlert] = React.useState(false)
  const [jobDescription, setJobDescription] = React.useState('')
  const [showContractorProfile, setShowContractorProfile] = React.useState(false)

  // --- Inline search state ---
  const [bottomSheetSearch, setBottomSheetSearch] = React.useState('')
  const [searchResults, setSearchResults] = React.useState<any[]>([])
  const [searchLoading, setSearchLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [searchCountdown, setSearchCountdown] = React.useState(0)
  // Elapsed timer for waiting on bids after posting a job
  const [waitElapsed, setWaitElapsed] = React.useState(0)
  const waitTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // --- In-sheet tracking mode state ---
  const [trackingEatSeconds, setTrackingEatSeconds] = React.useState(0)
  const [trackingContractorLoc, setTrackingContractorLoc] = React.useState<{ lat: number; lng: number } | null>(null)
  const [trackingBearing, setTrackingBearing] = React.useState(0)
  const prevTrackingLocRef = React.useRef<{ lat: number; lng: number } | null>(null)
  const [cancellingJob, setCancellingJob] = React.useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false)
  const trackingEatRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch saved payment method on mount
  React.useEffect(() => {
    if (!user) return
    fetch(`/api/stripe/customer/payment-methods?userId=${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.paymentMethods?.length > 0) {
          const defaultPm = data.paymentMethods.find((pm: any) => pm.id === data.defaultPaymentMethodId) || data.paymentMethods[0]
          if (defaultPm?.card) {
            setSavedCard({ brand: defaultPm.card.brand, last4: defaultPm.card.last4 })
          }
        }
      })
      .catch(err => console.error('Error fetching payment methods:', err))
  }, [user])

  // Map ref for zoom controls
  const mapRef = useRef<FindProMapboxHandle>(null)

  // When home tab becomes visible again, resize map and ensure radius is shown (unless tracking)
  React.useEffect(() => {
    if (isVisible && mapRef.current) {
      const t = setTimeout(() => {
        mapRef.current?.resize()
        if (!trackingJob) {
          mapRef.current?.showRadiusCircle()
        }
      }, 100)
      return () => clearTimeout(t)
    }
  }, [isVisible, trackingJob])

  // Fetch online contractors within radius on mount (for showing as tabs when searching)
  const [nearbyOnline, setNearbyOnline] = React.useState<any[]>([])
  React.useEffect(() => {
    const fetchOnline = async () => {
      try {
        const { data } = await supabase
          .from('pro_contractors')
          .select('*')
          .eq('status', 'approved')
          .eq('availability', 'online')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .limit(30)
        if (data) {
          const nearby = data.filter((c: any) => {
            const R = 3959
            const dLat = (c.latitude - center[0]) * Math.PI / 180
            const dLon = (c.longitude - center[1]) * Math.PI / 180
            const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(center[0] * Math.PI / 180) * Math.cos(c.latitude * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2
            const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
            return dist <= 5
          })
          setNearbyOnline(nearby)
        }
      } catch (err) {
        console.error('Error fetching online contractors:', err)
      }
    }
    fetchOnline()
  }, [center, user?.id])

  // Real-time: listen for contractor availability changes (online/offline/busy)
  React.useEffect(() => {
    const channel = supabase
      .channel('contractor_availability')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pro_contractors',
        },
        (payload) => {
          const updated = payload.new as any
          if (!updated?.id) return

          setNearbyOnline(prev => {
            const isInList = prev.some(c => c.id === updated.id)

            // Contractor went offline/busy → remove from list
            if (updated.availability !== 'online') {
              return isInList ? prev.filter(c => c.id !== updated.id) : prev
            }

            // Contractor came online → add if within radius and approved
            if (updated.availability === 'online' && updated.status === 'approved' && updated.latitude && updated.longitude) {
              if (isInList) {
                // Update existing entry
                return prev.map(c => c.id === updated.id ? { ...c, ...updated } : c)
              }
              // Check if within 5mi radius
              const R = 3959
              const dLat = (updated.latitude - center[0]) * Math.PI / 180
              const dLon = (updated.longitude - center[1]) * Math.PI / 180
              const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(center[0] * Math.PI / 180) * Math.cos(updated.latitude * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2
              const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
              if (dist <= 5) {
                return [...prev, updated]
              }
            }
            return prev
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [center])

  // Merge nearbyOnline (Supabase) with filtered (context) — ensures contractors always show
  const mapContractors = React.useMemo(() => {
    if (nearbyOnline.length === 0) return filtered
    if (filtered.length === 0) return nearbyOnline
    // Merge: use nearbyOnline as base, add any from filtered not already present
    const ids = new Set(nearbyOnline.map((c: any) => c.id))
    const merged = [...nearbyOnline]
    for (const c of filtered) {
      if (!ids.has(c.id)) merged.push(c)
    }
    return merged
  }, [nearbyOnline, filtered])

  // Contractor tabs: show ALL nearby online contractors by default, filtered when user searches
  const mapCategoryContractors = React.useMemo(() => {
    if (!hasSearched || !bottomSheetSearch) return nearbyOnline
    const detectedCategory = detectCategoryFromSearch(bottomSheetSearch)
    if (detectedCategory) {
      return nearbyOnline.filter((c: any) =>
        Array.isArray(c.categories) && c.categories.some((cat: string) => cat.toLowerCase() === detectedCategory.toLowerCase())
      )
    }
    const q = bottomSheetSearch.toLowerCase()
    return nearbyOnline.filter((c: any) =>
      (c.business_name || '').toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q)
    )
  }, [nearbyOnline, hasSearched, bottomSheetSearch])

  // Bottom sheet state - minimized shows only the drag handle stripe, expanded covers the map
  const [sheetExpanded, setSheetExpanded] = React.useState(false)
  const [sheetMinimized, setSheetMinimized] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [startY, setStartY] = React.useState(0)
  const [currentTranslate, setCurrentTranslate] = React.useState(0)

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true)
    setStartY(e.touches[0].clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const diff = startY - e.touches[0].clientY
    // Limit the drag range based on current state
    // Three states: minimized (stripe only) -> normal (45%) -> expanded (70%)
    const maxUp = 200
    const maxDown = 200
    let clampedDiff: number

    if (sheetMinimized) {
      // From minimized, can only drag up
      clampedDiff = Math.max(0, Math.min(maxUp, diff))
    } else if (sheetExpanded) {
      // From expanded, can only drag down
      clampedDiff = Math.max(-maxDown, Math.min(0, diff))
    } else {
      // From normal, can drag either way
      clampedDiff = Math.max(-maxDown, Math.min(maxUp, diff))
    }
    setCurrentTranslate(clampedDiff)
  }

  const handleTouchEnd = async () => {
    setIsDragging(false)
    const threshold = 60

    if (sheetMinimized) {
      // From minimized: drag up to normal
      if (currentTranslate > threshold) {
        await triggerHaptic()
        setSheetMinimized(false)
      }
    } else if (sheetExpanded) {
      // From expanded: drag down to normal
      if (currentTranslate < -threshold) {
        await triggerHaptic()
        setSheetExpanded(false)
      }
    } else {
      // From normal: drag up to expand, drag down to minimize
      if (currentTranslate > threshold) {
        await triggerHaptic()
        setSheetExpanded(true)
      } else if (currentTranslate < -threshold) {
        await triggerHaptic()
        setSheetMinimized(true)
      }
    }
    setCurrentTranslate(0)
  }

  // Get the most relevant active job for HomeTab
  // Priority: in_progress > confirmed > pending
  // Only completed jobs are excluded from HomeTab
  const activeJobForHome = useMemo(() => {
    // First check for in_progress jobs (contractor on the way)
    const inProgressJobs = jobs.filter(j => j.status === 'in_progress' || j.status === 'confirmed')
    if (inProgressJobs.length > 0) return inProgressJobs[0]

    // Then check for pending jobs (waiting for bids)
    const pendingJobs = jobs.filter(j => j.status === 'pending')
    if (pendingJobs.length > 0) return pendingJobs[0]

    return null
  }, [jobs])

  // Legacy alias for backward compatibility
  const mostRecentPendingJob = activeJobForHome?.status === 'pending' ? activeJobForHome : null

  // Check if we have an in-progress job to show tracking
  const inProgressJob = activeJobForHome?.status === 'in_progress' || activeJobForHome?.status === 'confirmed' ? activeJobForHome : null

  const handleBookPro = async () => {
    await triggerHaptic(ImpactStyle.Medium)
    router.push('/post-job')
  }

  const handleSearch = async () => {
    await triggerHaptic(ImpactStyle.Medium)
    // Inline search — stay in bottom sheet, no FindProView overlay
    setBottomSheetSearch(searchQuery.trim())
    handleBottomSheetSearch(searchQuery.trim())
    setSearchQuery('')
    setSheetMinimized(false)
    setSheetExpanded(true)
  }

  const handleCategoryPress = async (categoryKey: string) => {
    await triggerHaptic()
    const label = CATEGORY_BUBBLES.find(c => c.key === categoryKey)?.label || categoryKey
    setBottomSheetSearch(label)
    handleBottomSheetSearch(label)
    setSearchQuery('')
    setSheetMinimized(false)
    setSheetExpanded(true)
  }

  const handleLocation = async () => {
    await triggerHaptic()
    setFetchingLocation(true)

    // 1) Native
    const nativeResult = await getNativeLocation()
    if (nativeResult.success && nativeResult.coordinates) {
      setCenter([nativeResult.coordinates.latitude, nativeResult.coordinates.longitude])
      setFetchingLocation(false)
      return
    }

    // 2) Browser geolocation
    const browserOk = await new Promise<boolean>((resolve) => {
      if (!navigator.geolocation) { resolve(false); return }
      navigator.geolocation.getCurrentPosition(
        (pos) => { setCenter([pos.coords.latitude, pos.coords.longitude]); resolve(true) },
        () => resolve(false),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      )
    })
    if (browserOk) { setFetchingLocation(false); return }

    // 3) IP-based fallback
    try {
      const res = await fetch('https://ipapi.co/json/')
      const data = await res.json()
      if (data.latitude && data.longitude) {
        setCenter([data.latitude, data.longitude])
      }
    } catch (e) {
      // All methods failed
    }
    setFetchingLocation(false)
  }

  // --- Inline bottom sheet search for contractors ---
  const handleBottomSheetSearch = React.useCallback(async (query: string) => {
    setSearchLoading(true)
    setHasSearched(true)
    setSearchCountdown(5)
    try {
      const detectedCategory = detectCategoryFromSearch(query)

      // Fetch all online contractors, filter by category in JS for case-insensitive matching
      const { data, error } = await supabase
        .from('pro_contractors')
        .select('*')
        .eq('status', 'approved')
        .eq('availability', 'online')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(50)
      if (error) throw error

      // Filter by category (case-insensitive) or name in JS
      let categoryFiltered = data || []
      if (detectedCategory) {
        categoryFiltered = categoryFiltered.filter((c: any) =>
          Array.isArray(c.categories) && c.categories.some(
            (cat: string) => cat.toLowerCase() === detectedCategory.toLowerCase()
          )
        )
      } else if (query.trim()) {
        const q = query.toLowerCase()
        categoryFiltered = categoryFiltered.filter((c: any) =>
          (c.name || '').toLowerCase().includes(q) || (c.business_name || '').toLowerCase().includes(q)
        )
      }

      // Filter by 5-mile radius helper
      const filterByRadius = (contractors: any[]) => contractors.filter((c: any) => {
        if (!c.latitude || !c.longitude) return false
        const R = 3959
        const dLat = (c.latitude - center[0]) * Math.PI / 180
        const dLon = (c.longitude - center[1]) * Math.PI / 180
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(center[0] * Math.PI / 180) * Math.cos(c.latitude * Math.PI / 180) *
          Math.sin(dLon / 2) ** 2
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return dist <= 5
      })

      let radiusFiltered = filterByRadius(categoryFiltered)

      // Fallback: if no contractors match the category, show ALL nearby online contractors
      if (radiusFiltered.length === 0 && (data || []).length > 0) {
        radiusFiltered = filterByRadius(data || [])
      }

      // Enrich with Mapbox EAT
      const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      const enriched = await Promise.all(
        radiusFiltered.map(async (c) => {
          let _eatMinutes: number | null = null
          let _distanceMiles: string | null = null
          if (MAPBOX_TOKEN && c.latitude && c.longitude) {
            try {
              const res = await fetch(
                `https://api.mapbox.com/directions/v5/mapbox/driving/${c.longitude},${c.latitude};${center[1]},${center[0]}?access_token=${MAPBOX_TOKEN}`
              )
              const d = await res.json()
              if (d.routes?.[0]) {
                _eatMinutes = Math.round(d.routes[0].duration / 60)
                _distanceMiles = (d.routes[0].distance / 1609.34).toFixed(1)
              }
            } catch {}
          }
          return { ...c, _eatMinutes, _distanceMiles }
        })
      )

      enriched.sort((a, b) => (a._eatMinutes ?? 999) - (b._eatMinutes ?? 999))
      setSearchResults(enriched)
      if (enriched.length > 0) setSearchCountdown(0)
    } catch (err) {
      console.error('Bottom sheet search error:', err)
    } finally {
      setSearchLoading(false)
    }
  }, [center])

  // EAT is now distance-based (static), no countdown interval for search/bid cards.
  // The only countdown timer is trackingEatSeconds (Phase 2 tracking mode).

  // Wait timer: counts up while waiting for bids on a pending job
  React.useEffect(() => {
    if (waitTimerRef.current) clearInterval(waitTimerRef.current)
    if (mostRecentPendingJob && bids.length === 0) {
      setWaitElapsed(0)
      waitTimerRef.current = setInterval(() => setWaitElapsed(prev => prev + 1), 1000)
    } else {
      setWaitElapsed(0)
    }
    return () => { if (waitTimerRef.current) clearInterval(waitTimerRef.current) }
  }, [mostRecentPendingJob?.id, bids.length])

  // Search countdown: 5s timer, if no results when it hits 0 → stop all loading, show "Post a Job Instead"
  React.useEffect(() => {
    if (searchCountdown <= 0) {
      // Force stop loading when countdown expires
      setSearchLoading(false)
      return
    }
    const timer = setTimeout(() => setSearchCountdown(prev => prev - 1), 1000)
    return () => clearTimeout(timer)
  }, [searchCountdown])

  // --- In-sheet tracking: subscribe to contractor location + calculate live EAT ---
  React.useEffect(() => {
    if (!trackingJob?.contractor_id || !trackingJob?.id) {
      setTrackingContractorLoc(null)
      setTrackingEatSeconds(0)
      return
    }

    // Initialize EAT from tracking job
    if (trackingJob.eta_minutes) setTrackingEatSeconds(trackingJob.eta_minutes * 60)

    // Subscribe to real-time contractor location
    const channel = supabase
      .channel(`home-tracking-${trackingJob.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contractor_location_tracking', filter: `job_id=eq.${trackingJob.id}` },
        (payload) => {
          if (payload.new && 'latitude' in payload.new) {
            const loc = payload.new as any
            setTrackingContractorLoc({ lat: loc.latitude, lng: loc.longitude })
            if (loc.eta_minutes) setTrackingEatSeconds(loc.eta_minutes * 60)
          }
        }
      )
      .subscribe()

    // Fetch initial location
    const fetchInitial = async () => {
      const { data } = await supabase
        .from('contractor_location_tracking')
        .select('*')
        .eq('job_id', trackingJob.id)
        .eq('contractor_id', trackingJob.contractor_id!)
        .order('last_update_at', { ascending: false })
        .limit(1)
        .single()
      if (data) {
        setTrackingContractorLoc({ lat: data.latitude, lng: data.longitude })
        if (data.eta_minutes) setTrackingEatSeconds(data.eta_minutes * 60)
      }
    }
    fetchInitial()

    return () => { supabase.removeChannel(channel) }
  }, [trackingJob?.id, trackingJob?.contractor_id])

  // Calculate bearing when contractor location updates
  React.useEffect(() => {
    if (!trackingContractorLoc) return
    const prev = prevTrackingLocRef.current
    if (prev) {
      const dLon = (trackingContractorLoc.lng - prev.lng) * Math.PI / 180
      const lat1 = prev.lat * Math.PI / 180
      const lat2 = trackingContractorLoc.lat * Math.PI / 180
      const y = Math.sin(dLon) * Math.cos(lat2)
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
      const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
      setTrackingBearing(bearing)
    }
    prevTrackingLocRef.current = trackingContractorLoc
  }, [trackingContractorLoc])

  // Recalculate EAT via Mapbox when contractor location updates
  React.useEffect(() => {
    if (!trackingContractorLoc || !trackingJob) return
    const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!MAPBOX_TOKEN) return

    const calcEAT = async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${trackingContractorLoc.lng},${trackingContractorLoc.lat};${center[1]},${center[0]}?access_token=${MAPBOX_TOKEN}`
        )
        const d = await res.json()
        if (d.routes?.[0]?.duration) {
          setTrackingEatSeconds(Math.ceil(d.routes[0].duration))
        }
      } catch {}
    }
    calcEAT()
  }, [trackingContractorLoc, center, trackingJob])

  // Tick tracking EAT countdown every second
  React.useEffect(() => {
    if (trackingEatRef.current) clearInterval(trackingEatRef.current)
    if (trackingEatSeconds <= 0 || !trackingJob) return
    trackingEatRef.current = setInterval(() => {
      setTrackingEatSeconds(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => { if (trackingEatRef.current) clearInterval(trackingEatRef.current) }
  }, [trackingJob?.id, trackingEatSeconds > 0])

  // Show route on map for tracking, restore radius when tracking ends
  React.useEffect(() => {
    if (trackingContractorLoc && trackingJob && mapRef.current) {
      mapRef.current.showRoute(trackingContractorLoc.lat, trackingContractorLoc.lng, center[0], center[1])
      mapRef.current.hideRadiusCircle()
    } else if (mapRef.current) {
      mapRef.current.clearRoute()
      mapRef.current.showRadiusCircle()
    }
  }, [trackingContractorLoc, trackingJob, center])

  // Cancel job handler
  const handleCancelJob = async () => {
    if (!trackingJob || cancellingJob) return
    setCancellingJob(true)
    try {
      // Update job status to cancelled
      await supabase.from('homeowner_jobs').update({ status: 'cancelled' }).eq('id', trackingJob.id)

      // Release payment hold if exists
      const { data: paymentHold } = await supabase
        .from('payment_holds')
        .select('id')
        .eq('job_id', trackingJob.id)
        .eq('status', 'held')
        .single()

      if (paymentHold) {
        await fetch('/api/booking/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: trackingJob.id,
            reason: 'Cancelled by homeowner',
            cancelledBy: 'homeowner',
            cancelledById: user?.id
          })
        })
      }

      await triggerHaptic(ImpactStyle.Heavy)
      setShowCancelConfirm(false)
      mapRef.current?.clearRoute()
      mapRef.current?.showRadiusCircle()
    } catch (err) {
      console.error('Cancel job error:', err)
    } finally {
      setCancellingJob(false)
    }
  }

  const handleContractorSelect = async (contractor: any) => {
    await triggerHaptic()
    setSelectedContractor(contractor)
    setContractorETA(null)
    setLoadingContractorETA(true)
    setEnrichedContractorData(null)
    setLoadingEnrichedData(true)
    setPaymentError(null)
    setJobDescription('')
    setShowContractorProfile(false)

    const lat = Number(contractor?.loc?.lat ?? contractor?.latitude)
    const lng = Number(contractor?.loc?.lng ?? contractor?.longitude)

    // Draw green route line on map + hide radius
    if (isFinite(lat) && isFinite(lng)) {
      mapRef.current?.showRoute(lat, lng, center[0], center[1])
      mapRef.current?.hideRadiusCircle()
    }

    // Fetch ETA and enriched data in parallel
    const etaPromise = (async () => {
      try {
        if (!isFinite(lat) || !isFinite(lng)) return
        const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (!MAPBOX_TOKEN) return

        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${lng},${lat};${center[1]},${center[0]}?access_token=${MAPBOX_TOKEN}`
        )
        if (response.ok) {
          const data = await response.json()
          if (data.routes && data.routes[0]) {
            const distanceMiles = (data.routes[0].distance / 1609.34).toFixed(1)
            const durationMinutes = Math.round(data.routes[0].duration / 60)
            setContractorETA(`${distanceMiles} mi • ${durationMinutes} min drive`)
          }
        }
      } catch (err) {
        console.error('Failed to fetch contractor ETA:', err)
      } finally {
        setLoadingContractorETA(false)
      }
    })()

    const enrichPromise = (async () => {
      try {
        const { data } = await supabase
          .from('pro_contractors')
          .select('hourly_rate, bio, categories, profile_image_url, years_in_business, total_jobs, visit_fee, diagnostic_fee, peak_rate, off_peak_rate, surge_rate, response_time_minutes, license_number, insurance_carrier, kyc_status, description, business_name, city, state, total_reviews')
          .eq('id', contractor.id)
          .single()
        setEnrichedContractorData(data)
      } catch (err) {
        console.error('Failed to fetch enriched contractor data:', err)
      } finally {
        setLoadingEnrichedData(false)
      }
    })()

    await Promise.all([etaPromise, enrichPromise])
  }

  const handleContactContractor = (contractor: any) => {
    // Open the offer modal instead of navigating to post-job
    setOfferContractor(contractor)
    setShowOfferModal(true)
    setSelectedContractor(null)
  }

  const handleStartJob = async (contractor: any) => {
    // 1. Check auth
    if (!user) {
      router.push('/sign-in')
      return
    }

    // 2. Check payment method
    if (!savedCard) {
      setShowAddCardAlert(true)
      return
    }

    setBookingLoading(true)
    setPaymentError(null)

    try {
      // 3. Calculate estimated amount
      const visitFee = enrichedContractorData?.visit_fee || 0
      const diagnosticFee = enrichedContractorData?.diagnostic_fee || 0
      const hourlyRate = enrichedContractorData?.hourly_rate || 65
      const baseAmount = (visitFee + diagnosticFee) > 0 ? (visitFee + diagnosticFee) : (hourlyRate * 2)
      const estimatedAmount = Math.max(baseAmount, hourlyRate)
      const category = enrichedContractorData?.categories?.[0] || contractor?.services?.[0] || 'General'
      const jobTitle = jobDescription || `${category} Service`

      // 4. Create homeowner_jobs record with status 'pending' (start-direct will set 'confirmed')
      const { data: jobRecord, error: jobError } = await supabase
        .from('homeowner_jobs')
        .insert({
          homeowner_id: user.id,
          title: jobTitle,
          description: jobDescription || `${category} service needed`,
          category,
          status: 'pending',
          estimated_cost: estimatedAmount,
          latitude: center[0],
          longitude: center[1],
          source: 'mobile_map'
        })
        .select()
        .single()

      if (jobError || !jobRecord) {
        throw new Error(jobError?.message || 'Failed to create job')
      }

      // 5. Call start-direct API — creates escrow, assigns contractor, notifies
      const startResponse = await fetch('/api/jobs/start-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: jobRecord.id,
          contractorId: contractor.id,
          amount: estimatedAmount,
          homeownerId: user.id
        })
      })

      const startData = await startResponse.json()

      if (!startResponse.ok || !startData.success) {
        // Rollback: delete the job record
        await supabase.from('homeowner_jobs').delete().eq('id', jobRecord.id)
        if (startData.needsCard) {
          setShowAddCardAlert(true)
          return
        }
        throw new Error(startData.error || 'Payment authorization failed')
      }

      // 6. Success — close bottom sheet and open tracking
      await triggerHaptic(ImpactStyle.Heavy)
      setSelectedContractor(null)
      setContractorETA(null)
      setEnrichedContractorData(null)
      setJobDescription('')

      // Parse ETA minutes from the contractorETA string (e.g., "3.2 mi • 8 min drive")
      let etaMins: number | undefined
      if (contractorETA) {
        const match = contractorETA.match(/(\d+)\s*min/)
        if (match) etaMins = parseInt(match[1])
      }

      onStartJobSuccess({
        jobId: jobRecord.id,
        contractorId: contractor.id,
        contractorName: startData.contractorName || contractor.name || contractor.business_name || 'Contractor',
        title: jobTitle,
        estimatedAmount,
        etaMinutes: etaMins
      })

    } catch (err: any) {
      console.error('Error in Start Job flow:', err)
      setPaymentError(err.message || 'Failed to process booking. Please try again.')
    } finally {
      setBookingLoading(false)
    }
  }

  // Fetch driving distance and address from Mapbox APIs
  const fetchDistance = async (bid: Bid) => {
    setLoadingDistance(true)
    setBidDistance(null)
    setBidAddress(null)

    try {
      // Get contractor coordinates - use bid location or contractor's address
      const contractorLat = (bid as any).contractor_latitude || (bid as any).latitude
      const contractorLng = (bid as any).contractor_longitude || (bid as any).longitude

      if (!contractorLat || !contractorLng) {
        // If no contractor location, show estimated time based on ETA
        if (bid.eta_minutes) {
          setBidDistance(`~${bid.eta_minutes} min away`)
        } else {
          setBidDistance('Distance unavailable')
        }
        setLoadingDistance(false)
        return
      }

      const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!MAPBOX_TOKEN) {
        setBidDistance('Distance unavailable')
        setLoadingDistance(false)
        return
      }

      // Fetch directions and reverse geocoding in parallel
      const [directionsResponse, geocodeResponse] = await Promise.all([
        // Mapbox Directions API for driving distance/duration
        fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${contractorLng},${contractorLat};${center[1]},${center[0]}?access_token=${MAPBOX_TOKEN}`
        ),
        // Mapbox Geocoding API for street address
        fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${contractorLng},${contractorLat}.json?access_token=${MAPBOX_TOKEN}&types=address,poi`
        )
      ])

      // Parse directions
      if (directionsResponse.ok) {
        const data = await directionsResponse.json()
        if (data.routes && data.routes[0]) {
          const distanceMeters = data.routes[0].distance
          const durationSeconds = data.routes[0].duration
          const distanceMiles = (distanceMeters / 1609.34).toFixed(1)
          const durationMinutes = Math.round(durationSeconds / 60)
          setBidDistance(`${distanceMiles} mi • ${durationMinutes} min drive`)
        } else {
          setBidDistance('Route unavailable')
        }
      } else {
        setBidDistance('Distance unavailable')
      }

      // Parse address from reverse geocoding
      if (geocodeResponse.ok) {
        const geoData = await geocodeResponse.json()
        if (geoData.features && geoData.features.length > 0) {
          // Get the most relevant feature (first one)
          const feature = geoData.features[0]
          // Extract short address (street name only or POI name)
          const placeName = feature.text || ''
          const context = feature.context || []
          const neighborhood = context.find((c: any) => c.id.startsWith('neighborhood'))?.text
          const locality = context.find((c: any) => c.id.startsWith('locality') || c.id.startsWith('place'))?.text

          // Build a short, readable address
          if (placeName && locality) {
            setBidAddress(`${placeName}, ${locality}`)
          } else if (neighborhood && locality) {
            setBidAddress(`${neighborhood}, ${locality}`)
          } else if (locality) {
            setBidAddress(locality)
          } else if (placeName) {
            setBidAddress(placeName)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching distance:', error)
      setBidDistance('Distance unavailable')
    } finally {
      setLoadingDistance(false)
    }
  }

  // When a bid is selected, fetch its distance and show route on map
  React.useEffect(() => {
    if (selectedBid) {
      fetchDistance(selectedBid)

      // Show route on map if contractor has location
      const contractorLat = (selectedBid as any).contractor_latitude
      const contractorLng = (selectedBid as any).contractor_longitude
      if (contractorLat && contractorLng && mapRef.current) {
        mapRef.current.showRoute(contractorLat, contractorLng, center[0], center[1])
        mapRef.current.hideRadiusCircle()
      }
    } else {
      // Clear route and restore radius when bid is deselected
      if (mapRef.current) {
        mapRef.current.clearRoute()
        mapRef.current.showRadiusCircle()
      }
    }
  }, [selectedBid, center])

  // Calculate ETA for all bids when bids change
  React.useEffect(() => {
    const calculateAllETAs = async () => {
      if (bids.length === 0) {
        setEnrichedBids([])
        return
      }

      setLoadingETAs(true)
      const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      if (!MAPBOX_TOKEN) {
        setEnrichedBids(bids)
        setLoadingETAs(false)
        return
      }

      // Calculate ETA for each bid in parallel
      const enrichedBidsPromises = bids.map(async (bid) => {
        const contractorLat = (bid as any).contractor_latitude || (bid as any).latitude
        const contractorLng = (bid as any).contractor_longitude || (bid as any).longitude

        // If no contractor location, return bid as-is with existing eta_minutes
        if (!contractorLat || !contractorLng) {
          return { ...bid, calculated_eta: bid.eta_minutes }
        }

        try {
          const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${contractorLng},${contractorLat};${center[1]},${center[0]}?access_token=${MAPBOX_TOKEN}`
          )

          if (response.ok) {
            const data = await response.json()
            if (data.routes && data.routes[0]) {
              const durationSeconds = data.routes[0].duration
              const distanceMeters = data.routes[0].distance
              const durationMinutes = Math.round(durationSeconds / 60)
              const distanceMiles = (distanceMeters / 1609.34).toFixed(1)
              return {
                ...bid,
                calculated_eta: durationMinutes,
                calculated_distance: `${distanceMiles} mi`
              }
            }
          }
        } catch (error) {
          console.error('Error calculating ETA for bid:', bid.id, error)
        }

        return { ...bid, calculated_eta: bid.eta_minutes }
      })

      const results = await Promise.all(enrichedBidsPromises)
      setEnrichedBids(results)
      setLoadingETAs(false)
    }

    calculateAllETAs()
  }, [bids, center])

  const timeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
    >
      {/* Full-screen Map Background - extends behind status bar (time/wifi icons) */}
      <div className="ios-fullscreen-map z-0">
        <FindProMapbox
          ref={mapRef}
          items={mapContractors}
          radiusMiles={5}
          searchCenter={center}
          userLocation={center}
          onSearchHere={(c) => setCenter(c)}
          onContractorSelect={(c: any) => { handleContractorSelect(c) }}
          fullscreen={true}
          hideSearchButton={true}
          hideControls={true}
          trackingMarker={trackingContractorLoc ? { lat: trackingContractorLoc.lat, lng: trackingContractorLoc.lng, bearing: trackingBearing } : null}
        />
      </div>

      {/* Map Controls - Zoom and Location buttons - Fixed position */}
      <div
        className="fixed right-4 z-30 flex flex-col gap-2"
        style={{ top: 'max(calc(env(safe-area-inset-top, 59px) + 12px), 71px)' }}
      >
        {/* Zoom In */}
        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="w-10 h-10 rounded-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
          }}
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
          </svg>
        </button>

        {/* Zoom Out */}
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="w-10 h-10 rounded-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
          }}
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
          </svg>
        </button>

        {/* My Location */}
        <button
          onClick={handleLocation}
          className="w-10 h-10 rounded-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
          }}
        >
          {fetchingLocation ? (
            <div className="w-4 h-4 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          )}
        </button>
      </div>

      {/* Jobs Section - Draggable Bottom Sheet - Hidden when contractor sheet is open */}
      {!selectedContractor && (
      <div
        className={`fixed left-0 right-0 bg-white rounded-t-2xl z-20 flex flex-col ${!isDragging ? 'transition-[height,max-height,transform,padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]' : ''}`}
        style={{
          boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
          height: sheetMinimized ? '80px' : sheetExpanded ? '50%' : (hasSearched || mostRecentPendingJob || trackingJob) ? '50%' : '195px',
          maxHeight: sheetMinimized ? '80px' : '50%',
          transform: `translateY(${-currentTranslate}px)`,
          paddingBottom: sheetMinimized ? '0' : '16px',
          bottom: 'calc(65px + env(safe-area-inset-bottom, 0px))'
        }}
      >
        {/* Pull handle - always draggable */}
        <div
          className="flex flex-col items-center cursor-grab active:cursor-grabbing flex-shrink-0 pt-3 pb-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={async () => {
            await triggerHaptic()
            if (sheetMinimized) {
              setSheetMinimized(false)
            } else if (sheetExpanded) {
              setSheetExpanded(false)
            } else {
              setSheetExpanded(true)
            }
          }}
        >
          <div className={`w-12 h-1.5 rounded-full transition-colors ${sheetMinimized ? 'bg-gray-400' : sheetExpanded ? 'bg-emerald-400' : 'bg-gray-300'}`} />
        </div>

        {/* Minimized Preview - shows header row with hint to expand */}
        {sheetMinimized && (
          <div
            className="px-4 flex items-center justify-between"
            onClick={async () => {
              await triggerHaptic()
              setSheetMinimized(false)
            }}
          >
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[14px] text-gray-900">
                {mostRecentPendingJob ? 'Active Request' : hasSearched && searchResults.length > 0 ? `${searchResults.length} Pros Found` : 'Find a Pro'}
              </h3>
              {mostRecentPendingJob && (
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-1 text-gray-400">
              <span className="text-[12px]">Tap to expand</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </div>
          </div>
        )}

        {/* Scrollable Content - hidden when minimized */}
        <div className={`flex-1 overflow-auto ${sheetMinimized ? 'hidden' : ''}`}>
          {/* Section Header — only shown when content is active */}
          {(hasSearched || mostRecentPendingJob || trackingJob) && (
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[15px] text-gray-900">
                {mostRecentPendingJob ? 'Active Request' : hasSearched && searchResults.length > 0 ? `${searchResults.length} Pros Found` : 'Find a Pro'}
              </h3>
              {mostRecentPendingJob && (
                <span className="px-2 py-0.5 bg-amber-100 rounded-full text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                  Finding Pros
                </span>
              )}
              {searchLoading && (
                <span className="px-2 py-0.5 bg-emerald-100 rounded-full text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                  <div className="w-2.5 h-2.5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                  Searching
                </span>
              )}
            </div>
            <button
              onClick={() => router.push('/post-job')}
              className="text-emerald-600 text-[13px] font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
          </div>
          )}

          {/* Search + Badges + Post a Job — always visible (except during tracking) */}
          {!trackingJob && (
            <div className="px-4 pb-3 space-y-3">
              {/* Search Bar */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 focus-within:border-emerald-400 focus-within:bg-white transition-colors">
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={bottomSheetSearch}
                  onChange={(e) => setBottomSheetSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { handleBottomSheetSearch(bottomSheetSearch); setSheetExpanded(true) } }}
                  placeholder="What do you need help with?"
                  className="flex-1 text-[15px] text-gray-900 placeholder-gray-400 bg-transparent outline-none"
                />
                {bottomSheetSearch && (
                  <button
                    onClick={() => { setBottomSheetSearch(''); setSearchResults([]); setHasSearched(false) }}
                    className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center"
                  >
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => { handleBottomSheetSearch(bottomSheetSearch); setSheetExpanded(true) }}
                  disabled={searchLoading}
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  {searchLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Category Badges */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {CATEGORY_BUBBLES.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => { setBottomSheetSearch(cat.label); handleBottomSheetSearch(cat.label); setSheetExpanded(true) }}
                    className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium bg-gray-100 text-gray-600 active:bg-emerald-100 active:text-emerald-700 active:scale-95 transition-all"
                  >
                    <span className="text-[13px]">{cat.icon}</span>
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Post a Job CTA — only visible when sheet expanded, NOT searching, and no active bids job */}
              {sheetExpanded && !hasSearched && !mostRecentPendingJob && (
                <button
                  onClick={() => router.push('/post-job')}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-200 active:scale-[0.98] transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[15px] text-gray-900">Post a Job</p>
                    <p className="text-[12px] text-gray-500">Get matched with nearby pros instantly</p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Job State Content — only render when there's an active job or tracking */}
          <div className={`px-4 ${(trackingJob || mostRecentPendingJob) ? 'pb-4' : ''}`}>
            {trackingJob ? (
              /* ═══ TRACKING JOB — two phases (hides search bar above) ═══ */
              <div className="space-y-4">
                {!trackingContractorLoc ? (
                  /* --- Phase 1: Waiting for contractor to accept & start tracking --- */
                  <div className="flex flex-col items-center py-6">
                    <div className="relative w-16 h-16 mb-3">
                      <div className="absolute inset-0 rounded-full bg-amber-100 animate-ping opacity-25" />
                      <div className="absolute inset-2 rounded-full bg-amber-200 animate-ping opacity-25" style={{ animationDelay: '0.2s' }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                          {trackingJob.contractor_image ? (
                            <img src={trackingJob.contractor_image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white font-bold text-lg">{(trackingJob.contractor_name || 'C')[0].toUpperCase()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="font-semibold text-[15px] text-gray-900">{trackingJob.contractor_name || 'Contractor'}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <p className="text-amber-600 text-[13px] font-medium">Waiting for contractor to accept...</p>
                    </div>
                    <p className="text-gray-400 text-[11px] mt-2">{trackingJob.title}</p>
                    {trackingJob.estimated_cost && (
                      <p className="text-gray-500 text-[13px] mt-1">Price: <span className="font-bold text-gray-900">${Number(trackingJob.estimated_cost).toFixed(0)}</span></p>
                    )}
                    {/* Cancel while waiting */}
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="mt-4 px-6 py-2 rounded-xl text-[13px] font-semibold text-red-500 bg-red-50 border border-red-200 active:scale-95 transition-transform"
                    >
                      Cancel Job
                    </button>
                    {showCancelConfirm && (
                      <div className="mt-3 bg-red-50 rounded-xl p-4 border-2 border-red-200 space-y-3 w-full">
                        <p className="text-red-700 text-[13px] font-semibold text-center">Cancel this job?</p>
                        <div className="flex gap-3">
                          <button onClick={() => setShowCancelConfirm(false)} className="flex-1 py-2 rounded-xl text-[12px] font-semibold text-gray-600 bg-white border border-gray-200 active:scale-95 transition-transform">Keep</button>
                          <button onClick={handleCancelJob} disabled={cancellingJob} className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white bg-red-500 active:scale-95 transition-transform disabled:opacity-50">{cancellingJob ? 'Cancelling...' : 'Yes, Cancel'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* --- Phase 2: Contractor accepted — live tracking mode --- */
                  <>
                    {/* Contractor info + Live EAT */}
                    <div className="bg-white rounded-2xl p-4 border-2 border-emerald-200" style={{ boxShadow: '0 4px 16px rgba(16,185,129,0.12)' }}>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <div className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                            {trackingJob.contractor_image ? (
                              <img src={trackingJob.contractor_image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-white font-bold text-xl">{(trackingJob.contractor_name || 'C')[0].toUpperCase()}</span>
                            )}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-emerald-600 text-[12px] font-semibold">On The Way</span>
                          </div>
                          <p className="font-bold text-[17px] text-gray-900 truncate">{trackingJob.contractor_name || 'Contractor'}</p>
                          <p className="text-gray-500 text-[12px]">{trackingJob.title}</p>
                        </div>
                        <div className="flex-shrink-0 text-center">
                          <p className="text-[28px] font-bold text-emerald-600 font-mono leading-none">{formatCountdown(trackingEatSeconds)}</p>
                          <p className="text-[10px] font-semibold text-emerald-700 mt-0.5">EAT</p>
                        </div>
                      </div>

                      {/* Price row */}
                      {trackingJob.estimated_cost && (
                        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                          <span className="text-gray-500 text-[13px]">Agreed Price</span>
                          <span className="text-[20px] font-bold text-gray-900">${Number(trackingJob.estimated_cost).toFixed(0)}</span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons: Chat + Track */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => { onOpenTracking() }}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-[14px] text-emerald-700 bg-emerald-50 border border-emerald-200 active:scale-95 transition-transform"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Chat
                      </button>
                      <button
                        onClick={onOpenTracking}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-[14px] text-white active:scale-95 transition-transform"
                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Track Live
                      </button>
                    </div>

                    {/* Cancel Job button */}
                    {!showCancelConfirm ? (
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="w-full py-3.5 rounded-xl font-bold text-[15px] text-red-600 bg-red-50 border-2 border-red-200 active:scale-95 transition-transform"
                      >
                        Cancel Job
                      </button>
                    ) : (
                      <div className="bg-red-50 rounded-xl p-4 border-2 border-red-200 space-y-3">
                        <p className="text-red-700 text-[14px] font-semibold text-center">Are you sure you want to cancel?</p>
                        <p className="text-red-500 text-[12px] text-center">The contractor will be notified and any payment hold will be released.</p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setShowCancelConfirm(false)}
                            className="flex-1 py-2.5 rounded-xl font-semibold text-[13px] text-gray-600 bg-white border border-gray-200 active:scale-95 transition-transform"
                          >
                            Keep Job
                          </button>
                          <button
                            onClick={handleCancelJob}
                            disabled={cancellingJob}
                            className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-white bg-red-500 active:scale-95 transition-transform disabled:opacity-50"
                          >
                            {cancellingJob ? 'Cancelling...' : 'Yes, Cancel'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
              {/* ═══ ACTIVE JOB: bid cards below search/badges ═══ */}
              {mostRecentPendingJob && (
              <div className="space-y-3 mb-4">
                {/* Waiting for bids — compact loading */}
                {bids.length === 0 && (
                  <div className="flex items-center gap-3 py-3 px-4 bg-emerald-50 rounded-xl border border-emerald-200">
                    <div className="relative w-10 h-10 flex-shrink-0">
                      <div className="absolute inset-0 rounded-full bg-emerald-200 animate-ping opacity-25" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-900 font-semibold text-[14px]">Finding pros...</p>
                      <p className="text-gray-500 text-[12px]">{mostRecentPendingJob.title}</p>
                    </div>
                    <p className="text-emerald-600 text-[16px] font-mono font-bold">{formatCountdown(waitElapsed)}</p>
                  </div>
                )}

                {/* Vertical bid card list */}
                {(enrichedBids.length > 0 || bids.length > 0) && (
                  <div className="space-y-2">
                    {(enrichedBids.length > 0 ? enrichedBids : bids).map((bid, index) => {
                      const displayEat = bid.calculated_eta || bid.eta_minutes
                      const isFirst = index === 0
                      return (
                        <button
                          key={bid.id}
                          onClick={() => setSelectedBid(bid)}
                          className={`w-full flex items-center gap-3 p-4 rounded-2xl active:scale-[0.98] transition-all text-left ${
                            isFirst ? 'border-2 border-emerald-500 bg-emerald-50' : 'border-2 border-gray-100 bg-white'
                          }`}
                          style={{ boxShadow: isFirst ? '0 4px 16px rgba(16,185,129,0.15)' : '0 1px 4px rgba(0,0,0,0.04)' }}
                        >
                          <div className="relative flex-shrink-0">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                              {(bid as any).contractor_image ? (
                                <img src={(bid as any).contractor_image} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-white font-bold text-[16px]">
                                  {(bid.contractor_name || 'C').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-[15px] text-gray-900 truncate">{bid.contractor_name || 'Contractor'}</p>
                              {bid.contractor_rating && (
                                <span className="flex items-center gap-0.5 flex-shrink-0">
                                  <span className="text-amber-400 text-[12px]">&#9733;</span>
                                  <span className="text-[12px] font-medium text-gray-600">{bid.contractor_rating.toFixed(1)}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Licensed</span>
                              {bid.calculated_distance && (
                                <span className="text-[11px] text-gray-500">{bid.calculated_distance} away</span>
                              )}
                            </div>
                            {bid.message && (
                              <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">&ldquo;{bid.message}&rdquo;</p>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="text-[22px] font-bold text-gray-900">${bid.bid_amount}</p>
                            {displayEat ? (
                              <p className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mt-1">{formatCountdown(displayEat * 60)} EAT</p>
                            ) : loadingETAs ? (
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <div className="w-2.5 h-2.5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                              </div>
                            ) : null}
                          </div>
                        </button>
                      )
                    })}
                    <p className="text-center text-emerald-600 text-[12px] font-medium pt-2">Average response time: 4 minutes</p>
                  </div>
                )}
              </div>
              )}

              {/* ═══ Search results / Nearby pros ═══ */}
              {!mostRecentPendingJob && (
              <div className="space-y-4">
                {/* Search Loading / Countdown */}
                {(searchLoading || (hasSearched && !searchLoading && searchResults.length === 0 && searchCountdown > 0)) && (
                  <div className="flex flex-col items-center py-6">
                    <div className="relative w-20 h-20 mb-3">
                      <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-25" />
                      <div className="absolute inset-2 rounded-full bg-emerald-200 animate-ping opacity-25" style={{ animationDelay: '0.2s' }} />
                      <div className="absolute inset-4 rounded-full bg-emerald-300 animate-ping opacity-25" style={{ animationDelay: '0.4s' }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center">
                          <span className="text-white text-[20px] font-bold">{searchCountdown}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-gray-600 font-medium text-[13px]">Searching for nearby pros...</p>
                    <p className="text-gray-400 text-[11px] mt-1">{searchCountdown}s remaining</p>
                  </div>
                )}

                {/* No results — after countdown hits 0 */}
                {hasSearched && !searchLoading && searchResults.length === 0 && searchCountdown <= 0 && (
                  <div className="text-center py-6">
                    <p className="text-gray-500 text-[14px] font-medium">No available contractors found.</p>
                    <button
                      onClick={() => router.push('/post-job')}
                      className="mt-3 px-5 py-2.5 rounded-xl font-semibold text-[14px] text-white active:scale-95 transition-transform"
                      style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    >
                      Post a Job Instead
                    </button>
                  </div>
                )}

                {/* Search Results — Vertical contractor cards */}
                {hasSearched && !searchLoading && searchResults.length > 0 && (
                  <div className="space-y-2">
                    {searchResults.map((contractor, index) => {
                      const isFirst = index === 0
                      const eatMinutes = contractor._eatMinutes || 0
                      return (
                        <button
                          key={contractor.id}
                          onClick={() => handleContractorSelect(contractor)}
                          className={`w-full flex items-center gap-3 p-4 rounded-2xl active:scale-[0.98] transition-all text-left ${
                            isFirst ? 'border-2 border-emerald-500 bg-emerald-50' : 'border-2 border-gray-100 bg-white'
                          }`}
                          style={{ boxShadow: isFirst ? '0 4px 16px rgba(16,185,129,0.15)' : '0 1px 4px rgba(0,0,0,0.04)' }}
                        >
                          <div className="relative flex-shrink-0">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                              {contractor.profile_image_url ? (
                                <img src={contractor.profile_image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-white font-bold text-[16px]">
                                  {(contractor.business_name || contractor.name || 'C').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                                </span>
                              )}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-[15px] text-gray-900 truncate">{contractor.business_name || contractor.name || 'Contractor'}</p>
                              {contractor.rating && (
                                <span className="flex items-center gap-0.5 flex-shrink-0">
                                  <span className="text-amber-400 text-[12px]">&#9733;</span>
                                  <span className="text-[12px] font-medium text-gray-600">{Number(contractor.rating).toFixed(1)}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {contractor.license_number && (
                                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Licensed</span>
                              )}
                              {contractor._distanceMiles && (
                                <span className="text-[11px] text-gray-500">{contractor._distanceMiles} mi away</span>
                              )}
                            </div>
                            {contractor.bio && (
                              <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">&ldquo;{contractor.bio}&rdquo;</p>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            {contractor.hourly_rate && (
                              <p className="text-[22px] font-bold text-gray-900">${contractor.hourly_rate}</p>
                            )}
                            {eatMinutes > 0 ? (
                              <p className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mt-1">{formatCountdown(eatMinutes * 60)} EAT</p>
                            ) : null}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
              </>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Contractor Bottom Sheet */}
      {selectedContractor && (
        <ContractorBottomSheet
          contractor={selectedContractor}
          onClose={() => { setSelectedContractor(null); setContractorETA(null); setEnrichedContractorData(null); setPaymentError(null); setJobDescription(''); mapRef.current?.clearRoute(); mapRef.current?.showRadiusCircle() }}
          onContact={handleContactContractor}
          onStartJob={handleStartJob}
          onViewProfile={() => setShowContractorProfile(true)}
          eta={contractorETA}
          loadingETA={loadingContractorETA}
          bookingLoading={bookingLoading}
          savedCard={savedCard}
          enrichedData={enrichedContractorData}
          loadingEnrichedData={loadingEnrichedData}
          paymentError={paymentError}
          jobDescription={jobDescription}
          onJobDescriptionChange={setJobDescription}
        />
      )}

      {/* Inline Add Card Modal */}
      <AddCardModal
        isOpen={showAddCardAlert}
        userId={user?.id || ''}
        onSuccess={(card) => { setSavedCard(card); setShowAddCardAlert(false) }}
        onClose={() => setShowAddCardAlert(false)}
      />

      {/* Direct Offer Modal */}
      {showOfferModal && offerContractor && (
        <OfferJobModal
          contractor={{
            id: offerContractor.id,
            name: offerContractor.name || offerContractor.business_name || 'Contractor',
            services: offerContractor.services || [],
            city: offerContractor.city,
            state: offerContractor.state,
            rating: offerContractor.rating
          }}
          onClose={() => {
            setShowOfferModal(false)
            setOfferContractor(null)
          }}
          onSuccess={() => {
            setShowOfferModal(false)
            setOfferContractor(null)
          }}
        />
      )}

      {/* Full-Screen Bid Profile View - Shows when contractor bid is selected */}
      {selectedBid && !showPaymentModal && (
        <ContractorBidProfileView
          bid={selectedBid}
          userLocation={center}
          onClose={() => {
            setSelectedBid(null)
            setBidDistance(null)
            setBidAddress(null)
          }}
          onAccept={() => {
            // Open payment modal
            setShowPaymentModal(true)
          }}
          onDecline={() => {
            setSelectedBid(null)
            setBidDistance(null)
            setBidAddress(null)
          }}
        />
      )}

      {/* Stripe Payment Modal */}
      {selectedBid && mostRecentPendingJob && user && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          bidId={selectedBid.id}
          jobId={mostRecentPendingJob.id}
          amount={selectedBid.bid_amount}
          contractorName={selectedBid.contractor_name || 'Contractor'}
          jobTitle={mostRecentPendingJob.title}
          homeownerId={user.id}
          onPaymentSuccess={async () => {
            // Payment succeeded - now accept the bid
            await triggerHaptic(ImpactStyle.Heavy)

            // Accept the bid (updates direct_offers and homeowner_jobs)
            onAcceptBid(selectedBid)

            // Close modal and clear state
            setShowPaymentModal(false)
            setSelectedBid(null)
            setBidDistance(null)
            setBidAddress(null)
          }}
        />
      )}
    </div>
  )
}

// Find a Pro View — same layout as Home tab (full-screen map + draggable bottom sheet)
// Only shows ONLINE contractors
function FindProView({ center, setCenter, initialSearch, initialCategory, onClose, onStartJobSuccess, user }: {
  center: LatLng
  setCenter: (c: LatLng) => void
  initialSearch: string
  initialCategory: string
  onClose: () => void
  onStartJobSuccess: (data: { jobId: string; contractorId: string; contractorName: string; title: string; estimatedAmount: number; etaMinutes?: number }) => void
  user: any
}) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = React.useState(initialSearch)
  const [activeCategory, setActiveCategory] = React.useState(initialCategory)
  const [contractors, setContractors] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [radiusMiles] = React.useState(5)
  const [selectedContractor, setSelectedContractor] = React.useState<any>(null)
  const [contractorETA, setContractorETA] = React.useState<string | null>(null)
  const [loadingContractorETA, setLoadingContractorETA] = React.useState(false)
  const [enrichedContractorData, setEnrichedContractorData] = React.useState<any>(null)
  const [loadingEnrichedData, setLoadingEnrichedData] = React.useState(false)
  const [savedCard, setSavedCard] = React.useState<{ brand: string; last4: string } | null>(null)
  const [bookingLoading, setBookingLoading] = React.useState(false)
  const [paymentError, setPaymentError] = React.useState<string | null>(null)
  const [jobDescription, setJobDescription] = React.useState('')
  const [showAddCardAlert, setShowAddCardAlert] = React.useState(false)
  const [showOfferModal, setShowOfferModal] = React.useState(false)
  const [offerContractor, setOfferContractor] = React.useState<any>(null)
  const [fetchingLocation, setFetchingLocation] = React.useState(false)
  const [showContractorProfile, setShowContractorProfile] = React.useState(false)
  const mapRef = useRef<FindProMapboxHandle>(null)

  // Bottom sheet drag state — same as HomeTab
  const [sheetExpanded, setSheetExpanded] = React.useState(false)
  const [sheetMinimized, setSheetMinimized] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [startY, setStartY] = React.useState(0)
  const [currentTranslate, setCurrentTranslate] = React.useState(0)

  const handleTouchStart = (e: React.TouchEvent) => { setIsDragging(true); setStartY(e.touches[0].clientY) }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const diff = startY - e.touches[0].clientY
    const maxUp = 200, maxDown = 200
    let clamped: number
    if (sheetMinimized) clamped = Math.max(0, Math.min(maxUp, diff))
    else if (sheetExpanded) clamped = Math.max(-maxDown, Math.min(0, diff))
    else clamped = Math.max(-maxDown, Math.min(maxUp, diff))
    setCurrentTranslate(clamped)
  }
  const handleTouchEnd = async () => {
    setIsDragging(false)
    const threshold = 60
    if (sheetMinimized) { if (currentTranslate > threshold) { await triggerHaptic(); setSheetMinimized(false) } }
    else if (sheetExpanded) { if (currentTranslate < -threshold) { await triggerHaptic(); setSheetExpanded(false) } }
    else { if (currentTranslate > threshold) { await triggerHaptic(); setSheetExpanded(true) } else if (currentTranslate < -threshold) { await triggerHaptic(); setSheetMinimized(true) } }
    setCurrentTranslate(0)
  }

  // Fetch saved payment method
  React.useEffect(() => {
    if (!user) return
    fetch(`/api/stripe/customer/payment-methods?userId=${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.paymentMethods?.length > 0) {
          const defaultPm = data.paymentMethods.find((pm: any) => pm.id === data.defaultPaymentMethodId) || data.paymentMethods[0]
          if (defaultPm?.card) setSavedCard({ brand: defaultPm.card.brand, last4: defaultPm.card.last4 })
        }
      })
      .catch(err => console.error('Error fetching payment methods:', err))
  }, [user])

  // Fetch ONLINE contractors based on category/search
  React.useEffect(() => {
    const fetchContractors = async () => {
      setLoading(true)
      try {
        let query = supabase
          .from('pro_contractors')
          .select('*')
          .eq('status', 'approved')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)

        if (activeCategory) {
          query = query.contains('categories', [activeCategory])
        }

        if (searchQuery) {
          query = query.or(`name.ilike.%${searchQuery}%,business_name.ilike.%${searchQuery}%,categories.cs.{${searchQuery}}`)
        }

        const { data, error } = await query.limit(50)
        if (error) throw error

        // Filter by radius
        const filtered = (data || []).filter(c => {
          if (!c.latitude || !c.longitude) return false
          const R = 3959
          const dLat = (c.latitude - center[0]) * Math.PI / 180
          const dLon = (c.longitude - center[1]) * Math.PI / 180
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(center[0] * Math.PI / 180) * Math.cos(c.latitude * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
          const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
          return dist <= radiusMiles
        })

        setContractors(filtered)
      } catch (err) {
        console.error('Error fetching contractors:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchContractors()
  }, [activeCategory, searchQuery, center, radiusMiles])

  const handleContractorSelect = async (contractor: any) => {
    await triggerHaptic()
    setSelectedContractor(contractor)
    setContractorETA(null)
    setLoadingContractorETA(true)
    setEnrichedContractorData(null)
    setLoadingEnrichedData(true)
    setShowContractorProfile(false)

    // Draw green route line on map + hide radius circle
    if (contractor.latitude && contractor.longitude) {
      mapRef.current?.showRoute(contractor.latitude, contractor.longitude, center[0], center[1])
      mapRef.current?.hideRadiusCircle()
    }

    const etaPromise = (async () => {
      try {
        if (contractor.latitude && contractor.longitude) {
          const res = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${contractor.longitude},${contractor.latitude};${center[1]},${center[0]}?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
          )
          const data = await res.json()
          if (data.routes?.[0]) {
            const dist = (data.routes[0].distance / 1609.34).toFixed(1)
            const dur = Math.round(data.routes[0].duration / 60)
            setContractorETA(`${dist} mi • ${dur} min drive`)
          }
        }
      } catch (err) {
        console.error('ETA fetch error:', err)
      } finally {
        setLoadingContractorETA(false)
      }
    })()

    const enrichPromise = (async () => {
      try {
        const { data } = await supabase
          .from('pro_contractors')
          .select('*, hourly_rate, visit_fee, diagnostic_fee, bio, years_experience, response_time_minutes, completed_jobs_count, off_peak_rate, peak_rate, surge_rate')
          .eq('id', contractor.id)
          .single()
        setEnrichedContractorData(data)
      } catch (err) {
        console.error('Failed to fetch enriched data:', err)
      } finally {
        setLoadingEnrichedData(false)
      }
    })()

    await Promise.all([etaPromise, enrichPromise])
  }

  const handleContactContractor = (contractor: any) => {
    setOfferContractor(contractor)
    setShowOfferModal(true)
    setSelectedContractor(null)
  }

  const handleStartJob = async (contractor: any) => {
    if (!user) { router.push('/sign-in'); return }
    if (!savedCard) { setShowAddCardAlert(true); return }

    setBookingLoading(true)
    setPaymentError(null)

    try {
      const visitFee = enrichedContractorData?.visit_fee || 0
      const diagnosticFee = enrichedContractorData?.diagnostic_fee || 0
      const hourlyRate = enrichedContractorData?.hourly_rate || 65
      const baseAmount = (visitFee + diagnosticFee) > 0 ? (visitFee + diagnosticFee) : (hourlyRate * 2)
      const estimatedAmount = Math.max(baseAmount, hourlyRate)
      const category = enrichedContractorData?.categories?.[0] || contractor?.services?.[0] || 'General'
      const jobTitle = jobDescription || `${category} Service`

      // Create job with status 'pending' (start-direct will set 'confirmed')
      const { data: jobRecord, error: jobError } = await supabase
        .from('homeowner_jobs')
        .insert({
          homeowner_id: user.id,
          title: jobTitle,
          description: jobDescription || `${category} service needed`,
          category,
          status: 'pending',
          estimated_cost: estimatedAmount,
          latitude: center[0],
          longitude: center[1],
          source: 'mobile_find_pro'
        })
        .select()
        .single()

      if (jobError || !jobRecord) throw new Error(jobError?.message || 'Failed to create job')

      // Call start-direct API — creates escrow, assigns contractor, notifies
      const startResponse = await fetch('/api/jobs/start-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: jobRecord.id,
          contractorId: contractor.id,
          amount: estimatedAmount,
          homeownerId: user.id
        })
      })

      const startData = await startResponse.json()
      if (!startResponse.ok || !startData.success) {
        await supabase.from('homeowner_jobs').delete().eq('id', jobRecord.id)
        if (startData.needsCard) {
          setShowAddCardAlert(true)
          return
        }
        throw new Error(startData.error || 'Payment authorization failed')
      }

      await triggerHaptic(ImpactStyle.Heavy)
      setSelectedContractor(null)

      let etaMins: number | undefined
      if (contractorETA) {
        const match = contractorETA.match(/(\d+)\s*min/)
        if (match) etaMins = parseInt(match[1])
      }

      onClose()
      onStartJobSuccess({
        jobId: jobRecord.id,
        contractorId: contractor.id,
        contractorName: startData.contractorName || contractor.name || contractor.business_name || 'Contractor',
        title: jobTitle,
        estimatedAmount,
        etaMinutes: etaMins
      })
    } catch (err: any) {
      console.error('Error in Start Job flow:', err)
      setPaymentError(err.message || 'Failed to process booking. Please try again.')
    } finally {
      setBookingLoading(false)
    }
  }

  const handleLocation = async () => {
    await triggerHaptic()
    setFetchingLocation(true)
    const nativeResult = await getNativeLocation()
    if (nativeResult.success && nativeResult.coordinates) {
      setCenter([nativeResult.coordinates.latitude, nativeResult.coordinates.longitude])
      setFetchingLocation(false)
      return
    }
    const browserOk = await new Promise<boolean>((resolve) => {
      if (!navigator.geolocation) { resolve(false); return }
      navigator.geolocation.getCurrentPosition(
        (pos) => { setCenter([pos.coords.latitude, pos.coords.longitude]); resolve(true) },
        () => resolve(false),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      )
    })
    if (browserOk) { setFetchingLocation(false); return }
    try {
      const res = await fetch('https://ipapi.co/json/')
      const data = await res.json()
      if (data.latitude && data.longitude) setCenter([data.latitude, data.longitude])
    } catch (e) { /* all failed */ }
    setFetchingLocation(false)
  }

  const handleCategorySelect = async (catKey: string) => {
    await triggerHaptic()
    setActiveCategory(activeCategory === catKey ? '' : catKey)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
    >
      {/* Full-screen Map Background — identical to Home tab */}
      <div className="ios-fullscreen-map z-0">
        <FindProMapbox
          ref={mapRef}
          items={contractors}
          radiusMiles={radiusMiles}
          searchCenter={center}
          userLocation={center}
          onSearchHere={(c) => setCenter(c)}
          onContractorSelect={handleContractorSelect}
          category={activeCategory}
          fullscreen={true}
          hideSearchButton={true}
          hideControls={true}
        />
      </div>

      {/* Floating Search Bar — same position as Home tab but with back button */}
      <div
        className="fixed left-4 right-4 z-30"
        style={{ top: 'max(calc(env(safe-area-inset-top, 59px) + 8px), 67px)' }}
      >
        <div
          className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
        >
          {/* Back button */}
          <button
            onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center active:scale-95 transition-transform bg-gray-100"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find a pro..."
            className="flex-1 text-[14px] text-gray-900 placeholder-gray-400 bg-transparent outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center"
            >
              <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Map Controls — same position as Home tab */}
      <div
        className="fixed right-4 z-30 flex flex-col gap-2"
        style={{ top: 'max(calc(env(safe-area-inset-top, 59px) + 70px), 129px)' }}
      >
        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="w-10 h-10 rounded-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
          </svg>
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="w-10 h-10 rounded-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
          </svg>
        </button>
        <button
          onClick={handleLocation}
          className="w-10 h-10 rounded-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
        >
          {fetchingLocation ? (
            <div className="w-4 h-4 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          )}
        </button>
      </div>

      {/* Bottom Sheet — draggable, identical layout to Home tab */}
      <div
        className={`fixed left-0 right-0 bg-white rounded-t-2xl z-20 flex flex-col ${!isDragging ? 'transition-all duration-300 ease-out' : ''}`}
        style={{
          boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
          height: sheetMinimized ? '80px' : sheetExpanded ? '70%' : '45%',
          transform: `translateY(${-currentTranslate}px)`,
          paddingBottom: sheetMinimized ? '0' : '16px',
          bottom: 'calc(65px + env(safe-area-inset-bottom, 0px))'
        }}
      >
        {/* Drag handle */}
        <div
          className="flex flex-col items-center cursor-grab active:cursor-grabbing flex-shrink-0 pt-3 pb-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={async () => {
            await triggerHaptic()
            if (sheetMinimized) setSheetMinimized(false)
            else if (sheetExpanded) setSheetExpanded(false)
            else setSheetExpanded(true)
          }}
        >
          <div className={`w-12 h-1.5 rounded-full transition-colors ${sheetMinimized ? 'bg-gray-400' : sheetExpanded ? 'bg-emerald-400' : 'bg-gray-300'}`} />
        </div>

        {/* Minimized preview */}
        {sheetMinimized && (
          <div className="px-4 flex items-center justify-between" onClick={async () => { await triggerHaptic(); setSheetMinimized(false) }}>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[14px] text-gray-900">Find a Pro</h3>
              <span className="text-[12px] text-emerald-600 font-medium">{contractors.length} online</span>
            </div>
            <div className="flex items-center gap-1 text-gray-400">
              <span className="text-[12px]">Tap to expand</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className={`flex-1 overflow-auto ${sheetMinimized ? 'hidden' : ''}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[15px] text-gray-900">Find a Pro</h3>
              <span className="px-2 py-0.5 bg-emerald-100 rounded-full text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                {contractors.length} online
              </span>
            </div>
          </div>

          {/* Category filter pills */}
          <div className="px-4 pb-3">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {CATEGORY_BUBBLES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => handleCategorySelect(cat.key)}
                  className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium active:scale-95 transition-all ${
                    activeCategory === cat.key
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <span className="text-[12px]">{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contractor cards */}
          <div className="px-4 pb-4">
            {loading ? (
              <div className="flex flex-col items-center py-6">
                <div className="relative w-16 h-16 mb-3">
                  <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-25" />
                  <div className="absolute inset-2 rounded-full bg-emerald-200 animate-ping opacity-25" style={{ animationDelay: '0.2s' }} />
                  <div className="absolute inset-4 rounded-full bg-emerald-300 animate-ping opacity-25" style={{ animationDelay: '0.4s' }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <p className="text-gray-600 font-medium text-[13px]">Searching for online pros...</p>
              </div>
            ) : contractors.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-600 text-[13px] font-medium">No online pros found</p>
                <p className="text-gray-400 text-[11px] mt-0.5">Try a different category</p>
              </div>
            ) : (
              <div className="space-y-2">
                {contractors.map(contractor => {
                  const distMi = (() => {
                    if (!contractor.latitude || !contractor.longitude) return null
                    const R = 3959
                    const dLat = (contractor.latitude - center[0]) * Math.PI / 180
                    const dLon = (contractor.longitude - center[1]) * Math.PI / 180
                    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(center[0] * Math.PI / 180) * Math.cos(contractor.latitude * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2)
                    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1)
                  })()
                  return (
                    <button
                      key={contractor.id}
                      onClick={() => handleContractorSelect(contractor)}
                      className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl active:scale-[0.98] transition-transform text-left"
                      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                          {contractor.profile_image_url ? (
                            <img src={contractor.profile_image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white font-bold text-[18px]">{(contractor.name || contractor.business_name || 'C')[0].toUpperCase()}</span>
                          )}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-[14px] text-gray-900 truncate">{contractor.business_name || contractor.name}</p>
                          {contractor.rating && (
                            <span className="flex items-center gap-0.5 flex-shrink-0">
                              <span className="text-amber-400 text-[11px]">★</span>
                              <span className="text-[11px] font-medium text-gray-600">{contractor.rating.toFixed(1)}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {contractor.categories?.slice(0, 2).map((cat: string, i: number) => (
                            <span key={i} className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">{cat}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {contractor.hourly_rate && (
                          <p className="text-[15px] font-bold text-gray-900">${contractor.hourly_rate}/hr</p>
                        )}
                        {distMi && (
                          <p className="text-[11px] text-gray-500">{distMi} mi</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contractor Bottom Sheet */}
      {selectedContractor && !showContractorProfile && (
        <ContractorBottomSheet
          contractor={selectedContractor}
          onClose={() => { setSelectedContractor(null); setContractorETA(null); setEnrichedContractorData(null); setPaymentError(null); setJobDescription(''); mapRef.current?.clearRoute(); mapRef.current?.showRadiusCircle() }}
          onContact={handleContactContractor}
          onStartJob={handleStartJob}
          onViewProfile={() => setShowContractorProfile(true)}
          eta={contractorETA}
          loadingETA={loadingContractorETA}
          bookingLoading={bookingLoading}
          savedCard={savedCard}
          enrichedData={enrichedContractorData}
          loadingEnrichedData={loadingEnrichedData}
          paymentError={paymentError}
          jobDescription={jobDescription}
          onJobDescriptionChange={setJobDescription}
        />
      )}

      {/* Full Contractor Profile View */}
      {selectedContractor && showContractorProfile && (
        <ContractorProfileView
          contractor={selectedContractor}
          enrichedData={enrichedContractorData}
          eta={contractorETA}
          onClose={() => setShowContractorProfile(false)}
          onStartJob={handleStartJob}
          onContact={handleContactContractor}
        />
      )}

      {/* Inline Add Card Modal */}
      <AddCardModal
        isOpen={showAddCardAlert}
        userId={user?.id || ''}
        onSuccess={(card) => { setSavedCard(card); setShowAddCardAlert(false) }}
        onClose={() => setShowAddCardAlert(false)}
      />

      {/* Direct Offer Modal */}
      {showOfferModal && offerContractor && (
        <OfferJobModal
          contractor={{
            id: offerContractor.id,
            name: offerContractor.name || offerContractor.business_name || 'Contractor',
            services: offerContractor.services || offerContractor.categories || [],
            city: offerContractor.city,
            state: offerContractor.state,
            rating: offerContractor.rating
          }}
          onClose={() => { setShowOfferModal(false); setOfferContractor(null) }}
          onSuccess={() => { setShowOfferModal(false); setOfferContractor(null) }}
        />
      )}
    </div>
  )
}

// Jobs Tab Content - Connected to real database
function JobsTab({ jobs, loading, onOpenTracking }: {
  jobs: HomeownerJob[]
  loading: boolean
  onOpenTracking?: (jobId: string) => void
}) {
  const router = useRouter()

  // Calculate total spent on completed jobs
  const totalSpent = React.useMemo(() => {
    return jobs
      .filter(j => j.status === 'completed')
      .reduce((sum, j) => sum + (j.final_price || j.final_cost || j.direct_amount || 0), 0)
  }, [jobs])

  const completedCount = jobs.filter(j => j.status === 'completed').length
  const activeCount = jobs.filter(j => j.status === 'in_progress' || j.status === 'confirmed' || j.status === 'pending').length

  const handleJobPress = async (job: HomeownerJob) => {
    await triggerHaptic()
    // For in_progress or confirmed jobs, open tracking view
    if ((job.status === 'in_progress' || job.status === 'confirmed') && onOpenTracking) {
      onOpenTracking(job.id)
    } else {
      router.push(`/jobs/${job.id}`)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' }
      case 'confirmed': return { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' }
      case 'in_progress': return { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' }
      case 'completed': return { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' }
      case 'cancelled': return { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' }
      default: return { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' }
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div
      className="absolute inset-0 flex flex-col bg-white"
      style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
    >
      {/* Green Header */}
      <div
        className="relative z-20"
        style={{
          background: 'linear-gradient(135deg, #10b981, #059669)',
          paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-white font-semibold text-[16px]">My Jobs</p>
          <Link
            href="/post-job"
            className="px-3 py-1.5 rounded-full text-[13px] font-medium text-emerald-600 bg-white active:scale-95 transition-transform"
          >
            + New Job
          </Link>
        </div>
      </div>

      {/* Spending Summary */}
      {!loading && jobs.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total Spent</p>
                <p className="text-[18px] font-bold text-gray-900">${totalSpent.toFixed(2)}</p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Completed</p>
                <p className="text-[18px] font-bold text-emerald-600">{completedCount}</p>
              </div>
              {activeCount > 0 && (
                <>
                  <div className="w-px h-8 bg-gray-200" />
                  <div>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wide">Active</p>
                    <p className="text-[18px] font-bold text-blue-600">{activeCount}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' }}
          >
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-900 text-[16px] font-semibold mb-1">No Jobs Yet</p>
          <p className="text-gray-500 text-[14px] text-center mb-5">Book a pro to see your jobs here</p>
          <Link
            href="/post-job"
            className="px-5 py-2.5 rounded-full font-semibold text-[14px] text-white active:scale-95 transition-transform"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
            }}
          >
            Book a Pro
          </Link>
        </div>
      ) : (
        /* Jobs List */
        <div className="flex-1 overflow-auto">
          <div className="px-4 py-3 space-y-3">
            {jobs.map((job) => {
              const statusStyle = getStatusColor(job.status)
              const createdDate = new Date(job.created_at)
              const timeAgo = (() => {
                const now = new Date()
                const diff = now.getTime() - createdDate.getTime()
                const mins = Math.floor(diff / 60000)
                const hours = Math.floor(mins / 60)
                const days = Math.floor(hours / 24)
                if (mins < 60) return `${mins}m ago`
                if (hours < 24) return `${hours}h ago`
                if (days < 7) return `${days}d ago`
                return createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              })()
              const isTrackable = job.status === 'in_progress' || job.status === 'confirmed'
              return (
                <button
                  key={job.id}
                  onClick={() => handleJobPress(job)}
                  className="w-full bg-white rounded-xl p-4 text-left active:scale-[0.98] transition-transform"
                  style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-gray-900 line-clamp-1">{job.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[12px] text-gray-500">{job.category}</span>
                        {job.priority === 'emergency' && (
                          <span className="bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                            URGENT
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded-full ${statusStyle.bg} flex items-center gap-1 flex-shrink-0`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                      <span className={`text-[11px] font-medium ${statusStyle.text} capitalize`}>
                        {job.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Details row */}
                  <div className="flex items-center gap-3 text-[12px] text-gray-500 mb-2">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {timeAgo}
                    </span>
                    {job.address && (
                      <span className="flex items-center gap-1 truncate max-w-[140px]">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        <span className="truncate">{job.address.split(',')[0]}</span>
                      </span>
                    )}
                    {job.scheduled_date && (
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {formatDate(job.scheduled_date)}
                      </span>
                    )}
                  </div>

                  {/* Footer row */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      {(job.bids_count !== undefined && job.bids_count > 0) && (
                        <span className="flex items-center gap-1 text-[12px] text-emerald-600 font-semibold">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          {job.bids_count} bid{job.bids_count > 1 ? 's' : ''}
                        </span>
                      )}
                      {job.final_price ? (
                        <span className="text-[13px] font-bold text-emerald-600">
                          ${Number(job.final_price).toFixed(2)}
                        </span>
                      ) : job.final_cost ? (
                        <span className="text-[13px] font-bold text-emerald-600">
                          ${Number(job.final_cost).toFixed(2)}
                        </span>
                      ) : (job.direct_amount || job.final_cost) ? (
                        <span className="text-[13px] font-semibold text-gray-700">
                          ${Number((job.direct_amount || job.final_cost)).toFixed(2)}
                        </span>
                      ) : job.estimated_cost ? (
                        <span className="text-[13px] font-semibold text-gray-700">
                          Est. ${job.estimated_cost}
                        </span>
                      ) : null}
                    </div>
                    {isTrackable ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 rounded-full">
                        <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        <span className="text-[11px] font-semibold text-white">Track Live</span>
                      </div>
                    ) : (
                      <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Messages Tab Content - Connected to real conversations
function MessagesTab({ conversations, loading, unreadCount }: {
  conversations: any[]
  loading: boolean
  unreadCount: number
}) {
  const router = useRouter()

  const handleConversationPress = async (conversationId: string, name: string) => {
    await triggerHaptic()
    setActiveConvName(name)
    setActiveConversation(conversationId)
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const [activeConversation, setActiveConversation] = React.useState<string | null>(null)
  const [activeConvName, setActiveConvName] = React.useState('')

  // If viewing a conversation, show inline chat
  if (activeConversation) {
    return (
      <div
        className="absolute inset-0 flex flex-col bg-white"
        style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
      >
        {/* Header */}
        <div
          className="relative z-20 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            paddingTop: 'calc(max(env(safe-area-inset-top, 54px), 54px) + 4px)'
          }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setActiveConversation(null)}
              className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center active:scale-95"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <p className="text-white font-semibold text-[16px] truncate">{activeConvName}</p>
          </div>
        </div>

        {/* Chat content — use iframe to messages page */}
        <div className="flex-1 overflow-hidden">
          <iframe
            src={`/messages?conversation=${activeConversation}&embed=true`}
            className="w-full h-full border-0"
            style={{ minHeight: '100%' }}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 flex flex-col bg-white"
      style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
    >
      {/* Green Header */}
      <div
        className="relative z-20 flex-shrink-0"
        style={{
          background: 'linear-gradient(135deg, #10b981, #059669)',
          paddingTop: 'calc(max(env(safe-area-inset-top, 54px), 54px) + 4px)'
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-white font-semibold text-[16px]">Messages</p>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-[11px] text-white font-medium">
                {unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : conversations.length === 0 ? (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' }}
          >
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-gray-900 text-[16px] font-semibold mb-1">No Messages</p>
          <p className="text-gray-500 text-[14px] text-center">Your conversations will appear here</p>
        </div>
      ) : (
        /* Conversations List */
        <div className="flex-1 overflow-auto">
          <div className="divide-y divide-gray-100">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleConversationPress(conv.id, conv.pro_name || conv.homeowner_name || conv.title || 'Chat')}
                className="w-full px-4 py-3 flex items-center gap-3 active:bg-gray-50 text-left"
              >
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-emerald-700 font-semibold text-[15px]">
                    {(conv.pro_name || conv.homeowner_name || 'R')[0].toUpperCase()}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className={`text-[15px] ${conv.unread_count > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'} truncate`}>
                      {conv.pro_name || conv.homeowner_name || conv.title || 'Rushr Support'}
                    </p>
                    <span className="text-[12px] text-gray-400 flex-shrink-0 ml-2">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={`text-[13px] truncate ${conv.unread_count > 0 ? 'text-gray-700' : 'text-gray-500'}`}>
                      {conv.last_message_content || 'No messages yet'}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="ml-2 w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Notification type
interface Notification {
  id: string
  type: 'bid' | 'message' | 'job_update' | 'payment' | 'system'
  title: string
  body: string
  read: boolean
  created_at: string
  data?: {
    job_id?: string
    bid_id?: string
    conversation_id?: string
  }
}

// Notifications Tab Content
function NotificationsTab({ userId }: { userId: string }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (fetchError) {
        console.error('Failed to fetch notifications:', fetchError.message)
        setError('Failed to load notifications')
        setNotifications([])
      } else {
        setNotifications(data || [])
      }
    } catch (err) {
      console.error('Error fetching notifications:', err)
      setError('Failed to load notifications')
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()

    // Only subscribe if user exists
    if (!userId) return

    // Subscribe to real-time notifications (will fail silently if table doesn't exist)
    const subscription = supabase
      .channel('notifications_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        () => {
          fetchNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [userId])

  const handleNotificationPress = async (notification: Notification) => {
    await triggerHaptic()

    // Mark as read in database
    if (!notification.read) {
      try {
        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('id', notification.id)
      } catch (e) {
        // Ignore errors if table doesn't exist
      }
    }

    // Navigate based on type
    if (notification.data?.job_id) {
      router.push(`/jobs/${notification.data.job_id}`)
    } else if (notification.data?.conversation_id) {
      router.push(`/messages?conversation=${notification.data.conversation_id}`)
    } else if (notification.data?.bid_id) {
      router.push(`/dashboard/homeowner/bids`)
    }
  }

  const markAllAsRead = async () => {
    await triggerHaptic()

    // Update local state first
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))

    // Try to update database (ignore errors if table doesn't exist)
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false)
    } catch (e) {
      // Ignore errors
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'bid':
        return (
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )
      case 'message':
        return (
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        )
      case 'job_update':
        return (
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        )
      case 'payment':
        return (
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
        )
      default:
        return (
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
        )
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div
      className="absolute inset-0 flex flex-col bg-white"
      style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
    >
      {/* Green Header */}
      <div
        className="relative z-20"
        style={{
          background: 'linear-gradient(135deg, #10b981, #059669)',
          paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-white font-semibold text-[16px]">Notifications</p>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-[11px] text-white font-medium">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-[13px] text-white/80 active:text-white"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : error ? (
        /* Error State with Reload Button */
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, #fee2e2, #fecaca)' }}
          >
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-gray-900 text-[16px] font-semibold mb-1">{error}</p>
          <p className="text-gray-500 text-[14px] text-center mb-4">Please check your connection and try again</p>
          <button
            onClick={() => fetchNotifications()}
            className="px-6 py-2.5 bg-emerald-600 text-white rounded-full text-[14px] font-medium active:bg-emerald-700 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reload
          </button>
        </div>
      ) : notifications.length === 0 ? (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' }}
          >
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p className="text-gray-900 text-[16px] font-semibold mb-1">All Caught Up</p>
          <p className="text-gray-500 text-[14px] text-center">No new notifications</p>
        </div>
      ) : (
        /* Notifications List */
        <div className="flex-1 overflow-auto">
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => handleNotificationPress(notification)}
                className={`w-full px-4 py-3 flex items-start gap-3 text-left active:bg-gray-50 ${!notification.read ? 'bg-emerald-50/50' : ''}`}
              >
                {getNotificationIcon(notification.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-[14px] ${!notification.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'} line-clamp-1`}>
                      {notification.title}
                    </p>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">
                      {formatTime(notification.created_at)}
                    </span>
                  </div>
                  <p className="text-[13px] text-gray-500 line-clamp-2 mt-0.5">
                    {notification.body}
                  </p>
                </div>
                {!notification.read && (
                  <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-2" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Profile Tab Content - Full Homeowner Dashboard (identical to web version)
function ProfileTab({
  firstName,
  email,
  userRole,
  userProfile,
  user,
  stats,
  jobs,
  jobsLoading,
  onSignOut
}: {
  firstName: string
  email: string
  userRole: string
  userProfile: any
  user: any
  stats: any
  jobs: HomeownerJob[]
  jobsLoading: boolean
  onSignOut: () => void
}) {
  const router = useRouter()
  const isContractor = userRole === 'contractor' || userRole === 'pro'

  // Payment method state
  const [savedCard, setSavedCard] = useState<{ brand: string; last4: string; id: string } | null>(null)
  const [loadingCard, setLoadingCard] = useState(false)
  const [showAddCardModal, setShowAddCardModal] = useState(false)
  const [removingCard, setRemovingCard] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  // Fetch saved payment method
  useEffect(() => {
    if (!user?.id || isContractor) return
    setLoadingCard(true)
    fetch(`/api/stripe/customer/payment-methods?userId=${user.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.paymentMethods?.length > 0) {
          const defaultPm = data.defaultPaymentMethodId
            ? data.paymentMethods.find((pm: any) => pm.id === data.defaultPaymentMethodId)
            : data.paymentMethods[0]
          const pm = defaultPm || data.paymentMethods[0]
          if (pm?.card) {
            setSavedCard({ brand: pm.card.brand, last4: pm.card.last4, id: pm.id })
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCard(false))
  }, [user?.id, isContractor])

  const handleRemoveCard = async () => {
    if (!savedCard?.id || !user?.id) return
    setRemovingCard(true)
    try {
      const res = await fetch(`/api/stripe/customer/save-card?paymentMethodId=${savedCard.id}&userId=${user.id}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setSavedCard(null)
        setShowRemoveConfirm(false)
      }
    } catch (err) {
      console.error('Error removing card:', err)
    } finally {
      setRemovingCard(false)
    }
  }

  const handleSignOut = async () => {
    await triggerHaptic(ImpactStyle.Medium)
    onSignOut()
  }

  const handleNavigation = async (href: string) => {
    await triggerHaptic()
    router.push(href)
  }

  // Compute profile completeness
  const completeness = useMemo(() => {
    if (!user || !userProfile) return []
    return [
      { key: 'email', label: 'Verify email', weight: 15, done: !!user.email_confirmed_at },
      { key: 'phone', label: 'Add phone number', weight: 15, done: !!userProfile.phone },
      { key: 'address', label: 'Add property address', weight: 20, done: !!userProfile.address },
      { key: 'avatar', label: 'Profile photo', weight: 10, done: !!userProfile.avatar_url },
      { key: 'kyc', label: 'Identity verification', weight: 25, done: !!userProfile.kyc_verified },
      { key: 'first', label: 'Book first service', weight: 15, done: !!userProfile.first_job_completed },
    ]
  }, [user, userProfile])

  const completenessPct = useMemo(() => {
    if (completeness.length === 0) return 0
    const totalWeight = completeness.reduce((sum, field) => sum + field.weight, 0)
    const doneWeight = completeness.filter(f => f.done).reduce((sum, field) => sum + field.weight, 0)
    return Math.round((doneWeight / totalWeight) * 100)
  }, [completeness])

  // Get active jobs (not completed or cancelled)
  const activeJobs = useMemo(() =>
    jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled').slice(0, 5),
    [jobs]
  )

  // Get past/completed jobs
  const pastJobs = useMemo(() =>
    jobs.filter(j => j.status === 'completed').slice(0, 3),
    [jobs]
  )

  // Stats from database
  const kpis = {
    active: stats?.active_services || 0,
    completed: stats?.completed_services || 0,
    unread: stats?.unread_messages || 0,
    saved: stats?.trusted_contractors || 0
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' }
      case 'confirmed': return { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' }
      case 'in_progress': return { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' }
      case 'completed': return { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' }
      case 'cancelled': return { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' }
      default: return { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' }
    }
  }

  // If contractor, show simple profile links
  if (isContractor) {
    return (
      <div
        className="absolute inset-0 flex flex-col bg-gray-50"
        style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
      >
        {/* Green Header with Profile Info */}
        <div
          className="relative z-20"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
          }}
        >
          <div className="flex items-center gap-3 px-4 py-4">
            {/* Avatar - Tappable to change */}
            <button
              onClick={() => handleNavigation('/profile/avatar')}
              className="relative w-12 h-12 rounded-full bg-white/20 flex items-center justify-center overflow-hidden active:scale-95 transition-transform"
            >
              {userProfile?.avatar_url ? (
                <img src={userProfile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-lg">{firstName?.[0]?.toUpperCase() || 'U'}</span>
              )}
              {/* Camera icon overlay */}
              <div className="absolute bottom-0 right-0 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm">
                <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>
            <div className="flex-1">
              <p className="text-white font-semibold text-[16px]">{firstName || 'User'}</p>
              <p className="text-white/70 text-[13px]">{email}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-white/20 rounded-full text-[11px] text-white font-medium">
                Pro Account
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="px-4 pt-4 space-y-3">
            <IOSCard>
              <button onClick={() => handleNavigation('/dashboard/contractor')} className="w-full">
                <div className="flex items-center justify-between py-3 px-4 active:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <span className="text-[15px] text-gray-900">Pro Dashboard</span>
                  </div>
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </IOSCard>

            <IOSCard>
              <button onClick={handleSignOut} className="w-full">
                <div className="flex items-center justify-center py-3 px-4 active:bg-gray-50">
                  <span className="text-[15px] text-red-500 font-medium">Sign Out</span>
                </div>
              </button>
            </IOSCard>
          </div>
        </div>
      </div>
    )
  }

  // Homeowner Dashboard - Full content identical to web version
  return (
    <div
      className="absolute inset-0 flex flex-col bg-gray-50"
      style={{ paddingBottom: 'calc(65px + max(env(safe-area-inset-bottom, 20px), 20px))' }}
    >
      {/* Green Header with Profile Info */}
      <div
        className="relative z-20"
        style={{
          background: 'linear-gradient(135deg, #10b981, #059669)',
          paddingTop: 'max(env(safe-area-inset-top, 59px), 59px)'
        }}
      >
        <div className="flex items-center gap-3 px-4 py-4">
          {/* Avatar - Tappable to change */}
          <button
            onClick={() => handleNavigation('/profile/avatar')}
            className="relative w-14 h-14 rounded-full bg-white/20 flex items-center justify-center overflow-hidden active:scale-95 transition-transform"
          >
            {userProfile?.avatar_url ? (
              <img src={userProfile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-xl">{firstName?.[0]?.toUpperCase() || 'U'}</span>
            )}
            {/* Camera icon overlay */}
            <div className="absolute bottom-0 right-0 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm">
              <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </button>
          {/* User Info */}
          <div className="flex-1">
            <p className="text-white font-semibold text-[17px]">Welcome, {firstName || 'User'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-[11px] text-white font-medium">
                Homeowner
              </span>
              {completenessPct >= 100 && (
                <span className="px-2 py-0.5 bg-blue-500/30 rounded-full text-[11px] text-white font-medium">
                  ✓ Complete
                </span>
              )}
            </div>
            {completenessPct < 100 && (
              <p className="text-white/60 text-[12px] mt-1">
                Profile {completenessPct}% complete
              </p>
            )}
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 px-4 pb-4 overflow-x-auto">
          <button
            onClick={() => handleNavigation('/post-job?urgent=1')}
            className="px-4 py-2 rounded-lg font-semibold text-[13px] text-red-600 bg-white flex items-center gap-1.5 active:scale-95 transition-transform whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Emergency
          </button>
          <button
            onClick={() => handleNavigation('/profile/settings')}
            className="px-4 py-2 rounded-lg font-medium text-[13px] text-white/90 bg-white/20 flex items-center gap-1.5 active:scale-95 transition-transform whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Profile
          </button>
          <button
            onClick={() => handleNavigation('/dashboard/homeowner/billing')}
            className="px-4 py-2 rounded-lg font-medium text-[13px] text-white/90 bg-white/20 flex items-center gap-1.5 active:scale-95 transition-transform whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Billing
          </button>
        </div>
      </div>

      {/* Scrollable Dashboard Content */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-4 space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Active Services */}
            <div className="bg-white rounded-xl p-3 border border-emerald-100" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[11px] uppercase tracking-wide text-gray-500">Active</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{kpis.active}</p>
              <p className="text-[11px] text-gray-500">services in progress</p>
            </div>

            {/* Completed Services */}
            <div className="bg-white rounded-xl p-3 border border-blue-100" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-[11px] uppercase tracking-wide text-gray-500">Completed</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{kpis.completed}</p>
              <p className="text-[11px] text-gray-500">total services</p>
            </div>

            {/* Unread Messages */}
            <div className="bg-white rounded-xl p-3 border border-amber-100" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[11px] uppercase tracking-wide text-gray-500">Messages</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{kpis.unread}</p>
              <p className="text-[11px] text-gray-500">unread messages</p>
            </div>

            {/* Trusted Contractors */}
            <div className="bg-white rounded-xl p-3 border border-purple-100" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-[11px] uppercase tracking-wide text-gray-500">Trusted</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{kpis.saved}</p>
              <p className="text-[11px] text-gray-500">contractors saved</p>
            </div>
          </div>

          {/* Payment Method Section */}
          <div className="bg-white rounded-xl p-4 border border-gray-100" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-gray-900 text-[14px]">Payment Method</p>
              <button
                onClick={() => setShowAddCardModal(true)}
                className="text-emerald-600 text-[12px] font-medium"
              >
                {savedCard ? 'Change' : 'Add Card'}
              </button>
            </div>
            {loadingCard ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
              </div>
            ) : savedCard ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-emerald-50 rounded-lg p-3">
                  <div className="w-10 h-7 bg-white rounded-md border border-gray-200 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-gray-600 uppercase">{savedCard.brand}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-medium text-gray-900">
                      {savedCard.brand.charAt(0).toUpperCase() + savedCard.brand.slice(1)} ending in {savedCard.last4}
                    </p>
                    <p className="text-[11px] text-emerald-600">Default payment method</p>
                  </div>
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                {showRemoveConfirm ? (
                  <div className="flex items-center gap-2 bg-red-50 rounded-lg p-3 border border-red-200">
                    <p className="flex-1 text-[12px] text-red-700">Remove this card?</p>
                    <button
                      onClick={() => setShowRemoveConfirm(false)}
                      disabled={removingCard}
                      className="px-3 py-1.5 text-[12px] font-medium text-gray-600 bg-white rounded-lg border border-gray-200 active:scale-95 transition-transform"
                    >
                      Keep
                    </button>
                    <button
                      onClick={handleRemoveCard}
                      disabled={removingCard}
                      className="px-3 py-1.5 text-[12px] font-semibold text-white bg-red-500 rounded-lg active:scale-95 transition-transform disabled:opacity-50"
                    >
                      {removingCard ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRemoveConfirm(true)}
                    className="text-[12px] text-red-400 font-medium pl-1"
                  >
                    Remove card
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowAddCardModal(true)}
                className="w-full flex items-center gap-3 bg-gray-50 rounded-lg p-3 active:bg-gray-100 transition-colors"
              >
                <div className="w-10 h-7 bg-gray-200 rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[14px] font-medium text-gray-700">No card on file</p>
                  <p className="text-[11px] text-gray-500">Add a card to post jobs</p>
                </div>
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>

          {/* Add Card Modal for Profile */}
          <AddCardModal
            isOpen={showAddCardModal}
            userId={user?.id || ''}
            onSuccess={(card) => {
              // Refetch to get the actual payment method ID for delete support
              fetch(`/api/stripe/customer/payment-methods?userId=${user?.id}`)
                .then(r => r.json())
                .then(data => {
                  if (data.success && data.paymentMethods?.length > 0) {
                    const pm = data.paymentMethods[0]
                    setSavedCard({ brand: pm.card.brand, last4: pm.card.last4, id: pm.id })
                  } else {
                    setSavedCard({ brand: card.brand, last4: card.last4, id: '' })
                  }
                })
                .catch(() => setSavedCard({ brand: card.brand, last4: card.last4, id: '' }))
              setShowAddCardModal(false)
              setShowRemoveConfirm(false)
            }}
            onClose={() => setShowAddCardModal(false)}
          />

          {/* Active Emergencies Section */}
          <div className="bg-white rounded-xl overflow-hidden border border-red-100" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="bg-gradient-to-r from-red-50 to-orange-50 px-4 py-3 flex items-center justify-between border-b border-red-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-red-900 text-[14px]">Active Emergencies</p>
                  <p className="text-[11px] text-red-700">
                    {activeJobs.length > 0 ? `${activeJobs.length} active` : 'No active requests'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleNavigation('/post-job')}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[12px] font-medium active:scale-95 transition-transform"
              >
                Request Help
              </button>
            </div>

            <div className="p-3">
              {jobsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-6 h-6 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
                </div>
              ) : activeJobs.length > 0 ? (
                <div className="space-y-2">
                  {activeJobs.map((job) => {
                    const statusStyle = getStatusColor(job.status)
                    const createdDate = new Date(job.created_at)
                    const timeAgo = (() => {
                      const now = new Date()
                      const diff = now.getTime() - createdDate.getTime()
                      const mins = Math.floor(diff / 60000)
                      const hours = Math.floor(mins / 60)
                      const days = Math.floor(hours / 24)
                      if (mins < 60) return `${mins}m ago`
                      if (hours < 24) return `${hours}h ago`
                      if (days < 7) return `${days}d ago`
                      return createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    })()
                    return (
                      <button
                        key={job.id}
                        onClick={() => handleNavigation(`/jobs/${job.job_number || job.id}`)}
                        className="w-full bg-red-50 rounded-lg p-3 text-left active:bg-red-100 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />
                              <p className="font-semibold text-gray-900 text-[14px] truncate">{job.title}</p>
                            </div>
                            {/* Status row */}
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              {job.priority === 'emergency' && (
                                <span className="bg-red-100 text-red-800 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                                  EMERGENCY
                                </span>
                              )}
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                                {job.status.replace('_', ' ')}
                              </span>
                              <span className="text-[11px] text-gray-500">{job.category}</span>
                            </div>
                            {/* Details row */}
                            <div className="flex items-center gap-3 text-[11px] text-gray-500">
                              <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {timeAgo}
                              </span>
                              {job.address && (
                                <span className="flex items-center gap-1 truncate max-w-[120px]">
                                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  </svg>
                                  <span className="truncate">{job.address.split(',')[0]}</span>
                                </span>
                              )}
                              {(job.bids_count !== undefined && job.bids_count > 0) && (
                                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                  </svg>
                                  {job.bids_count} bid{job.bids_count > 1 ? 's' : ''}
                                </span>
                              )}
                              {job.estimated_cost && (
                                <span className="font-medium text-gray-700">${job.estimated_cost}</span>
                              )}
                            </div>
                          </div>
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-gray-600 font-medium text-[14px]">No Active Emergencies</p>
                  <p className="text-gray-500 text-[12px] mt-1">Request help when you need it</p>
                </div>
              )}
            </div>
          </div>

          {/* Profile Completeness */}
          {completenessPct < 100 && (
            <div className="bg-white rounded-xl p-4 border border-emerald-100" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-gray-900 text-[14px]">Profile Completeness</p>
                <button
                  onClick={() => handleNavigation('/profile/settings')}
                  className="text-emerald-600 text-[12px] font-medium"
                >
                  Complete Now
                </button>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between text-[12px] font-medium text-emerald-900 mb-1.5">
                  <span>Overall</span>
                  <span>{completenessPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-emerald-100">
                  <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${completenessPct}%` }} />
                </div>
              </div>
              <div className="space-y-2">
                {completeness.filter(f => !f.done).slice(0, 3).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => handleNavigation('/profile/settings')}
                    className="w-full flex items-center justify-between p-2.5 bg-amber-50 rounded-lg text-left active:bg-amber-100 transition-colors"
                  >
                    <span className="text-[13px] text-gray-700">{f.label}</span>
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Past Jobs Section */}
          {pastJobs.length > 0 && (
            <div className="bg-white rounded-xl overflow-hidden border border-gray-100" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
                <p className="font-semibold text-gray-900 text-[14px]">Recent Jobs</p>
                <button
                  onClick={() => handleNavigation('/history')}
                  className="text-emerald-600 text-[12px] font-medium flex items-center gap-1"
                >
                  View All
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <div className="p-3 space-y-2">
                {pastJobs.map((job) => {
                  const completedDate = job.completed_date ? new Date(job.completed_date) : new Date(job.created_at)
                  const dateStr = completedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  return (
                    <button
                      key={job.id}
                      onClick={() => handleNavigation(`/jobs/${job.job_number || job.id}`)}
                      className="w-full bg-gray-50 rounded-lg p-3 text-left active:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4.5 h-4.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="font-semibold text-gray-900 text-[13px] truncate">{job.title}</p>
                            {job.final_cost && (
                              <span className="text-[14px] font-bold text-emerald-600 flex-shrink-0">${job.final_cost}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="bg-emerald-100 text-emerald-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                              Completed
                            </span>
                            <span className="text-[11px] text-gray-500">{job.category}</span>
                          </div>
                          {/* Details row */}
                          <div className="flex items-center gap-3 text-[11px] text-gray-500">
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {dateStr}
                            </span>
                            {job.address && (
                              <span className="flex items-center gap-1 truncate">
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                </svg>
                                <span className="truncate">{job.address.split(',')[0]}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quick Links */}
          <IOSCard>
            <button onClick={() => handleNavigation('/dashboard/homeowner/billing')} className="w-full">
              <div className="flex items-center justify-between py-3 px-4 active:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <span className="text-[15px] text-gray-900">Billing & Payments</span>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
            <div className="h-px bg-gray-100 ml-14" />
            <button onClick={() => handleNavigation('/dashboard/homeowner/transactions')} className="w-full">
              <div className="flex items-center justify-between py-3 px-4 active:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                    </svg>
                  </div>
                  <span className="text-[15px] text-gray-900">Transaction History</span>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
            <div className="h-px bg-gray-100 ml-14" />
            <button onClick={() => handleNavigation('/contact')} className="w-full">
              <div className="flex items-center justify-between py-3 px-4 active:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-[15px] text-gray-900">Help & Support</span>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </IOSCard>

          {/* Sign Out */}
          <IOSCard>
            <button onClick={handleSignOut} className="w-full">
              <div className="flex items-center justify-center py-3 px-4 active:bg-gray-50">
                <span className="text-[15px] text-red-500 font-medium">Sign Out</span>
              </div>
            </button>
          </IOSCard>

          {/* App Version */}
          <p className="text-center text-gray-400 text-[12px] pt-2 pb-4">Rushr v1.0.0</p>
        </div>
      </div>
    </div>
  )
}

interface IOSHomeViewProps {
  onSwitchToContractor?: () => void
}

export default function IOSHomeView({ onSwitchToContractor }: IOSHomeViewProps = {}) {
  const { state } = useApp()
  const { user, userProfile, loading: authLoading, signOut } = useAuth()
  const allContractors: any[] = Array.isArray((state as any)?.contractors)
    ? (state as any).contractors
    : []

  // Database hooks - fetch real data from Supabase
  const { jobs, stats, loading: jobsLoading } = useHomeownerStats()
  const { conversations, loading: conversationsLoading } = useConversations()

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('home')

  // Get first name for greeting
  const firstName = userProfile?.name?.split(' ')[0] || ''
  const email = userProfile?.email || user?.email || ''

  // Location state - use cached location from localStorage to avoid NYC flash
  const [center, setCenter] = useState<LatLng>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('rushr-user-location')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed) && parsed.length === 2) return parsed as LatLng
        }
      } catch {}
    }
    return [40.7128, -74.006]
  })
  const [fetchingLocation, setFetchingLocation] = useState(false)
  const locationFetchedRef = useRef(false)

  // Bid tracking state for Uber-style overlay
  const [activeJob, setActiveJob] = useState<HomeownerJob | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [bidsLoading, setBidsLoading] = useState(false)

  // Contractor tracking view state - shows full-screen tracking when contractor is on the way
  const [showTrackingView, setShowTrackingView] = useState(false)
  const [trackingJob, setTrackingJob] = useState<TrackingJob | null>(null)


  // Find a Pro view state
  const [showFindPro, setShowFindPro] = useState(false)
  const [findProCategory, setFindProCategory] = useState('')
  const [findProSearch, setFindProSearch] = useState('')

  const handleFindPro = (search: string, category: string) => {
    setFindProSearch(search)
    setFindProCategory(category)
    setShowFindPro(true)
  }

  // Initialize native plugins
  useEffect(() => {
    const initNative = async () => {
      try {
        // Enable overlay mode so content draws behind status bar (for fullscreen map)
        await StatusBar.setOverlaysWebView({ overlay: true })
        // Set status bar style (dark text on transparent background)
        await StatusBar.setStyle({ style: Style.Dark })
      } catch (e) {
        // Status bar not available
      }

      try {
        // Setup keyboard listeners
        Keyboard.addListener('keyboardWillShow', () => {
          document.body.classList.add('keyboard-open')
        })
        Keyboard.addListener('keyboardWillHide', () => {
          document.body.classList.remove('keyboard-open')
        })
      } catch (e) {
        // Keyboard plugin not available
      }

      try {
        // Reset to home tab when app launches fresh (cold start)
        // This ensures the app always opens to the Home tab
        setActiveTab('home')
      } catch (e) {
        // App plugin not available
      }
    }

    initNative()
  }, [])

  // Push notification registration
  useEffect(() => {
    if (!user) return

    const setupPush = async () => {
      try {
        // Request permission
        const permResult = await PushNotifications.requestPermissions()
        if (permResult.receive !== 'granted') {
          console.log('[PUSH] Permission not granted')
          return
        }

        // Register with APNs
        await PushNotifications.register()

        // Listen for registration success — store token
        PushNotifications.addListener('registration', async (token) => {
          console.log('[PUSH] Token:', token.value)
          try {
            await fetch('/api/push/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.id, token: token.value, platform: 'ios' })
            })
          } catch (err) {
            console.error('[PUSH] Failed to register token:', err)
          }
        })

        // Handle registration error
        PushNotifications.addListener('registrationError', (err) => {
          console.error('[PUSH] Registration error:', err)
        })

        // Handle notification received while app is in foreground — show local notification
        PushNotifications.addListener('pushNotificationReceived', async (notification) => {
          console.log('[PUSH] Foreground notification:', notification)
          try {
            await LocalNotifications.schedule({
              notifications: [{
                title: notification.title || 'New Message',
                body: notification.body || '',
                id: Date.now(),
                extra: notification.data
              }]
            })
          } catch (e) {
            console.log('[PUSH] Local notification fallback failed:', e)
          }
        })

        // Handle notification tap — navigate to chat
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('[PUSH] Notification tapped:', action)
          const data = action.notification.data
          if (data?.jobId && data?.contractorId) {
            // Open tracking view with chat for this job
            handleOpenTrackingForJob(data.jobId)
          }
        })

        // Also handle local notification tap
        LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
          const data = action.notification.extra
          if (data?.jobId && data?.contractorId) {
            handleOpenTrackingForJob(data.jobId)
          }
        })
      } catch (e) {
        console.log('[PUSH] Push notifications not available:', e)
      }
    }

    setupPush()

    return () => {
      PushNotifications.removeAllListeners()
      LocalNotifications.removeAllListeners()
    }
  }, [user?.id])

  // Get user location on mount — native → browser → IP-based (guaranteed)
  useEffect(() => {
    if (locationFetchedRef.current) return

    const fetchLocation = async () => {
      setFetchingLocation(true)

      // Helper to cache location
      const cacheLocation = (lat: number, lng: number) => {
        try { localStorage.setItem('rushr-user-location', JSON.stringify([lat, lng])) } catch {}
      }

      // 1) Native Capacitor geolocation
      const nativeResult = await getNativeLocation()
      if (nativeResult.success && nativeResult.coordinates) {
        console.log('[LOCATION] Native success:', nativeResult.coordinates)
        const { latitude, longitude } = nativeResult.coordinates
        setCenter([latitude, longitude])
        cacheLocation(latitude, longitude)
        locationFetchedRef.current = true
        setFetchingLocation(false)
        return
      }
      console.warn('[LOCATION] Native failed:', nativeResult.error)

      // 2) Browser geolocation
      const browserOk = await new Promise<boolean>((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(false); return }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log('[LOCATION] Browser success:', pos.coords.latitude, pos.coords.longitude)
            setCenter([pos.coords.latitude, pos.coords.longitude])
            cacheLocation(pos.coords.latitude, pos.coords.longitude)
            locationFetchedRef.current = true
            resolve(true)
          },
          () => resolve(false),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        )
      })
      if (browserOk) { setFetchingLocation(false); return }
      console.warn('[LOCATION] Browser geolocation failed')

      // 3) IP-based geolocation — always works when online
      try {
        const res = await fetch('https://ipapi.co/json/')
        const data = await res.json()
        if (data.latitude && data.longitude) {
          console.log('[LOCATION] IP geolocation:', data.city, data.latitude, data.longitude)
          setCenter([data.latitude, data.longitude])
          cacheLocation(data.latitude, data.longitude)
          locationFetchedRef.current = true
        }
      } catch (e) {
        console.error('[LOCATION] All methods failed')
      }
      setFetchingLocation(false)
    }

    fetchLocation()
  }, [])

  // Check for active jobs (pending with no contractor) when jobs update
  useEffect(() => {
    if (jobs && jobs.length > 0) {
      // Find the most recent pending job waiting for bids
      const pendingJob = jobs.find(
        (job) => job.status === 'pending' && !job.contractor_id
      )

      // Update activeJob if:
      // 1. There's a pending job and no current active job, OR
      // 2. The pending job is different from the current active job (new job created)
      if (pendingJob && (!activeJob || activeJob.id !== pendingJob.id)) {
        setActiveJob(pendingJob)
        setBids([]) // Clear previous bids for the new job
        setBidsLoading(true)
        // Set loading to false after a brief delay to show the animation
        const timer = setTimeout(() => setBidsLoading(false), 3000)
        return () => clearTimeout(timer)
      }

      // If no pending job and we had an active job, clear it
      if (!pendingJob && activeJob?.status === 'pending') {
        setActiveJob(null)
        setBids([])
      }
    } else if (activeJob) {
      // No jobs at all, clear active job
      setActiveJob(null)
      setBids([])
    }
  }, [jobs])

  // Real-time subscription for bids on the active job
  // Supports both job_bids (emergency jobs) and direct_offers (direct contractor requests)
  useEffect(() => {
    if (!activeJob || !user) return

    // Function to fetch and combine bids from both tables
    const fetchAllBids = async () => {
      // Fetch from job_bids (emergency job bids)
      const { data: jobBids } = await supabase
        .from('job_bids')
        .select(`
          id,
          contractor_id,
          bid_amount,
          message,
          status,
          created_at,
          pro_contractors:contractor_id (
            name,
            business_name,
            rating
          )
        `)
        .eq('job_id', activeJob.id)
        .in('status', ['pending', 'submitted'])
        .order('created_at', { ascending: false })

      // Fetch from direct_offers (direct contractor requests)
      const { data: directOffers } = await supabase
        .from('direct_offers')
        .select(`
          id,
          contractor_id,
          price,
          message,
          status,
          created_at,
          user_profiles:contractor_id (
            name,
            rating
          )
        `)
        .eq('job_id', activeJob.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      // Combine and format bids from both sources
      const formattedBids: Bid[] = []

      // Add job_bids
      if (jobBids) {
        jobBids.forEach((bid: any) => {
          formattedBids.push({
            id: bid.id,
            contractor_id: bid.contractor_id,
            contractor_name: bid.pro_contractors?.business_name || bid.pro_contractors?.name || 'Contractor',
            contractor_rating: bid.pro_contractors?.rating,
            bid_amount: bid.bid_amount,
            message: bid.message,
            created_at: bid.created_at,
            source: 'job_bids'
          })
        })
      }

      // Add direct_offers
      if (directOffers) {
        directOffers.forEach((offer: any) => {
          formattedBids.push({
            id: offer.id,
            contractor_id: offer.contractor_id,
            contractor_name: offer.user_profiles?.name || 'Contractor',
            contractor_rating: offer.user_profiles?.rating,
            bid_amount: offer.price,
            message: offer.message,
            created_at: offer.created_at,
            source: 'direct_offers'
          })
        })
      }

      // Sort by created_at descending
      formattedBids.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setBids(formattedBids)
    }

    // Subscribe to job_bids for this job
    const jobBidsSubscription = supabase
      .channel(`job_bids_${activeJob.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_bids',
          filter: `job_id=eq.${activeJob.id}`
        },
        () => fetchAllBids()
      )
      .subscribe()

    // Subscribe to direct_offers for this job
    const directOffersSubscription = supabase
      .channel(`direct_offers_${activeJob.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'direct_offers',
          filter: `job_id=eq.${activeJob.id}`
        },
        () => fetchAllBids()
      )
      .subscribe()

    // Initial fetch of existing bids
    fetchAllBids()

    return () => {
      supabase.removeChannel(jobBidsSubscription)
      supabase.removeChannel(directOffersSubscription)
    }
  }, [activeJob, user])

  // Check for in-progress jobs and fetch contractor info for tracking
  useEffect(() => {
    const checkInProgressJobs = async () => {
      if (!jobs || jobs.length === 0) return

      // Find any in-progress or confirmed job
      const inProgressJob = jobs.find(
        (job) => (job.status === 'in_progress' || job.status === 'confirmed') && job.contractor_id
      )

      if (inProgressJob && inProgressJob.contractor_id) {
        // Fetch contractor details for the tracking view
        const { data: contractorData } = await supabase
          .from('user_profiles')
          .select('name')
          .eq('id', inProgressJob.contractor_id)
          .single()

        // Set up tracking job with contractor info
        const trackingJobData: TrackingJob = {
          ...inProgressJob,
          contractor_name: contractorData?.name || 'Contractor'
        }

        setTrackingJob(trackingJobData)
      } else {
        // No in-progress job, clear tracking state
        setTrackingJob(null)
        setShowTrackingView(false)
      }
    }

    checkInProgressJobs()
  }, [jobs])

  // Handler for successful Start Job from map contractor selection
  const handleStartJobSuccess = async (data: { jobId: string; contractorId: string; contractorName: string; title: string; estimatedAmount: number; etaMinutes?: number }) => {
    try {
      const { data: contractorData } = await supabase
        .from('pro_contractors')
        .select('name, business_name, profile_image_url, latitude, longitude')
        .eq('id', data.contractorId)
        .single()

      const newTrackingJob: TrackingJob = {
        id: data.jobId,
        title: data.title,
        status: 'confirmed',
        contractor_id: data.contractorId,
        contractor_name: contractorData?.business_name || contractorData?.name || data.contractorName,
        contractor_image: contractorData?.profile_image_url || null,
        eta_minutes: data.etaMinutes,
        contractor_latitude: contractorData?.latitude,
        contractor_longitude: contractorData?.longitude,
        estimated_cost: data.estimatedAmount
      }

      setTrackingJob(newTrackingJob)
      setShowTrackingView(true)
    } catch (err) {
      console.error('Error setting up tracking:', err)
    }
  }

  // Handler to open tracking view
  const handleOpenTracking = () => {
    if (trackingJob) {
      setShowTrackingView(true)
    }
  }

  // Handler to open tracking view for a specific job (from Jobs tab)
  const handleOpenTrackingForJob = async (jobId: string) => {
    // If it's the current tracking job, just open the view
    if (trackingJob?.id === jobId) {
      setShowTrackingView(true)
      return
    }

    // Otherwise, fetch the job data and set it as the tracking job
    try {
      const { data: jobData, error: jobError } = await supabase
        .from('homeowner_jobs')
        .select('*, accepted_bid_id')
        .eq('id', jobId)
        .single()

      if (jobError || !jobData) {
        console.error('Error fetching job for tracking:', jobError)
        alert('Could not load job details')
        return
      }

      // Get contractor info - try accepted_bid_id first, then look for accepted bid
      let contractorId: string | null = null

      if (jobData.accepted_bid_id) {
        const { data: bidData } = await supabase
          .from('job_bids')
          .select('contractor_id')
          .eq('id', jobData.accepted_bid_id)
          .single()
        contractorId = bidData?.contractor_id || null
      }

      // Fallback: find accepted bid for this job
      if (!contractorId) {
        const { data: acceptedBid } = await supabase
          .from('job_bids')
          .select('contractor_id')
          .eq('job_id', jobId)
          .eq('status', 'accepted')
          .single()
        contractorId = acceptedBid?.contractor_id || null
      }

      if (!contractorId) {
        console.error('No contractor found for job:', jobId)
        alert('No contractor assigned to this job yet')
        return
      }

      const { data: contractorData } = await supabase
        .from('pro_contractors')
        .select('name, business_name, profile_image_url')
        .eq('id', contractorId)
        .single()

      const newTrackingJob: TrackingJob = {
        id: jobData.id,
        title: jobData.title,
        status: jobData.status,
        contractor_id: contractorId,
        contractor_name: contractorData?.business_name || contractorData?.name || 'Contractor',
        contractor_image: contractorData?.profile_image_url,
        address: jobData.address,
        estimated_cost: jobData.final_cost || jobData.estimated_cost,
        homeowner_confirmed_complete: jobData.homeowner_confirmed_complete,
        contractor_confirmed_complete: jobData.contractor_confirmed_complete
      }

      setTrackingJob(newTrackingJob)
      setShowTrackingView(true)
    } catch (err) {
      console.error('Error opening tracking for job:', err)
      alert('Failed to open tracking')
    }
  }

  // Handler to close tracking view
  const handleCloseTracking = () => {
    setShowTrackingView(false)
    setTrackingJob(null)
  }

  const router = useRouter()

  // Handler for accepting a bid
  const handleAcceptBid = async (bid: Bid) => {
    if (!activeJob || !user) return

    try {
      // Call start-direct API — creates escrow, assigns contractor, rejects other bids, notifies
      const startResponse = await fetch('/api/jobs/start-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: activeJob.id,
          contractorId: bid.contractor_id,
          bidId: bid.id,
          amount: bid.bid_amount,
          homeownerId: user.id
        })
      })

      const startData = await startResponse.json()

      if (!startResponse.ok || !startData.success) {
        console.error('Start-direct failed:', startData.error)
        return
      }

      await triggerHaptic(ImpactStyle.Heavy)

      // Clear the active job overlay
      setActiveJob(null)
      setBids([])

      // Transition to tracking view
      handleStartJobSuccess({
        jobId: activeJob.id,
        contractorId: bid.contractor_id,
        contractorName: startData.contractorName || bid.contractor_name,
        title: activeJob.title,
        estimatedAmount: bid.bid_amount,
        etaMinutes: bid.eta_minutes
      })
    } catch (error) {
      console.error('Error accepting bid:', error)
    }
  }

  // Handler for declining a bid
  const handleDeclineBid = async (bid: Bid) => {
    try {
      // Update the bid status based on source table
      const bidTable = bid.source === 'job_bids' ? 'job_bids' : 'direct_offers'
      const declinedStatus = bid.source === 'job_bids' ? 'rejected' : 'declined'

      await supabase
        .from(bidTable)
        .update({ status: declinedStatus })
        .eq('id', bid.id)

      // Remove from local state
      setBids((prev) => prev.filter((b) => b.id !== bid.id))
    } catch (error) {
      console.error('Error declining bid:', error)
    }
  }

  // Distance helper
  function distMiles(a: LatLng, b: LatLng) {
    const toRad = (d: number) => (d * Math.PI) / 180
    const R = 3958.8
    const dLat = toRad(b[0] - a[0])
    const dLng = toRad(b[1] - a[1])
    const s1 = Math.sin(dLat / 2)
    const s2 = Math.sin(dLng / 2)
    const t = s1 * s1 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * s2 * s2
    const c = 2 * Math.atan2(Math.sqrt(t), Math.sqrt(1 - t))
    return R * c
  }

  // Filter contractors
  const filtered = useMemo(() => {
    let items = (allContractors || [])
      .map((c) => ({ ...c }))
      .filter((c) => {
        const lat = Number(c?.loc?.lat ?? c?.latitude)
        const lng = Number(c?.loc?.lng ?? c?.longitude)
        if (!isFinite(lat) || !isFinite(lng)) return false

        const d = distMiles(center, [lat, lng])
        ;(c as any).__distance = d
        if (d > 5) return false

        return true
      })

    items.sort((a, b) => (a.__distance ?? 1e9) - (b.__distance ?? 1e9))
    return items
  }, [allContractors, center])

  // Show registration/login screen if not authenticated
  if (!authLoading && !user) {
    return <IOSRegistration onSwitchToContractor={onSwitchToContractor} />
  }

  // Loading state with animated logo
  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <LoadingLogo />
      </div>
    )
  }

  // Main app view with bottom tabs
  return (
    <IOSErrorBoundary>
      {/* Full-screen Find a Pro View */}
      {showFindPro && (
        <FindProView
          center={center}
          setCenter={setCenter}
          initialSearch={findProSearch}
          initialCategory={findProCategory}
          onClose={() => setShowFindPro(false)}
          onStartJobSuccess={handleStartJobSuccess}
          user={user}
        />
      )}

      {/* Full-screen Contractor Tracking View - Shows when contractor is on the way */}
      {showTrackingView && trackingJob && (
        <ContractorTrackingView
          job={trackingJob}
          userLocation={center}
          onBack={handleCloseTracking}
          onJobComplete={() => {
            // Close tracking view and let the jobs list refresh via real-time subscription
            setShowTrackingView(false)
            setTrackingJob(null)
          }}
        />
      )}

      <div className="fixed inset-0 bg-gray-50 flex flex-col">
        {/* Tab Content — use display:none to keep tabs mounted and preserve state */}
        <div style={{ display: activeTab === 'home' ? 'contents' : 'none' }}>
          <HomeTab
            center={center}
            setCenter={setCenter}
            filtered={filtered}
            fetchingLocation={fetchingLocation}
            setFetchingLocation={setFetchingLocation}
            firstName={firstName}
            jobs={jobs}
            jobsLoading={jobsLoading}
            activeJob={activeJob}
            bids={bids}
            bidsLoading={bidsLoading}
            onAcceptBid={handleAcceptBid}
            onDeclineBid={handleDeclineBid}
            onCloseBidOverlay={() => setActiveJob(null)}
            user={user}
            trackingJob={trackingJob}
            onOpenTracking={handleOpenTracking}
            onStartJobSuccess={handleStartJobSuccess}
            onFindPro={handleFindPro}
            isVisible={activeTab === 'home'}
          />
        </div>
        <div style={{ display: activeTab === 'jobs' ? 'contents' : 'none' }}>
          <JobsTab
            jobs={jobs}
            loading={jobsLoading}
            onOpenTracking={handleOpenTrackingForJob}
          />
        </div>
        <div style={{ display: activeTab === 'messages' ? 'contents' : 'none' }}>
          <MessagesTab
            conversations={conversations}
            loading={conversationsLoading}
            unreadCount={conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)}
          />
        </div>
        <div style={{ display: activeTab === 'notifications' ? 'contents' : 'none' }}>
          <NotificationsTab userId={user?.id || ''} />
        </div>
        <div style={{ display: activeTab === 'profile' ? 'contents' : 'none' }}>
          <ProfileTab
            firstName={firstName}
            email={email}
            userRole={userProfile?.role || 'homeowner'}
            userProfile={userProfile}
            user={user}
            stats={stats}
            jobs={jobs}
            jobsLoading={jobsLoading}
            onSignOut={signOut}
          />
        </div>

        {/* Bottom Tab Bar */}
        <IOSTabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          unreadMessages={conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)}
          unreadNotifications={stats?.unread_messages || 0}
        />
      </div>
    </IOSErrorBoundary>
  )
}
