/**
 * Student tournaments page — view upcoming tournaments and past results.
 */

import { Trophy } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

export default function StudentTournaments() {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">Tournaments</h1>

      <EmptyState
        icon={<Trophy size={48} />}
        title="Coming soon"
        description="Tournament registrations, brackets, and results will be available in an upcoming update."
      />
    </div>
  );
}
