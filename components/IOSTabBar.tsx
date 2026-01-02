// components/IOSTabBar.tsx
// iOS app bottom tab navigation - Native feel with haptics
'use client'

import React, { useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export type TabId = 'home' | 'jobs' | 'messages' | 'notifications' | 'profile'

interface IOSTabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  unreadMessages?: number
  unreadNotifications?: number
}

// Haptic feedback helper
const triggerHaptic = async () => {
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch (e) {
    // Haptics not available (web)
  }
}

export default function IOSTabBar({
  activeTab,
  onTabChange,
  unreadMessages = 0,
  unreadNotifications = 0
}: IOSTabBarProps) {
  const tabs: { id: TabId; label: string; icon: (active: boolean) => React.ReactNode }[] = [
    {
      id: 'home',
      label: 'Home',
      icon: (active) => (
        <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5} d={active
            ? "M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"
            : "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"} />
        </svg>
      )
    },
    {
      id: 'jobs',
      label: 'Jobs',
      icon: (active) => (
        <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5} d={active
            ? "M20 6h-3V4c0-1.103-.897-2-2-2H9c-1.103 0-2 .897-2 2v2H4c-1.103 0-2 .897-2 2v11c0 1.103.897 2 2 2h16c1.103 0 2-.897 2-2V8c0-1.103-.897-2-2-2zM9 4h6v2H9V4zm5 10h-4v-2h4v2z"
            : "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"} />
        </svg>
      )
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: (active) => (
        <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5} d={active
            ? "M20 2H4c-1.103 0-2 .897-2 2v18l5.333-4H20c1.103 0 2-.897 2-2V4c0-1.103-.897-2-2-2zm-3 9H7V9h10v2zm0-4H7V5h10v2z"
            : "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"} />
        </svg>
      )
    },
    {
      id: 'notifications',
      label: 'Alerts',
      icon: (active) => (
        <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5} d={active
            ? "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
            : "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"} />
        </svg>
      )
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: (active) => (
        <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5} d={active
            ? "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
            : "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"} />
        </svg>
      )
    }
  ]

  const handleTabPress = async (tabId: TabId) => {
    if (tabId !== activeTab) {
      await triggerHaptic()
      onTabChange(tabId)
    }
  }

  return (
    <div
      className="fixed left-0 right-0 z-50 bg-white/95 backdrop-blur-lg"
      style={{
        bottom: '1px',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 -1px 10px rgba(0,0,0,0.03)'
      }}
    >
      <div className="flex items-center justify-around pt-2 pb-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const badge = tab.id === 'messages' ? unreadMessages : tab.id === 'notifications' ? unreadNotifications : 0

          return (
            <button
              key={tab.id}
              onClick={() => handleTabPress(tab.id)}
              className="flex flex-col items-center justify-center min-w-[64px] py-1.5 relative active:opacity-60 transition-opacity"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="relative">
                <div
                  className={`transition-colors duration-200 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}
                  style={{ transform: isActive ? 'scale(1.05)' : 'scale(1)', transition: 'transform 0.15s ease' }}
                >
                  {tab.icon(isActive)}
                </div>
                {badge > 0 && (
                  <div className="absolute -top-1 -right-2 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center px-1">
                    <span className="text-white text-[10px] font-semibold">{badge > 99 ? '99+' : badge}</span>
                  </div>
                )}
              </div>
              <span
                className={`text-[10px] mt-0.5 font-medium transition-colors duration-200 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
