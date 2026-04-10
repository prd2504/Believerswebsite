/**
 * Reusable loading skeletons. These replace spinners across the app as per the design
 * spec. Each variant matches a common page shape (card grid, table rows, detail page).
 */

import { cn } from '@/lib/cn';

function Bar({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 rounded', className)} />;
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <Bar className="h-5 w-3/4" />
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-5/6" />
          <Bar className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4">
        <Bar className="h-5 w-1/4" />
        <Bar className="h-5 w-1/4" />
        <Bar className="h-5 w-1/4" />
        <Bar className="h-5 w-1/4" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Bar className="h-4 w-1/4" />
          <Bar className="h-4 w-1/4" />
          <Bar className="h-4 w-1/4" />
          <Bar className="h-4 w-1/4" />
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Bar className="h-6 w-1/3" />
      <Bar className="h-4 w-full" />
      <Bar className="h-4 w-5/6" />
      <Bar className="h-4 w-2/3" />
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Bar className="h-10" />
        <Bar className="h-10" />
      </div>
    </div>
  );
}
