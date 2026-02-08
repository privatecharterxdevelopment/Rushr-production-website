'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../contexts/AuthContext'
import { supabase } from '../../../../lib/supabaseClient'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { ArrowLeft, CreditCard, CheckCircle2, Plus, X, Lock, Loader2, Shield } from 'lucide-react'
import LoadingSpinner, { FullScreenLoading } from '../../../../components/LoadingSpinner'
import { Capacitor } from '@capacitor/core'
import { safeBack } from '../../../../lib/safeBack'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

function useIsNative() {
  const [isNative, setIsNative] = useState(false)
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])
  return isNative
}

interface PaymentMethod {
  id: string
  card: {
    brand: string
    last4: string
    exp_month: number
    exp_year: number
  }
}

function getBrandLabel(brand: string) {
  const b = brand.toLowerCase()
  if (b === 'visa') return 'Visa'
  if (b === 'mastercard') return 'Mastercard'
  if (b === 'amex') return 'Amex'
  if (b === 'discover') return 'Discover'
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

/* ─────────────── Add Card Modal ─────────────── */
function AddPaymentMethodModal({ customerId, onSuccess, onCancel }: { customerId: string; onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError(null)

    try {
      const setupResponse = await fetch('/api/stripe/customer/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId })
      })
      const setupData = await setupResponse.json()

      if (!setupResponse.ok || !setupData.clientSecret) {
        throw new Error(setupData.error || 'Failed to create setup intent')
      }

      const cardElement = elements.getElement(CardElement)
      if (!cardElement) throw new Error('Card element not found')

      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(setupData.clientSecret, {
        payment_method: { card: cardElement }
      })

      if (stripeError) {
        setError(stripeError.message || 'Failed to add payment method')
        setLoading(false)
        return
      }

      const { data: customer, error: customerError } = await supabase
        .from('stripe_customers')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (customerError) throw customerError

      if (customer && setupIntent.payment_method) {
        const { error: updateError } = await supabase
          .from('stripe_customers')
          .update({
            default_payment_method_id: setupIntent.payment_method,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', customer.user_id)
          .select()

        if (updateError) throw updateError
      }

      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Failed to add payment method')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add Card</h3>
              <p className="text-xs text-slate-500">Securely processed by Stripe</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-5">
          <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: '16px',
                    color: '#1e293b',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    '::placeholder': { color: '#94a3b8' },
                  },
                  invalid: { color: '#ef4444' },
                },
              }}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Lock className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Your card details are encrypted and never stored on our servers</span>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!stripe || loading}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 dark:bg-white dark:text-slate-900 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Add Card'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─────────────── Page ─────────────── */
function BillingPageContent() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const isNative = useIsNative()
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [showAddCard, setShowAddCard] = useState(false)

  useEffect(() => {
    if (user) {
      fetchPaymentMethods()
    }
  }, [user])

  const fetchPaymentMethods = async () => {
    if (!user) return

    setFetching(true)
    try {
      const createResponse = await fetch('/api/stripe/customer/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          name: userProfile?.name || user.email?.split('@')[0]
        })
      })

      const createData = await createResponse.json()
      const custId = createData.customerId

      const response = await fetch(`/api/stripe/customer/payment-methods?userId=${user.id}`)
      const data = await response.json()

      if (data.success) {
        setPaymentMethods(data.paymentMethods || [])
        setDefaultPaymentMethodId(data.defaultPaymentMethodId)
        setCustomerId(data.customerId || custId)
      }
    } catch (error) {
      console.error('Failed to fetch payment methods:', error)
    } finally {
      setFetching(false)
    }
  }

  const handlePaymentMethodAdded = () => {
    setShowAddCard(false)
    fetchPaymentMethods()
  }

  if (authLoading) {
    return <FullScreenLoading />
  }

  if (!user || !userProfile || userProfile.role !== 'homeowner') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Homeowner access required</h2>
          <Link href="/" className="btn-primary">Go to Home</Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className="page-container section-spacing space-y-6"
      style={{
        paddingTop: isNative ? 'env(safe-area-inset-top)' : undefined,
        paddingBottom: isNative ? 'calc(80px + env(safe-area-inset-bottom))' : undefined
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/homeowner"
          className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        </Link>
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold text-ink dark:text-white">Payment Methods</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage your saved cards</p>
        </div>
      </div>

      {/* Cards list */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        {fetching && paymentMethods.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner size="md" text="Loading payment methods..." />
          </div>
        ) : paymentMethods.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <CreditCard className="h-7 w-7 text-slate-300 dark:text-slate-600" />
            </div>
            <h4 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No cards yet</h4>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Add a payment method to hire contractors</p>
            <button
              onClick={() => setShowAddCard(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Card
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Saved Cards
                <span className="ml-2 text-xs font-normal text-slate-400">({paymentMethods.length})</span>
              </h2>
              <button
                onClick={() => setShowAddCard(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {paymentMethods.map((pm) => (
                <div
                  key={pm.id}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="w-12 h-8 rounded-md bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-600 dark:to-slate-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-white tracking-wider">
                      {getBrandLabel(pm.card.brand).substring(0, 4).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 dark:text-white text-sm">
                      {getBrandLabel(pm.card.brand)} ending in {pm.card.last4}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Expires {String(pm.card.exp_month).padStart(2, '0')}/{pm.card.exp_year}
                    </div>
                  </div>
                  {pm.id === defaultPaymentMethodId && (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Default
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Security note */}
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <Shield className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Your payment info is securely processed by Stripe. Rushr never stores full card details.
          Payments are only charged when you hire a contractor.
        </p>
      </div>

      {/* Add Card Modal */}
      {showAddCard && customerId && (
        <AddPaymentMethodModal
          customerId={customerId}
          onSuccess={handlePaymentMethodAdded}
          onCancel={() => setShowAddCard(false)}
        />
      )}
    </div>
  )
}

export default function HomeownerBillingPage() {
  return (
    <Elements stripe={stripePromise}>
      <BillingPageContent />
    </Elements>
  )
}
