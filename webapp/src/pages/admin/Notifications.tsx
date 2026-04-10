/**
 * Admin notifications page — broadcast messages and notification management.
 * WhatsApp delivery is gated by VITE_WHATSAPP_LIVE feature flag.
 */

import { Bell } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

export default function NotificationsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-brand-secondary">Notifications</h1>
        <p className="text-sm text-gray-500">Broadcasts, push notifications, and WhatsApp messaging</p>
      </div>

      <EmptyState
        icon={<Bell size={48} />}
        title="Coming soon"
        description="Broadcast messaging, push notifications, and WhatsApp integration will be available in an upcoming update."
      />
    </div>
  );
}
