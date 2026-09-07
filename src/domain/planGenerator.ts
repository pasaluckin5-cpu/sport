import {
  capZoneIntensity,
  exercisesToAvoidForMedical,
  hasShoulderInjury,
  medicalVolumeMultiplier,
  medicalZoneCap,
  strokesToAvoid,
} from './medical';
import {
  adherenceRatio,
  adherenceVolumeMultiplier,
  avoidShoulderLoad,
  daysUntilRace,
  easeOverloadedZones,
  feedbackVolumeMultiplier,
  overloadedZones,
  periodizationPhase,
  summarizeFeedback,
  volumeMultiplier,
} from './periodization';
import { AthleteProfile, DayPlan, GymFocus, GymMode, MedicalProfile, PoolSession, RaceStroke, SessionFeedback, TrainingGoal, WeekCompletionCount, WeekPlan, Zone } from './types';
import {
  basePace100Sec,
  buildCooldown,
  buildGymSession,
  buildMainSet,
  buildStrokeRotation,
  buildSwimDrylandGymSession,
  buildWarmup,
  GYM_SPLIT_ROTATION,
  roundToPoolLength,
  sessionVolume,
  specialtyFactor,
  strokeFor,
} from './workoutLibrary';
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

/**
 * Which days (0=Mon..6=Sun) get a pool session, for each weekly session count. Also reused to
 * evenly space gym days across the week for a gym-only (zero pool sessions) profile.
 */
