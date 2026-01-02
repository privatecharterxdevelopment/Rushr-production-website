import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()!

// Custom storage adapter for Capacitor (iOS/Android)
// Uses native Preferences API for persistent storage that survives app updates
const capacitorStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const { value } = await Preferences.get({ key })
      return value
    } catch {
      return null
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await Preferences.set({ key, value })
    } catch (e) {
      console.error('Failed to save to Preferences:', e)
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await Preferences.remove({ key })
    } catch (e) {
      console.error('Failed to remove from Preferences:', e)
    }
  }
}

// Check if running on native platform
const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

// Singleton instance to prevent multiple clients
let supabaseInstance: SupabaseClient | null = null

export const supabase = (() => {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: !isNative, // Disable URL detection on native apps
        // Use Capacitor Preferences on iOS/Android for persistent auth
        // This ensures users stay logged in even after app updates
        storage: isNative ? capacitorStorage : (typeof window !== 'undefined' ? window.localStorage : undefined),
        storageKey: 'rushr-auth-token',
        flowType: 'pkce',
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: { 'x-my-custom-header': 'rushr-app' },
      },
    })
  }
  return supabaseInstance
})()
