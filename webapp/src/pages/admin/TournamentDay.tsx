/**
 * Tournament Day — admin hub for Believers Games 2026.
 * Tabs: Seed Data | Score Entry | Bracket View | Timeline
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  Trophy,
  Clock,
  RefreshCw,
  CheckCircle,
  XCircle,
  Edit2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  seedAllMatches,
  subscribeToMatches,
  updateMatchScore,
  markWalkover,
  assignBracketSlot,
} from '@/services/matchService';
import type { TournamentMatch, MatchSport, MatchCategory, MatchSide, GameScore } from '@bba/shared';
import {
  MATCH_SPORT_LABEL,
  MATCH_CATEGORY_LABEL,
  MATCH_ROUND_LABEL,
  MATCH_SPORT_COLOR,
} from '@bba/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

const SPORTS: MatchSport[] = ['BADMINTON', 'TABLE_TENNIS', 'PICKLEBALL', 'CARROM'];
const CATEGORIES: MatchCategory[] = ['SINGLES', 'OPEN_DOUBLES', 'MIXED_DOUBLES', 'CARROM_DOUBLES'];

const STATUS_COLOR: Record<string, string> = {
  UPCOMING: 'bg-gray-100 text-gray-600',
  LIVE: 'bg-red-100 text-red-700 animate-pulse',
  COMPLETED: 'bg-green-100 text-green-700',
  WALKOVER: 'bg-yellow-100 text-yellow-700',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function scoreStr(scores: GameScore[]): string {
  if (!scores.length) return '—';
  return scores.map((g) => `${g.a}-${g.b}`).join(', ');
}

// ─── Score Entry Dialog ───────────────────────────────────────────────────────

interface ScoreDialogProps {
  match: TournamentMatch;
  onClose: () => void;
  onSaved: () => void;
}

function ScoreDialog({ match, onClose, onSaved }: ScoreDialogProps) {
  const isDoubles = match.playerANames.length > 1;
  const playerA = match.playerANames.join(' / ');
  const playerB = match.playerBNames.join(' / ');

  // Start with at least one game
  const [games, setGames] = useState<GameScore[]>(
    match.scores.length ? match.scores : [{ a: 0, b: 0 }],
  );
  const [status, setStatus] = useState<'UPCOMING' | 'LIVE' | 'COMPLETED' | 'WALKOVER'>(
    match.status === 'WALKOVER' ? 'WALKOVER' : match.status === 'COMPLETED' ? 'COMPLETED' : 'LIVE',
  );
  const [walkoverWinner, setWalkoverWinner] = useState<MatchSide>('A');
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const computedWinner = useMemo<MatchSide | null>(() => {
    if (status !== 'COMPLETED') return null;
    const aWins = games.filter((g) => g.a > g.b).length;
    const bWins = games.filter((g) => g.b > g.a).length;
    if (aWins > bWins) return 'A';
    if (bWins > aWins) return 'B';
    return null;
  }, [games, status]);

  function addGame() {
    setGames((prev) => [...prev, { a: 0, b: 0 }]);
  }

  function removeLastGame() {
    if (games.length > 1) setGames((prev) => prev.slice(0, -1));
  }

  function setScore(idx: number, side: 'a' | 'b', val: string) {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setGames((prev) => prev.map((g, i) => (i === idx ? { ...g, [side]: n } : g)));
  }

  async function handleSave() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setSaving(true);
    try {
      const winner = status === 'WALKOVER' ? walkoverWinner : computedWinner;
      await updateMatchScore(
        match.id,
        {
          scores: status === 'WALKOVER' ? [] : games,
          status,
          winner,
        },
        match.version,
      );
      toast.success('Score saved');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save score');
      setSaving(false);
      setConfirmed(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="flex gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_SPORT_COLOR[match.sport]}`}>
                {MATCH_SPORT_LABEL[match.sport]}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {MATCH_CATEGORY_LABEL[match.category]}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {MATCH_ROUND_LABEL[match.round]}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {fmtTime(match.scheduledAt)} · Match #{match.matchNumber}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100">
            <XCircle className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Players */}
          <div className="grid grid-cols-3 items-center gap-2 text-sm font-medium">
            <span className="text-right">{playerA}</span>
            <span className="text-center text-xs text-gray-400">vs</span>
            <span>{playerB}</span>
          </div>

          {/* Status toggle */}
          <div className="flex gap-2">
            {(['LIVE', 'COMPLETED', 'WALKOVER'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setStatus(s); setConfirmed(false); }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                  status === s
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {status === 'WALKOVER' ? (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-500">Walkover winner</p>
              <div className="grid grid-cols-2 gap-2">
                {(['A', 'B'] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => setWalkoverWinner(side)}
                    className={`rounded-lg border-2 p-2 text-sm font-medium transition ${
                      walkoverWinner === side ? 'border-orange-500 bg-orange-50' : 'border-gray-200'
                    }`}
                  >
                    {side === 'A' ? playerA : playerB}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium text-gray-500">
                <span className="text-right">{playerA}</span>
                <span>Game</span>
                <span>{playerB}</span>
              </div>
              {games.map((g, i) => (
                <div key={i} className="grid grid-cols-3 items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={g.a}
                    onChange={(e) => setScore(i, 'a', e.target.value)}
                    className="rounded-lg border text-center text-lg font-bold focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 py-2"
                  />
                  <span className="text-center text-xs font-semibold text-gray-400">G{i + 1}</span>
                  <input
                    type="number"
                    min={0}
                    value={g.b}
                    onChange={(e) => setScore(i, 'b', e.target.value)}
                    className="rounded-lg border text-center text-lg font-bold focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 py-2"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={addGame}
                  className="flex-1 rounded-lg border border-dashed border-gray-300 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                >
                  + Add game
                </button>
                {games.length > 1 && (
                  <button
                    onClick={removeLastGame}
                    className="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    Remove last
                  </button>
                )}
              </div>
              {status === 'COMPLETED' && computedWinner && (
                <div className="rounded-lg bg-green-50 p-2 text-center text-sm font-semibold text-green-700">
                  Winner: {computedWinner === 'A' ? playerA : playerB}
                </div>
              )}
              {status === 'COMPLETED' && !computedWinner && (
                <div className="rounded-lg bg-yellow-50 p-2 text-center text-xs text-yellow-700">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  Tie — check scores
                </div>
              )}
            </div>
          )}

          {/* Confirm + Save */}
          {confirmed ? (
            <div className="space-y-2 rounded-xl bg-orange-50 p-3">
              <p className="text-center text-sm font-medium text-orange-800">
                Confirm and save? This will advance the winner to the next match.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmed(false)}
                  className="flex-1 rounded-lg border py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || (status === 'COMPLETED' && !computedWinner)}
              className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              Save Score
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bracket Slot Assignment ──────────────────────────────────────────────────

interface SlotDialogProps {
  match: TournamentMatch;
  slot: MatchSide;
  onClose: () => void;
}

function SlotDialog({ match, slot, onClose }: SlotDialogProps) {
  const [names, setNames] = useState(
    (slot === 'A' ? match.playerANames : match.playerBNames).filter((n) => n !== 'TBD').join(', '),
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const playerNames = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      if (!playerNames.length) throw new Error('Enter at least one player name');
      await assignBracketSlot(match.id, slot, playerNames);
      toast.success('Slot updated');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update slot');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="mb-1 text-base font-semibold">Assign Player(s) to Slot {slot}</h3>
        <p className="mb-4 text-xs text-gray-500">
          {MATCH_ROUND_LABEL[match.round]} · {MATCH_SPORT_LABEL[match.sport]} {MATCH_CATEGORY_LABEL[match.category]}
        </p>
        <input
          autoFocus
          placeholder="Name1, Name2 (for doubles)"
          value={names}
          onChange={(e) => setNames(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <p className="mt-1 text-xs text-gray-400">Separate doubles partners with a comma</p>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────

interface MatchCardProps {
  match: TournamentMatch;
  onEdit: () => void;
  onAssignSlot: (slot: MatchSide) => void;
}

function MatchCard({ match, onEdit, onAssignSlot }: MatchCardProps) {
  const isTBD = (names: string[]) => names.length === 0 || names[0] === 'TBD';
  const playerA = match.playerANames.join(' / ');
  const playerB = match.playerBNames.join(' / ');

  return (
    <div className={`rounded-xl border bg-white p-3 shadow-sm ${match.status === 'LIVE' ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1 mb-1">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_SPORT_COLOR[match.sport]}`}>
              {MATCH_SPORT_LABEL[match.sport]}
            </span>
            <span className="text-xs text-gray-400">{MATCH_CATEGORY_LABEL[match.category]}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">{MATCH_ROUND_LABEL[match.round]}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">#{match.matchNumber}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-3 w-3 shrink-0 text-gray-400" />
            <span className="text-gray-500 text-xs">{fmtTime(match.scheduledAt)}</span>
          </div>
          {/* Players */}
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              {isTBD(match.playerANames) ? (
                <button
                  onClick={() => onAssignSlot('A')}
                  className="flex items-center gap-1 rounded border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-400 hover:border-orange-400 hover:text-orange-500"
                >
                  <Users className="h-3 w-3" /> Assign A
                </button>
              ) : (
                <span className={`text-sm font-medium ${match.winner === 'A' ? 'text-green-600' : ''}`}>
                  {match.winner === 'A' && '🏆 '}{playerA}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isTBD(match.playerBNames) ? (
                <button
                  onClick={() => onAssignSlot('B')}
                  className="flex items-center gap-1 rounded border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-400 hover:border-orange-400 hover:text-orange-500"
                >
                  <Users className="h-3 w-3" /> Assign B
                </button>
              ) : (
                <span className={`text-sm font-medium ${match.winner === 'B' ? 'text-green-600' : ''}`}>
                  {match.winner === 'B' && '🏆 '}{playerB}
                </span>
              )}
            </div>
          </div>
          {match.scores.length > 0 && (
            <p className="mt-1 text-xs text-gray-400">{scoreStr(match.scores)}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[match.status]}`}>
            {match.status}
          </span>
          <button
            onClick={onEdit}
            className="flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-100"
          >
            <Edit2 className="h-3 w-3" /> Score
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'seed' | 'score' | 'bracket' | 'timeline';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'seed', label: 'Seed Data', icon: Database },
  { id: 'score', label: 'Score Entry', icon: Edit2 },
  { id: 'bracket', label: 'Bracket', icon: Trophy },
  { id: 'timeline', label: 'Timeline', icon: Clock },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TournamentDay() {
  const [tab, setTab] = useState<Tab>('score');
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [editMatch, setEditMatch] = useState<TournamentMatch | null>(null);
  const [slotEdit, setSlotEdit] = useState<{ match: TournamentMatch; slot: MatchSide } | null>(null);

  // Filters for score entry
  const [sportFilter, setSportFilter] = useState<MatchSport | ''>('');
  const [roundFilter, setRoundFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Real-time subscription
  useEffect(() => {
    const unsub = subscribeToMatches(
      (data) => {
        setMatches(data);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  const handleSeed = useCallback(async () => {
    if (!confirm('This will write all match data to Firestore. Already-scored matches will be skipped. Continue?')) return;
    setSeeding(true);
    try {
      const { written, skipped } = await seedAllMatches();
      toast.success(`Seeded ${written} matches (${skipped} skipped — already scored)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  }, []);

  // Unique dates for date filter
  const uniqueDates = useMemo(() => {
    const dates = new Set<string>();
    matches.forEach((m) => {
      dates.add(
        new Date(m.scheduledAt).toLocaleDateString('en-IN', {
          weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata',
        }),
      );
    });
    return Array.from(dates);
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (sportFilter && m.sport !== sportFilter) return false;
      if (roundFilter && m.round !== roundFilter) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (dateFilter) {
        const d = new Date(m.scheduledAt).toLocaleDateString('en-IN', {
          weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata',
        });
        if (d !== dateFilter) return false;
      }
      return true;
    });
  }, [matches, sportFilter, roundFilter, statusFilter, dateFilter]);

  // ── Timeline conflict detection ──
  const timelineGroups = useMemo(() => {
    const bySport: Record<string, TournamentMatch[]> = {};
    for (const m of matches) {
      if (!bySport[m.sport]) bySport[m.sport] = [];
      bySport[m.sport].push(m);
    }
    return bySport;
  }, [matches]);

  const conflicts = useMemo(() => {
    const result: string[] = [];
    Object.entries(timelineGroups).forEach(([sport, sportMatches]) => {
      // Group by 15-min window
      const sorted = [...sportMatches].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        const diffMins = (new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()) / 60000;
        if (diffMins < 15) {
          result.push(`${sport}: Match #${a.matchNumber} and #${b.matchNumber} overlap (${diffMins}min gap)`);
        }
      }
    });
    return result;
  }, [timelineGroups]);

  // ── Bracket helpers ──
  const bracketBySport = useMemo(() => {
    const groups: Record<string, Record<string, TournamentMatch[]>> = {};
    matches
      .filter((m) => ['QF', 'SF', 'FINAL'].includes(m.round))
      .forEach((m) => {
        const key = `${m.sport}|${m.category}`;
        if (!groups[key]) groups[key] = { QF: [], SF: [], FINAL: [] };
        groups[key][m.round].push(m);
      });
    return groups;
  }, [matches]);

  const liveAndNext = useMemo(() => {
    const live = matches.filter((m) => m.status === 'LIVE');
    const upcoming = matches
      .filter((m) => m.status === 'UPCOMING')
      .slice(0, 10);
    return { live, upcoming };
  }, [matches]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🏆 Believers Games 2026</h1>
            <p className="text-sm text-gray-500">May 8–10, 2026 · Admin Control Center</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              {liveAndNext.live.length} LIVE
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              {matches.filter((m) => m.status === 'COMPLETED').length} Done
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* ── SEED TAB ── */}
        {tab === 'seed' && (
          <div className="max-w-lg space-y-4">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Database className="h-6 w-6 text-orange-500" />
                <div>
                  <h2 className="font-semibold text-gray-900">Seed Match Data</h2>
                  <p className="text-xs text-gray-500">Write all qualifier + bracket matches to Firestore</p>
                </div>
              </div>
              <ul className="mb-4 space-y-1 text-sm text-gray-600">
                <li>✓ All qualifier matches with player names and times</li>
                <li>✓ QF / SF / Final bracket slots (empty, ready to fill)</li>
                <li>✓ Bracket wiring — winners auto-advance to next match</li>
                <li>✓ Idempotent — already-scored matches are skipped</li>
              </ul>
              <p className="mb-4 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                Current DB: {matches.length} matches loaded in real-time.
              </p>
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {seeding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                {seeding ? 'Seeding…' : 'Seed All Matches'}
              </button>
            </div>
            {matches.length > 0 && (
              <div className="rounded-xl border bg-white p-4 shadow-sm text-sm">
                <div className="grid grid-cols-2 gap-3">
                  {(['UPCOMING', 'LIVE', 'COMPLETED', 'WALKOVER'] as const).map((s) => (
                    <div key={s} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-gray-500">{s}</span>
                      <span className="font-semibold">{matches.filter((m) => m.status === s).length}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SCORE ENTRY TAB ── */}
        {tab === 'score' && (
          <div className="space-y-4">
            {/* Live matches at the top */}
            {liveAndNext.live.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">
                  🔴 Live Now
                </h3>
                <div className="space-y-2">
                  {liveAndNext.live.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      onEdit={() => setEditMatch(m)}
                      onAssignSlot={(slot) => setSlotEdit({ match: m, slot })}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <select
                value={sportFilter}
                onChange={(e) => setSportFilter(e.target.value as MatchSport | '')}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
              >
                <option value="">All sports</option>
                {SPORTS.map((s) => <option key={s} value={s}>{MATCH_SPORT_LABEL[s]}</option>)}
              </select>
              <select
                value={roundFilter}
                onChange={(e) => setRoundFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
              >
                <option value="">All rounds</option>
                {(['QUALIFIER', 'QF', 'SF', 'FINAL', 'PLACEMENT_56', 'PLACEMENT_78'] as const).map((r) => (
                  <option key={r} value={r}>{MATCH_ROUND_LABEL[r]}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
              >
                <option value="">All statuses</option>
                {(['UPCOMING', 'LIVE', 'COMPLETED', 'WALKOVER'] as const).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
              >
                <option value="">All dates</option>
                {uniqueDates.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-gray-400">Loading matches…</div>
            ) : filteredMatches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
                No matches match the current filters.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    onEdit={() => setEditMatch(m)}
                    onAssignSlot={(slot) => setSlotEdit({ match: m, slot })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── BRACKET TAB ── */}
        {tab === 'bracket' && (
          <div className="space-y-8">
            {Object.entries(bracketBySport).map(([key, rounds]) => {
              const [sport, category] = key.split('|') as [MatchSport, MatchCategory];
              return (
                <div key={key} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_SPORT_COLOR[sport]}`}>
                      {MATCH_SPORT_LABEL[sport]}
                    </span>
                    <span className="text-sm font-semibold text-gray-700">{MATCH_CATEGORY_LABEL[category]}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 overflow-x-auto">
                    {(['QF', 'SF', 'FINAL'] as const).map((round) => (
                      <div key={round}>
                        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {MATCH_ROUND_LABEL[round]}
                        </p>
                        <div className="space-y-2">
                          {(rounds[round] ?? []).map((m) => (
                            <div
                              key={m.id}
                              className={`rounded-lg border p-2 text-xs ${
                                m.status === 'COMPLETED'
                                  ? 'border-green-200 bg-green-50'
                                  : m.status === 'LIVE'
                                  ? 'border-red-300 bg-red-50'
                                  : 'border-gray-100 bg-gray-50'
                              }`}
                            >
                              <p className={`font-medium ${m.winner === 'A' ? 'text-green-700' : 'text-gray-700'}`}>
                                {m.winner === 'A' ? '🏆 ' : ''}{m.playerANames.join(' / ')}
                              </p>
                              <p className="text-gray-400 text-center text-[10px] my-0.5">vs</p>
                              <p className={`font-medium ${m.winner === 'B' ? 'text-green-700' : 'text-gray-700'}`}>
                                {m.winner === 'B' ? '🏆 ' : ''}{m.playerBNames.join(' / ')}
                              </p>
                              {m.scores.length > 0 && (
                                <p className="mt-1 text-gray-400">{scoreStr(m.scores)}</p>
                              )}
                              <button
                                onClick={() => setEditMatch(m)}
                                className="mt-1 w-full rounded border border-orange-200 bg-orange-50 py-0.5 text-[10px] font-medium text-orange-600 hover:bg-orange-100"
                              >
                                Edit
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {Object.keys(bracketBySport).length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
                No bracket matches yet. Seed the data first.
              </div>
            )}
          </div>
        )}

        {/* ── TIMELINE TAB ── */}
        {tab === 'timeline' && (
          <div className="space-y-4">
            {conflicts.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">Schedule Conflicts ({conflicts.length})</span>
                </div>
                <ul className="space-y-1">
                  {conflicts.map((c, i) => (
                    <li key={i} className="text-xs text-amber-700">{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {Object.entries(timelineGroups).map(([sport, sportMatches]) => (
              <div key={sport} className="rounded-xl border bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-700">
                  {MATCH_SPORT_LABEL[sport as MatchSport]}
                </h3>
                <div className="space-y-1">
                  {sportMatches.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50"
                    >
                      <span className="w-16 text-right text-xs text-gray-400 shrink-0">
                        {fmtTime(m.scheduledAt)}
                      </span>
                      <span className={`h-2 w-2 rounded-full shrink-0 ${
                        m.status === 'LIVE' ? 'bg-red-500' :
                        m.status === 'COMPLETED' ? 'bg-green-400' : 'bg-gray-300'
                      }`} />
                      <span className="text-xs text-gray-500 w-16 shrink-0">{MATCH_ROUND_LABEL[m.round]}</span>
                      <span className="text-xs truncate">
                        {m.playerANames.join('/')} vs {m.playerBNames.join('/')}
                      </span>
                      <span className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${STATUS_COLOR[m.status]}`}>
                        {m.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {editMatch && (
        <ScoreDialog
          match={editMatch}
          onClose={() => setEditMatch(null)}
          onSaved={() => setEditMatch(null)}
        />
      )}
      {slotEdit && (
        <SlotDialog
          match={slotEdit.match}
          slot={slotEdit.slot}
          onClose={() => setSlotEdit(null)}
        />
      )}
    </div>
  );
}
