/**
 * BBA brand logo placeholder. Renders the text "BBA" in brand orange until a real logo
 * asset is provided. Supports three sizes for different contexts (nav bar, login page,
 * full-page loader).
 */

import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-14 w-14 text-xl',
} as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  className?: string;
}

export function Logo({ size = 'md', className }: LogoProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-xl bg-brand-primary font-bold text-white select-none',
        SIZES[size],
        className,
      )}
    >
      BBA
    </div>
  );
}
