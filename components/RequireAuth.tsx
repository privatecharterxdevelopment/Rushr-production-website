// components/RequireAuth.tsx
'use client'
import { useEffect } from 'react'
import { useApp } from '@/lib/state'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { state, openAuth } = useApp()
  const isSignedIn = state?.user?.signedIn ?? false
  useEffect(() => { if (!isSignedIn) openAuth() }, [isSignedIn, openAuth])
  if (!isSignedIn) return null
  return <>{children}</>
}
