'use client'

import React from 'react'
import { usePathname } from 'next/navigation'

export default function LogoWordmark({ className = '', variant = 'header' }: { className?: string, variant?: 'header' | 'footer' }) {
  const pathname = usePathname()
  const [isProHost, setIsProHost] = React.useState(false)

  React.useEffect(() => {
    try {
      const host = window.location.hostname.toLowerCase()
      setIsProHost(host === 'pro.localhost' || host.startsWith('pro.'))
    } catch {}
  }, [])

  // Homeowner-specific pages should always show homeowner logo
  const isHomeownerPage = pathname?.startsWith('/profile') ||
                         pathname?.startsWith('/dashboard/homeowner') ||
                         pathname?.startsWith('/messages') ||
                         pathname?.startsWith('/post-job') ||
                         pathname?.startsWith('/jobs') ||
                         pathname?.startsWith('/settings')

  const isPro = (pathname?.startsWith('/pro') || pathname?.startsWith('/dashboard/contractor') || isProHost) && !isHomeownerPage

  // Choose logo based on variant (header/footer) and user type (pro/homeowner)
  let src: string
  if (isPro) {
    // Contractors keep their existing logos
    src = variant === 'footer' ? '/rushr-contractor-footer.jpeg' : '/rushr-contractor-header.jpeg'
  } else {
    // Homeowners get the new vector SVG logo
    src = 'https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg'
  }

  const alt = isPro ? 'Rushr — for pros' : 'Rushr'

  // Different sizes for header vs footer - smaller for better mobile fit
  // Contractor logos are larger images so need smaller height
  const heightClass = variant === 'footer'
    ? (isPro ? 'h-6' : 'h-8')  // Contractor footer smaller
    : (isPro ? 'h-8' : 'h-10') // Contractor header smaller

  return (
    <img
      src={src}
      alt={alt}
      className={`block ${heightClass} w-auto select-none ${className}`}
      // small visual padding to soften any edge rounding
      style={{ paddingRight: 2 }}
      draggable={false}
    />
  )
}
