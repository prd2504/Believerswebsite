/**
 * Admin notifications page — send broadcasts, view broadcast history.
 */

import { useState, useEffect, useCallback } from 'react';
import { Bell, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAllBroadcasts, createBroadcast } from '@/services/notificationService';
import { getAllCentres } from '@/services/centreService';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { env } from '@/lib/env';
import type { BroadcastDocument, CentreDocument } from '@bba/shared';

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [broadcasts, setBroadcasts] = useState<BroadcastDocument[]>([]);
  const [centres, setCentres] = useState<CentreDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetAll, setTargetAll] = useState(true);
  const [targetCentreIds, setTargetCentreIds] = useState<string[]>([]);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [sendPush, setSendPush] = useState(false);

  const whatsappLive = env.flags.whatsappLive;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [bData, cData] = await Promise.all([getAllBroadcasts(), getAllCentres()]);
      setBroadcasts(bData);
      setCentres(cData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSend() {
    if (!profile || !title.trim() || !body.trim()) {
      toast.error('Title and message are required');
      return;
    }
    setSending(true);
    try {
      await createBroadcast({
        title: title.trim(),
        body: body.trim(),
        targetCentreIds: targetAll ? 'ALL' : targetCentreIds,
        targetRoles: null,
        sendWhatsApp: whatsappLive && sendWhatsApp,
        sendPush,
      }, profile.id);
      toast.success('Broadcast created — fan-out will run shortly');
      setTitle(''); setBody(''); setShowForm(false);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Failed to send broadcast');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-secondary">Notifications</h1>
          <p className="text-sm text-gray-500">Broadcasts and in-app notifications</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus size={16} /> New Broadcast
        </button>
      </div>

      {/* Compose form */}
      {showForm && (
        <div className="card mb-6">
          <h2 className="mb-4 text-sm font-semibold text-brand-secondary">Compose Broadcast</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Important announcement" disabled={sending} />
            </div>
            <div>
              <label className="label">Message</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="input" placeholder="Your message here…" disabled={sending} />
            </div>

            {/* Target */}
            <div>
              <label className="label">Recipients</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={targetAll} onChange={() => setTargetAll(true)} disabled={sending} />
                  All centres
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={!targetAll} onChange={() => setTargetAll(false)} disabled={sending} />
                  Specific centres
                </label>
              </div>
              {!targetAll && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {centres.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={targetCentreIds.includes(c.id)}
                        onChange={(e) => {
                          setTargetCentreIds(prev =>
                            e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                          );
                        }}
                        disabled={sending}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Channels */}
            <div>
              <label className="label">Delivery channels</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked disabled />
                  In-app (always)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} disabled={sending} />
                  Push
                </label>
                <label className={`flex items-center gap-2 text-sm ${whatsappLive ? 'text-gray-600' : 'text-gray-400'}`}>
                  <input type="checkbox" checked={sendWhatsApp} onChange={(e) => setSendWhatsApp(e.target.checked)} disabled={sending || !whatsappLive} />
                  WhatsApp {!whatsappLive && <span className="text-[10px] text-gray-400">(flag OFF)</span>}
                </label>
              </div>
            </div>

            <div className="flex gap-3 border-t border-gray-100 pt-3">
              <button onClick={handleSend} disabled={sending} className="btn-primary">
                <Send size={14} /> {sending ? 'Sending…' : 'Send Broadcast'}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary" disabled={sending}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast history */}
      <h2 className="mb-3 text-sm font-semibold text-brand-secondary">Broadcast History</h2>
      {loading ? <CardSkeleton count={3} /> : broadcasts.length === 0 ? (
        <EmptyState icon={<Bell size={48} />} title="No broadcasts yet" description="Send your first broadcast message to students and parents." />
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b) => (
            <div key={b.id} className="card">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-brand-secondary">{b.title}</span>
                <div className="flex gap-1 text-[10px] text-gray-400">
                  {b.sendWhatsApp && <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-600">WA</span>}
                  {b.sendPush && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">Push</span>}
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">
                    {b.targetCentreIds === 'ALL' ? 'All centres' : `${(b.targetCentreIds as string[]).length} centres`}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-600">{b.body}</p>
              <p className="mt-1 text-[10px] text-gray-400">
                {b.fanoutComplete ? `Delivered to ${b.fanoutCount} users` : 'Fan-out pending'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
