// components/IOSContractorTabBar.tsx
// iOS contractor app bottom tab navigation - Blue theme with haptics
'use client'

import React from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export type ContractorTabId = 'home' | 'jobs' | 'messages' | 'earnings' | 'profile'

interface IOSContractorTabBarProps {
  activeTab: ContractorTabId
  onTabChange: (tab: ContractorTabId) => void
  unreadMessages?: number
  newJobs?: number
}

// Haptic feedback helper
const triggerHaptic = async () => {
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch (e) {
    // Haptics not available (web)
  }
}

export default function IOSContractorTabBar({
  activeTab,
  onTabChange,
  unreadMessages = 0,
  newJobs = 0
}: IOSContractorTabBarProps) {
  const tabs: { id: ContractorTabId; label: string; icon: (active: boolean) => React.ReactNode }[] = [
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
      label: 'Find Jobs',
      icon: (active) => (
        <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5} d={active
            ? "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            : "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"} />
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
      id: 'earnings',
      label: 'Earnings',
      icon: (active) => (
        <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5} d={active
            ? "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            : "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} />
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

  const handleTabPress = async (tabId: ContractorTabId) => {
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
          const badge = tab.id === 'messages' ? unreadMessages : tab.id === 'jobs' ? newJobs : 0

          return (
            <button
              key={tab.id}
              onClick={() => handleTabPress(tab.id)}
              className="flex flex-col items-center justify-center min-w-[64px] py-1.5 relative active:opacity-60 transition-opacity"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="relative">
                <div
                  className={`transition-colors duration-200 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}
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
                className={`text-[10px] mt-0.5 font-medium transition-colors duration-200 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}
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
