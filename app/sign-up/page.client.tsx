'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../../contexts/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import { openAuth } from '../../components/AuthModal'

export default function SignUpPage() {
  const { signUp, user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const role = 'homeowner' as const // HOMEOWNER ONLY registration page
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  // No auto-redirect - let users stay on the page if they want

  // Show modal when there's an error
  useEffect(() => {
    if (error) {
      setShowModal(true)
    }
  }, [error])

  // Close modal when clicking outside or pressing Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false)
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.classList.contains('modal-overlay')) {
        setShowModal(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (!agreedToTerms) {
      setError('You must agree to the Terms & Conditions and Privacy Policy to create an account')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      setLoading(false)
      return
    }

    const result = await signUp(email, password, name, role)

    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else if (result.needsConfirmation) {
      // Email confirmation required - show success message
      setError(result.message || 'Please check your email to confirm your account.')
      setLoading(false)
    } else {
      // Success - show success state then redirect
      setSuccess(true)
      setLoading(false)
      const callbackUrl = searchParams.get('callback')
      const target = callbackUrl || '/dashboard/homeowner'

      // Show success message for 1.5 seconds then redirect
      setTimeout(() => {
        router.push(target)
      }, 1500)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg"  />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 relative">
      {/* Background with subtle gradient for better readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/20 to-transparent -z-10"></div>

      <div className="max-w-md w-full bg-white/95 backdrop-blur-sm rounded-lg shadow-md p-8 border border-gray-200/50">
        <h1 className="text-2xl font-semibold mb-6 text-center text-gray-800">
          {success ? '✅ Account Created!' : 'Create Account'}
        </h1>

        {success ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Welcome to Rushr!
            </h3>
            <p className="text-sm text-slate-600">
              Redirecting to your dashboard...
            </p>
            <div className="mt-4 inline-flex items-center text-sm text-emerald-600">
              <LoadingSpinner size="sm" />
              <span className="ml-2">Loading dashboard...</span>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Full Name"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Email"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />

          {/* Homeowner registration - no role selection needed */}
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Creating homeowner account. Service providers should <Link href="/pro/contractor-signup" className="text-blue-600 hover:text-blue-500 font-medium">register here</Link>.
            </p>
          </div>

          {/* Terms & Conditions Checkbox */}
          <div className="flex items-start gap-3 py-3 px-4 bg-gray-50 rounded-md border border-gray-200">
            <input
              type="checkbox"
              id="agree-terms"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
              required
            />
            <label htmlFor="agree-terms" className="text-sm text-gray-700 cursor-pointer select-none">
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="text-green-600 hover:text-green-700 underline font-medium">
                Terms & Conditions
              </Link>
              {' '}and{' '}
              <Link href="/privacy" target="_blank" className="text-green-600 hover:text-green-700 underline font-medium">
                Privacy Policy
              </Link>
            </label>
          </div>

          <button
            className="w-full py-2 px-4 bg-[#059669] text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            disabled={loading || !agreedToTerms}
          >
            {loading ? 'Creating Account…' : 'Create Account'}
          </button>
        </form>
        )}

        {!success && (
          <>
            <p className="mt-6 text-sm text-gray-600 text-center">
              Already have an account?{' '}
              <button
                onClick={() => {
                  const callbackUrl = searchParams.get('callback')
                  if (callbackUrl) {
                    openAuth(callbackUrl)
                  } else {
                    window.location.href = '/?auth=signin'
                  }
                }}
                className="text-green-600 hover:text-green-500 font-medium transition-colors"
              >
                Sign in
              </button>
            </p>
          </>
        )}

        {/* Error Modal */}
        {showModal && error && (
          <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay bg-black/40 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl relative border border-gray-200">
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Sign Up Error</h3>
              <p className="text-sm text-red-600">{error}</p>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-[#059669] text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
