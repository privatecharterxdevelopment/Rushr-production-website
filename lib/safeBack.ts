'use client'

import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

/**
 * Safe back navigation that works in Capacitor iOS apps.
 * Falls back to home page if there's no browser history.
 */
export function safeBack(router: AppRouterInstance, fallbackPath: string = '/') {
  // Check if there's history to go back to
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
  } else {
    // No history - navigate to fallback
    router.push(fallbackPath)
  }
}
