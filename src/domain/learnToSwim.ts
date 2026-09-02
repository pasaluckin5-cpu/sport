import { LearnToSwimDay, LearnToSwimDrill, LearnToSwimDrillKind, LearnToSwimPlan, LearnToSwimStage } from './types';
import { rotateArray } from './week';

/**
 * Reference pace: 20 minutes/day gets you through the whole curriculum in 30 days (hence "learn
 * to swim in 30 days"). The curriculum has a fixed total time budget — 600 minutes, roughly what
 * typical adult learn-to-swim courses run (8-10 lessons of 45-60 minutes) — so a chosen daily
 * time budget above or below the reference pace compresses or stretches the *number of days*,
 * not the content itself.
 */
const BASELINE_MINUTES_PER_DAY = 20;
const BASELINE_TOTAL_DAYS = 30;
const BASELINE_TOTAL_MINUTES = BASELINE_MINUTES_PER_DAY * BASELINE_TOTAL_DAYS;

/**
 * Floor on total days regardless of how much daily time is chosen: motor skills (especially
 * water-safety ones) consolidate through repeated exposure across separate days, not just total
 * minutes — cramming the whole budget into a handful of very long days isn't how this actually
 * works, so more time/day buys *shorter* lessons per stage, not a shorter curriculum below this
 * floor. The cap on the other end just keeps a very small daily budget from stretching into a
 * number of days nobody would actually call "a program."
 */
const MIN_TOTAL_DAYS = 14;
const MAX_TOTAL_DAYS = 60;

/** More minutes/day finishes sooner (down to MIN_TOTAL_DAYS); less minutes/day takes longer (up to MAX_TOTAL_DAYS). */
export function computeTotalDays(minutesPerDay: number): number {
  const safeMinutes = Math.max(1, minutesPerDay);
  const raw = Math.round(BASELINE_TOTAL_MINUTES / safeMinutes);
  return Math.min(MAX_TOTAL_DAYS, Math.max(MIN_TOTAL_DAYS, raw));
}

/**
 * Curated progression through the classic learn-to-swim skill sequence (comfort -> floating ->
 * gliding -> kicking -> arm stroke -> breathing coordination -> full stroke + safety endurance),
 * each roughly proportional to how much real practice time that skill typically needs. Proportions
 * sum to 1. At MIN_TOTAL_DAYS (14), the smallest proportion (0.10) still floors to >=1 day per
 * stage (14 * 0.10 = 1.4) — see learnToSwim.test.ts's coverage of this invariant.
 */
const STAGE_ORDER: LearnToSwimStage[] = [
  'waterComfort',
  'floating',
  'gliding',
  'kicking',
  'armStroke',
  'breathingCoordination',
  'fullStrokeEndurance',
];

const STAGE_PROPORTIONS: Record<LearnToSwimStage, number> = {
  waterComfort: 0.1,
  floating: 0.15,
  gliding: 0.1,
  kicking: 0.15,
  armStroke: 0.15,
  breathingCoordination: 0.15,
  fullStrokeEndurance: 0.2,
};

/** Splits totalDays across STAGE_ORDER by STAGE_PROPORTIONS, using largest-remainder apportionment so the parts sum to exactly totalDays. */
export function allocateStageDays(totalDays: number): { stage: LearnToSwimStage; days: number }[] {
  const raw = STAGE_ORDER.map((stage) => totalDays * STAGE_PROPORTIONS[stage]);
  const base = raw.map((n) => Math.floor(n));
  const remainder = totalDays - base.reduce((a, b) => a + b, 0);
  const byFraction = raw.map((n, i) => ({ i, frac: n - base[i] })).sort((a, b) => b.frac - a.frac);
  const days = [...base];
  for (let k = 0; k < remainder; k++) days[byFraction[k].i] += 1;
  return STAGE_ORDER.map((stage, i) => ({ stage, days: days[i] }));
}

/**
 * Which drills belong to each stage, in a fixed base order (rotated per day within the stage —
 * see buildDayLesson — so consecutive days in a multi-day stage vary rather than repeating the
 * exact same drills). `recoveryToStanding` and `rollToBackFloat` are water-safety skills
 * (returning to standing/resting position), included alongside the swimming-technique skills
 * proper rather than treated as a separate track, since being able to safely stop is as
 * essential as being able to go.
 */
const STAGE_DRILLS: Record<LearnToSwimStage, LearnToSwimDrillKind[]> = {
  waterComfort: ['breathControl', 'faceSubmersion'],
  floating: ['frontFloat', 'backFloat', 'recoveryToStanding'],
  gliding: ['wallPushGlide', 'streamlineGlide'],
  kicking: ['flutterKickFront', 'flutterKickBack'],
  armStroke: ['armCircleStanding', 'armStrokeWithGlide'],
  breathingCoordination: ['sideBreathing', 'breathingWithKick'],
  fullStrokeEndurance: ['fullStrokeShort', 'fullStrokeContinuous', 'treadingWater', 'rollToBackFloat'],
};

/** How many distinct drills a lesson covers — shorter sessions stay focused, longer ones cover more ground. */
function drillsPerDay(minutesPerDay: number, catalogLength: number): number {
  if (minutesPerDay <= 15) return Math.min(2, catalogLength);
  if (minutesPerDay <= 30) return Math.min(3, catalogLength);
  return Math.min(4, catalogLength);
}

/** Splits `total` whole minutes across `count` drills as evenly as possible, summing back to exactly `total`. */
function splitMinutes(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

function buildDayLesson(stage: LearnToSwimStage, minutesPerDay: number, dayWithinStage: number): LearnToSwimDrill[] {
  const catalog = STAGE_DRILLS[stage];
  const count = drillsPerDay(minutesPerDay, catalog.length);
  const kinds = rotateArray(catalog, dayWithinStage).slice(0, count);
  const minutes = splitMinutes(minutesPerDay, count);
  return kinds.map((kind, i) => ({ kind, minutes: minutes[i] }));
}

/**
 * The whole curriculum for a chosen daily time budget — deterministic (same minutesPerDay always
 * yields the same plan), matching the rest of src/domain's pure-function, no-I/O contract.
 */
export function buildLearnToSwimPlan(minutesPerDay: number): LearnToSwimPlan {
  const totalDays = computeTotalDays(minutesPerDay);
  const stageDays = allocateStageDays(totalDays);

  const days: LearnToSwimDay[] = [];
  let dayNumber = 1;
  for (const { stage, days: count } of stageDays) {
    for (let dayWithinStage = 0; dayWithinStage < count; dayWithinStage++) {
      const drills = buildDayLesson(stage, minutesPerDay, dayWithinStage);
      days.push({
        dayNumber,
        stage,
        drills,
        totalMinutes: drills.reduce((sum, d) => sum + d.minutes, 0),
      });
      dayNumber++;
    }
  }

  return { totalDays, minutesPerDay, days };
}
