/**
 * Believers Games 2026 — complete match schedule seed data.
 * All times stored as ISO UTC (IST = UTC+5:30).
 *
 * Qualifier matches have real player names.
 * Knockout bracket slots (QF/SF/Final) have empty playerNames — filled as results come in.
 */

import type { TournamentMatch, MatchSport, MatchCategory, MatchRound } from '@bba/shared';

export const TOURNAMENT_ID = 'believers-games-2026';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert IST date/time to ISO UTC string. */
function ist(dateStr: string, timeStr: string): string {
  // dateStr: 'YYYY-MM-DD', timeStr: 'HH:MM' (24h IST)
  const [h, m] = timeStr.split(':').map(Number);
  // IST = UTC+5:30, so subtract 5h30m
  const totalMinsIST = h * 60 + m;
  const totalMinsUTC = totalMinsIST - 330;
  const utcH = Math.floor(((totalMinsUTC % 1440) + 1440) % 1440 / 60);
  const utcM = ((totalMinsUTC % 1440) + 1440) % 1440 % 60;
  // Handle date rollover (if UTC time goes to previous day — only for early morning IST)
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (totalMinsUTC < 0) d.setUTCDate(d.getUTCDate() - 1);
  return `${d.toISOString().slice(0, 10)}T${String(utcH).padStart(2, '0')}:${String(utcM).padStart(2, '0')}:00.000Z`;
}

let _seq = 0;
function match(
  id: string,
  sport: MatchSport,
  category: MatchCategory,
  round: MatchRound,
  matchNumber: number,
  scheduledAt: string,
  playerANames: string[],
  playerBNames: string[],
  nextMatchId: string | null = null,
  nextMatchSlot: 'A' | 'B' | null = null,
): Omit<TournamentMatch, 'createdAt' | 'updatedAt'> {
  _seq++;
  return {
    id,
    sport,
    category,
    round,
    matchNumber,
    scheduledAt,
    playerANames,
    playerBNames,
    scores: [],
    status: 'UPCOMING',
    winner: null,
    nextMatchId,
    nextMatchSlot,
    notes: null,
    version: 0,
  };
}

function bracket(
  id: string,
  sport: MatchSport,
  category: MatchCategory,
  round: MatchRound,
  matchNumber: number,
  scheduledAt: string,
  nextMatchId: string | null = null,
  nextMatchSlot: 'A' | 'B' | null = null,
): Omit<TournamentMatch, 'createdAt' | 'updatedAt'> {
  return match(id, sport, category, round, matchNumber, scheduledAt, ['TBD'], ['TBD'], nextMatchId, nextMatchSlot);
}

// ─── FRIDAY 8 MAY — Singles Qualifiers ──────────────────────────────────────

const FRI = '2026-05-08';

const TT_SQ = [
  match('tt-s-q1', 'TABLE_TENNIS', 'SINGLES', 'QUALIFIER', 1, ist(FRI,'19:30'), ['Rustom D'], ['Jehan D']),
  match('tt-s-q2', 'TABLE_TENNIS', 'SINGLES', 'QUALIFIER', 2, ist(FRI,'19:45'), ['Yohann D'], ['Khudavand K']),
  match('tt-s-q3', 'TABLE_TENNIS', 'SINGLES', 'QUALIFIER', 3, ist(FRI,'20:00'), ['Jehan K'], ['Yohan N']),
  match('tt-s-q4', 'TABLE_TENNIS', 'SINGLES', 'QUALIFIER', 4, ist(FRI,'20:15'), ['Rushad G'], ['Sohrab M']),
  match('tt-s-q5', 'TABLE_TENNIS', 'SINGLES', 'QUALIFIER', 5, ist(FRI,'20:30'), ['Aaryan M'], ['Merwyn P']),
];

const BD_SQ = [
  match('bd-s-q1', 'BADMINTON', 'SINGLES', 'QUALIFIER', 1, ist(FRI,'19:30'), ['Piroze K'], ['Mehernosh P']),
  match('bd-s-q2', 'BADMINTON', 'SINGLES', 'QUALIFIER', 2, ist(FRI,'19:45'), ['Farzil P'], ['Chirag I']),
  match('bd-s-q3', 'BADMINTON', 'SINGLES', 'QUALIFIER', 3, ist(FRI,'20:00'), ['Farhad G'], ['Zeus M']),
  match('bd-s-q4', 'BADMINTON', 'SINGLES', 'QUALIFIER', 4, ist(FRI,'20:15'), ['Rustom P'], ['Zeus K']),
  match('bd-s-q5', 'BADMINTON', 'SINGLES', 'QUALIFIER', 5, ist(FRI,'20:30'), ['Neville K'], ['Daraayush P']),
];

