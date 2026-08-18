import { RaceStroke } from './types';

/**
 * World records and Russian classification standards (ЕВСК), used to give an athlete a sense of
 * where a real time trial (`AthleteProfile.benchmark`) sits relative to elite swimming and to
 * suggest a concrete next target. This is curated reference data, not a live feed — world
 * records get broken and ЕВСК standards are revised on a multi-year cycle, so both tables are
 * manually maintained and should be periodically re-checked against worldaquatics.com /
 * the Russian swimming federation rather than assumed permanently accurate. See the "Records &
 * goals" section of CLAUDE.md for scope notes (freestyle only, why some ranks are interpolated).
 */
export type Gender = 'male' | 'female';

export interface WorldRecord {
  stroke: RaceStroke;
  distance: number; // meters, long course (50m pool)
  gender: Gender;
  timeSec: number;
  holder: string;
  year: number;
}

// Long-course-meters individual world records, current as of early 2026. Holder/year are shown
// for context, not guaranteed to still be exactly current by the time this is read.
export const WORLD_RECORDS: WorldRecord[] = [
  { stroke: 'freestyle', distance: 50, gender: 'male', timeSec: 20.88, holder: 'Cameron McEvoy', year: 2026 },
  { stroke: 'freestyle', distance: 100, gender: 'male', timeSec: 46.4, holder: 'Pan Zhanle', year: 2024 },
  { stroke: 'freestyle', distance: 200, gender: 'male', timeSec: 102.0, holder: 'Paul Biedermann', year: 2009 },
  { stroke: 'freestyle', distance: 400, gender: 'male', timeSec: 219.96, holder: 'Lukas Märtens', year: 2025 },
  { stroke: 'freestyle', distance: 800, gender: 'male', timeSec: 452.12, holder: 'Zhang Lin', year: 2009 },
  { stroke: 'freestyle', distance: 1500, gender: 'male', timeSec: 870.67, holder: 'Bobby Finke', year: 2024 },
  { stroke: 'backstroke', distance: 100, gender: 'male', timeSec: 51.6, holder: 'Thomas Ceccon', year: 2022 },
  { stroke: 'backstroke', distance: 200, gender: 'male', timeSec: 111.92, holder: 'Aaron Peirsol', year: 2009 },
  { stroke: 'breaststroke', distance: 100, gender: 'male', timeSec: 56.88, holder: 'Adam Peaty', year: 2019 },
  { stroke: 'breaststroke', distance: 200, gender: 'male', timeSec: 125.48, holder: 'Qin Haiyang', year: 2023 },
  { stroke: 'butterfly', distance: 100, gender: 'male', timeSec: 49.45, holder: 'Caeleb Dressel', year: 2021 },
  { stroke: 'butterfly', distance: 200, gender: 'male', timeSec: 110.34, holder: 'Kristóf Milák', year: 2022 },
  { stroke: 'im', distance: 200, gender: 'male', timeSec: 112.69, holder: 'Léon Marchand', year: 2025 },
  { stroke: 'im', distance: 400, gender: 'male', timeSec: 242.5, holder: 'Léon Marchand', year: 2023 },

  { stroke: 'freestyle', distance: 50, gender: 'female', timeSec: 23.19, holder: 'Kate Douglass', year: 2026 },
  { stroke: 'freestyle', distance: 100, gender: 'female', timeSec: 51.68, holder: 'Marrit Steenbergen', year: 2026 },
  { stroke: 'freestyle', distance: 200, gender: 'female', timeSec: 112.85, holder: "Mollie O'Callaghan", year: 2024 },
  { stroke: 'freestyle', distance: 400, gender: 'female', timeSec: 235.38, holder: 'Ariarne Titmus', year: 2022 },
  { stroke: 'freestyle', distance: 800, gender: 'female', timeSec: 484.12, holder: 'Katie Ledecky', year: 2025 },
  { stroke: 'freestyle', distance: 1500, gender: 'female', timeSec: 920.48, holder: 'Katie Ledecky', year: 2018 },
  { stroke: 'backstroke', distance: 100, gender: 'female', timeSec: 57.33, holder: 'Kaylee McKeown', year: 2023 },
  { stroke: 'backstroke', distance: 200, gender: 'female', timeSec: 123.14, holder: 'Regan Smith', year: 2024 },
  { stroke: 'breaststroke', distance: 100, gender: 'female', timeSec: 64.13, holder: 'Rūta Meilutytė', year: 2023 },
  { stroke: 'breaststroke', distance: 200, gender: 'female', timeSec: 137.55, holder: 'Evgeniia Chikunova', year: 2024 },
  { stroke: 'butterfly', distance: 100, gender: 'female', timeSec: 54.6, holder: 'Gretchen Walsh', year: 2025 },
  { stroke: 'butterfly', distance: 200, gender: 'female', timeSec: 121.24, holder: 'Summer McIntosh', year: 2023 },
  { stroke: 'im', distance: 200, gender: 'female', timeSec: 126.56, holder: 'Summer McIntosh', year: 2024 },
  { stroke: 'im', distance: 400, gender: 'female', timeSec: 263.65, holder: 'Summer McIntosh', year: 2024 },
];

