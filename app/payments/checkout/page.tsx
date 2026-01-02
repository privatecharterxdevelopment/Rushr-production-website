'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '../../../contexts/AuthContext'
import { loadStripe } from '@stripe/stripe-js'
import { safeBack } from '../../../lib/safeBack'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

function CheckoutContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const job_id = searchParams.get('job_id')
  const amount = searchParams.get('amount')
  const description = searchParams.get('description')
  const type = searchParams.get('type') // 'escrow' or 'payment'

  useEffect(() => {
    if (!user) {
      router.push('/sign-up?callback=/payments/checkout')
      return
    }

    if (!job_id || !amount) {
      setError('Missing required parameters')
      setLoading(false)
      return
    }

    createCheckoutSession()
  }, [user, job_id, amount])

  const createCheckoutSession = async () => {
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id,
          amount: parseFloat(amount!),
          description: description || 'Job Payment',
          type: type || 'escrow',
          customer_email: user?.email
        })
      })

      const data = await response.json()

      if (data.error) {
        setError(data.error)
        setLoading(false)
        return
      }

      // Redirect to Stripe Checkout using the URL
      if (data.url) {
        window.location.href = data.url
      } else {
        setError('No checkout URL received')
        setLoading(false)
      }
    } catch (err: any) {
      console.error('Checkout error:', err)
      setError(err.message || 'Failed to create checkout session')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-md">
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <img
          src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
          alt="Loading..."
          className="h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4 object-contain"
        />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Preparing Payment</h2>
          <p className="text-slate-600">Redirecting to secure checkout...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-md">
        <div className="bg-white border border-red-200 rounded-lg p-8">
          <h2 className="text-xl font-semibold text-red-900 mb-4">Payment Error</h2>
          <p className="text-red-700 mb-6">{error}</p>
          <button
            onClick={() => safeBack(router, '/dashboard')}
            className="w-full px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-16 max-w-md">
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <img
          src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
          alt="Loading..."
          className="h-12 w-12 border-b-2 border-emerald-600 mx-auto object-contain"
        />
        </div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