const PB_SQ = [
  match('pb-s-q1', 'PICKLEBALL', 'SINGLES', 'QUALIFIER', 1, ist(FRI,'19:30'), ['Zeus C'], ['Karl K']),
  match('pb-s-q2', 'PICKLEBALL', 'SINGLES', 'QUALIFIER', 2, ist(FRI,'19:45'), ['Tabrez M'], ['Nozer A']),
  match('pb-s-q3', 'PICKLEBALL', 'SINGLES', 'QUALIFIER', 3, ist(FRI,'20:00'), ['Arish S'], ['Jehan D']),
  match('pb-s-q4', 'PICKLEBALL', 'SINGLES', 'QUALIFIER', 4, ist(FRI,'20:15'), ['Zerab A'], ['Sean T']),
  match('pb-s-q5', 'PICKLEBALL', 'SINGLES', 'QUALIFIER', 5, ist(FRI,'20:30'), ['Barzin P'], ['Cherag B']),
];

// ─── FRIDAY 8 MAY — Open Doubles Qualifiers ──────────────────────────────────

const TT_OD = [
  match('tt-od-q1','TABLE_TENNIS','OPEN_DOUBLES','QUALIFIER',1,ist(FRI,'20:45'),['Yohan N','Karl K'],['Shazen E','Sohrab M']),
  match('tt-od-q2','TABLE_TENNIS','OPEN_DOUBLES','QUALIFIER',2,ist(FRI,'21:00'),['Sean T','Aaryan M'],['Katreina H','Jehan K']),
  match('tt-od-q3','TABLE_TENNIS','OPEN_DOUBLES','QUALIFIER',3,ist(FRI,'21:15'),['Percy P','Cyrus M'],['Yohann D','Zerab A']),
  match('tt-od-q4','TABLE_TENNIS','OPEN_DOUBLES','QUALIFIER',4,ist(FRI,'21:30'),['Farzil P','Rushad G'],['Hushang M','Janine A']),
  match('tt-od-q5','TABLE_TENNIS','OPEN_DOUBLES','QUALIFIER',5,ist(FRI,'21:45'),['Merwyn P','Pearl A'],['Barzin P','Hormazd K']),
];

const BD_OD = [
  match('bd-od-q1','BADMINTON','OPEN_DOUBLES','QUALIFIER',1,ist(FRI,'20:45'),['Jenaina I','Scherezade I'],['Farzan V','Piroze K']),
  match('bd-od-q2','BADMINTON','OPEN_DOUBLES','QUALIFIER',2,ist(FRI,'21:00'),['Daraayush P','Anosh P'],['Hushang M','Zeus K']),
  match('bd-od-q3','BADMINTON','OPEN_DOUBLES','QUALIFIER',3,ist(FRI,'21:15'),['Dinaz P','Spenta U'],['Neville K','Kaizad A']),
  match('bd-od-q4','BADMINTON','OPEN_DOUBLES','QUALIFIER',4,ist(FRI,'21:30'),['Karl T','Hormuz B'],['Farad D','Chirag I']),
  match('bd-od-q5','BADMINTON','OPEN_DOUBLES','QUALIFIER',5,ist(FRI,'21:45'),['Khoremand I','Benaifer K'],['Xerxes A','Farhad G']),
];

const PB_OD = [
  match('pb-od-q1','PICKLEBALL','OPEN_DOUBLES','QUALIFIER',1,ist(FRI,'20:45'),['Karl B','Tabrez M'],['Danush D','Zeus C']),
  match('pb-od-q2','PICKLEBALL','OPEN_DOUBLES','QUALIFIER',2,ist(FRI,'21:00'),['Airyaman M','Rishad U'],['Zaara D','Arish S']),
  match('pb-od-q3','PICKLEBALL','OPEN_DOUBLES','QUALIFIER',3,ist(FRI,'21:15'),['Benaifer K','Katreina H'],['Naomi P','Pearl A']),
  match('pb-od-q4','PICKLEBALL','OPEN_DOUBLES','QUALIFIER',4,ist(FRI,'21:30'),['Rustom D','Hushad K'],['Sean T','Aaryan M']),
  match('pb-od-q5','PICKLEBALL','OPEN_DOUBLES','QUALIFIER',5,ist(FRI,'21:45'),['Rushaad E','Zerab A'],['Zarayus A','Cyrus M']),
];

