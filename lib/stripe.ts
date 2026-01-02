// lib/stripe.ts
// Lazy Stripe initialization to prevent build-time errors when keys are not set
import Stripe from 'stripe'

let stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia'
    })
  }
  return stripe
}
