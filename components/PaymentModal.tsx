'use client'

import React, { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  bidId: string
  jobId: string
  amount: number
  contractorName: string
  jobTitle: string
  homeownerId: string
  onPaymentSuccess: () => void
}

interface SavedCard {
  id: string
  card: {
    brand: string
    last4: string
    exp_month: number
    exp_year: number
  }
}

// Card brand icons
const cardBrandIcons: Record<string, string> = {
  visa: '💳',
  mastercard: '💳',
  amex: '💳',
  discover: '💳',
  default: '💳'
}

//
// -------------------------
// Saved Card Selection Component
// -------------------------
function SavedCardSelector({
  cards,
  selectedCardId,
  onSelectCard,
  onAddNewCard,
  defaultCardId
}: {
  cards: SavedCard[]
  selectedCardId: string | null
  onSelectCard: (cardId: string) => void
  onAddNewCard: () => void
  defaultCardId: string | null
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700 mb-2">Saved Cards</p>

      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onSelectCard(card.id)}
          className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between ${
            selectedCardId === card.id
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          }`}
        >
          <div className="flex items-center gap-3">
            {/* Card Icon */}
            <div className={`w-12 h-8 rounded flex items-center justify-center text-lg ${
              card.card.brand === 'visa' ? 'bg-blue-100' :
              card.card.brand === 'mastercard' ? 'bg-red-100' :
              card.card.brand === 'amex' ? 'bg-blue-100' :
              'bg-slate-100'
            }`}>
              {card.card.brand === 'visa' && (
                <span className="text-blue-700 font-bold text-xs">VISA</span>
              )}
              {card.card.brand === 'mastercard' && (
                <span className="text-red-600 font-bold text-xs">MC</span>
              )}
              {card.card.brand === 'amex' && (
                <span className="text-blue-600 font-bold text-xs">AMEX</span>
              )}
              {!['visa', 'mastercard', 'amex'].includes(card.card.brand) && (
                <span className="text-slate-600">{cardBrandIcons[card.card.brand] || cardBrandIcons.default}</span>
              )}
            </div>

            <div className="text-left">
              <p className="font-medium text-slate-900">
                •••• •••• •••• {card.card.last4}
              </p>
              <p className="text-sm text-slate-500">
                Expires {card.card.exp_month.toString().padStart(2, '0')}/{card.card.exp_year.toString().slice(-2)}
                {card.id === defaultCardId && (
                  <span className="ml-2 text-emerald-600 font-medium">Default</span>
                )}
              </p>
            </div>
          </div>

          {/* Selection indicator */}
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            selectedCardId === card.id
              ? 'border-emerald-500 bg-emerald-500'
              : 'border-slate-300'
          }`}>
            {selectedCardId === card.id && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </button>
      ))}

      {/* Add New Card Button */}
      <button
        type="button"
        onClick={onAddNewCard}
        className="w-full p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 transition-all flex items-center justify-center gap-2 text-slate-600 hover:text-emerald-700"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span className="font-medium">Add New Card</span>
      </button>
    </div>
  )
}

//
// -------------------------
// Payment Form Component (for new cards)
// -------------------------
function NewCardForm({
  amount,
  saveCard,
  setSaveCard,
  onSubmit,
  loading,
  error,
  onCancel
}: {
  amount: number
  saveCard: boolean
  setSaveCard: (save: boolean) => void
  onSubmit: (e: React.FormEvent) => void
  loading: boolean
  error: string | null
  onCancel: () => void
}) {
  const stripe = useStripe()

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-slate-700">Card Details</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to saved cards
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <PaymentElement />
      </div>

      {/* Save card checkbox */}
      <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 transition-colors">
        <input
          type="checkbox"
          checked={saveCard}
          onChange={(e) => setSaveCard(e.target.checked)}
          className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
        />
        <div>
          <span className="text-slate-900 font-medium">Save card for future payments</span>
          <p className="text-sm text-slate-500">Your card will be securely stored</p>
        </div>
      </label>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/25"
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <img
              src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
              alt="Loading..."
              className="w-5 h-5 object-contain -ml-1 mr-2"
            />
            Processing...
          </span>
        ) : (
          `Pay $${amount.toFixed(2)}`
        )}
      </button>
    </form>
  )
}

