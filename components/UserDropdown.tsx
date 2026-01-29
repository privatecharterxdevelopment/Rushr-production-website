'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { useProAuth } from '../contexts/ProAuthContext'
import { showGlobalToast } from './Toast'
import { isAdminUser } from '../lib/adminConfig'

function ChevronDown(props: any) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function UserIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function SettingsIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
    </svg>
  )
}

function MessageIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function DashboardIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  )
}

function LogoutIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export default function UserDropdown() {
  const { user: homeownerUser, userProfile, signOut: homeownerSignOut } = useAuth()
  const { user: contractorUser, contractorProfile, signOut: contractorSignOut } = useProAuth()
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Determine which user is logged in
  // CRITICAL: Check contractorProfile existence, NOT contractorUser
  // Both contexts can have a user, but only contractors have contractorProfile
  const isContractor = !!contractorProfile
  const isHomeowner = !!userProfile && !contractorProfile

  const user = isContractor ? contractorUser : homeownerUser
  const profile = isContractor ? contractorProfile : userProfile
  const signOut = isContractor ? contractorSignOut : homeownerSignOut

  useEffect(() => {
    if (!showDropdown) return

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDropdown(false)
      }
    }

    // Use setTimeout to avoid immediate closure on the same click
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showDropdown])

  if (!user) {
    return null
  }

  const displayName = profile?.name || user.email?.split('@')[0] || 'User'
  const roleLabel = isContractor ? 'Contractor' : 'Homeowner'
  const roleCls = isContractor
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'

  // Get dashboard URL based on role
  const getDashboardUrl = () => {
    return isContractor ? '/dashboard/contractor' : '/dashboard/homeowner'
  }

  // Check if user is admin
  const isAdmin = isAdminUser(userProfile?.email, userProfile?.role)

  const menuItems = [
    {
      icon: DashboardIcon,
      label: 'Dashboard',
      href: getDashboardUrl(),
    },
    {
      icon: MessageIcon,
      label: 'Messages',
      href: isContractor ? '/dashboard/contractor/messages' : '/dashboard/homeowner/messages',
      badge: 0, // TODO: Implement unread count
    },
    {
      icon: UserIcon,
      label: isContractor ? 'Account Settings' : 'Profile Settings',
      href: isContractor ? '/dashboard/contractor/settings' : '/profile/settings',
    },
    // Admin panel link (only show for admins)
    ...(isAdmin ? [{
      icon: SettingsIcon, // You can change this to a Shield icon if you import it
      label: '⚡ Admin Panel',
      href: '/dashboard/admin',
    }] : []),
  ]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 transition-colors"
        aria-haspopup="menu"
        aria-expanded={showDropdown}
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-white text-sm font-semibold overflow-hidden">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={`${displayName}'s avatar`}
              className="w-full h-full object-cover"
            />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>

        <div className="flex flex-col items-start min-w-0">
          <span className="text-sm font-medium truncate max-w-[120px]">{displayName}</span>
          <div className="flex items-center gap-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleCls}`}>
              {roleLabel}
            </span>
            {profile?.subscription_type === 'pro' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold">
                ⚡ PRO
              </span>
            )}
          </div>
        </div>

        <ChevronDown className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
          {/* User info header */}
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-white font-semibold overflow-hidden">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={`${displayName}'s avatar`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  displayName.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{displayName}</p>
                  {profile?.subscription_type === 'pro' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold">
                      PRO
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{user.email}</p>
                <p className="text-xs text-slate-500 dark:text-slate-500 capitalize">
                  {profile?.subscription_type || 'free'} • {roleLabel}
                </p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-2">
            {menuItems.map((item, index) => (
              <Link
                key={index}
                href={item.href}
                onClick={() => setShowDropdown(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <item.icon className="text-slate-500 dark:text-slate-400" />
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full min-w-[20px] text-center">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>

          {/* Sign out */}
          <div className="border-t border-slate-200 dark:border-slate-700 py-2">
            <button
              onClick={async () => {
                setShowDropdown(false)
                // Show toaster BEFORE signout (signOut will redirect immediately)
                // showGlobalToast('Successfully logged out', 'success')
                signOut()
                setShowDropdown(false)
                router.refresh()
                // signOut handles redirect to appropriate page (contractor vs homeowner)
              }}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogoutIcon />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}