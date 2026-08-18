import { buildCooldown, buildGymSession, buildMainSet, buildWarmup, sessionVolumeM, ZONE_LABELS } from './workoutLibrary';
import { AthleteProfile, DayPlan, Equipment, GymFocus, PoolSession, SwimGoal, WeekPlan, Zone } from './types';

export const DEFAULT_PROFILE: AthleteProfile = {
  level: 'intermediate',
  goal: 'fitness',
  poolSessionsPerWeek: 3,
  poolSessionDurationMin: 60,
  gymSessionsPerWeek: 1,
  equipment: [],
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
 * days roughly alternate. The first N entries are used for N sessions/week.
 */
const ZONE_ROTATION_BY_GOAL: Record<SwimGoal, Zone[]> = {
  fitness: ['aerobicBase', 'technique', 'threshold', 'aerobicBase', 'recovery', 'aerobicBase', 'technique'],
  endurance: ['aerobicBase', 'threshold', 'aerobicBase', 'threshold', 'recovery', 'aerobicBase', 'technique'],
  speed: ['sprint', 'technique', 'vo2max', 'aerobicBase', 'sprint', 'recovery', 'vo2max'],
  technique: ['technique', 'aerobicBase', 'technique', 'threshold', 'technique', 'recovery', 'aerobicBase'],
};

const HARD_ZONES: Zone[] = ['threshold', 'vo2max', 'sprint'];

const GYM_FOCUS_ROTATION: GymFocus[] = ['fullBody', 'upperBody', 'core', 'lowerBody', 'mobility'];

const GYM_FOCUS_LABELS: Record<GymFocus, string> = {
  fullBody: 'Full-body strength',
  upperBody: 'Upper-body strength',
  lowerBody: 'Lower-body strength',
  core: 'Core strength',
  mobility: 'Mobility & recovery',
};

const DEFAULT_GYM_DURATION_MIN = 45;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function round25(meters: number): number {
  return Math.max(25, Math.round(meters / 25) * 25);
}

function assemblePoolSession(
  zone: Zone,
  level: AthleteProfile['level'],
  durationMin: number,
  equipment: Equipment[],
  dayIndex: number,
): PoolSession {
  const volume = sessionVolumeM(level, durationMin);
  const warmupMeters = round25(volume * 0.18);
  const cooldownMeters = round25(volume * 0.12);
  const mainMeters = Math.max(25, volume - warmupMeters - cooldownMeters);

  const warmup = buildWarmup(warmupMeters, equipment, dayIndex);
  const main = buildMainSet(zone, mainMeters, equipment, level, dayIndex);
  const cooldown = buildCooldown(cooldownMeters);

  const allSteps = [...warmup, ...main, ...cooldown];
  const totalDistanceM = allSteps.reduce((sum, step) => sum + step.distanceM, 0);
  const equipmentUsed = Array.from(new Set(allSteps.flatMap((step) => step.equipment)));

  return {
    zone,
    title: `${ZONE_LABELS[zone]} swim`,
    durationMin,
    warmup,
    main,
    cooldown,
    totalDistanceM,
    equipmentUsed,
  };
}

export function generateWeekPlan(profile: AthleteProfile): WeekPlan {
  const poolCount = clamp(profile.poolSessionsPerWeek, 1, 7);
  const poolDays = POOL_DAY_PATTERNS[poolCount] ?? POOL_DAY_PATTERNS[3];
  const zones = ZONE_ROTATION_BY_GOAL[profile.goal].slice(0, poolDays.length);

  const days: DayPlan[] = Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex }));

  poolDays.forEach((dayIndex, i) => {
    days[dayIndex].pool = assemblePoolSession(zones[i], profile.level, profile.poolSessionDurationMin, profile.equipment, dayIndex);
  });

  const poolDaySet = new Set(poolDays);
  const restDays = days.map((d) => d.dayIndex).filter((d) => !poolDaySet.has(d));
  // Prefer placing gym sessions on days without a pool session; only stack on pool days
  // once every rest day is used.
  const gymDayCandidates = [...restDays, ...poolDays];

  const gymCount = clamp(profile.gymSessionsPerWeek, 0, 7);
  for (let i = 0; i < gymCount && i < gymDayCandidates.length; i++) {
    const dayIndex = gymDayCandidates[i];
    const nextDayPool = days[(dayIndex + 1) % 7].pool;
    const followedByHardSwim = !!nextDayPool && HARD_ZONES.includes(nextDayPool.zone);

    let focus = GYM_FOCUS_ROTATION[i % GYM_FOCUS_ROTATION.length];
    if (followedByHardSwim && focus === 'lowerBody') {
      // Avoid pre-fatiguing the legs the day before a hard kick/sprint-heavy swim.
      focus = 'core';
    }

    days[dayIndex].gym = {
      title: GYM_FOCUS_LABELS[focus],
      durationMin: DEFAULT_GYM_DURATION_MIN,
      focus,
      blocks: buildGymSession(focus, DEFAULT_GYM_DURATION_MIN, profile.level),
    };
  }

  const totalPoolDistanceM = days.reduce((sum, d) => sum + (d.pool?.totalDistanceM ?? 0), 0);

  return { days, totalPoolDistanceM, generatedAt: new Date().toISOString() };
}
