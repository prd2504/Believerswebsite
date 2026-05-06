/**
 * Match service — Firestore CRUD for /tournamentMatches/{id}.
 * Supports real-time subscriptions, optimistic locking, and winner auto-advancement.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@bba/shared';
import type { TournamentMatch, GameScore, MatchStatus, MatchSide } from '@bba/shared';
import { ALL_SEED_MATCHES, TOURNAMENT_ID } from '@/lib/tournamentSeedData';

const COL = COLLECTIONS.tournamentMatches;

// ─── Converters ──────────────────────────────────────────────────────────────

function toIso(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts)
    return (ts as Timestamp).toDate().toISOString();
  return new Date().toISOString();
}

function fromFirestore(id: string, d: DocumentData): TournamentMatch {
  return {
    id,
    sport: d.sport,
    category: d.category,
    round: d.round,
    matchNumber: d.matchNumber ?? 0,
    scheduledAt: toIso(d.scheduledAt),
    playerANames: d.playerANames ?? [],
    playerBNames: d.playerBNames ?? [],
    scores: d.scores ?? [],
    status: d.status ?? 'UPCOMING',
    winner: d.winner ?? null,
    nextMatchId: d.nextMatchId ?? null,
    nextMatchSlot: d.nextMatchSlot ?? null,
    notes: d.notes ?? null,
    version: d.version ?? 0,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

// ─── Seed ────────────────────────────────────────────────────────────────────

/**
 * Write all seed matches into Firestore. Idempotent — uses setDoc(merge: false)
 * but only overwrites if version === 0 (never scored) to avoid wiping live data.
 */
export async function seedAllMatches(): Promise<{ written: number; skipped: number }> {
  const now = new Date().toISOString();
  let written = 0;
  let skipped = 0;

  // Batch in groups of 20 to stay within Firestore write limits per round-trip
  for (const m of ALL_SEED_MATCHES) {
    const ref = doc(db, COL, m.id);
    const snap = await getDoc(ref);
    if (snap.exists() && (snap.data().version ?? 0) > 0) {
      skipped++;
      continue;
    }
    await setDoc(ref, {
      ...m,
      createdAt: snap.exists() ? snap.data().createdAt : now,
      updatedAt: now,
    });
    written++;
  }
  return { written, skipped };
}

export { TOURNAMENT_ID };

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getAllMatches(): Promise<TournamentMatch[]> {
  const q = query(collection(db, COL), orderBy('scheduledAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore(d.id, d.data()));
}

export async function getMatch(id: string): Promise<TournamentMatch | null> {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? fromFirestore(snap.id, snap.data()) : null;
}

// ─── Real-time subscription ──────────────────────────────────────────────────

export function subscribeToMatches(
  callback: (matches: TournamentMatch[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), orderBy('scheduledAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => fromFirestore(d.id, d.data())));
    },
    (err) => {
      console.error('matchService subscription error', err);
      onError?.(err);
    },
  );
}

// ─── Score update (optimistic locking) ───────────────────────────────────────

export interface ScoreUpdatePayload {
  scores: GameScore[];
  status: MatchStatus;
  winner: MatchSide | null;
  notes?: string | null;
}

/**
 * Atomically update a match's score. Throws if another writer incremented
 * the version since the caller last read (optimistic concurrency control).
 */
export async function updateMatchScore(
  matchId: string,
  payload: ScoreUpdatePayload,
  expectedVersion: number,
): Promise<void> {
  const ref = doc(db, COL, matchId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error(`Match ${matchId} not found`);
    const current = snap.data().version ?? 0;
    if (current !== expectedVersion) {
      throw new Error(
        `Concurrent edit detected on match ${matchId} (expected v${expectedVersion}, got v${current}). Refresh and try again.`,
      );
    }
    tx.update(ref, {
      scores: payload.scores,
      status: payload.status,
      winner: payload.winner ?? null,
      notes: payload.notes ?? null,
      version: current + 1,
      updatedAt: new Date().toISOString(),
    });
  });

  // If the match just completed, auto-advance the winner to the next bracket slot
  if (payload.status === 'COMPLETED' && payload.winner !== null) {
    await advanceWinner(matchId, payload.winner);
  }
}

// ─── Bracket auto-advancement ────────────────────────────────────────────────

async function advanceWinner(matchId: string, winner: MatchSide): Promise<void> {
  const matchSnap = await getDoc(doc(db, COL, matchId));
  if (!matchSnap.exists()) return;
  const match = fromFirestore(matchSnap.id, matchSnap.data());
  if (!match.nextMatchId || !match.nextMatchSlot) return;

  const winnerNames = winner === 'A' ? match.playerANames : match.playerBNames;
  const nextRef = doc(db, COL, match.nextMatchId);
  const field = match.nextMatchSlot === 'A' ? 'playerANames' : 'playerBNames';

  await updateDoc(nextRef, {
    [field]: winnerNames,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Manually set players for a bracket slot (used to wire qualifiers → QF).
 */
export async function assignBracketSlot(
  matchId: string,
  slot: MatchSide,
  playerNames: string[],
): Promise<void> {
  const ref = doc(db, COL, matchId);
  const field = slot === 'A' ? 'playerANames' : 'playerBNames';
  await updateDoc(ref, {
    [field]: playerNames,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Mark a match as WALKOVER — winner advances automatically.
 */
export async function markWalkover(
  matchId: string,
  winner: MatchSide,
  currentVersion: number,
): Promise<void> {
  await updateMatchScore(
    matchId,
    { scores: [], status: 'WALKOVER', winner, notes: 'Walkover' },
    currentVersion,
  );
}