// ─── FRIDAY 8 MAY — Carrom Open Doubles Qualifiers ───────────────────────────

const CR_OD = [
  match('cr-od-q1','CARROM','CARROM_DOUBLES','QUALIFIER',1,ist(FRI,'19:30'),['Shazen E','Nivaan K'],['Ashdin R','Nozer A']),
  match('cr-od-q2','CARROM','CARROM_DOUBLES','QUALIFIER',2,ist(FRI,'19:45'),['Cherag B','Piran M'],['Jenaina G','Percy P']),
  match('cr-od-q3','CARROM','CARROM_DOUBLES','QUALIFIER',3,ist(FRI,'20:00'),['Maia D','Bianca D'],['Joshua D','Jehan H']),
  match('cr-od-q4','CARROM','CARROM_DOUBLES','QUALIFIER',4,ist(FRI,'20:15'),['Hushang M','Jinelle D'],['Farzil P','Tabrez M']),
  match('cr-od-q5','CARROM','CARROM_DOUBLES','QUALIFIER',5,ist(FRI,'20:30'),['Zara K','Zeus M'],['Karishma K','Sharzad S']),
];

// ─── SATURDAY 9 MAY — Mixed Doubles Qualifiers ───────────────────────────────

const SAT = '2026-05-09';

const TT_MD = [
  match('tt-md-q1','TABLE_TENNIS','MIXED_DOUBLES','QUALIFIER',1,ist(SAT,'10:00'),['Merwyn P','Pearl A'],['Joshua D','Scherezade I']),
  match('tt-md-q2','TABLE_TENNIS','MIXED_DOUBLES','QUALIFIER',2,ist(SAT,'10:15'),['Khudavand K','Janine A'],['Farah D','Xerxes A']),
  match('tt-md-q3','TABLE_TENNIS','MIXED_DOUBLES','QUALIFIER',3,ist(SAT,'10:30'),['Yohann D','Zara L'],['Mitchelle A','Percy P']),
  match('tt-md-q4','TABLE_TENNIS','MIXED_DOUBLES','QUALIFIER',4,ist(SAT,'10:45'),['Spenta U','Rushad G'],['Jehan K','Katreina H']),
  match('tt-md-q5','TABLE_TENNIS','MIXED_DOUBLES','QUALIFIER',5,ist(SAT,'11:00'),['Kamal M','Shazen E'],['Yohan N','Maia D']),
];

const BD_MD = [
  match('bd-md-q1','BADMINTON','MIXED_DOUBLES','QUALIFIER',1,ist(SAT,'10:00'),['Zara K','Karl T'],['Mitchelle A','Piroze K']),
  match('bd-md-q2','BADMINTON','MIXED_DOUBLES','QUALIFIER',2,ist(SAT,'10:15'),['Bianca D','Anosh P'],['Karl B','Pearl T']),
  match('bd-md-q3','BADMINTON','MIXED_DOUBLES','QUALIFIER',3,ist(SAT,'10:30'),['Delna P','Khorzad B'],['Zaara D','Chirag I']),
  match('bd-md-q4','BADMINTON','MIXED_DOUBLES','QUALIFIER',4,ist(SAT,'10:45'),['Farah D','Xerxes A'],['Scherezade I','Mehernosh P']),
  match('bd-md-q5','BADMINTON','MIXED_DOUBLES','QUALIFIER',5,ist(SAT,'11:00'),['Naomi A','Neville K'],['Benaifer K','Khoremand I']),
];

