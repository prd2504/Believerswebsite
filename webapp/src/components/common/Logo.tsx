/**
 * BBA brand logo — renders the official logo SVG. Supports three sizes for
 * different contexts (nav bar, login page, full-page loader).
 */

import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-20',
} as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  className?: string;
}

export function Logo({ size = 'md', className }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      alt="BBA Sports"
      className={cn('object-contain select-none', SIZES[size], className)}
    />
  );
}
