import { supabase } from './supabaseClient'

/**
 * Drop-in replacement for fetch() that automatically includes
 * the Supabase auth token in the Authorization header.
 * Use for any API route that requires authentication.
 *
 * Handles expired tokens: if the cached session has an expired access
 * token, refreshes it before sending the request. If refresh fails,
 * retries once with a fresh getSession() call.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let { data: { session } } = await supabase.auth.getSession()

  // If token is expired or about to expire (within 60s), force a refresh
  if (session?.expires_at) {
    const expiresAt = session.expires_at * 1000 // convert to ms
    if (expiresAt - Date.now() < 60_000) {
      try {
        const { data, error } = await supabase.auth.refreshSession()
        if (!error && data.session) {
          session = data.session
        } else {
          // Refresh failed — try getSession() as fallback (might have a newer token)
          console.warn('[authFetch] Token refresh failed, retrying getSession:', error?.message)
          const fallback = await supabase.auth.getSession()
          session = fallback.data.session
        }
      } catch (err) {
        console.warn('[authFetch] Token refresh threw:', err)
        // Use whatever session we had
      }
    }
  }

  const headers = new Headers(init?.headers)
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  const response = await fetch(input, { ...init, headers })

  // If API returned 401, try ONE more time with a fresh session
  if (response.status === 401 && session) {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (!error && data.session) {
        const retryHeaders = new Headers(init?.headers)
        retryHeaders.set('Authorization', `Bearer ${data.session.access_token}`)
        return fetch(input, { ...init, headers: retryHeaders })
      }
    } catch {
      // Give up, return original 401
    }
  }

  return response
}
