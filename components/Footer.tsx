'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { useProAuth } from '../contexts/ProAuthContext'
import { openAuth } from './AuthModal'
import LogoWordmark from './LogoWordmark'
import { Capacitor } from '@capacitor/core'

export default function Footer() {
  const pathname = usePathname() || ''
  const router = useRouter()
  const { user: homeownerUser } = useAuth()
  const { user: proUser } = useProAuth()

  // Use state to detect native platform after hydration
  const [isNative, setIsNative] = React.useState(false)
  React.useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])

  // Hide footer in native iOS/Android app
  // Note: CSS also hides footer via html.native-app class before React hydrates
  if (isNative) {
    return null
  }

  // Hide footer on early access pages and admin panel
  if (pathname.startsWith('/pro/early-access') || pathname.startsWith('/dashboard/admin')) {
    return null
  }

  // Determine current user and role
  const user = homeownerUser || proUser
  const userRole = homeownerUser ? 'HOMEOWNER' : proUser ? 'CONTRACTOR' : null

  // Determine if we're on a pro route for theming
  const isProRoute = pathname.startsWith('/pro') || pathname.startsWith('/dashboard/contractor')

  // Brand colors
  const brandColor = isProRoute ? '#0072f5' : '#47B46B'

  // For local development, use relative paths instead of cross-site URLs
  const isLocalDev = !process.env.NEXT_PUBLIC_PRO_URL && !process.env.NEXT_PUBLIC_MAIN_URL

  const PRO_HOME  = process.env.NEXT_PUBLIC_PRO_URL  || 'http://pro.localhost:3000'
  const MAIN_HOME = process.env.NEXT_PUBLIC_MAIN_URL || 'http://localhost:3000'
  const join = (base: string, path: string) => base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '')
  const toMain = (p: string) => isLocalDev ? p : join(MAIN_HOME, p)
  const toPro  = (p: string) => isLocalDev ? p : join(PRO_HOME, p)

  const isActiveLocal = (href: string) => pathname === href
  const isExternal = (href: string) => /^https?:\/\//i.test(href)

  const FLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
    // Only mark active for local, same-host routes
    const active = !isExternal(href) && isActiveLocal(href)
    return (
      <Link
        href={href}
        className={`flex items-center gap-2 hover:text-ink dark:hover:text-white transition ${active ? 'font-semibold' : ''}`}
        style={active ? { color: brandColor } : undefined}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: active ? brandColor : 'transparent' }}
        />
        <span>{children}</span>
      </Link>
    )
  }

  const DashboardItem = () => {
    const go = (href: string) => {
      if (isExternal(href)) window.location.href = href
      else router.push(href)
    }
    // Route based on role when signed in; otherwise open auth
    // In local dev, just use /dashboard for all roles
    const target = isLocalDev ? '/dashboard'
      : userRole === 'CONTRACTOR'
      ? toPro('/dashboard')
      : toMain('/dashboard')

    // We won't try to compute "active" across hosts; keep neutral styling
    return (
      <button
        type="button"
        onClick={() => {
          if (user) go(target)
          else openAuth('signin')
        }}
        className="flex items-center gap-2 hover:text-ink dark:hover:text-white transition text-left"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
        <span>Dashboard</span>
      </button>
    )
  }

  const year = new Date().getFullYear()

  return (
    <footer className="mt-20 border-t border-slate-100 bg-white dark:bg-slate-900 dark:border-slate-800">
      <div className="container-max py-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm text-slate-600 dark:text-slate-300">
        <div>
          <LogoWordmark className="mb-2" variant="footer" />
          <p className="max-w-xs">
            Linking Homeowners with Local Pros Instantly. Post a job, get bids, hire with confidence.
          </p>

          {/* App Store Buttons */}
          <div className="flex items-center gap-2 mt-4">
            <a
              href="https://apps.apple.com/app/rushr"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity"
            >
              <img
                src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
                alt="Download on the App Store"
                className="h-[34px]"
              />
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.rushr"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity -ml-1"
            >
              <img
                src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                alt="Get it on Google Play"
                className="h-[50px]"
              />
            </a>
          </div>
        </div>

        <div>
          <div className="font-semibold text-ink dark:text-white mb-2">Company</div>
          <ul className="space-y-2">
            <li><FLink href="/about">About</FLink></li>
            <li><FLink href="/pricing">Pricing</FLink></li>
            <li><DashboardItem /></li>
            <li><FLink href="/">Rushr for Homeowners</FLink></li>
            <li><FLink href="/pro">Rushr For Pros</FLink></li>
          </ul>
        </div>

        <div>
          <div className="font-semibold text-ink dark:text-white mb-2">Explore</div>
          <ul className="space-y-2">
            <li><FLink href="/">Home</FLink></li>
            <li><FLink href="/how-it-works">How It Works</FLink></li>
            <li><FLink href="/pro/how-it-works">How it Works For Pros</FLink></li>
            {/* <li><FLink href="/teams">Rushr Teams</FLink></li> */}
            <li><FLink href="/find-pro">Search For A Pro</FLink></li>
            <li><FLink href="/dashboard/contractor/jobs">Find Jobs (Contractors)</FLink></li>
            <li><FLink href="/post-job">Post a Job</FLink></li>
          </ul>
        </div>

        <div>
          <div className="font-semibold text-ink dark:text-white mb-2">Legal & Contact</div>
          <ul className="space-y-2">
            <li><FLink href="/terms">Terms</FLink></li>
            <li><FLink href="/privacy">Privacy</FLink></li>
            <li><FLink href="/contact">Contact</FLink></li>
            <li>
              <a
                className="flex items-center gap-2 hover:text-ink dark:hover:text-white transition"
                href="mailto:hello@userushr.com"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
                <span>hello@userushr.com</span>
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800">
        <div className="container-max py-4 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3">
          <span>© {year} Rushr</span>
          <span className="mx-2 hidden sm:inline">•</span>
          <span>Made for homeowners &amp; contractors</span>
        </div>
      </div>
    </footer>
  )
}
