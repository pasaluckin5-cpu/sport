import {
  basePace100Sec,
  buildCooldown,
  buildGymSession,
  buildMainSet,
  buildWarmup,
  roundToPoolLength,
  sessionVolume,
} from './workoutLibrary';
import { AthleteProfile, DayPlan, GymFocus, PoolSession, SwimGoal, WeekPlan, Zone } from './types';
import { isoWeekKey, rotateArray, weekKeyToOffset } from './week';

export const DEFAULT_PROFILE: AthleteProfile = {
  level: 'intermediate',
  goal: 'fitness',
  poolSessionsPerWeek: 3,
  poolSessionDurationMin: 60,
  gymSessionsPerWeek: 1,
  equipment: [],
  unit: 'meters',
  poolLength: 25,
};

/** Which days (0=Mon..6=Sun) get a pool session, for each weekly session count. */
const POOL_DAY_PATTERNS: Record<number, number[]> = {
  1: [2],
  2: [1, 4],
  3: [0, 2, 4],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

/**
 * Zone focus for each pool session in a week, in order, per goal. Curated so hard and easy
 * days roughly alternate. The first N entries are used for N sessions/week. The whole array
 * is rotated by a week-derived offset so the plan varies from week to week instead of being
 * identical every time (see src/domain/week.ts).
 */
const ZONE_ROTATION_BY_GOAL: Record<SwimGoal, Zone[]> = {
  fitness: ['aerobicBase', 'technique', 'threshold', 'aerobicBase', 'recovery', 'aerobicBase', 'technique'],
  endurance: ['aerobicBase', 'threshold', 'aerobicBase', 'threshold', 'recovery', 'aerobicBase', 'technique'],
  speed: ['sprint', 'technique', 'vo2max', 'aerobicBase', 'sprint', 'recovery', 'vo2max'],
  technique: ['technique', 'aerobicBase', 'technique', 'threshold', 'technique', 'recovery', 'aerobicBase'],
};

const HARD_ZONES: Zone[] = ['threshold', 'vo2max', 'sprint'];

const GYM_FOCUS_ROTATION: GymFocus[] = ['fullBody', 'upperBody', 'core', 'lowerBody', 'mobility'];

const DEFAULT_GYM_DURATION_MIN = 45;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function assemblePoolSession(
  zone: Zone,
  profile: AthleteProfile,
  dayIndex: number,
  weekOffset: number,
): PoolSession {
  const { level, poolSessionDurationMin: durationMin, equipment, unit, poolLength, benchmark } = profile;
  const volume = sessionVolume(level, durationMin, unit, poolLength, benchmark);
  const warmupDistance = roundToPoolLength(volume * 0.18, poolLength);
  const cooldownDistance = roundToPoolLength(volume * 0.12, poolLength);
  const mainDistance = Math.max(poolLength, volume - warmupDistance - cooldownDistance);

  const pace100Sec = benchmark ? basePace100Sec(benchmark) : undefined;
  const warmup = buildWarmup(warmupDistance, equipment, dayIndex, poolLength, weekOffset);
  const main = buildMainSet(zone, mainDistance, equipment, level, dayIndex, poolLength, weekOffset, pace100Sec);
  const cooldown = buildCooldown(cooldownDistance);

  const allSteps = [...warmup, ...main, ...cooldown];
  const totalDistance = allSteps.reduce((sum, step) => sum + step.distance, 0);
  const equipmentUsed = Array.from(new Set(allSteps.flatMap((step) => step.equipment)));

  return {
    zone,
    durationMin,
    warmup,
    main,
    cooldown,
    totalDistance,
    equipmentUsed,
  };
}

export interface GenerateWeekPlanOptions {
  /** Overrides the current calendar week — mainly for tests. Defaults to today's ISO week. */
  weekKey?: string;
}

export function generateWeekPlan(profile: AthleteProfile, options: GenerateWeekPlanOptions = {}): WeekPlan {
  const weekKey = options.weekKey ?? isoWeekKey(new Date());

  const poolCount = clamp(profile.poolSessionsPerWeek, 1, 7);
  const poolDays = POOL_DAY_PATTERNS[poolCount] ?? POOL_DAY_PATTERNS[3];

  const zoneRotation = ZONE_ROTATION_BY_GOAL[profile.goal];
  const zoneOffset = weekKeyToOffset(weekKey, zoneRotation.length);
  const zones = rotateArray(zoneRotation, zoneOffset).slice(0, poolDays.length);
  const strokeOffset = weekKeyToOffset(`${weekKey}:stroke`, 7);

  const days: DayPlan[] = Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex }));

  poolDays.forEach((dayIndex, i) => {
    days[dayIndex].pool = assemblePoolSession(zones[i], profile, dayIndex, strokeOffset);
  });

  const poolDaySet = new Set(poolDays);
  const restDays = days.map((d) => d.dayIndex).filter((d) => !poolDaySet.has(d));
  // Prefer placing gym sessions on days without a pool session; only stack on pool days
  // once every rest day is used.
  const gymDayCandidates = [...restDays, ...poolDays];

  const gymCount = clamp(profile.gymSessionsPerWeek, 0, 7);
  const gymFocusOffset = weekKeyToOffset(`${weekKey}:gym`, GYM_FOCUS_ROTATION.length);
  for (let i = 0; i < gymCount && i < gymDayCandidates.length; i++) {
    const dayIndex = gymDayCandidates[i];
    const nextDayPool = days[(dayIndex + 1) % 7].pool;
    const followedByHardSwim = !!nextDayPool && HARD_ZONES.includes(nextDayPool.zone);

    let focus = GYM_FOCUS_ROTATION[(i + gymFocusOffset) % GYM_FOCUS_ROTATION.length];
    if (followedByHardSwim && focus === 'lowerBody') {
      // Avoid pre-fatiguing the legs the day before a hard kick/sprint-heavy swim.
      focus = 'core';
    }

    days[dayIndex].gym = {
      durationMin: DEFAULT_GYM_DURATION_MIN,
      focus,
      blocks: buildGymSession(focus, DEFAULT_GYM_DURATION_MIN, profile.level),
    };
  }

  const totalPoolDistance = days.reduce((sum, d) => sum + (d.pool?.totalDistance ?? 0), 0);

  return { days, totalPoolDistance, generatedAt: new Date().toISOString(), weekKey };
}
