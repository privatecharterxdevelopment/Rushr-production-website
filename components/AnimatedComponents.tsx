'use client'

import { motion, HTMLMotionProps } from 'motion/react'
import { ReactNode, forwardRef } from 'react'
import Link from 'next/link'

// ============================================================================
// ANIMATED BUTTON
// ============================================================================

interface AnimatedButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
}

const buttonVariants = {
  primary: 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent',
  secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-transparent dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white',
  outline: 'bg-transparent hover:bg-slate-50 text-slate-700 border-slate-300 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-800',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 border-transparent dark:text-slate-200 dark:hover:bg-slate-800',
  danger: 'bg-red-600 hover:bg-red-700 text-white border-transparent',
}

const buttonSizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
}

export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  function AnimatedButton(
    {
      children,
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconPosition = 'left',
      className = '',
      disabled,
      ...props
    },
    ref
  ) {
    return (
      <motion.button
        ref={ref}
        className={`
          inline-flex items-center justify-center gap-2 font-medium border transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
          ${buttonVariants[variant]}
          ${buttonSizes[size]}
          ${className}
        `}
        whileHover={{ scale: disabled ? 1 : 1.02 }}
        whileTap={{ scale: disabled ? 1 : 0.98 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <motion.span
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        ) : (
          <>
            {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
            {children}
            {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
          </>
        )}
      </motion.button>
    )
  }
)

// ============================================================================
// ANIMATED LINK BUTTON
// ============================================================================

interface AnimatedLinkButtonProps {
  href: string
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  className?: string
  external?: boolean
}

export function AnimatedLinkButton({
  href,
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  className = '',
  external = false,
}: AnimatedLinkButtonProps) {
  const content = (
    <motion.span
      className={`
        inline-flex items-center justify-center gap-2 font-medium border transition-colors
        ${buttonVariants[variant]}
        ${buttonSizes[size]}
        ${className}
      `}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
      {children}
      {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
    </motion.span>
  )

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    )
  }

  return <Link href={href}>{content}</Link>
}

// ============================================================================
// ANIMATED CARD
// ============================================================================

interface AnimatedCardProps extends HTMLMotionProps<'div'> {
  children: ReactNode
  variant?: 'default' | 'glass' | 'elevated' | 'bordered'
  hover?: 'none' | 'lift' | 'glow' | 'scale'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const cardVariants = {
  default: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800',
  glass: 'ios-glass border border-white/20',
  elevated: 'bg-white dark:bg-slate-900 shadow-lg border border-slate-100 dark:border-slate-800',
  bordered: 'bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700',
}

const cardPaddings = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-6',
  lg: 'p-6 sm:p-8',
}

const cardHoverEffects = {
  none: {},
  lift: {
    whileHover: { y: -4, boxShadow: '0 10px 40px -10px rgba(0,0,0,0.15)' },
    transition: { duration: 0.2 }
  },
  glow: {
    whileHover: { boxShadow: '0 0 30px rgba(16, 185, 129, 0.15)' },
    transition: { duration: 0.2 }
  },
  scale: {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
    transition: { duration: 0.15 }
  },
}

export function AnimatedCard({
  children,
  variant = 'default',
  hover = 'lift',
  padding = 'md',
  className = '',
  ...props
}: AnimatedCardProps) {
  const hoverEffect = cardHoverEffects[hover]

  return (
    <motion.div
      className={`
        rounded-2xl transition-colors
        ${cardVariants[variant]}
        ${cardPaddings[padding]}
        ${className}
      `}
      {...hoverEffect}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// ============================================================================
// ANIMATED BADGE
// ============================================================================

interface AnimatedBadgeProps {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md'
  pulse?: boolean
  className?: string
}

const badgeVariants = {
  default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

const badgeSizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
}

export function AnimatedBadge({
  children,
  variant = 'default',
  size = 'sm',
  pulse = false,
  className = '',
}: AnimatedBadgeProps) {
  return (
    <motion.span
      className={`
        inline-flex items-center font-medium rounded-full
        ${badgeVariants[variant]}
        ${badgeSizes[size]}
        ${className}
      `}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {pulse && (
        <motion.span
          className="w-2 h-2 rounded-full bg-current mr-1.5"
          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      {children}
    </motion.span>
  )
}

// ============================================================================
// ANIMATED ICON BUTTON
// ============================================================================

interface AnimatedIconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  icon: ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'ghost' | 'outline'
  label?: string
}

const iconButtonSizes = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
}

const iconButtonVariants = {
  default: 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700',
  ghost: 'hover:bg-slate-100 dark:hover:bg-slate-800',
  outline: 'border border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800',
}

export function AnimatedIconButton({
  icon,
  size = 'md',
  variant = 'default',
  label,
  className = '',
  ...props
}: AnimatedIconButtonProps) {
  return (
    <motion.button
      className={`
        inline-flex items-center justify-center rounded-xl transition-colors
        ${iconButtonSizes[size]}
        ${iconButtonVariants[variant]}
        ${className}
      `}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15 }}
      aria-label={label}
      {...props}
    >
      {icon}
    </motion.button>
  )
}

// ============================================================================
// ANIMATED CONTAINER (for stagger effects)
// ============================================================================

interface AnimatedContainerProps {
  children: ReactNode
  className?: string
  stagger?: number
  delay?: number
}

export function AnimatedContainer({
  children,
  className = '',
  stagger = 0.05,
  delay = 0,
}: AnimatedContainerProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            delay,
            staggerChildren: stagger,
          },
        },
      }}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedItem({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 15 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.4,
            ease: [0.25, 0.46, 0.45, 0.94],
          },
        },
      }}
    >
      {children}
    </motion.div>
  )
}

// ============================================================================
// ANIMATED MODAL BACKDROP
// ============================================================================

interface AnimatedBackdropProps {
  isOpen: boolean
  onClose?: () => void
  children: ReactNode
  className?: string
}

export function AnimatedBackdrop({
  isOpen,
  onClose,
  children,
  className = '',
}: AnimatedBackdropProps) {
  if (!isOpen) return null

  return (
    <motion.div
      className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      {/* Content */}
      <motion.div
        className="relative z-10"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