const PB_MD = [
  match('pb-md-q1','PICKLEBALL','MIXED_DOUBLES','QUALIFIER',1,ist(SAT,'10:00'),['Iyanah D','Cherag B'],['Zaara D','Arish S']),
  match('pb-md-q2','PICKLEBALL','MIXED_DOUBLES','QUALIFIER',2,ist(SAT,'10:15'),['Rian M','Zarir M'],['Naomi A','Nozer A']),
  match('pb-md-q3','PICKLEBALL','MIXED_DOUBLES','QUALIFIER',3,ist(SAT,'10:30'),['Janine A','Zeus C'],['Maia D','Airyaman M']),
  match('pb-md-q4','PICKLEBALL','MIXED_DOUBLES','QUALIFIER',4,ist(SAT,'10:45'),['Sanya A','Sharzad S'],['Farah K','Joshua D']),
  match('pb-md-q5','PICKLEBALL','MIXED_DOUBLES','QUALIFIER',5,ist(SAT,'11:00'),['Mitchelle A','Jehan D'],['Karl B','Pearl T']),
];

// ─── SATURDAY 9 MAY — Placement matches ─────────────────────────────────────

const PLACEMENTS = [
  // Singles 5th/6th (if required)
  bracket('tt-s-p56','TABLE_TENNIS','SINGLES','PLACEMENT_56',1,ist(SAT,'11:15')),
  bracket('bd-s-p56','BADMINTON','SINGLES','PLACEMENT_56',1,ist(SAT,'11:15')),
  bracket('pb-s-p56','PICKLEBALL','SINGLES','PLACEMENT_56',1,ist(SAT,'11:15')),
  // Singles 7th/8th
  bracket('tt-s-p78','TABLE_TENNIS','SINGLES','PLACEMENT_78',1,ist(SAT,'11:45')),
  bracket('bd-s-p78','BADMINTON','SINGLES','PLACEMENT_78',1,ist(SAT,'11:45')),
  bracket('pb-s-p78','PICKLEBALL','SINGLES','PLACEMENT_78',1,ist(SAT,'11:45')),
  // Open Doubles 6th (if required)
  bracket('tt-od-p56','TABLE_TENNIS','OPEN_DOUBLES','PLACEMENT_56',1,ist(SAT,'12:15')),
  bracket('bd-od-p56','BADMINTON','OPEN_DOUBLES','PLACEMENT_56',1,ist(SAT,'12:15')),
  bracket('pb-od-p56','PICKLEBALL','OPEN_DOUBLES','PLACEMENT_56',1,ist(SAT,'12:15')),
  // Open Doubles 7th/8th
  bracket('tt-od-p78','TABLE_TENNIS','OPEN_DOUBLES','PLACEMENT_78',1,ist(SAT,'12:30')),
  bracket('bd-od-p78','BADMINTON','OPEN_DOUBLES','PLACEMENT_78',1,ist(SAT,'12:30')),
  bracket('pb-od-p78','PICKLEBALL','OPEN_DOUBLES','PLACEMENT_78',1,ist(SAT,'12:30')),
  // Mixed Doubles 6th (if required)
  bracket('tt-md-p56','TABLE_TENNIS','MIXED_DOUBLES','PLACEMENT_56',1,ist(SAT,'12:45')),
  bracket('bd-md-p56','BADMINTON','MIXED_DOUBLES','PLACEMENT_56',1,ist(SAT,'12:45')),
  bracket('pb-md-p56','PICKLEBALL','MIXED_DOUBLES','PLACEMENT_56',1,ist(SAT,'12:45')),
  // Mixed Doubles 7th/8th
  bracket('tt-md-p78','TABLE_TENNIS','MIXED_DOUBLES','PLACEMENT_78',1,ist(SAT,'13:00')),
  bracket('bd-md-p78','BADMINTON','MIXED_DOUBLES','PLACEMENT_78',1,ist(SAT,'13:00')),
  bracket('pb-md-p78','PICKLEBALL','MIXED_DOUBLES','PLACEMENT_78',1,ist(SAT,'13:00')),
];

// ─── SATURDAY 9 MAY — Quarter Finals (bracket wired QF→SF→Final) ─────────────

const SUN = '2026-05-10';

