/**
 * Public live scores page for Believers Games 2026.
 * No auth required — accessible at /live.
 * Tabs: Now Playing | Schedule | Results
 * Real-time via Firestore onSnapshot.
 */

import { useState, useEffect, useMemo } from 'react';
import { subscribeToMatches } from '@/services/matchService';
import type { TournamentMatch, MatchSport } from '@bba/shared';
import {
  MATCH_SPORT_LABEL,
  MATCH_CATEGORY_LABEL,
  MATCH_ROUND_LABEL,
  MATCH_SPORT_COLOR,
} from '@bba/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function scoreStr(scores: TournamentMatch['scores']): string {
  if (!scores.length) return '—';
  return scores.map((g) => `${g.a}-${g.b}`).join(', ');
}

const STATUS_DOT: Record<string, string> = {
  UPCOMING: 'bg-gray-300',
  LIVE: 'bg-red-500 animate-pulse',
  COMPLETED: 'bg-green-400',
  WALKOVER: 'bg-yellow-400',
};

const SPORTS: MatchSport[] = ['BADMINTON', 'TABLE_TENNIS', 'PICKLEBALL', 'CARROM'];

// ─── Match card (public) ──────────────────────────────────────────────────────

function LiveMatchCard({ match }: { match: TournamentMatch }) {
  const playerA = match.playerANames.join(' / ');
  const playerB = match.playerBNames.join(' / ');
  const isLive = match.status === 'LIVE';

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm transition ${
        isLive ? 'border-red-300 bg-red-50 ring-1 ring-red-200' : 'border-gray-100 bg-white'
      }`}
    >
      {/* Top row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_SPORT_COLOR[match.sport]}`}>
          {MATCH_SPORT_LABEL[match.sport]}
        </span>
        <span className="text-xs text-gray-400">{MATCH_CATEGORY_LABEL[match.category]}</span>
        <span className="text-xs text-gray-400">·</span>
        <span className="text-xs text-gray-400">{MATCH_ROUND_LABEL[match.round]}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[match.status]}`} />
          <span className="text-xs font-medium text-gray-500">{match.status}</span>
        </div>
      </div>

      {/* Score */}
      <div className="flex items-center gap-3">
        <div className="flex-1 text-right">
          <p className={`font-semibold text-sm ${match.winner === 'A' ? 'text-green-700' : 'text-gray-800'}`}>
            {match.winner === 'A' && '🏆 '}{playerA}
          </p>
        </div>
        <div className="w-20 text-center">
          {match.scores.length > 0 ? (
            <div className="space-y-0.5">
              {match.scores.map((g, i) => (
                <div key={i} className="flex items-center justify-center gap-2 text-lg font-bold">
                  <span className={g.a > g.b ? 'text-green-700' : 'text-gray-600'}>{g.a}</span>
                  <span className="text-gray-300 text-sm">-</span>
                  <span className={g.b > g.a ? 'text-green-700' : 'text-gray-600'}>{g.b}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm font-medium text-gray-400">{fmtTime(match.scheduledAt)}</span>
          )}
        </div>
        <div className="flex-1">
          <p className={`font-semibold text-sm ${match.winner === 'B' ? 'text-green-700' : 'text-gray-800'}`}>
            {match.winner === 'B' && '🏆 '}{playerB}
          </p>
        </div>
      </div>

      {match.notes && (
        <p className="mt-2 text-center text-xs text-gray-400 italic">{match.notes}</p>
      )}
    </div>
  );
}

// ─── Schedule row ─────────────────────────────────────────────────────────────

function ScheduleRow({ match }: { match: TournamentMatch }) {
  const playerA = match.playerANames.join(' / ');
  const playerB = match.playerBNames.join(' / ');

  return (
    <div className="flex items-center gap-3 border-b border-gray-50 py-3 last:border-0">
      <span className="w-16 shrink-0 text-right text-xs text-gray-400">{fmtTime(match.scheduledAt)}</span>
      <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[match.status]}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800">
          {playerA} <span className="text-gray-400">vs</span> {playerB}
        </p>
        <p className="text-xs text-gray-400">
          {MATCH_SPORT_LABEL[match.sport]} {MATCH_CATEGORY_LABEL[match.category]} · {MATCH_ROUND_LABEL[match.round]}
        </p>
      </div>
    </div>
  );
}

// ─── Team leaderboard ─────────────────────────────────────────────────────────

interface TeamScore {
  name: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

function buildLeaderboard(matches: TournamentMatch[]): TeamScore[] {
  const scores: Record<string, TeamScore> = {};

  function add(name: string, medal: 'gold' | 'silver' | 'bronze') {
    if (!scores[name]) scores[name] = { name, gold: 0, silver: 0, bronze: 0, total: 0 };
    scores[name][medal]++;
    scores[name].total += medal === 'gold' ? 3 : medal === 'silver' ? 2 : 1;
  }

  matches
    .filter((m) => m.status === 'COMPLETED' && m.winner && ['FINAL', 'SF', 'PLACEMENT_56', 'PLACEMENT_78'].includes(m.round))
    .forEach((m) => {
      if (!m.winner) return;
      const winner = m.winner === 'A' ? m.playerANames : m.playerBNames;
      const loser = m.winner === 'A' ? m.playerBNames : m.playerANames;
      if (m.round === 'FINAL') {
        winner.forEach((n) => add(n, 'gold'));
        loser.forEach((n) => add(n, 'silver'));
      } else if (m.round === 'SF') {
        loser.forEach((n) => add(n, 'bronze'));
      }
    });

  return Object.values(scores).sort((a, b) => b.total - a.total || b.gold - a.gold);
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'live' | 'schedule' | 'results' | 'leaderboard';

export default function LiveScores() {
  const [tab, setTab] = useState<Tab>('live');
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [sportFilter, setSportFilter] = useState<MatchSport | ''>('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOffline = () => setOffline(true);
    const handleOnline = () => setOffline(false);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    const unsub = subscribeToMatches(
      (data) => {
        setMatches(data);
        setLoading(false);
        setLastUpdated(new Date());
      },
    );
    return unsub;
  }, []);

  const liveMatches = useMemo(
    () => matches.filter((m) => m.status === 'LIVE' && (!sportFilter || m.sport === sportFilter)),
    [matches, sportFilter],
  );

  const upcomingByDay = useMemo(() => {
    const filtered = matches.filter(
      (m) => m.status === 'UPCOMING' && (!sportFilter || m.sport === sportFilter),
    );
    const groups: Record<string, TournamentMatch[]> = {};
    filtered.forEach((m) => {
      const day = fmtDay(m.scheduledAt);
      if (!groups[day]) groups[day] = [];
      groups[day].push(m);
    });
    return groups;
  }, [matches, sportFilter]);

  const completedMatches = useMemo(
    () =>
      matches
        .filter((m) => ['COMPLETED', 'WALKOVER'].includes(m.status) && (!sportFilter || m.sport === sportFilter))
        .reverse(),
    [matches, sportFilter],
  );

  const leaderboard = useMemo(() => buildLeaderboard(matches), [matches]);

  const tabCounts = {
    live: liveMatches.length,
    schedule: Object.values(upcomingByDay).flat().length,
    results: completedMatches.length,
    leaderboard: leaderboard.length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Offline banner */}
      {offline && (
        <div className="bg-yellow-500 px-4 py-2 text-center text-sm font-medium text-white">
          You're offline — showing last known scores
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-6 text-white">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold">🏆 Believers Games 2026</h1>
          <p className="mt-1 text-orange-100 text-sm">May 8–10 · Live Scores & Results</p>
          {lastUpdated && (
            <p className="mt-1 text-orange-200 text-xs">
              Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-0 z-10 border-b bg-white shadow-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex overflow-x-auto">
            {([
              { id: 'live' as Tab, label: 'Now Playing' },
              { id: 'schedule' as Tab, label: 'Schedule' },
              { id: 'results' as Tab, label: 'Results' },
              { id: 'leaderboard' as Tab, label: 'Leaderboard' },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition ${
                  tab === t.id
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                {tabCounts[t.id] > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                    t.id === 'live' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tabCounts[t.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl p-4">
        {/* Sport filter (for live/schedule/results) */}
        {tab !== 'leaderboard' && (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setSportFilter('')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                sportFilter === '' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
              }`}
            >
              All Sports
            </button>
            {SPORTS.map((s) => (
              <button
                key={s}
                onClick={() => setSportFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  sportFilter === s ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
                }`}
              >
                {MATCH_SPORT_LABEL[s]}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="py-16 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            <p className="mt-3 text-sm text-gray-400">Loading scores…</p>
          </div>
        )}

        {/* ── NOW PLAYING ── */}
        {!loading && tab === 'live' && (
          <div className="space-y-3">
            {liveMatches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
                <p className="text-3xl mb-2">🏸</p>
                <p className="text-sm font-medium text-gray-600">No matches live right now</p>
                <p className="text-xs text-gray-400 mt-1">Check the Schedule tab for upcoming matches</p>
              </div>
            ) : (
              liveMatches.map((m) => <LiveMatchCard key={m.id} match={m} />)
            )}

            {/* Upcoming next */}
            {Object.entries(upcomingByDay).slice(0, 1).map(([day, dayMatches]) => (
              <div key={day} className="mt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Up Next — {day}
                </h3>
                <div className="rounded-2xl border bg-white px-4 shadow-sm">
                  {dayMatches.slice(0, 5).map((m) => <ScheduleRow key={m.id} match={m} />)}
                  {dayMatches.length > 5 && (
                    <p className="py-2 text-center text-xs text-gray-400">
                      +{dayMatches.length - 5} more — see Schedule
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {!loading && tab === 'schedule' && (
          <div className="space-y-4">
            {Object.keys(upcomingByDay).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
                <p className="text-sm text-gray-400">No upcoming matches</p>
              </div>
            ) : (
              Object.entries(upcomingByDay).map(([day, dayMatches]) => (
                <div key={day}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{day}</h3>
                  <div className="rounded-2xl border bg-white px-4 shadow-sm">
                    {dayMatches.map((m) => <ScheduleRow key={m.id} match={m} />)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── RESULTS ── */}
        {!loading && tab === 'results' && (
          <div className="space-y-3">
            {completedMatches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
                <p className="text-sm text-gray-400">No results yet</p>
              </div>
            ) : (
              completedMatches.map((m) => <LiveMatchCard key={m.id} match={m} />)
            )}
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {!loading && tab === 'leaderboard' && (
          <div>
            {leaderboard.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
                <p className="text-sm text-gray-400">Leaderboard will appear once finals are completed</p>
              </div>
            ) : (
              <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-0 text-xs font-semibold text-gray-400 px-4 py-2 border-b bg-gray-50">
                  <span className="w-8 text-center">#</span>
                  <span>Player / Team</span>
                  <span className="w-10 text-center">🥇</span>
                  <span className="w-10 text-center">🥈</span>
                  <span className="w-10 text-center">🥉</span>
                  <span className="w-12 text-right">Pts</span>
                </div>
                {leaderboard.map((row, i) => (
                  <div
                    key={row.name}
                    className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-0 px-4 py-3 border-b last:border-0 ${
                      i === 0 ? 'bg-yellow-50' : i === 1 ? 'bg-gray-50' : i === 2 ? 'bg-orange-50' : ''
                    }`}
                  >
                    <span className="w-8 text-center text-sm font-bold text-gray-400">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <span className="text-sm font-semibold text-gray-800 truncate">{row.name}</span>
                    <span className="w-10 text-center text-sm">{row.gold || '—'}</span>
                    <span className="w-10 text-center text-sm">{row.silver || '—'}</span>
                    <span className="w-10 text-center text-sm">{row.bronze || '—'}</span>
                    <span className="w-12 text-right text-sm font-bold text-orange-600">{row.total}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 pb-8 text-center text-xs text-gray-300">
        Powered by Believers Badminton Academy
      </div>
    </div>
  );
}
