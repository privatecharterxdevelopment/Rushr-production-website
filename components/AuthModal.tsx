"use client"

import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useAuth } from "../contexts/AuthContext"
import { useRouter, useSearchParams, usePathname } from "next/navigation"

type Mode = "signin" // AuthModal is LOGIN ONLY now

// allow passing a callbackUrl with the event so we can return the user
type OpenDetail = { mode?: Mode; callbackUrl?: string }

// export that can be called anywhere (supports callbackUrl) - LOGIN ONLY
export function openAuth(callbackUrl?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<OpenDetail>("auth:open", { detail: { mode: "signin", callbackUrl } }))
  }
}

export default function AuthModal() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const mode = "signin" as const // LOGIN ONLY

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  const { signIn } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const pathname = usePathname()

  // where to send the user after successful auth
  const callbackRef = useRef<string | undefined>(undefined)

  // Detect if we're on a pro route for styling
  const isProRoute = pathname?.startsWith('/pro') || false

  useEffect(() => setMounted(true), [])

  // 🔔 open when someone calls openAuth()
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail
      callbackRef.current = detail?.callbackUrl
      setOpen(true)
      setError(null)
      setLoading(false)
      // AuthModal is only for homeowners - contractors use /pro/contractor-signup
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("auth:open", onOpen as any)
    window.addEventListener("keydown", onEsc)
    return () => {
      window.removeEventListener("auth:open", onOpen as any)
      window.removeEventListener("keydown", onEsc)
    }
  }, [])

  // 🔗 ALSO auto-open if URL has ?auth=signin (& optional ?callback=/some/path)
  useEffect(() => {
    const a = params.get("auth")
    const cb = params.get("callback") || undefined
    if (a === "signin" && !open) {
      callbackRef.current = cb
      setOpen(true)
    }
  }, [params, open])

  // Clean up ?auth / ?callback in the URL when closing
  const cleanUrl = () => {
    const hasAuth = params.get("auth")
    const hasCb = params.get("callback")
    if (hasAuth || hasCb) {
      router.replace(window.location.pathname, { scroll: false })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const emailTrim = email.trim().toLowerCase()
      const passTrim = password.trim()

      if (!emailTrim || !passTrim) {
        setError("Please enter your email and password.")
        setLoading(false)
        return
      }

      // AuthModal is LOGIN ONLY - Sign in with Supabase
      const result = await signIn(emailTrim, passTrim)
      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      if (result.success) {
        setLoading(false)
        setOpen(false)
        cleanUrl()

        // Redirect immediately
        const target = callbackRef.current || "/dashboard/homeowner"
        router.push(target)
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  if (!mounted) return null
  if (!open) return null

  const title = "Sign in to your account"
  const cta = loading ? "Signing in..." : "Sign in"

  return createPortal(
    <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
      {/* overlay */}
      <button
        aria-label="Close"
        className="absolute inset-0 h-full w-full bg-black/40 backdrop-blur-[1px]"
        onClick={() => { setOpen(false); cleanUrl() }}
      />
      {/* modal */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Rushr Logo */}
        <div className="mb-4">
          <img
            src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg"
            alt="Rushr"
            className="h-10 w-auto"
          />
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <button
              onClick={() => { setOpen(false); cleanUrl() }}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-slate-600">
            For homeowners. New? <a href="/sign-up" className="text-emerald-600 hover:text-emerald-700 font-medium">Create account</a> | Service providers <a href="/pro/sign-in" className="text-blue-600 hover:text-blue-700 font-medium">sign in here</a>.
          </p>
        </div>

        {/* Social login */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => {
              // TODO: Implement Google OAuth
              console.log('Google sign-in clicked')
            }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <div className="my-3 h-px bg-slate-200" />

        <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px] outline-none ${isProRoute ? 'focus:border-blue-500' : 'focus:border-emerald-500'
                }`}
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px] outline-none ${isProRoute ? 'focus:border-blue-500' : 'focus:border-emerald-500'
                }`}
            />
            {error && (
              <div className="text-sm text-rose-600">
                {error.includes('contractor account') ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800">
                    <p className="font-medium mb-2">🔵 Contractor Account Detected</p>
                    <p className="text-sm mb-2">{error}</p>
                    <a
                      href="/pro/sign-in"
                      className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                      Go to Contractor Login →
                    </a>
                  </div>
                ) : (
                  <p>{error}</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end mb-2">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className={`text-sm hover:underline ${isProRoute ? 'text-blue-600' : 'text-emerald-600'}`}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-xl px-3 py-2 text-[14px] font-semibold text-white disabled:opacity-60 flex items-center justify-center ${isProRoute
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
            >
              {loading && (
                <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {cta}
            </button>
        </form>

        {/* Forgot Password Modal */}
        {showForgotPassword && <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />}
      </div>
    </div>,
    document.body
  )
}

// Forgot Password Modal Component
function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)

    try {
      const emailTrim = email.trim().toLowerCase()
      if (!emailTrim) {
        setError("Please enter your email address.")
        setLoading(false)
        return
      }

      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTrim })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to send reset email')
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[5001] flex items-center justify-center p-4">
      {/* overlay */}
      <button
        aria-label="Close"
        className="absolute inset-0 h-full w-full bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* modal */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Rushr Logo */}
        <div className="mb-4">
          <img
            src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg"
            alt="Rushr"
            className="h-10 w-auto"
          />
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {success ? "Check your email" : "Reset your password"}
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {!success && (
            <p className="text-sm text-slate-600">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          )}
        </div>

        {success ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Email sent!
            </h3>
            <p className="text-sm text-slate-600">
              If an account with <strong>{email}</strong> exists, you will receive password reset instructions. Please check your inbox and spam folder.
            </p>
            <div className="mt-4 inline-flex items-center text-sm text-emerald-600">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Check your inbox
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px] outline-none focus:border-emerald-500"
            />
            <input
              type="email"
              disabled
              placeholder=""
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px] outline-none opacity-0 pointer-events-none"
              aria-hidden="true"
            />
            {error && (
              <div className="text-sm text-rose-600">
                <p>{error}</p>
              </div>
            )}

            <div className="flex items-center justify-end mb-2 opacity-0 pointer-events-none" aria-hidden="true">
              <button type="button" className="text-sm">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl px-3 py-2 text-[14px] font-semibold text-white disabled:opacity-60 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700"
            >
              {loading && (
                <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}
