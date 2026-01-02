'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../contexts/AuthContext'
import { supabase } from '../../../../lib/supabaseClient'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { ArrowLeft, CreditCard, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import LoadingSpinner, { FullScreenLoading } from '../../../../components/LoadingSpinner'
import { Capacitor } from '@capacitor/core'
import { safeBack } from '../../../../lib/safeBack'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// Hook to safely check if running in native app (avoids hydration mismatch)
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

function AddPaymentMethodForm({ customerId, onSuccess }: { customerId: string; onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Create setup intent
      const { clientSecret } = await fetch('/api/stripe/customer/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId })
      }).then(r => r.json())

      const cardElement = elements.getElement(CardElement)
      if (!cardElement) {
        throw new Error('Card element not found')
      }

      // Confirm setup
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement
        }
      })

      if (stripeError) {
        setError(stripeError.message || 'Failed to add payment method')
        setLoading(false)
        return
      }

      // Update default payment method in database
      console.log('💳 Saving payment method to database...', setupIntent.payment_method)
      const { data: customer, error: customerError } = await supabase
        .from('stripe_customers')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (customerError) {
        console.error('❌ Error fetching customer:', customerError)
        throw customerError
      }

      console.log('✅ Found customer:', customer)

      if (customer && setupIntent.payment_method) {
        const { data: updateResult, error: updateError } = await supabase
          .from('stripe_customers')
          .update({
            default_payment_method_id: setupIntent.payment_method,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', customer.user_id)
          .select()

        if (updateError) {
          console.error('❌ Error updating payment method:', updateError)
          throw updateError
        }

        console.log('✅ Payment method saved successfully:', updateResult)
      }

      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Failed to add payment method')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border border-gray-300 rounded-lg bg-gray-50">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#9e2146',
              },
            },
          }}
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Adding...' : 'Add Payment Method'}
      </button>
    </form>
  )
}

function BillingPageContent() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const isNative = useIsNative()
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddCard, setShowAddCard] = useState(false)

  useEffect(() => {
    if (user) {
      fetchPaymentMethods()
    }
  }, [user])

  const fetchPaymentMethods = async () => {
    if (!user) return

    setLoading(true)
    try {
      // First, ensure customer exists
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

      // Fetch payment methods
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
      setLoading(false)
    }
  }

  const handlePaymentMethodAdded = () => {
    setShowAddCard(false)
    fetchPaymentMethods()
  }

  // Show full-screen loading while auth or payment methods are loading
  if (authLoading || loading) {
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
              Billing & Payments
            </h1>
          </div>
        </div>
      )}

      {/* Web Header */}
      {!isNative && (
        <div
          className="relative z-20"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)'
          }}
        >
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-3">
              <Link
                href="/dashboard/homeowner"
                className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
              >
                <ArrowLeft className="h-5 w-5 text-white" />
              </Link>
              <h1 className="text-xl font-semibold text-white">Billing & Payments</h1>
            </div>
            <p className="text-white/80 text-sm">Manage your payment methods for hiring contractors</p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Payment Methods List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Payment Methods</h2>
              {!showAddCard && (
                <button
                  onClick={() => setShowAddCard(true)}
                  className="btn btn-outline flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Card
                </button>
              )}
              </div>

              {paymentMethods.length === 0 && !showAddCard ? (
                <div className="text-center py-8">
                  <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 mb-4">No payment methods added yet</p>
                  <button
                    onClick={() => setShowAddCard(true)}
                    className="btn-primary"
                  >
                    Add Your First Card
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentMethods.map((pm) => (
                    <div
                      key={pm.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-lg">
                          <CreditCard className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 capitalize">
                            {pm.card.brand} •••• {pm.card.last4}
                          </div>
                          <div className="text-sm text-gray-600">
                            Expires {pm.card.exp_month}/{pm.card.exp_year}
                          </div>
                        </div>
                      </div>
                      {pm.id === defaultPaymentMethodId && (
                        <div className="flex items-center gap-2 text-emerald-600">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="text-sm font-medium">Default</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add Card Form */}
              {showAddCard && customerId && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-gray-900">Add New Card</h3>
                    <button
                      onClick={() => setShowAddCard(false)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                  <AddPaymentMethodForm
                    customerId={customerId}
                    onSuccess={handlePaymentMethodAdded}
                  />
                </div>
              )}
            </div>

            {/* Info Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">Secure Payments</h3>
              <p className="text-sm text-blue-800">
                Your payment information is securely processed by Stripe. Rushr never stores your
                full card details. Payments are only charged when you accept a contractor's bid.
              </p>
            </div>
          </div>
      </div>
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
