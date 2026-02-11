// app/sign-in/page.client.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../../contexts/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function SignInPage() {
  const { signIn, user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

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

    const { error } = await signIn(email, password)
    setLoading(false)

    if (error) {
      setError(error)
    } else {
      // Success - redirect to dashboard
      router.push('/dashboard')
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" color="green" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 relative">
      {/* Background with subtle gradient for better readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/20 to-transparent -z-10"></div>
      
      <div className="max-w-md w-full bg-white/95 backdrop-blur-sm rounded-lg shadow-md p-8 border border-gray-200/50">
        <h1 className="text-2xl font-semibold mb-6 text-center text-gray-800">Sign in</h1>
        <form onSubmit={onSubmit} className="space-y-4">
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
            placeholder="Password"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button 
            className="w-full py-2 px-4 bg-[#059669] text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 transition-colors" 
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-gray-600 text-center">
          New here?{' '}
          <Link href="/sign-up" className="text-green-600 hover:text-green-500 font-medium transition-colors">
            Create an account
          </Link>
        </p>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            By continuing you agree to our{' '}
            <Link href="/terms" className="text-green-600 hover:text-green-500 underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-green-600 hover:text-green-500 underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

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
              <h3 className="text-lg font-medium text-gray-900 mb-2">Sign In Error</h3>
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