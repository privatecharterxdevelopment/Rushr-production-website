'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../../../contexts/AuthContext'
import { supabase } from '../../../lib/supabaseClient'
import { openAuth } from '../../../components/AuthModal'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { MapPin, Star, Clock, DollarSign, Shield, CheckCircle, ChevronLeft, CreditCard, Lock } from 'lucide-react'
import Link from 'next/link'

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')

interface Contractor {
  id: string
  name: string
  business_name: string
  rating: number
  total_jobs: number
  hourly_rate: number
  categories: string[]
  phone?: string
  email?: string
  years_in_business?: number
  profile_image?: string
}

// Payment Form Component
function PaymentForm({
  contractor,
  category,
  estimatedHours,
  onSuccess
}: {
  contractor: Contractor
  category: string
  estimatedHours: number
  onSuccess: (jobId: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cardComplete, setCardComplete] = useState(false)

  const estimatedTotal = contractor.hourly_rate * estimatedHours
  const platformFee = estimatedTotal * 0.1 // 10% platform fee
  const totalWithFee = estimatedTotal

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements || !user) {
      setError('Please sign in to continue')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const cardElement = elements.getElement(CardElement)
      if (!cardElement) {
        throw new Error('Card element not found')
      }

      // Create payment method
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      })

      if (pmError) {
        throw new Error(pmError.message)
      }

      // Create payment hold (escrow) via API
      const response = await fetch('/api/payments/create-hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId: contractor.id,
          amount: totalWithFee,
          platformFee,
          paymentMethodId: paymentMethod.id,
          category,
          estimatedHours,
          homeownerId: user.id
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Payment failed')
      }

      // Confirm the payment intent if needed
      if (data.clientSecret && data.status === 'requires_confirmation') {
        const { error: confirmError } = await stripe.confirmCardPayment(data.clientSecret)
        if (confirmError) {
          throw new Error(confirmError.message)
        }
      }

      // Success - job created
      onSuccess(data.jobId)

    } catch (err: any) {
      console.error('Payment error:', err)
      setError(err.message || 'Payment failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Price Summary */}
      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-slate-900">Price Estimate</h3>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Hourly rate</span>
          <span className="font-medium">${contractor.hourly_rate}/hr</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Estimated time</span>
          <span className="font-medium">{estimatedHours} hour(s)</span>
        </div>
        <div className="border-t border-slate-200 pt-3 flex justify-between">
          <span className="font-semibold text-slate-900">Estimated Total</span>
          <span className="font-bold text-lg text-emerald-600">${estimatedTotal.toFixed(2)}</span>
        </div>
        <p className="text-xs text-slate-500">
          * Final price may be adjusted by the contractor based on actual work performed.
          You'll approve any changes before payment is released.
        </p>
      </div>

      {/* Card Input */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          <CreditCard className="w-4 h-4 inline mr-2" />
          Payment Method
        </label>
        <div className="border border-slate-300 rounded-lg p-4 bg-white">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#1f2937',
                  '::placeholder': { color: '#9ca3af' },
                },
                invalid: { color: '#dc2626' }
              }
            }}
            onChange={(e) => setCardComplete(e.complete)}
          />
        </div>
      </div>

      {/* Security Note */}
      <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg">
        <Shield className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-emerald-800">Secure Escrow Payment</p>
          <p className="text-emerald-700">
            Your payment is held securely until you confirm the work is complete.
            You can cancel and get a full refund before the contractor starts work.
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!stripe || loading || !cardComplete}
        className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition-all ${
          loading || !cardComplete
            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/30'
        }`}
      >
        {loading ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Lock className="w-5 h-5" />
            Confirm Booking • ${estimatedTotal.toFixed(2)}
          </>
        )}
      </button>

      <p className="text-xs text-center text-slate-500">
        By confirming, you agree to our Terms of Service and authorize the escrow payment.
      </p>
    </form>
  )
}

// Main Page Component
export default function BookContractorPage({ params }: { params: { contractorId: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const [contractor, setContractor] = useState<Contractor | null>(null)
  const [loading, setLoading] = useState(true)
  const [estimatedHours, setEstimatedHours] = useState(2)

  const category = searchParams.get('category') || 'General'
  const rate = searchParams.get('rate')

  // Fetch contractor details
  useEffect(() => {
    async function fetchContractor() {
      const { data, error } = await supabase
        .from('pro_contractors')
        .select('*')
        .eq('id', params.contractorId)
        .single()

      if (error) {
        console.error('Error fetching contractor:', error)
        router.push('/')
        return
      }

      setContractor({
        id: data.id,
        name: data.name,
        business_name: data.business_name || data.name,
        rating: data.rating || 4.5,
        total_jobs: data.total_jobs || 0,
        hourly_rate: rate ? parseFloat(rate) : (data.hourly_rate || 65),
        categories: data.categories || [],
        phone: data.phone,
        email: data.email,
        years_in_business: data.years_in_business,
        profile_image: data.profile_image
      })
      setLoading(false)
    }

    fetchContractor()
  }, [params.contractorId, rate, router])

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      // Save booking intent
      localStorage.setItem('rushr_pending_booking', JSON.stringify({
        contractorId: params.contractorId,
        category,
        rate,
        timestamp: Date.now()
      }))
      openAuth(`/book/${params.contractorId}?category=${encodeURIComponent(category)}&rate=${rate}`)
    }
  }, [user, authLoading, params.contractorId, category, rate])

  const handlePaymentSuccess = (jobId: string) => {
    // Navigate to job tracking page
    router.push(`/jobs/${jobId}/track`)
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">R</span>
          </div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!contractor) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600">Contractor not found</p>
          <Link href="/" className="text-emerald-600 hover:underline mt-2 inline-block">
            Go back home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-lg text-slate-900">Confirm Booking</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Contractor Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-2xl">
                {contractor.business_name.charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-xl text-slate-900">{contractor.business_name}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-600">
                <span className="flex items-center gap-1 text-amber-500">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="font-medium">{contractor.rating.toFixed(1)}</span>
                </span>
                <span>{contractor.total_jobs} jobs</span>
                {contractor.years_in_business && (
                  <span>{contractor.years_in_business} years exp.</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {contractor.categories.slice(0, 3).map((cat, i) => (
                  <span key={i} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Service details */}
          <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span className="text-slate-600">Rate:</span>
              <span className="font-semibold">${contractor.hourly_rate}/hr</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span className="text-slate-600">Category:</span>
              <span className="font-semibold">{category}</span>
            </div>
          </div>
        </div>

        {/* Estimated Duration */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">Estimated Duration</h3>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setEstimatedHours(Math.max(1, estimatedHours - 1))}
              className="w-10 h-10 border border-slate-300 rounded-lg flex items-center justify-center text-xl font-medium hover:bg-slate-50"
            >
              -
            </button>
            <div className="flex-1 text-center">
              <span className="text-3xl font-bold text-slate-900">{estimatedHours}</span>
              <span className="text-slate-600 ml-2">hour{estimatedHours !== 1 ? 's' : ''}</span>
            </div>
            <button
              onClick={() => setEstimatedHours(Math.min(8, estimatedHours + 1))}
              className="w-10 h-10 border border-slate-300 rounded-lg flex items-center justify-center text-xl font-medium hover:bg-slate-50"
            >
              +
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-3 text-center">
            The contractor may adjust this based on the actual work needed.
          </p>
        </div>

        {/* Payment Form */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">Payment</h3>
          <Elements stripe={stripePromise}>
            <PaymentForm
              contractor={contractor}
              category={category}
              estimatedHours={estimatedHours}
              onSuccess={handlePaymentSuccess}
            />
          </Elements>
        </div>
      </div>
    </div>
  )
}
