import { supabase } from './supabaseClient'

/**
 * Drop-in replacement for fetch() that automatically includes
 * the Supabase auth token in the Authorization header.
 * Use for any API route that requires authentication.
 *
 * Handles expired tokens: if the cached session has an expired access
 * token, refreshes it before sending the request.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let { data: { session } } = await supabase.auth.getSession()

  // If token is expired or about to expire (within 30s), force a refresh
  if (session?.expires_at) {
    const expiresAt = session.expires_at * 1000 // convert to ms
    if (expiresAt - Date.now() < 30_000) {
      const { data } = await supabase.auth.refreshSession()
      session = data.session
    }
  }

  const headers = new Headers(init?.headers)
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  return fetch(input, { ...init, headers })
}
