/**
 * Student/Parent profile page — view and edit basic profile info.
 */

import { useState } from 'react';
import { User, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { updateUserProfile } from '@/services/userService';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      await updateUserProfile(profile.id, { name: name.trim(), phone: phone.trim() });
      await refreshProfile();
      toast.success('Profile updated');
      setEditing(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold text-brand-secondary">My Profile</h1>

      <div className="card">
        {/* Avatar placeholder */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-surface">
            <User size={24} className="text-gray-400" />
          </div>
          <div>
            <p className="font-semibold text-brand-secondary">{profile?.name ?? '—'}</p>
            <p className="text-xs text-gray-400">{profile?.email ?? profile?.phone ?? ''}</p>
            <span className="rounded-full bg-brand-primary-light px-2 py-0.5 text-[10px] font-medium text-brand-primary">
              {profile?.role}
            </span>
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="label">Display name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                disabled={saving}
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input"
                placeholder="+91 98765 43210"
                disabled={saving}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                <Save size={14} /> {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} disabled={saving} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="text-brand-secondary">{profile?.name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="text-brand-secondary">{profile?.email ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Phone</span>
              <span className="text-brand-secondary">{profile?.phone ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Role</span>
              <span className="text-brand-secondary">{profile?.role}</span>
            </div>
            <button onClick={() => setEditing(true)} className="btn-secondary mt-3 w-full">
              Edit Profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