// Finals
const TT_S_F  = bracket('tt-s-final', 'TABLE_TENNIS','SINGLES','FINAL',1,ist(SUN,'13:30'));
const BD_S_F  = bracket('bd-s-final', 'BADMINTON',  'SINGLES','FINAL',1,ist(SUN,'13:30'));
const PB_S_F  = bracket('pb-s-final', 'PICKLEBALL', 'SINGLES','FINAL',1,ist(SUN,'13:30'));
const TT_OD_F = bracket('tt-od-final','TABLE_TENNIS','OPEN_DOUBLES','FINAL',1,ist(SUN,'14:30'));
const BD_OD_F = bracket('bd-od-final','BADMINTON',  'OPEN_DOUBLES','FINAL',1,ist(SUN,'14:30'));
const PB_OD_F = bracket('pb-od-final','PICKLEBALL', 'OPEN_DOUBLES','FINAL',1,ist(SUN,'14:30'));
const CR_OD_F = bracket('cr-od-final','CARROM',     'CARROM_DOUBLES','FINAL',1,ist(SUN,'14:30'));
const TT_MD_F = bracket('tt-md-final','TABLE_TENNIS','MIXED_DOUBLES','FINAL',1,ist(SUN,'15:30'));
const BD_MD_F = bracket('bd-md-final','BADMINTON',  'MIXED_DOUBLES','FINAL',1,ist(SUN,'15:30'));
const PB_MD_F = bracket('pb-md-final','PICKLEBALL', 'MIXED_DOUBLES','FINAL',1,ist(SUN,'15:30'));

// Semis (wired to final)
const TT_S_SF1  = bracket('tt-s-sf1', 'TABLE_TENNIS','SINGLES','SF',1,ist(SUN,'10:30'), 'tt-s-final','A');
const TT_S_SF2  = bracket('tt-s-sf2', 'TABLE_TENNIS','SINGLES','SF',2,ist(SUN,'10:30'), 'tt-s-final','B');
const BD_S_SF1  = bracket('bd-s-sf1', 'BADMINTON',  'SINGLES','SF',1,ist(SUN,'10:30'), 'bd-s-final','A');
const BD_S_SF2  = bracket('bd-s-sf2', 'BADMINTON',  'SINGLES','SF',2,ist(SUN,'10:30'), 'bd-s-final','B');
const PB_S_SF1  = bracket('pb-s-sf1', 'PICKLEBALL', 'SINGLES','SF',1,ist(SUN,'10:30'), 'pb-s-final','A');
const PB_S_SF2  = bracket('pb-s-sf2', 'PICKLEBALL', 'SINGLES','SF',2,ist(SUN,'10:30'), 'pb-s-final','B');

const TT_OD_SF1 = bracket('tt-od-sf1','TABLE_TENNIS','OPEN_DOUBLES','SF',1,ist(SUN,'11:30'), 'tt-od-final','A');
const TT_OD_SF2 = bracket('tt-od-sf2','TABLE_TENNIS','OPEN_DOUBLES','SF',2,ist(SUN,'11:30'), 'tt-od-final','B');
const BD_OD_SF1 = bracket('bd-od-sf1','BADMINTON',  'OPEN_DOUBLES','SF',1,ist(SUN,'11:30'), 'bd-od-final','A');
const BD_OD_SF2 = bracket('bd-od-sf2','BADMINTON',  'OPEN_DOUBLES','SF',2,ist(SUN,'11:30'), 'bd-od-final','B');
const PB_OD_SF1 = bracket('pb-od-sf1','PICKLEBALL', 'OPEN_DOUBLES','SF',1,ist(SUN,'11:30'), 'pb-od-final','A');
const PB_OD_SF2 = bracket('pb-od-sf2','PICKLEBALL', 'OPEN_DOUBLES','SF',2,ist(SUN,'11:30'), 'pb-od-final','B');
const CR_OD_SF1 = bracket('cr-od-sf1','CARROM',     'CARROM_DOUBLES','SF',1,ist(SUN,'11:30'), 'cr-od-final','A');
const CR_OD_SF2 = bracket('cr-od-sf2','CARROM',     'CARROM_DOUBLES','SF',2,ist(SUN,'11:30'), 'cr-od-final','B');

const TT_MD_SF1 = bracket('tt-md-sf1','TABLE_TENNIS','MIXED_DOUBLES','SF',1,ist(SUN,'12:30'), 'tt-md-final','A');
const TT_MD_SF2 = bracket('tt-md-sf2','TABLE_TENNIS','MIXED_DOUBLES','SF',2,ist(SUN,'12:30'), 'tt-md-final','B');
const BD_MD_SF1 = bracket('bd-md-sf1','BADMINTON',  'MIXED_DOUBLES','SF',1,ist(SUN,'12:30'), 'bd-md-final','A');
const BD_MD_SF2 = bracket('bd-md-sf2','BADMINTON',  'MIXED_DOUBLES','SF',2,ist(SUN,'12:30'), 'bd-md-final','B');
const PB_MD_SF1 = bracket('pb-md-sf1','PICKLEBALL', 'MIXED_DOUBLES','SF',1,ist(SUN,'12:30'), 'pb-md-final','A');
const PB_MD_SF2 = bracket('pb-md-sf2','PICKLEBALL', 'MIXED_DOUBLES','SF',2,ist(SUN,'12:30'), 'pb-md-final','B');

