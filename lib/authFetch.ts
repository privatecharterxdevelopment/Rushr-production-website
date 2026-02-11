import { supabase } from './supabaseClient'

/**
 * Drop-in replacement for fetch() that automatically includes
 * the Supabase auth token in the Authorization header.
 * Use for any API route that requires authentication.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init?.headers)
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  return fetch(input, { ...init, headers })
}
