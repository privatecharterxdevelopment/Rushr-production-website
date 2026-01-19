// Admin configuration
// Centralized list of admin emails for easy management

export const ADMIN_EMAILS = [
  'admin@userushr.com',
  'lorenzo.vanza@hotmail.com',
  'zac@spgrp.com',
  'jake@spgrp.com',
  'zac.schwartz212@gmail.com',
  'jakezpodolsky@gmail.com',
  'zac@testbylorenzo.com'
]

/**
 * Check if a user email is an admin
 * @param email - User email to check (case-insensitive)
 * @param role - Optional user role
 * @returns true if user is admin
 */
export function isAdminUser(email: string | undefined | null, role?: string): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase()) || role === 'admin'
}