// Quarter Finals (wired to semis)
const QF_SAT_S  = ist(SAT,'13:30');
const QF_SAT_OD = ist(SAT,'15:30');
const QF_SAT_MD = ist(SAT,'18:00');

const QFS = [
  // TT Singles QFs
  bracket('tt-s-qf1','TABLE_TENNIS','SINGLES','QF',1,QF_SAT_S,'tt-s-sf1','A'),
  bracket('tt-s-qf2','TABLE_TENNIS','SINGLES','QF',2,QF_SAT_S,'tt-s-sf1','B'),
  bracket('tt-s-qf3','TABLE_TENNIS','SINGLES','QF',3,QF_SAT_S,'tt-s-sf2','A'),
  bracket('tt-s-qf4','TABLE_TENNIS','SINGLES','QF',4,QF_SAT_S,'tt-s-sf2','B'),
  // Badminton Singles QFs
  bracket('bd-s-qf1','BADMINTON','SINGLES','QF',1,QF_SAT_S,'bd-s-sf1','A'),
  bracket('bd-s-qf2','BADMINTON','SINGLES','QF',2,QF_SAT_S,'bd-s-sf1','B'),
  bracket('bd-s-qf3','BADMINTON','SINGLES','QF',3,QF_SAT_S,'bd-s-sf2','A'),
  bracket('bd-s-qf4','BADMINTON','SINGLES','QF',4,QF_SAT_S,'bd-s-sf2','B'),
  // Pickleball Singles QFs
  bracket('pb-s-qf1','PICKLEBALL','SINGLES','QF',1,QF_SAT_S,'pb-s-sf1','A'),
  bracket('pb-s-qf2','PICKLEBALL','SINGLES','QF',2,QF_SAT_S,'pb-s-sf1','B'),
  bracket('pb-s-qf3','PICKLEBALL','SINGLES','QF',3,QF_SAT_S,'pb-s-sf2','A'),
  bracket('pb-s-qf4','PICKLEBALL','SINGLES','QF',4,QF_SAT_S,'pb-s-sf2','B'),
  // TT Open Doubles QFs
  bracket('tt-od-qf1','TABLE_TENNIS','OPEN_DOUBLES','QF',1,QF_SAT_OD,'tt-od-sf1','A'),
  bracket('tt-od-qf2','TABLE_TENNIS','OPEN_DOUBLES','QF',2,QF_SAT_OD,'tt-od-sf1','B'),
  bracket('tt-od-qf3','TABLE_TENNIS','OPEN_DOUBLES','QF',3,QF_SAT_OD,'tt-od-sf2','A'),
  bracket('tt-od-qf4','TABLE_TENNIS','OPEN_DOUBLES','QF',4,QF_SAT_OD,'tt-od-sf2','B'),
  // Badminton Open Doubles QFs
  bracket('bd-od-qf1','BADMINTON','OPEN_DOUBLES','QF',1,QF_SAT_OD,'bd-od-sf1','A'),
  bracket('bd-od-qf2','BADMINTON','OPEN_DOUBLES','QF',2,QF_SAT_OD,'bd-od-sf1','B'),
  bracket('bd-od-qf3','BADMINTON','OPEN_DOUBLES','QF',3,QF_SAT_OD,'bd-od-sf2','A'),
  bracket('bd-od-qf4','BADMINTON','OPEN_DOUBLES','QF',4,QF_SAT_OD,'bd-od-sf2','B'),
  // Pickleball Open Doubles QFs
  bracket('pb-od-qf1','PICKLEBALL','OPEN_DOUBLES','QF',1,QF_SAT_OD,'pb-od-sf1','A'),
  bracket('pb-od-qf2','PICKLEBALL','OPEN_DOUBLES','QF',2,QF_SAT_OD,'pb-od-sf1','B'),
  bracket('pb-od-qf3','PICKLEBALL','OPEN_DOUBLES','QF',3,QF_SAT_OD,'pb-od-sf2','A'),
  bracket('pb-od-qf4','PICKLEBALL','OPEN_DOUBLES','QF',4,QF_SAT_OD,'pb-od-sf2','B'),
  // Carrom Open Doubles QFs
  bracket('cr-od-qf1','CARROM','CARROM_DOUBLES','QF',1,QF_SAT_OD,'cr-od-sf1','A'),
  bracket('cr-od-qf2','CARROM','CARROM_DOUBLES','QF',2,QF_SAT_OD,'cr-od-sf1','B'),
  bracket('cr-od-qf3','CARROM','CARROM_DOUBLES','QF',3,QF_SAT_OD,'cr-od-sf2','A'),
  bracket('cr-od-qf4','CARROM','CARROM_DOUBLES','QF',4,QF_SAT_OD,'cr-od-sf2','B'),
  // TT Mixed Doubles QFs
  bracket('tt-md-qf1','TABLE_TENNIS','MIXED_DOUBLES','QF',1,QF_SAT_MD,'tt-md-sf1','A'),
  bracket('tt-md-qf2','TABLE_TENNIS','MIXED_DOUBLES','QF',2,QF_SAT_MD,'tt-md-sf1','B'),
  bracket('tt-md-qf3','TABLE_TENNIS','MIXED_DOUBLES','QF',3,QF_SAT_MD,'tt-md-sf2','A'),
  bracket('tt-md-qf4','TABLE_TENNIS','MIXED_DOUBLES','QF',4,QF_SAT_MD,'tt-md-sf2','B'),
  // Badminton Mixed Doubles QFs
  bracket('bd-md-qf1','BADMINTON','MIXED_DOUBLES','QF',1,QF_SAT_MD,'bd-md-sf1','A'),
  bracket('bd-md-qf2','BADMINTON','MIXED_DOUBLES','QF',2,QF_SAT_MD,'bd-md-sf1','B'),
  bracket('bd-md-qf3','BADMINTON','MIXED_DOUBLES','QF',3,QF_SAT_MD,'bd-md-sf2','A'),
  bracket('bd-md-qf4','BADMINTON','MIXED_DOUBLES','QF',4,QF_SAT_MD,'bd-md-sf2','B'),
  // Pickleball Mixed Doubles QFs
  bracket('pb-md-qf1','PICKLEBALL','MIXED_DOUBLES','QF',1,QF_SAT_MD,'pb-md-sf1','A'),
  bracket('pb-md-qf2','PICKLEBALL','MIXED_DOUBLES','QF',2,QF_SAT_MD,'pb-md-sf1','B'),
  bracket('pb-md-qf3','PICKLEBALL','MIXED_DOUBLES','QF',3,QF_SAT_MD,'pb-md-sf2','A'),
  bracket('pb-md-qf4','PICKLEBALL','MIXED_DOUBLES','QF',4,QF_SAT_MD,'pb-md-sf2','B'),
];