export function findWorldRecord(gender: Gender, stroke: RaceStroke, distance: number): WorldRecord | undefined {
  return WORLD_RECORDS.find((r) => r.gender === gender && r.stroke === stroke && r.distance === distance);
}

export type EvskRank = 'rank3' | 'rank2' | 'rank1' | 'kms' | 'ms' | 'msmk';

/** Slowest (easiest) to fastest (hardest) — the order a beginner progresses through. */
export const EVSK_RANK_ORDER: EvskRank[] = ['rank3', 'rank2', 'rank1', 'kms', 'ms', 'msmk'];

interface EvskStandard {
  distance: number;
  gender: Gender;
  times: Record<EvskRank, number>;
}

/**
 * Russian ЕВСК (Единая всероссийская спортивная классификация) freestyle standards, 2024–2026
 * cycle, 25m (short) course. Scoped to freestyle/100-200-400m only — the distances and stroke
 * this app's own benchmark/race-distance fields already cover, and the ones with the most
 * directly-sourced data. МСМК/МС/КМС times below are sourced directly from swimka.ru's 2024–2026
 * table; I/II/III разряд times for 200m (both genders) and 400m (women) weren't directly found
 * and are interpolated from the rank-to-rank ratios observed on the fully-sourced distances
 * (100m both genders, 400m men) — treat those specific cells as an approximation, not an
 * official figure, and double check against a current federation table before using them for
 * real classification/certification purposes.
 */
export const EVSK_FREESTYLE_25M: EvskStandard[] = [
  {
    distance: 100,
    gender: 'female',
    times: { rank3: 79.1, rank2: 71.4, rank1: 63.84, kms: 60.0, ms: 56.0, msmk: 52.68 },
  },
  {
    distance: 200,
    gender: 'female',
    times: { rank3: 174.7, rank2: 157.7, rank1: 141.1, kms: 132.55, ms: 124.25, msmk: 114.74 },
  },
  {
    distance: 400,
    gender: 'female',
    times: { rank3: 366.4, rank2: 330.7, rank1: 295.8, kms: 278.0, ms: 263.0, msmk: 241.47 },
  },
  {
    distance: 100,
    gender: 'male',
    times: { rank3: 71.0, rank2: 63.5, rank1: 57.1, kms: 53.7, ms: 50.4, msmk: 47.05 },
  },
  {
    distance: 200,
    gender: 'male',
    times: { rank3: 159.0, rank2: 141.1, rank1: 125.9, kms: 118.25, ms: 111.75, msmk: 104.25 },
  },
  {
    distance: 400,
    gender: 'male',
    times: { rank3: 344.0, rank2: 303.0, rank1: 268.0, kms: 251.5, ms: 239.0, msmk: 222.57 },
  },
];

function findEvskStandard(gender: Gender, distance: number): EvskStandard | undefined {
  return EVSK_FREESTYLE_25M.find((s) => s.gender === gender && s.distance === distance);
}

/** The best (fastest) rank a time already qualifies for, or null if slower than III разряд. */
export function rankForTime(gender: Gender, distance: number, timeSec: number): EvskRank | null {
  const standard = findEvskStandard(gender, distance);
  if (!standard) return null;
  let achieved: EvskRank | null = null;
  for (const rank of EVSK_RANK_ORDER) {
    if (timeSec <= standard.times[rank]) achieved = rank;
  }
  return achieved;
}

export interface NextRankTarget {
  rank: EvskRank;
  timeSec: number;
  secondsToImprove: number;
}

/** The next rank up from a time, and how many seconds need to come off to reach it. */
export function nextRankTarget(gender: Gender, distance: number, timeSec: number): NextRankTarget | null {
  const standard = findEvskStandard(gender, distance);
  if (!standard) return null;
  for (const rank of EVSK_RANK_ORDER) {
    if (standard.times[rank] < timeSec) {
      return { rank, timeSec: standard.times[rank], secondsToImprove: timeSec - standard.times[rank] };
    }
  }
  return null; // already at or beyond МСМК
}
