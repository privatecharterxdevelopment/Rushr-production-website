'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { useProAuth } from '../contexts/ProAuthContext'
import { supabaseBrowser } from '../utils/supabase-browser'
import { Capacitor } from '@capacitor/core'

const supabase = supabaseBrowser()
import { useHydrated } from '../lib/useHydrated'
import LogoWordmark from './LogoWordmark'
import { openAuth } from './AuthModal'
import { openProAuth } from './ProAuthModal'
import ProAuthModal from './ProAuthModal'
import UserDropdown from './UserDropdown'
import BidNotificationSystem from './BidNotification'

function BellIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </svg>
  )
}
function ChevronDown(props: any) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
function MenuIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}

export default function Header() {
  const router = useRouter()
  const { user: homeownerUser, userProfile } = useAuth()
  const { user: contractorUser, contractorProfile } = useProAuth()

  const pathname = usePathname() || ''

  // Use state to detect native platform after hydration
  const [isNative, setIsNative] = useState(false)

  const [openFindPro, setOpenFindPro] = useState(false)
  const [openFindWork, setOpenFindWork] = useState(false)
  const [openMore, setOpenMore] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const timers = useRef<Record<string, number | null>>({ pro: null, work: null, more: null })

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])

  // Detect scroll to change header background
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close all dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Check if click is outside all dropdowns
      if (!target.closest('[data-dropdown-container]')) {
        setOpenFindPro(false)
        setOpenFindWork(false)
        setOpenMore(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Cleanup timers on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(timer => {
        if (timer) window.clearTimeout(timer)
      })
    }
  }, [])

  // Hide header in native iOS/Android app
  // Note: CSS also hides header via html.native-app class before React hydrates
  if (isNative) {
    return null
  }

  // Hide header on early access pages and admin panel
  if (pathname.startsWith('/pro/early-access') || pathname.startsWith('/dashboard/admin')) {
    return null
  }

  // Simple logic: determine if we're on a pro route
  const isProRoute = pathname.startsWith('/pro') || pathname.startsWith('/dashboard/contractor')

  // Determine user type and signed in status
  const isSignedInAsHomeowner = !!homeownerUser && !!userProfile
  const isSignedInAsContractor = !!contractorUser && !!contractorProfile
  const signedIn = isSignedInAsHomeowner || isSignedInAsContractor

  // Theme: Pro routes get blue, everything else gets green
  const isContractor = isProRoute



  // Brand-driven classes (from CSS variables set in layout.tsx)
  const BRAND = {
    primaryText: 'text-[var(--brand-text)]',
    activeUnderline: 'bg-[var(--brand-border)]',
    authAccent:
      'border-[var(--brand-border)] text-[var(--brand-text)] hover:bg-[var(--brand-hover)] focus:ring-[var(--brand-ring)]',
  }

  // For local development, use relative paths instead of cross-site URLs
  const isLocalDev = !process.env.NEXT_PUBLIC_PRO_URL && !process.env.NEXT_PUBLIC_MAIN_URL

  // Cross-site base URLs (env overrides with sane local fallbacks)
  const PRO_HOME  = process.env.NEXT_PUBLIC_PRO_URL  || 'http://pro.localhost:3000'
  const MAIN_HOME = process.env.NEXT_PUBLIC_MAIN_URL || 'http://localhost:3000'

  // Safe join: base + path (handles trailing/leading slashes)
  const join = (base: string, path: string) =>
    base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '')

  // Helpers to target the right site - use relative paths in local dev
  const toMain = (p: string) => isLocalDev ? p : join(MAIN_HOME, p)
  const toPro  = (p: string) => isLocalDev ? p : join(PRO_HOME, p)

  // External-safe navigation (absolute URLs go via full page load)
  const go = (href: string) => {
    if (/^https?:\/\//i.test(href)) window.location.href = href
    else router.push(href)
  }

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href))

  // Function to switch to Pro - GO TO /PRO ROUTE (stays on marketing page)
  const switchToPro = () => {
    console.log('Switching to Pro - going to /pro route')
    router.push('/pro')
  }

  // Function to switch to Homeowner (just navigate, keep user logged in)
  const switchToHomeowner = () => {
    console.log('Switching to Homeowner')
    try {
      router.push('/')
    } catch (error) {
      console.error('Error switching to Homeowner:', error)
      // Fallback to window.location if router fails
      window.location.href = '/'
    }
  }

  // Dashboard target for navigation - route based on user type
  const dashboardHref = isSignedInAsContractor ? '/dashboard/contractor' : '/dashboard/homeowner'

  // Simple nav link with "active" underline for local paths only
  const NavA = ({ href, children }: { href: string; children: React.ReactNode }) => {
    const active = !/^https?:\/\//i.test(href) && isActive(href)
    return (
      <Link
        href={href}
        className={`relative inline-flex items-center hover:text-ink dark:hover:text-white pb-1 font-medium ${
          active ? BRAND.primaryText : 'text-slate-700 dark:text-slate-200'
        }`}
      >
        <span>{children}</span>
        <span
          className={`pointer-events-none absolute left-0 right-0 -bottom-[3px] h-[2px] rounded transition-opacity ${
            active ? `opacity-100 ${BRAND.activeUnderline}` : 'opacity-0'
          }`}
        />
      </Link>
    )
  }

  function HoverDrop({
    label, open, setOpen, items, active, keyName
  }: {
    label: string
    open: boolean
    setOpen: (v: boolean) => void
    active?: boolean
    keyName: 'pro' | 'work' | 'more'
    items: { label: string; href?: string; onClick?: () => void }[]
  }) {
    const startClose = () => {
      const k = keyName
      if (timers.current[k]) window.clearTimeout(timers.current[k] as number)
      timers.current[k] = window.setTimeout(() => {
        setOpen(false)
      }, 100) as any
    }
    const cancelClose = () => {
      const k = keyName
      if (timers.current[k]) {
        window.clearTimeout(timers.current[k] as number)
        timers.current[k] = null
      }
    }

    const handleOpen = () => {
        // Close other dropdowns to prevent multiple open
      if (keyName !== 'pro') {
        setOpenFindPro(false)
        if (timers.current.pro) {
          window.clearTimeout(timers.current.pro as number)
          timers.current.pro = null
        }
      }
      if (keyName !== 'work') {
        setOpenFindWork(false)
        if (timers.current.work) {
          window.clearTimeout(timers.current.work as number)
          timers.current.work = null
        }
      }
      if (keyName !== 'more') {
        setOpenMore(false)
        if (timers.current.more) {
          window.clearTimeout(timers.current.more as number)
          timers.current.more = null
        }
      }
      cancelClose()
      setOpen(true)
    }

    const handleClick = () => {
      if (open) {
        setOpen(false)
      } else {
        handleOpen()
      }
    }

    return (
      <div className="relative" data-dropdown-container onMouseEnter={handleOpen} onMouseLeave={startClose}>
        <button
          onClick={handleClick}
          className={`relative inline-flex items-center pb-1 hover:text-ink dark:hover:text-white font-medium transition-colors ${
            active ? BRAND.primaryText : 'text-slate-700 dark:text-slate-200'
          }`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {label}
          <span
            className={`pointer-events-none absolute left-0 right-0 -bottom-[3px] h-[2px] rounded transition-opacity ${
              active ? `opacity-100 ${BRAND.activeUnderline}` : 'opacity-0'
            }`}
          />
          <span className={`ml-1 inline-block transition-transform duration-200 ease-in-out ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {open && (
          <div
            className="absolute left-0 top-full mt-2 z-[9999] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 w-64 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
            onMouseEnter={cancelClose}
            onMouseLeave={startClose}
            role="menu"
          >
            {items.map((it, i) => (
              <button
                key={i}
                onClick={() => {
                  // Immediately close and clear all timers
                  if (timers.current[keyName]) {
                    window.clearTimeout(timers.current[keyName] as number)
                    timers.current[keyName] = null
                  }
                  setOpen(false)
                  if (it.href) go(it.href)
                  else it.onClick?.()
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm transition-colors focus:bg-slate-100 dark:focus:bg-slate-800 focus:outline-none"
                role="menuitem"
              >
                {it.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Route menus to their owning site (absolute URLs)
  const findProItems = [
    { label: 'Post a Job',            href: '/post-job' },
    { label: 'How it Works',          href: '/how-it-works' },
  ]
  const findWorkItems = isSignedInAsContractor ? [
    // Contractor is logged in - go to dashboard pages
    { label: 'Browse Jobs',               href: '/dashboard/contractor/jobs' },
  ] : [
    // Not logged in - open Pro login modal
    { label: 'Browse Jobs',               onClick: () => openProAuth() },
  ]
  const moreItems = [
    { label: 'About',   href: '/about' },
    { label: 'Contact', href: '/contact' },
    { label: 'Pricing', href: '/pricing' },
  ]

  // "Active" underline only applies to local sections
  const findProActive = ['/post-job', '/find-pro', '/how-it-works'].some(isActive)
  const findWorkActive = ['/jobs', '/find-work', '/pro'].some(isActive)
  const moreActive = ['/about', '/contact', '/pricing'].some(isActive)
  const messagesActive = pathname.includes('/messages')

  // FORCE HEADER COLORS BASED ON USER TYPE
  const headerStyle = isContractor ? {
    // BLUE PRO THEME FOR CONTRACTORS
    '--brand-border': '#2563EB',
    '--brand-text': '#1D4ED8',
    '--brand-ring': '#3B82F6',
    '--brand-hover': 'rgba(59,130,246,0.08)',
    '--color-primary': '37 99 235',
    '--color-primary-hover': '29 78 216',
    '--color-primary-foreground': '255 255 255',
    backgroundColor: '#ffffff',
  } as React.CSSProperties : {
    // GREEN HOMEOWNER THEME
    '--brand-border': '#10B981',
    '--brand-text': '#059669',
    '--brand-ring': '#34D399',
    '--brand-hover': 'rgba(52,211,153,0.08)',
    '--color-primary': '16 185 129',
    '--color-primary-hover': '5 150 105',
    '--color-primary-foreground': '255 255 255',
    backgroundColor: '#ffffff',
  } as React.CSSProperties

  return (
    <>
    <header className="sticky top-0 z-50 backdrop-blur-md border-b border-slate-200 dark:bg-slate-900/90 dark:border-slate-700 shadow-sm" style={headerStyle}>
      <div className="mx-auto w-full px-4 sm:px-6 md:px-10 lg:px-16 py-3 flex items-center gap-2 sm:gap-4">
        {/* Logo links to /pro on Pro pages, / on homeowner pages */}
        <Link href={isProRoute ? '/pro' : '/'} className="flex items-center gap-2">
          <LogoWordmark />
        </Link>

        <nav className="ml-2 sm:ml-6 hidden md:flex items-center gap-3 lg:gap-6 flex-1">
          <HoverDrop
            label="Find a Pro"
            keyName="pro"
            open={openFindPro}
            setOpen={setOpenFindPro}
            items={findProItems}
            active={findProActive}
          />
          <HoverDrop
            label="Rushr Pro"
            keyName="work"
            open={openFindWork}
            setOpen={setOpenFindWork}
            items={findWorkItems}
            active={findWorkActive}
          />
          <HoverDrop
            label="More"
            keyName="more"
            open={openMore}
            setOpen={setOpenMore}
            items={moreItems}
            active={moreActive}
          />
          {/* Messages - show for logged in users only */}
          {signedIn && (
            <NavA href={isSignedInAsContractor ? '/dashboard/contractor/messages' : '/dashboard/homeowner/messages'}>
              Messages
            </NavA>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2 relative z-10 min-w-0 flex-shrink-0">
          {!signedIn ? (
            <>
              {isProRoute ? (
                // Pro route: Blue contractor sign in + switch to homeowner
                <>
                  <button
                    className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium shadow-sm text-sm whitespace-nowrap"
                    onClick={() => openProAuth()}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={switchToHomeowner}
                    className="text-xs sm:text-sm px-2 py-1 underline text-blue-600 hover:opacity-80 hover:no-underline transition-colors duration-200 whitespace-nowrap"
                  >
                    <span className="hidden sm:inline">Switch to </span>Homeowner
                  </button>
                </>
              ) : (
                // Homeowner route: Green homeowner sign in + switch to pro
                <>
                  <button
                    className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium shadow-sm text-sm whitespace-nowrap"
                    onClick={() => openAuth()}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={switchToPro}
                    className="text-xs sm:text-sm px-2 py-1 underline text-emerald-600 hover:opacity-80 hover:no-underline transition-colors duration-200 whitespace-nowrap"
                  >
                    <span className="hidden sm:inline">Switch to </span>Pro
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {/* Bid notifications */}
              <BidNotificationSystem />
              {/* Get Help Now button for logged in homeowners only (not contractors) */}
              {isSignedInAsHomeowner && !isProRoute && !isSignedInAsContractor && (
                <button
                  onClick={() => router.push('/post-job')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium shadow-sm text-sm whitespace-nowrap"
                >
                  <span className="text-lg">+</span> Get Help Now
                </button>
              )}
              {/* User dropdown when logged in */}
              <UserDropdown />
            </>
          )}
          <button
            className="md:hidden ml-1 p-2 rounded-md border border-slate-300 hover:bg-slate-50"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="px-4 py-3 space-y-3">
            {/* Navigation Links */}
            <div className="space-y-1 border-b border-slate-200 dark:border-slate-700 pb-3">
              {/* Find a Pro Section */}
              <div className="font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider px-3 py-1">
                Find a Pro
              </div>
              {findProItems.map((item, i) => (
                <Link
                  key={i}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-300"
                >
                  {item.label}
                </Link>
              ))}

              {/* Rushr Pro Section */}
              <div className="font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider px-3 py-1 mt-3">
                Rushr Pro
              </div>
              {findWorkItems.map((item, i) => (
                item.href ? (
                  <Link
                    key={i}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-300"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={i}
                    onClick={() => {
                      item.onClick?.()
                      setMobileMenuOpen(false)
                    }}
                    className="block w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-300"
                  >
                    {item.label}
                  </button>
                )
              ))}

              {/* Messages - show for logged in users only */}
              {signedIn && (
                <Link
                  href={isSignedInAsContractor ? '/dashboard/contractor/messages' : '/dashboard/homeowner/messages'}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Messages
                </Link>
              )}

              {/* More Section */}
              <div className="font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider px-3 py-1 mt-3">
                More
              </div>
              {moreItems.map((item, i) => (
                <Link
                  key={i}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-300"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Auth Buttons */}
            {!signedIn ? (
              <>
                {isProRoute ? (
                  <>
                    <button
                      className="w-full text-left px-3 py-2 rounded-lg border border-blue-600 bg-blue-600 text-white font-medium text-sm"
                      onClick={() => {
                        openProAuth()
                        setMobileMenuOpen(false)
                      }}
                    >
                      Sign In
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 text-blue-600 underline text-sm"
                      onClick={() => {
                        switchToHomeowner()
                        setMobileMenuOpen(false)
                      }}
                    >
                      Switch to Homeowner
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="w-full text-left px-3 py-2 rounded-lg border border-emerald-600 bg-emerald-600 text-white font-medium text-sm"
                      onClick={() => {
                        openAuth()
                        setMobileMenuOpen(false)
                      }}
                    >
                      Sign In
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 text-emerald-600 underline text-sm"
                      onClick={() => {
                        switchToPro()
                        setMobileMenuOpen(false)
                      }}
                    >
                      Switch to Pro
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="py-2 space-y-2">
                {/* Get Help Now button for logged in homeowners only (not contractors) on mobile */}
                {isSignedInAsHomeowner && !isProRoute && !isSignedInAsContractor && (
                  <button
                    className="w-full text-left px-3 py-2 rounded-lg bg-emerald-600 text-white font-medium text-sm"
                    onClick={() => {
                      router.push('/post-job')
                      setMobileMenuOpen(false)
                    }}
                  >
                    + Get Help Now
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
    <ProAuthModal />
    </>
  )
}
