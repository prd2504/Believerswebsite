/**
 * Admin settings page — system configuration, feature flags overview.
 */

import { Settings, Flag, Shield, Users } from 'lucide-react';
import { env } from '@/lib/env';

export default function SettingsPage() {
  const razorpayLive = env.flags.razorpayLive;
  const whatsappLive = env.flags.whatsappLive;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-brand-secondary">Settings</h1>
        <p className="text-sm text-gray-500">System configuration and feature flags</p>
      </div>

      {/* Feature flags */}
      <div className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-secondary">
          <Flag size={14} /> Feature Flags
        </h2>
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-brand-secondary">Razorpay Payments</p>
              <p className="text-xs text-gray-400">Online payment collection via Razorpay</p>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              razorpayLive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {razorpayLive ? 'LIVE' : 'OFF'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-brand-secondary">WhatsApp Notifications</p>
              <p className="text-xs text-gray-400">Send notifications via WhatsApp Business API</p>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              whatsappLive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {whatsappLive ? 'LIVE' : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* Info sections */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-secondary">
            <Shield size={14} /> Security
          </h3>
          <p className="text-xs text-gray-500">
            Firestore security rules enforce role-based access. Only SUPER_ADMIN and CENTRE_MANAGER
            can modify centres, batches, and student records. Coaches have read access plus
            attendance/progress write access.
          </p>
        </div>
        <div className="card">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-secondary">
            <Users size={14} /> User Management
          </h3>
          <p className="text-xs text-gray-500">
            User roles are managed in the Firebase Console under the /users collection. To promote
            a user, update their <code className="rounded bg-gray-100 px-1">role</code> field to
            SUPER_ADMIN, CENTRE_MANAGER, COACH, STUDENT, or PARENT.
          </p>
        </div>
      </div>
    </div>
  );
}
