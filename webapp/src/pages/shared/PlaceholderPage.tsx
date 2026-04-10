/**
 * Reusable placeholder for modules not yet built. Shows the module name, the step
 * number it arrives in, and the BBA logo.
 */

import { EmptyState } from '@/components/common/EmptyState';
import { Logo } from '@/components/common/Logo';

interface PlaceholderPageProps {
  title: string;
  step: number;
  description?: string;
}

export function PlaceholderPage({ title, step, description }: PlaceholderPageProps) {
  return (
    <EmptyState
      icon={<Logo size="lg" className="opacity-30" />}
      title={title}
      description={description ?? `Coming in Step ${step}. This module is part of the build plan.`}
    />
  );
}
