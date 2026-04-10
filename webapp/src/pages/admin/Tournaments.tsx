/**
 * Admin tournaments page — manage tournaments, registrations, and results.
 * Full CRUD will be expanded in a later step; this provides the functional shell.
 */

import { Trophy } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

export default function TournamentsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-brand-secondary">Tournaments</h1>
        <p className="text-sm text-gray-500">Manage tournaments, brackets, and results</p>
      </div>

      <EmptyState
        icon={<Trophy size={48} />}
        title="Coming soon"
        description="Tournament management with registrations, brackets, and result tracking will be available in an upcoming update."
      />
    </div>
  );
}
