/**
 * iOS 26 Design System Components
 *
 * This module exports all iOS 26 "Liquid Glass" design components
 * with animations, glass morphism effects, and consistent sizing.
 *
 * Usage:
 * import { PageWrapper, AnimatedCard, AnimatedButton } from '@/components/ios26'
 */

// Page wrapper with consistent sizing and animations
export { default as PageWrapper, AnimatedSection, AnimatedList, AnimatedListItem } from '../PageWrapper'

// Animated interactive components
export {
  AnimatedButton,
  AnimatedLinkButton,
  AnimatedCard,
  AnimatedBadge,
  AnimatedIconButton,
  AnimatedContainer,
  AnimatedItem,
  AnimatedBackdrop
} from '../AnimatedComponents'
