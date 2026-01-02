'use client'

import { motion, AnimatePresence } from 'motion/react'
import { ReactNode } from 'react'

interface PageWrapperProps {
  children: ReactNode
  className?: string
  /** Enable glass morphism effect for iOS 26 style */
  glass?: boolean
  /** Remove default padding (for fullscreen pages like maps) */
  noPadding?: boolean
  /** Remove safe area padding (for pages that handle it themselves) */
  noSafeArea?: boolean
  /** Custom max width - defaults to max-w-7xl */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full' | 'none'
  /** Animation variant */
  animation?: 'fade' | 'slide-up' | 'slide-left' | 'scale' | 'none'
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
  none: '',
}

const animations = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: 'easeOut' }
  },
  'slide-up': {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }
  },
  'slide-left': {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98 },
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }
  },
  none: {
    initial: {},
    animate: {},
    exit: {},
    transition: { duration: 0 }
  }
}

/**
 * PageWrapper - iOS 26 friendly page container with consistent sizing and animations
 *
 * Features:
 * - Consistent padding across all pages (px-4 sm:px-6 lg:px-8)
 * - iOS safe area support
 * - Glass morphism effect option
 * - Smooth page transitions with Framer Motion
 * - Standardized max-width
 */
export default function PageWrapper({
  children,
  className = '',
  glass = false,
  noPadding = false,
  noSafeArea = false,
  maxWidth = '7xl',
  animation = 'fade'
}: PageWrapperProps) {
  const animationConfig = animations[animation]

  const containerClasses = [
    'min-h-screen',
    // Safe area padding for iOS
    !noSafeArea && 'pt-safe pb-safe',
    // Glass morphism effect
    glass && 'ios-glass',
    className
  ].filter(Boolean).join(' ')

  const innerClasses = [
    'mx-auto w-full',
    maxWidthClasses[maxWidth],
    // Standard padding unless disabled
    !noPadding && 'px-4 sm:px-6 lg:px-8 py-6 sm:py-8',
  ].filter(Boolean).join(' ')

  return (
    <motion.div
      className={containerClasses}
      initial={animationConfig.initial}
      animate={animationConfig.animate}
      exit={animationConfig.exit}
      transition={animationConfig.transition}
    >
      <div className={innerClasses}>
        {children}
      </div>
    </motion.div>
  )
}

/**
 * AnimatedSection - For staggered animations within a page
 */
export function AnimatedSection({
  children,
  className = '',
  delay = 0,
  animation = 'slide-up'
}: {
  children: ReactNode
  className?: string
  delay?: number
  animation?: 'fade' | 'slide-up' | 'slide-left' | 'scale'
}) {
  const animationConfig = animations[animation]

  return (
    <motion.section
      className={className}
      initial={animationConfig.initial}
      animate={animationConfig.animate}
      transition={{
        ...animationConfig.transition,
        delay
      }}
    >
      {children}
    </motion.section>
  )
}

/**
 * AnimatedList - For staggered list item animations
 */
export function AnimatedList({
  children,
  className = '',
  staggerDelay = 0.05
}: {
  children: ReactNode
  className?: string
  staggerDelay?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay
          }
        }
      }}
    >
      {children}
    </motion.div>
  )
}

/**
 * AnimatedListItem - Individual items in an AnimatedList
 */
export function AnimatedListItem({
  children,
  className = ''
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.3,
            ease: [0.25, 0.46, 0.45, 0.94]
          }
        }
      }}
    >
      {children}
    </motion.div>
  )
}