//
// -------------------------
// Main Payment Form with Saved Cards
// -------------------------
function PaymentForm({
  bidId,
  jobId,
  amount,
  contractorName,
  jobTitle,
  homeownerId,
  onSuccess,
  onClose,
  clientSecret
}: Omit<PaymentModalProps, 'isOpen'> & { onSuccess: () => void; clientSecret: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [showNewCardForm, setShowNewCardForm] = useState(false)
  const [saveCard, setSaveCard] = useState(true)
  const [loadingCards, setLoadingCards] = useState(true)
  const [defaultCardId, setDefaultCardId] = useState<string | null>(null)

  // Fetch saved cards on mount
  useEffect(() => {
    const fetchSavedCards = async () => {
      try {
        const response = await fetch(`/api/stripe/customer/payment-methods?userId=${homeownerId}`)
        const data = await response.json()

        if (data.success && data.paymentMethods?.length > 0) {
          setSavedCards(data.paymentMethods)
          setDefaultCardId(data.defaultPaymentMethodId)
          // Auto-select default card or first card
          const defaultCard = data.paymentMethods.find((c: SavedCard) => c.id === data.defaultPaymentMethodId)
          setSelectedCardId(defaultCard?.id || data.paymentMethods[0].id)
        } else {
          // No saved cards - show new card form
          setShowNewCardForm(true)
        }
      } catch (err) {
        console.error('Error fetching saved cards:', err)
        setShowNewCardForm(true)
      } finally {
        setLoadingCards(false)
      }
    }

    fetchSavedCards()
  }, [homeownerId])

  // Pay with saved card
  const handlePayWithSavedCard = async () => {
    if (!stripe || !selectedCardId) return

    setLoading(true)
    setError(null)

    try {
      const { error: confirmError } = await stripe.confirmPayment({
        clientSecret,
        confirmParams: {
          payment_method: selectedCardId,
          return_url: `${window.location.origin}/jobs/${jobId}/track`
        },
        redirect: 'if_required'
      })

      if (confirmError) {
        setError(confirmError.message || 'Payment failed')
        setLoading(false)
        return
      }

      onSuccess()
    } catch (err: any) {
      console.error('Payment error:', err)
      setError(err.message || 'Payment failed')
      setLoading(false)
    }
  }

  // Pay with new card
  const handlePayWithNewCard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError(null)

    try {
      // Submit card details to Stripe
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setError(submitError.message || 'Payment failed')
        setLoading(false)
        return
      }

      // Confirm payment with Stripe
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/jobs/${jobId}/track`,
          save_payment_method: saveCard
        },
        redirect: 'if_required'
      })

      if (confirmError) {
        setError(confirmError.message || 'Payment failed')
        setLoading(false)
        return
      }

      // If user chose to save card and payment succeeded, attach it
      if (saveCard && paymentIntent?.payment_method) {
        try {
          await fetch('/api/stripe/customer/save-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: homeownerId,
              paymentMethodId: paymentIntent.payment_method
            })
          })
        } catch (err) {
          console.error('Error saving card:', err)
          // Don't fail payment if save fails
        }
      }

      onSuccess()
    } catch (err: any) {
      console.error('Payment error:', err)
      setError(err.message || 'Payment failed')
      setLoading(false)
    }
  }

  const platformFee = Math.round(amount * 0.10 * 100) / 100
  const contractorPayout = amount - platformFee

  if (loadingCards) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-600">
        <img
          src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
          alt="Loading..."
          className="w-8 h-8 object-contain"
        />
        <span className="ml-3">Loading payment methods...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center border-b border-slate-200 pb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Secure Payment</h2>
        <p className="text-slate-600">Payment held in escrow until job completion</p>
      </div>

      {/* Payment Summary */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-6 border border-emerald-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm text-emerald-700 font-medium mb-1">Job</p>
            <p className="text-slate-900 font-semibold">{jobTitle}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-emerald-700 font-medium mb-1">Contractor</p>
            <p className="text-slate-900 font-semibold">{contractorName}</p>
          </div>
        </div>

        <div className="border-t border-emerald-200 pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-700">Bid Amount</span>
            <span className="font-semibold text-slate-900">${amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-700">Platform Fee (10%)</span>
            <span className="font-semibold text-slate-900">-${platformFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-emerald-200 pt-2">
            <span className="text-slate-700">Contractor Receives</span>
            <span className="font-semibold text-emerald-700">${contractorPayout.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Escrow Explanation */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">How escrow payment works:</p>
            <ul className="space-y-1 text-blue-800">
              <li>• Payment is held securely until job completion</li>
              <li>• Both parties confirm when work is done</li>
              <li>• Funds released to contractor automatically</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Payment Method Selection */}
      {!showNewCardForm && savedCards.length > 0 ? (
        <div className="space-y-4">
          <SavedCardSelector
            cards={savedCards}
            selectedCardId={selectedCardId}
            onSelectCard={setSelectedCardId}
            onAddNewCard={() => setShowNewCardForm(true)}
            defaultCardId={defaultCardId}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePayWithSavedCard}
              disabled={!stripe || loading || !selectedCardId}
              className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/25"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <img
                    src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
                    alt="Loading..."
                    className="w-5 h-5 object-contain -ml-1 mr-2"
                  />
                  Processing...
                </span>
              ) : (
                `Pay $${amount.toFixed(2)}`
              )}
            </button>
          </div>
        </div>
      ) : (
        <NewCardForm
          amount={amount}
          saveCard={saveCard}
          setSaveCard={setSaveCard}
          onSubmit={handlePayWithNewCard}
          loading={loading}
          error={error}
          onCancel={() => {
            if (savedCards.length > 0) {
              setShowNewCardForm(false)
            } else {
              onClose()
            }
          }}
        />
      )}
    </div>
  )
}

//
// -------------------------
// Wrapper to handle clientSecret + Elements
// -------------------------
function PaymentWrapper(props: PaymentModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const createPaymentIntent = async () => {
      try {
        const response = await fetch('/api/payments/create-hold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bidId: props.bidId,
            homeownerId: props.homeownerId
          })
        })

        const data = await response.json()
        if (data.error) {
          setError(data.error)
          return
        }

        setClientSecret(data.clientSecret)
      } catch (err: any) {
        console.error('Error creating payment intent:', err)
        setError(err.message || 'Failed to initialize payment')
      }
    }

    createPaymentIntent()
  }, [props.bidId, props.homeownerId])

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        Failed to initialize payment: {error}
      </div>
    )
  }

  if (!clientSecret) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-600">
        <img
          src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/RushrLogoAnimation.gif"
          alt="Loading..."
          className="w-8 h-8 object-contain"
        />
        <span className="ml-3">Initializing secure payment...</span>
      </div>
    )
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#059669',
            colorBackground: '#ffffff',
            colorText: '#1e293b',
            colorDanger: '#ef4444',
            fontFamily: 'system-ui, sans-serif',
            borderRadius: '8px'
          }
        }
      }}
    >
      <PaymentForm {...props} onSuccess={props.onPaymentSuccess} clientSecret={clientSecret} />
    </Elements>
  )
}

//
// -------------------------
// Main Modal Component
// -------------------------
export default function PaymentModal(props: PaymentModalProps) {
  if (!props.isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300"
        onClick={props.onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <button
              onClick={props.onClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors z-10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="p-8">
              <PaymentWrapper {...props} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
