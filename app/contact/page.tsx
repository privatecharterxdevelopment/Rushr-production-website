'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { useApp } from '../../lib/state' // optional: only used to prefill name if available
import Link from "next/link";
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { ArrowLeft } from 'lucide-react'
import { safeBack } from '../../lib/safeBack'

// Hook to safely check if running in native app (avoids hydration mismatch)
function useIsNative() {
  const [isNative, setIsNative] = useState(false)
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])
  return isNative
}

export default function ContactPage() {
  const { state } = useApp() as any // safe even if undefined initially
  const prefillName = useMemo(() => state?.user?.name || '', [state?.user?.name])
  const router = useRouter()
  const isNative = useIsNative()

  const [name, setName] = useState(prefillName)
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [agree, setAgree] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // simple client validation
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setError('Please fill in all required fields.')
      return
    }
    if (!agree) {
      setError('Please agree to be contacted.')
      return
    }

    setSubmitting(true)
    try {
      // Try API route (ok to remove; page still works without)
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      })

      if (!res.ok) throw new Error(String(res.status || 'Request failed'))

      setSuccess(true)
    } catch {
      // Fallback: open mailto with prefilled body
      const lines = [
        `Name: ${name}`,
        `Email: ${email}`,
        `Subject: ${subject}`,
        '',
        message,
      ]
      const mailto = `mailto:hello@userushr.com?subject=${encodeURIComponent(
        `[Contact] ${subject}`
      )}&body=${encodeURIComponent(lines.join('\n'))}`

      // Open in a new tab so we keep success state here
      window.open(mailto, '_blank', 'noopener,noreferrer')
      setSuccess(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <main
        className="min-h-screen bg-gray-50"
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
                Help & Support
              </h1>
            </div>
          </div>
        )}

        {/* Web Header */}
        {!isNative && (
          <section
            className="relative z-20"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)'
            }}
          >
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-3">
                <Link
                  href="/"
                  className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
                >
                  <ArrowLeft className="h-5 w-5 text-white" />
                </Link>
                <h1 className="text-xl font-semibold text-white">Help & Support</h1>
              </div>
              <p className="text-white/80 text-sm">Questions about quotes, accounts, or features? We're here to help.</p>
            </div>
          </section>
        )}

        <div className="px-4 py-10">
          <div className="mx-auto max-w-md rounded-2xl border bg-white p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <IconCheck className="h-6 w-6 text-emerald-700" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">Message sent</h1>
            <p className="mt-2 text-sm text-slate-600">
              Thanks for reaching out. We usually reply within a few hours on business days.
            </p>
            <button
              onClick={() => safeBack(router, '/dashboard')}
              className="mt-6 w-full inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Done
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main
      className="min-h-screen bg-gray-50"
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
              Help & Support
            </h1>
          </div>
        </div>
      )}

      {/* Web Header */}
      {!isNative && (
        <section
          className="relative z-20"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)'
          }}
        >
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-3">
              <Link
                href="/"
                className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
              >
                <ArrowLeft className="h-5 w-5 text-white" />
              </Link>
              <h1 className="text-xl font-semibold text-white">Help & Support</h1>
            </div>
            <p className="text-white/80 text-sm">Questions about quotes, accounts, or features? We're here to help.</p>
          </div>
        </section>
      )}

      {/* Content */}
      <section className="px-4 py-6">
        {/* Response time info */}
        <div className="rounded-2xl border bg-white p-5 mb-6">
          <div className="flex items-center gap-2">
            <IconClock className="h-5 w-5 text-emerald-700" />
            <div className="text-sm font-semibold text-slate-900">Response time</div>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            We usually reply within a few hours on business days.
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <IconMail className="h-5 w-5 text-emerald-700" />
            <h2 className="text-lg font-semibold text-slate-900">Send us a message</h2>
          </div>

          <form onSubmit={onSubmit} className="grid gap-4">
            <Field
              label="Your name"
              required
              input={
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                />
              }
            />
            <Field
              label="Email"
              required
              input={
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  placeholder="your@email.com"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                />
              }
            />

            <Field
              label="Subject"
              required
              input={
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Account question, quoting help, features, etc."
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                />
              }
            />

            <Field
              label="Message"
              required
              input={
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Tell us what you need help with..."
                  rows={5}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                />
              }
            />

            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={agree}
                onChange={e => setAgree(e.target.checked)}
                className="mt-[3px] h-4 w-4 rounded border-slate-300 text-primary focus:ring-emerald-200"
              />
              <span>
                I agree to be contacted about my request.
              </span>
            </label>

            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? 'Sending…' : 'Send message'}
            </button>
          </form>
        </div>

        {/* Email alternative */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">
            Or email us at{' '}
            <a href="mailto:hello@userushr.com" className="text-emerald-600 font-medium">
              hello@userushr.com
            </a>
          </p>
        </div>
      </section>
    </main>
  )
}

/* ------------------------ Small composables ------------------------ */
function Field({ label, required, input }: { label: string; required?: boolean; input: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label} {required && <span className="text-rose-600">*</span>}
      </span>
      {input}
    </label>
  )
}
/* ---------------------------- Inline icons ---------------------------- */
function IconCheck(props: React.SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}><path strokeWidth="2" d="M20 6L9 17l-5-5"/></svg>)
}
function IconMail(props: React.SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}><rect x="3" y="5" width="18" height="14" rx="2" strokeWidth="2"/><path strokeWidth="2" d="M3 7l9 6 9-6"/></svg>)
}
function IconClock(props: React.SVGProps<SVGSVGElement>) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}><circle cx="12" cy="12" r="9" strokeWidth="2"/><path strokeWidth="2" d="M12 7v5l3 2"/></svg>)
}