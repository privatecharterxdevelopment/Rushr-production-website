// app/auth/callback/page.tsx
export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import AuthCallbackClient from './page.client'
import LoadingSpinner from '../../../components/LoadingSpinner'

export default function Page() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" text="Authenticating..." />}>
      <AuthCallbackClient />
    </Suspense>
  )
}
