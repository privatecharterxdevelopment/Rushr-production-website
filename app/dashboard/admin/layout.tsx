'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import {
  Users,
  UserCheck,
  MessageSquare,
  Settings,
  BarChart3,
  Shield,
  Menu,
  X,
  DollarSign,
  Briefcase,
  AlertTriangle,
} from 'lucide-react'

// Allowed admin email addresses
const ADMIN_EMAILS = [
  'jake@spgrp.com',
  'zac@spgrp.com',
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isLocalhost, setIsLocalhost] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const checkAccess = async () => {
      // Check hostname
      const hostname = window.location.hostname
      const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('localhost')
      setIsLocalhost(isLocal)

      // If localhost, allow access immediately
      if (isLocal) {
        setIsAdmin(true)
        setLoading(false)
        return
      }

      // In production, check if user is logged in and is an admin
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email) {
          setUserEmail(user.email)
          const hasAdminAccess = ADMIN_EMAILS.includes(user.email.toLowerCase())
          setIsAdmin(hasAdminAccess)
        }
      } catch (err) {
        console.error('Error checking admin access:', err)
      }
      setLoading(false)
    }

    checkAccess()
  }, [])

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Deny access if not admin (and not localhost)
  if (!isLocalhost && !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md border">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold">Access Denied</h1>
          </div>
          <p className="text-gray-600">Admin access required.</p>
          {userEmail && (
            <p className="text-sm text-gray-500 mt-2">Logged in as: {userEmail}</p>
          )}
          <Link href="/" className="mt-6 inline-block bg-blue-600 text-white px-4 py-2 rounded-md">
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  const navigation = [
    {
      name: 'Overview',
      href: '/dashboard/admin',
      icon: BarChart3,
      exact: true,
    },
    {
      name: 'Contractor Approvals',
      href: '/dashboard/admin/contractors',
      icon: UserCheck,
      badge: 'pending',
    },
    {
      name: 'All Contractors',
      href: '/dashboard/admin/contractors/all',
      icon: Users,
    },
    {
      name: 'Homeowners',
      href: '/dashboard/admin/homeowners',
      icon: Users,
    },
    {
      name: 'KYC Verification',
      href: '/dashboard/admin/kyc',
      icon: Shield,
    },
    {
      name: 'Jobs',
      href: '/dashboard/admin/jobs',
      icon: Briefcase,
    },
    {
      name: 'Disputes',
      href: '/dashboard/admin/disputes',
      icon: AlertTriangle,
      badge: 'open',
    },
    {
      name: 'Payments & Escrow',
      href: '/dashboard/admin/payments',
      icon: DollarSign,
    },
    {
      name: 'Support Tickets',
      href: '/dashboard/admin/support',
      icon: MessageSquare,
      badge: 'new',
    },
    {
      name: 'Contact Submissions',
      href: '/dashboard/admin/contact-submissions',
      icon: MessageSquare,
    },
    {
      name: 'Settings',
      href: '/dashboard/admin/settings',
      icon: Settings,
    },
  ]

  const isActive = (item: typeof navigation[0]) => {
    if (item.exact) {
      return pathname === item.href
    }
    return pathname?.startsWith(item.href)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Admin Panel</h1>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon
            const active = isActive(item)
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1">{item.name}</span>
                {item.badge && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                    id={`badge-${item.badge}`}
                  >
                    •
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-slate-800">
          <div className="text-xs text-gray-500 dark:text-slate-400">
            <div className="font-medium text-gray-700 dark:text-slate-300">Admin</div>
            <div className="truncate">localhost</div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile menu button - floating */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-4 left-4 z-30 lg:hidden bg-white dark:bg-slate-900 p-2 rounded-lg shadow-lg border border-gray-200 dark:border-slate-800 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <Menu className="h-6 w-6" />
        </button>

        {/* Page content */}
        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