const POOL_DAY_PATTERNS: Record<number, number[]> = {
  0: [],
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
const ZONE_ROTATION_BY_GOAL: Record<TrainingGoal, Zone[]> = {
  fitness: ['aerobicBase', 'technique', 'threshold', 'aerobicBase', 'recovery', 'aerobicBase', 'technique'],
  endurance: ['aerobicBase', 'threshold', 'aerobicBase', 'threshold', 'recovery', 'aerobicBase', 'technique'],
  speed: ['sprint', 'technique', 'vo2max', 'aerobicBase', 'sprint', 'recovery', 'vo2max'],
  technique: ['technique', 'aerobicBase', 'technique', 'threshold', 'technique', 'recovery', 'aerobicBase'],
};

const HARD_ZONES: Zone[] = ['threshold', 'vo2max', 'sprint'];

/**
 * Which gym focus comes first (and so is favored when there are fewer gym sessions than
 * focuses) per goal — e.g. a "speed" goal front-loads explosive lower-body/full-body power,
 * while "technique" front-loads mobility/core (movement quality, and for swimmers the
 * shoulder/rotational work that most directly carries over to stroke technique).
 */
const GYM_FOCUS_ROTATION_BY_GOAL: Record<TrainingGoal, GymFocus[]> = {
  fitness: ['fullBody', 'upperBody', 'core', 'lowerBody', 'mobility'],
  endurance: ['fullBody', 'core', 'upperBody', 'mobility', 'lowerBody'],
  speed: ['lowerBody', 'fullBody', 'upperBody', 'core', 'mobility'],
  technique: ['mobility', 'core', 'upperBody', 'fullBody', 'lowerBody'],
};

const DEFAULT_GYM_DURATION_MIN = 45;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

interface PoolSessionAdjustments {
  volumeMult: number;
  /** Recent shoulder-pain feedback and/or a standing shoulder injury both funnel into this one flag. */
  avoidShoulder: boolean;
  /** Standing injuries only (see src/domain/medical.ts) — a self-declared, persistent condition, not a one-off feedback flag. */
  avoidedStrokes: RaceStroke[];
  medicalZoneCap: Zone | undefined;
}

function assemblePoolSession(
  zone: Zone,
  profile: AthleteProfile,
  sessionIndex: number,
  weekOffset: number,
  adjustments: PoolSessionAdjustments,
): PoolSession {
  const { volumeMult, avoidShoulder, avoidedStrokes, medicalZoneCap: zoneCap } = adjustments;
  const cappedZone = capZoneIntensity(zone, zoneCap);
  const { level, poolSessionDurationMin: durationMin, unit, poolLength, benchmark, primaryStrokes, primaryDistances } = profile;
  // Skip paddles (extra shoulder loading) for the week when recent feedback flagged shoulder
  // pain — same "downgrade, don't drop the day" pattern already used for a hard-swim-eve leg day.
  const equipment = avoidShoulder ? profile.equipment.filter((e) => e !== 'paddles') : profile.equipment;
  const volume = sessionVolume(level, durationMin, unit, poolLength, benchmark) * volumeMult;
  const warmupDistance = roundToPoolLength(volume * 0.18, poolLength);
  const cooldownDistance = roundToPoolLength(volume * 0.12, poolLength);
  const mainDistance = Math.max(poolLength, volume - warmupDistance - cooldownDistance);

  // Indexed by the session's position within the week (0, 1, 2, ...) rather than its weekday —
  // weekdays for a given session count are often all the same parity (e.g. 3/week = Mon/Wed/Fri,
  // all even), which would otherwise systematically collide with a period-2 stroke rotation and
  // could hide the athlete's primary stroke from an entire low-frequency week.
  let stroke = strokeFor(sessionIndex, weekOffset, buildStrokeRotation(primaryStrokes));
  // A standing injury can make the athlete's own chosen primary stroke inadvisable this week
  // (e.g. breaststroke's whip kick with a knee injury) — fall back to freestyle rather than
  // silently dropping the stroke rotation's variety for every other session too.
  if (avoidedStrokes.some((s) => s === stroke)) stroke = 'freestyle';
  const specialty = specialtyFactor(primaryDistances);
  const pace100Sec = benchmark ? basePace100Sec(benchmark) : undefined;
  const warmup = buildWarmup(warmupDistance, equipment, stroke, poolLength);
  const main = buildMainSet(cappedZone, mainDistance, equipment, level, stroke, poolLength, specialty, pace100Sec);
  const cooldown = buildCooldown(cooldownDistance);

  const allSteps = [...warmup, ...main, ...cooldown];
  const totalDistance = allSteps.reduce((sum, step) => sum + step.distance, 0);
  const equipmentUsed = Array.from(new Set(allSteps.flatMap((step) => step.equipment)));

  return {
    zone: cappedZone,
    durationMin,
    warmup,
    main,
    cooldown,
    totalDistance,
    equipmentUsed,
  };
}

function roundGymDuration(minutes: number): number {
  return Math.max(20, Math.round(minutes / 15) * 15);
}

export interface GenerateWeekPlanOptions {
  /** Overrides the current calendar week — mainly for tests. Defaults to today's ISO week. */
  weekKey?: string;
  /**
   * The athlete's full logged post-session feedback history, newest first (see
   * src/domain/periodization.ts's summarizeFeedback/overloadedZones) — an exponential moving
   * average backs volume off after a trend toward hard/painful sessions (or nudges it up after
   * a trend toward easy ones), and per-zone tracking eases off specific zones the athlete has
   * consistently found too hard. Empty/absent = neutral.
   */
  feedbackHistory?: SessionFeedback[];
  /**
   * Completed-session counts per week (see src/state/history-context.tsx) — used only to gauge
   * adherence to the current schedule (see src/domain/periodization.ts's adherenceRatio).
   * Empty/absent = no adherence adjustment.
   */
  recentWeekCounts?: WeekCompletionCount[];
  /**
   * Self-declared, persistent medical data (see src/domain/medical.ts) — independent of
   * AthleteProfile (it's a property of the person, not of this training program) so it's passed
   * in rather than read off `profile`. Empty/absent = no caution applied.
   */
  medical?: MedicalProfile;
}

export function generateWeekPlan(profile: AthleteProfile, options: GenerateWeekPlanOptions = {}): WeekPlan {
  const weekKey = options.weekKey ?? isoWeekKey(new Date());

  const phase = periodizationPhase(daysUntilRace(weekKey, profile.goalRaceDate));
  const feedbackSummary = summarizeFeedback(options.feedbackHistory);
  const expectedSessionsPerWeek = profile.poolSessionsPerWeek + profile.gymSessionsPerWeek;
  const adherence = adherenceRatio(options.recentWeekCounts ?? [], weekKey, expectedSessionsPerWeek);
  const volumeMult = Math.min(
    1.1,
    Math.max(
      0.5,
      volumeMultiplier(phase) *
        feedbackVolumeMultiplier(feedbackSummary) *
        adherenceVolumeMultiplier(adherence) *
        medicalVolumeMultiplier(options.medical),
    ),
  );
  const avoidShoulder = avoidShoulderLoad(feedbackSummary) || hasShoulderInjury(options.medical);
  const avoidedStrokes = strokesToAvoid(options.medical);
  const medicalExcludeExercises = exercisesToAvoidForMedical(options.medical);
  const zoneCap = medicalZoneCap(options.medical);
  const overloaded = overloadedZones(options.feedbackHistory);

  const poolCount = clamp(profile.poolSessionsPerWeek, 0, 7);
  const poolDays = poolCount === 0 ? [] : (POOL_DAY_PATTERNS[poolCount] ?? POOL_DAY_PATTERNS[3]);
  // Zero pool sessions means a gym/fitness-only profile: dryland exercises chosen for a swim
  // payoff don't make sense with no swimming to carry over to, so fall back to a standard
  // general-fitness split instead.
  const gymMode: GymMode = poolCount > 0 ? 'swimDryland' : 'generalFitness';

  const zoneRotation = ZONE_ROTATION_BY_GOAL[profile.goal];
  const zoneOffset = weekKeyToOffset(weekKey, zoneRotation.length);
  const zones = easeOverloadedZones(rotateArray(zoneRotation, zoneOffset).slice(0, poolDays.length), overloaded);
  const strokeOffset = weekKeyToOffset(`${weekKey}:stroke`, 7);

  const days: DayPlan[] = Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex }));

  const poolAdjustments: PoolSessionAdjustments = { volumeMult, avoidShoulder, avoidedStrokes, medicalZoneCap: zoneCap };
  poolDays.forEach((dayIndex, i) => {
    days[dayIndex].pool = assemblePoolSession(zones[i], profile, i, strokeOffset, poolAdjustments);
  });

  const gymCount = clamp(profile.gymSessionsPerWeek, 0, 7);
  let gymDayCandidates: number[];
  if (poolCount === 0) {
    // No pool days to work around — just spread gym days evenly across the week.
    gymDayCandidates = POOL_DAY_PATTERNS[clamp(gymCount, 1, 7)] ?? POOL_DAY_PATTERNS[3];
  } else {
    const poolDaySet = new Set(poolDays);
    const restDays = days.map((d) => d.dayIndex).filter((d) => !poolDaySet.has(d));
    // Prefer placing gym sessions on days without a pool session; only stack on pool days
    // once every rest day is used.
    gymDayCandidates = [...restDays, ...poolDays];
  }

  // Not week-rotated (unlike the swim zone/stroke rotations above): the goal should
  // consistently shape the gym split every week, not just some weeks — weekly variety already
  // comes from the swim side (and from which exact days gym lands on as gymCount changes).
  const gymFocusRotation = GYM_FOCUS_ROTATION_BY_GOAL[profile.goal];
  // Only meaningful in generalFitness mode (poolCount === 0) — see GymSplit's doc comment.
  const splitRotation = profile.gymSplit ? GYM_SPLIT_ROTATION[profile.gymSplit] : undefined;
  const gymDuration = roundGymDuration(DEFAULT_GYM_DURATION_MIN * volumeMult);
  const SPLIT_DAY_LETTERS = ['A', 'B', 'C'] as const;

  for (let i = 0; i < gymCount && i < gymDayCandidates.length; i++) {
    const dayIndex = gymDayCandidates[i];
    const nextDayPool = days[(dayIndex + 1) % 7].pool;
    const followedByHardSwim = !!nextDayPool && HARD_ZONES.includes(nextDayPool.zone);

    if (gymMode === 'swimDryland') {
      // A periodized, rotating full-body A/B/C program (see workoutLibrary.ts's
      // SWIM_SC_PROGRAM) rather than a body-part split — this is how swimmers are actually
      // programmed, and it ties gym progression to the same race periodization as the pool
      // side (base/build/peak/taper).
      const dayLetter = SPLIT_DAY_LETTERS[i % 3];
      days[dayIndex].gym = {
        durationMin: gymDuration,
        focus: 'fullBody',
        mode: gymMode,
        blocks: buildSwimDrylandGymSession(
          phase,
          dayLetter,
          profile.level,
          gymDuration,
          followedByHardSwim,
          avoidShoulder,
          medicalExcludeExercises,
        ),
      };
      continue;
    }

    let focus: GymFocus;
    if (splitRotation) {
      // The athlete explicitly chose a split (Profile → gym-only settings) — follow it exactly
      // rather than the default goal-based rotation.
      focus = splitRotation[i % splitRotation.length];
    } else {
      focus = gymFocusRotation[i % gymFocusRotation.length];
      if (followedByHardSwim && focus === 'lowerBody') {
        // Avoid pre-fatiguing the legs the day before a hard kick/sprint-heavy swim.
        focus = 'core';
      }
    }
    if (avoidShoulder && (focus === 'upperBody' || focus === 'chest' || focus === 'shoulders' || focus === 'push')) {
      // Recent shoulder pain (or a standing shoulder injury) flagged — swap heavy
      // pulling/pressing work for mobility this week.
      focus = 'mobility';
    }

    days[dayIndex].gym = {
      durationMin: gymDuration,
      focus,
      mode: gymMode,
      blocks: buildGymSession(focus, gymDuration, profile.level, profile.gymTrainingStyle, medicalExcludeExercises),
    };
  }

  const totalPoolDistance = days.reduce((sum, d) => sum + (d.pool?.totalDistance ?? 0), 0);

  return { days, totalPoolDistance, generatedAt: new Date().toISOString(), weekKey, periodizationPhase: phase };
}
