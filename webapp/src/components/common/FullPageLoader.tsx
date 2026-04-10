/**
 * Full-page loading screen used while the auth state is being resolved or a role is
 * being checked. Uses a shimmer skeleton (not a spinner) to match the design brief.
 */

import { Logo } from './Logo';

export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-background p-6">
      <Logo size="lg" />
      <div className="mt-8 w-64 space-y-3">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-4 w-2/3" />
      </div>
      <p className="mt-6 text-sm text-gray-500">{label}</p>
    </div>
  );
}