// ─── Export ───────────────────────────────────────────────────────────────────

export const ALL_SEED_MATCHES: Omit<TournamentMatch, 'createdAt' | 'updatedAt'>[] = [
  // Friday qualifier rounds
  ...TT_SQ, ...BD_SQ, ...PB_SQ,
  ...TT_OD, ...BD_OD, ...PB_OD,
  ...CR_OD,
  // Saturday qualifiers (mixed doubles)
  ...TT_MD, ...BD_MD, ...PB_MD,
  // Placement matches
  ...PLACEMENTS,
  // QFs
  ...QFS,
  // Semis
  TT_S_SF1, TT_S_SF2, BD_S_SF1, BD_S_SF2, PB_S_SF1, PB_S_SF2,
  TT_OD_SF1, TT_OD_SF2, BD_OD_SF1, BD_OD_SF2, PB_OD_SF1, PB_OD_SF2,
  CR_OD_SF1, CR_OD_SF2,
  TT_MD_SF1, TT_MD_SF2, BD_MD_SF1, BD_MD_SF2, PB_MD_SF1, PB_MD_SF2,
  // Finals
  TT_S_F, BD_S_F, PB_S_F,
  TT_OD_F, BD_OD_F, PB_OD_F, CR_OD_F,
  TT_MD_F, BD_MD_F, PB_MD_F,
];

export const SEED_MATCH_COUNT = ALL_SEED_MATCHES.length;
