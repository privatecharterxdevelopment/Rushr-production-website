'use client';
export const dynamic = 'force-dynamic';

import React, { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProAuth } from '../../../contexts/ProAuthContext';
import LoadingSpinner from '../../../components/LoadingSpinner';

/** Wrapper to satisfy Next 14 requirement: useSearchParams must be inside Suspense */
export default function Page() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg"  color="blue" />}>
      <ClientInner />
    </Suspense>
  );
}

/* ====================== Page ====================== */
function ClientInner() {
  const router = useRouter()
  const { loading: authLoading } = useProAuth()

  // Redirect to wizard immediately
  useEffect(() => {
    if (!authLoading) {
      router.replace('/pro/wizard')
    }
  }, [authLoading, router])

  /* ====================== Render ====================== */
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner size="lg"  color="blue" />
    </div>
  )
}