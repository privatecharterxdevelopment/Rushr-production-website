'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastContextType {
  showToast: (message: string, type: ToastType, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

// Global toast function that can be called from anywhere
let globalShowToast: ((message: string, type: ToastType, duration?: number) => void) | null = null

export function showGlobalToast(message: string, type: ToastType, duration?: number) {
  if (globalShowToast) {
    globalShowToast(message, type, duration)
  }
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

function ToastItem({ toast, onRemove, isNative }: { toast: Toast; onRemove: (id: string) => void; isNative: boolean }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    // Animate in
    const timer = setTimeout(() => setIsVisible(true), 10)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const duration = toast.duration || 3000
    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => onRemove(toast.id), 300) // Wait for exit animation
    }, duration)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onRemove])

  // iOS Native style - white background, colored icon
  if (isNative) {
    const iconColor = {
      success: 'text-emerald-500',
      error: 'text-red-500',
      info: 'text-blue-500'
    }[toast.type]

    const icon = {
      success: (
        <div className={`w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center`}>
          <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ),
      error: (
        <div className={`w-8 h-8 rounded-full bg-red-100 flex items-center justify-center`}>
          <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      ),
      info: (
        <div className={`w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center`}>
          <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      )
    }[toast.type]

    return (
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl bg-white shadow-xl border border-gray-100 transition-all duration-300 ease-out ${
          isVisible && !isExiting
            ? 'opacity-100 translate-y-0'
            : isExiting
            ? 'opacity-0 -translate-y-4'
            : 'opacity-0 -translate-y-4'
        }`}
        style={{
          boxShadow: '0 4px 20px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)'
        }}
      >
        <div className="flex-shrink-0">
          {icon}
        </div>
        <p className="text-gray-900 font-medium text-[15px] flex-1">{toast.message}</p>
        <button
          onClick={() => {
            setIsExiting(true)
            setTimeout(() => onRemove(toast.id), 300)
          }}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors p-1"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  // Web style - colored background (original)
  const bgColor = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  }[toast.type]

  const icon = {
    success: (
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }[toast.type]

  return (
    <div
      className={`flex items-center gap-3 p-4 rounded-lg shadow-lg transition-all duration-300 ease-out ${bgColor} ${
        isVisible && !isExiting
          ? 'opacity-100 translate-x-0'
          : isExiting
          ? 'opacity-0 translate-x-full'
          : 'opacity-0 translate-x-full'
      }`}
    >
      <div className="flex-shrink-0">
        {icon}
      </div>
      <p className="text-white font-medium text-sm">{toast.message}</p>
      <button
        onClick={() => {
          setIsExiting(true)
          setTimeout(() => onRemove(toast.id), 300)
        }}
        className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
        aria-label="Close"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [mounted, setMounted] = useState(false)
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsNative(Capacitor.isNativePlatform())
  }, [])

  const showToast = (message: string, type: ToastType, duration = 3000) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast: Toast = { id, message, type, duration }
    setToasts(prev => [...prev, newToast])
  }

  // Set global function when provider mounts
  useEffect(() => {
    globalShowToast = showToast
    return () => {
      globalShowToast = null
    }
  }, [])

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  if (!mounted) return <>{children}</>

  // iOS Native - centered at top with safe area
  const containerStyles = isNative
    ? 'fixed left-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none'
    : 'fixed top-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none'

  const containerPosition = isNative
    ? { top: 'calc(env(safe-area-inset-top, 44px) + 8px)' }
    : {}

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {mounted && createPortal(
        <div className={containerStyles} style={containerPosition}>
          {toasts.map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <ToastItem toast={toast} onRemove={removeToast} isNative={isNative} />
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}
