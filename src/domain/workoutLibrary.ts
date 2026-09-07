import {
  AthleteLevel,
  DistanceUnit,
  Equipment,
  GymBlock,
  GymExercise,
  GymFocus,
  GymSplit,
  GymTrainingStyle,
  PaceBenchmark,
  PacingStrategy,
  PeriodizationPhase,
  PoolLength,
  RaceStroke,
  RaceSplit,
  RaceTacticKey,
  SetStep,
  StrokeKey,
  Zone,
} from './types';

/**
 * Rough continuous-swimming output per hour of pool time, by level, in meters. Used only to
 * size total session volume from a duration — not a real pace prediction. Superseded by a
 * pace benchmark when the athlete provides one (see basePace100Sec/estimateMPerHour). Yards
 * uses the physical meters<->yards conversion of this same table, not a separate estimate.
 */
export const PACE_M_PER_HOUR: Record<AthleteLevel, number> = {
  beginner: 1800,
  intermediate: 2600,
  advanced: 3400,
};

const YARDS_PER_METER = 1.0936;

/**
 * A session's real swimming time is diluted by rest intervals, warmup/cooldown pacing,
 * and turns — so "distance covered per hour" is well below a flat-out benchmark pace.
 * This factor converts a raw time-trial pace into that realistic session-average pace.
 */
const SESSION_EFFECTIVE_PACE_FACTOR = 1.35;

/** Target main-set pace per 100 (meters or yards), as a multiple of the athlete's base (threshold) pace. */
const ZONE_PACE_FACTOR: Partial<Record<Zone, number>> = {
  aerobicBase: 1.12,
  threshold: 1.0,
  vo2max: 0.93,
};

const DEFAULT_STROKE_ROTATION: StrokeKey[] = ['freestyle', 'im', 'freestyle', 'backstroke', 'freestyle', 'choice', 'freestyle'];

/**
 * Builds the week's stroke rotation. With no stated specialty, freestyle dominates (the
 * default — most training volume is freestyle regardless of specialty). With one or more
 * primary strokes, they're interleaved with freestyle (still kept in the mix even for a
 * non-freestyle specialist, since it's the standard aerobic-conditioning stroke) rather than
 * replacing it outright.
 *
 * The interleaved rotation's length is deliberately even (2x the stroke count) rather than
 * matching the 7-day week: `strokeFor` indexes into it with `% rotation.length`, and for an
 * *even* length that preserves the original index's parity no matter how far it wraps — so
 * freestyle/primary strictly alternate with no exceptions. An odd length (like 7) can't be
 * 2-colored without one adjacent repeat, which could otherwise line up with a low-frequency
 * session count (e.g. 3/week lands on same-parity weekdays) and hide the primary stroke from
 * an entire week.
 */
export function buildStrokeRotation(primaryStrokes: RaceStroke[] | undefined): StrokeKey[] {
  if (!primaryStrokes || primaryStrokes.length === 0) return DEFAULT_STROKE_ROTATION;
  return Array.from({ length: primaryStrokes.length * 2 }, (_, i) =>
    i % 2 === 0 ? 'freestyle' : primaryStrokes[(i - 1) / 2],
  );
}

export function strokeFor(dayIndex: number, weekOffset: number, rotation: StrokeKey[]): StrokeKey {
  return rotation[(dayIndex + weekOffset) % rotation.length];
}

/**
 * 0 (pure sprint, e.g. the 50) .. 1 (pure distance, e.g. the mile/1500) — how an athlete's
 * stated race distance(s) should bias main-set rep length and rest. Distances span a wide,
 * multiplicative range (50 to 1500+), so the blend uses a log scale rather than a linear one.
 * No stated distance defaults to a neutral midpoint rather than assuming either extreme.
 */
export function specialtyFactor(primaryDistances: number[] | undefined): number {
  if (!primaryDistances || primaryDistances.length === 0) return 0.5;
  const avg = primaryDistances.reduce((a, b) => a + b, 0) / primaryDistances.length;
  const clamped = Math.min(1500, Math.max(50, avg));
  return (Math.log2(clamped) - Math.log2(50)) / (Math.log2(1500) - Math.log2(50));
}

export type FocusEmphasis = 'sprint' | 'balanced' | 'distance';

/** A coaching-style summary of what a specialty factor implies emphasizing in training. */
export function focusEmphasis(factor: number): FocusEmphasis {
  if (factor < 0.35) return 'sprint';
  if (factor > 0.65) return 'distance';
  return 'balanced';
}

/** Rounds to the nearest whole pool length (25 or 50), with a minimum of one length. */
export function roundToPoolLength(distance: number, poolLength: PoolLength): number {
  return Math.max(poolLength, Math.round(distance / poolLength) * poolLength);
}

function has(equipment: Equipment[], id: Equipment): boolean {
  return equipment.includes(id);
}

/** Seconds per 100 (meters or yards) implied by a time-trial benchmark. */
export function basePace100Sec(benchmark: PaceBenchmark): number {
  return (benchmark.timeSec / benchmark.distance) * 100;
}

export function formatPace100(sec: number): string {
  const rounded = Math.round(sec);
  const min = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${min}:${s.toString().padStart(2, '0')}`;
}

function targetPaceSec(zone: Zone, pace100Sec: number | undefined, repDistance: number): number | undefined {
  const factor = pace100Sec !== undefined ? ZONE_PACE_FACTOR[zone] : undefined;
  if (factor === undefined) return undefined;
  return pace100Sec! * factor * (repDistance / 100);
}

export function estimateDistancePerHour(level: AthleteLevel, unit: DistanceUnit, benchmark?: PaceBenchmark): number {
  if (!benchmark) {
    const metersPerHour = PACE_M_PER_HOUR[level];
    return unit === 'yards' ? metersPerHour * YARDS_PER_METER : metersPerHour;
  }
  const effectivePace100 = basePace100Sec(benchmark) * SESSION_EFFECTIVE_PACE_FACTOR;
  return (100 * 3600) / effectivePace100;
}

export function sessionVolume(
  level: AthleteLevel,
  durationMin: number,
  unit: DistanceUnit,
  poolLength: PoolLength,
  benchmark?: PaceBenchmark,
): number {
  return roundToPoolLength((estimateDistancePerHour(level, unit, benchmark) * durationMin) / 60, poolLength);
}

export function buildWarmup(distance: number, equipment: Equipment[], stroke: StrokeKey, poolLength: PoolLength): SetStep[] {
  const steps: SetStep[] = [];
  const easyDistance = has(equipment, 'pullBuoy') ? roundToPoolLength(distance * 0.6, poolLength) : distance;
  steps.push({
    kind: 'warmupSwim',
    reps: 1,
    repDistance: easyDistance,
    distance: easyDistance,
    stroke,
    equipment: [],
    zone: 'recovery',
  });
  if (has(equipment, 'pullBuoy')) {
    const rest = roundToPoolLength(distance - easyDistance, poolLength);
    if (rest > 0) {
      steps.push({
        kind: 'warmupPull',
        reps: 1,
        repDistance: rest,
        distance: rest,
        equipment: ['pullBuoy'],
        zone: 'recovery',
      });
    }
  }
  return steps;
}

export function buildCooldown(distance: number): SetStep[] {
  return [
    {
      kind: 'cooldown',
      reps: 1,
      repDistance: distance,
      distance,
      equipment: [],
      zone: 'recovery',
    },
  ];
}

function repStep(
  kind: SetStep['kind'],
  reps: number,
  repDistance: number,
  equipment: Equipment[],
  zone: Zone,
  extra: Partial<SetStep> = {},
): SetStep {
  return {
    kind,
    reps,
    repDistance,
    distance: reps * repDistance,
    equipment,
    zone,
    ...extra,
  };
}

function fitReps(targetDistance: number, repDistance: number, minReps = 2): number {
  return Math.max(minReps, Math.round(targetDistance / repDistance));
}

export function buildMainSet(
  zone: Zone,
  distance: number,
  equipment: Equipment[],
  level: AthleteLevel,
  stroke: StrokeKey,
  poolLength: PoolLength,
  specialty: number,
  pace100Sec?: number,
): SetStep[] {
  const steps: SetStep[] = [];
  const round = (m: number) => roundToPoolLength(m, poolLength);
  // Sprint specialists (specialty→0) get shorter, punchier reps with fuller recovery; distance
  // specialists (specialty→1) get longer, more continuous reps with less rest — both scaled
  // around the same level-based baseline rather than replacing it. See specialtyFactor().
  const repMultiplier = 0.75 + specialty * 0.5; // 0.75x at pure sprint .. 1.25x at pure distance
  const restBias = 1 - specialty; // 1 at pure sprint (more rest) .. 0 at pure distance (less rest)

  switch (zone) {
    case 'technique': {
      // Drills need a concrete stroke to be meaningful — fall back off of "choice" specifically.
      const drillStroke = stroke === 'choice' ? 'freestyle' : stroke;
      const drillDistance = level === 'beginner' ? poolLength : poolLength * 2;
      const drillTotal = round(distance * 0.55);
      const drillEquip: Equipment[] = has(equipment, 'snorkel') ? ['snorkel'] : [];
      steps.push(
        repStep('drill', fitReps(drillTotal, drillDistance), drillDistance, drillEquip, 'technique', { stroke: drillStroke }),
      );
      const restTotal = round(distance - drillTotal);
      if (restTotal > 0) {
        const buildEquip: Equipment[] = has(equipment, 'paddles') ? ['paddles'] : [];
        steps.push(
          repStep('drillBuild', fitReps(restTotal, drillDistance * 2), drillDistance * 2, buildEquip, 'technique', {
            stroke: drillStroke,
          }),
        );
      }
      break;
    }
    case 'aerobicBase': {
      const repDistance = round((level === 'beginner' ? poolLength : poolLength * 2) * repMultiplier);
      const swimTotal = round(distance * (has(equipment, 'kickboard') || has(equipment, 'fins') ? 0.75 : 1));
      steps.push(
        repStep('steadySwim', fitReps(swimTotal, repDistance), repDistance, [], 'aerobicBase', {
          stroke,
          restSec: 15,
          restSecMax: 20,
          paceSec: targetPaceSec('aerobicBase', pace100Sec, repDistance),
        }),
      );
      const kickTotal = round(distance - swimTotal);
      if (kickTotal > 0) {
        const kickEquip: Equipment[] = [
          ...(has(equipment, 'kickboard') ? (['kickboard'] as Equipment[]) : []),
          ...(has(equipment, 'fins') ? (['fins'] as Equipment[]) : []),
        ];
        steps.push(repStep('steadyKick', fitReps(kickTotal, poolLength), poolLength, kickEquip, 'aerobicBase'));
      }
      break;
    }
    case 'threshold': {
      const baseRepDistance = level === 'beginner' ? poolLength : poolLength * (level === 'intermediate' ? 2 : 4);
      const repDistance = round(baseRepDistance * repMultiplier);
      const restSec = Math.round(8 + restBias * 7);
      const pullTotal = has(equipment, 'pullBuoy') && has(equipment, 'paddles') ? round(distance * 0.3) : 0;
      const swimTotal = round(distance - pullTotal);
      steps.push(
        repStep('thresholdSwim', fitReps(swimTotal, repDistance), repDistance, [], 'threshold', {
          stroke,
          restSec,
          restSecMax: restSec + 5,
          paceSec: targetPaceSec('threshold', pace100Sec, repDistance),
        }),
      );
      if (pullTotal > 0) {
        steps.push(
          repStep('thresholdPull', fitReps(pullTotal, repDistance), repDistance, ['pullBuoy', 'paddles'], 'threshold', {
            restSec: 15,
          }),
        );
      }
      break;
    }
    case 'vo2max': {
      const repDistance = round((level === 'beginner' ? poolLength : poolLength * 2) * repMultiplier);
      const restSec = Math.round(15 + restBias * 15);
      steps.push(
        repStep('vo2Swim', fitReps(distance * 0.8, repDistance), repDistance, [], 'vo2max', {
          stroke,
          restSec,
          restSecMax: restSec + 10,
          paceSec: targetPaceSec('vo2max', pace100Sec, repDistance),
        }),
      );
      const remainder = round(distance * 0.2);
      const kickEquip: Equipment[] = has(equipment, 'fins') ? ['fins'] : [];
      steps.push(repStep('vo2Kick', fitReps(remainder, poolLength), poolLength, kickEquip, 'vo2max', { restSec: 20 }));
      break;
    }
    case 'sprint': {
      const sprintEquip: Equipment[] = has(equipment, 'parachute') ? ['parachute'] : [];
      steps.push(
        repStep('sprintAllOut', fitReps(distance * 0.6, poolLength), poolLength, sprintEquip, 'sprint', {
          restSec: 45,
          restSecMax: 60,
        }),
      );
      const buildTotal = round(distance * 0.4);
      steps.push(
        repStep('sprintBuild', fitReps(buildTotal, poolLength * 2), poolLength * 2, [], 'sprint', { stroke, restSec: 20 }),
      );
      break;
    }
    case 'recovery': {
      const equip: Equipment[] = has(equipment, 'pullBuoy') ? ['pullBuoy'] : [];
      steps.push({
        kind: 'recoverySwim',
        reps: 1,
        repDistance: distance,
        distance,
        stroke,
        equipment: equip,
        zone: 'recovery',
      });
      break;
    }
  }

  return steps;
}

/**
 * Standard, general-purpose gym/fitness split — used for an athlete with zero pool sessions
 * (`GymMode: 'generalFitness'`). No swim connection implied. `Partial` (not every GymFocus is
 * meaningful in this mode — see buildGymSession's fallback) rather than a full `Record` so this
 * catalog only needs to define the focuses `generalFitness` actually uses.
 */
const GENERAL_FITNESS_EXERCISES: Partial<Record<GymFocus, GymBlock[]>> = {
  fullBody: [
    { exercise: 'squats', sets: 3, reps: '10-12' },
    { exercise: 'pushUps', sets: 3, reps: 'max' },
    { exercise: 'bentOverRows', sets: 3, reps: '10-12' },
    { exercise: 'plank', sets: 3, reps: '30-45s' },
  ],
  upperBody: [
    { exercise: 'pullUps', sets: 4, reps: '6-10' },
    { exercise: 'benchPress', sets: 4, reps: '8-10' },
    { exercise: 'shoulderExternalRotation', sets: 3, reps: '15' },
    { exercise: 'tricepsDips', sets: 3, reps: '10-12' },
  ],
  lowerBody: [
    { exercise: 'squats', sets: 4, reps: '8-10' },
    { exercise: 'romanianDeadlift', sets: 3, reps: '10' },
    { exercise: 'walkingLunges', sets: 3, reps: '12' },
    { exercise: 'calfRaises', sets: 3, reps: '15' },
  ],
  core: [
    { exercise: 'plank', sets: 3, reps: '45-60s' },
    { exercise: 'deadBug', sets: 3, reps: '12' },
    { exercise: 'russianTwists', sets: 3, reps: '20' },
    { exercise: 'hollowHold', sets: 3, reps: '20-30s' },
  ],
  mobility: [
    { exercise: 'shoulderDislocates', sets: 2, reps: '10' },
    { exercise: 'worldsGreatestStretch', sets: 2, reps: '5' },
    { exercise: 'thoracicRotations', sets: 2, reps: '10' },
    { exercise: 'ankleMobility', sets: 2, reps: '10' },
  ],
  chest: [
    { exercise: 'benchPress', sets: 4, reps: '8-12' },
    { exercise: 'pushUps', sets: 3, reps: 'max' },
    { exercise: 'tricepsDips', sets: 3, reps: '10-12' },
  ],
  back: [
    { exercise: 'pullUps', sets: 4, reps: '6-10' },
    { exercise: 'bentOverRows', sets: 4, reps: '8-12' },
    { exercise: 'facePulls', sets: 3, reps: '12-15' },
  ],
  shoulders: [
    { exercise: 'shoulderPress', sets: 4, reps: '8-12' },
    { exercise: 'lateralRaises', sets: 3, reps: '12-15' },
    { exercise: 'shoulderExternalRotation', sets: 2, reps: '15' },
  ],
  arms: [
    { exercise: 'bicepCurls', sets: 3, reps: '10-12' },
    { exercise: 'tricepsDips', sets: 3, reps: '10-12' },
  ],
  push: [
    { exercise: 'benchPress', sets: 4, reps: '8-12' },
    { exercise: 'shoulderPress', sets: 3, reps: '8-12' },
    { exercise: 'tricepsDips', sets: 3, reps: '10-12' },
  ],
  pull: [
    { exercise: 'pullUps', sets: 4, reps: '6-10' },
    { exercise: 'bentOverRows', sets: 3, reps: '8-12' },
    { exercise: 'bicepCurls', sets: 3, reps: '10-12' },
  ],
};

/**
 * Which body-part focus (or focuses) train on each day of a `GymSplit`, cycled by the gym
 * session's position in the week (day 1 of the split, day 2, ...), independent of which weekday
 * it lands on. 'bodyPartSplit' pairs muscle groups across 4 days; 'broSplit' is the more
 * granular one-muscle-group-per-day version across 6.
 */
export const GYM_SPLIT_ROTATION: Record<GymSplit, GymFocus[]> = {
  fullBody: ['fullBody'],
  upperLower: ['upperBody', 'lowerBody'],
  pushPull: ['push', 'pull'],
  pushPullLegs: ['push', 'pull', 'lowerBody'],
  bodyPartSplit: ['chest', 'back', 'lowerBody', 'shoulders'],
  broSplit: ['chest', 'back', 'shoulders', 'lowerBody', 'arms', 'core'],
};

const STYLE_SCHEME: Partial<Record<GymTrainingStyle, { sets: number; reps: string }>> = {
  strength: { sets: 5, reps: '4-6' },
  hypertrophy: { sets: 4, reps: '8-12' },
  endurance: { sets: 3, reps: '15-20' },
  functional: { sets: 3, reps: '10-12' },
};

/**
 * A_LETTERS-keyed periodized swim strength & conditioning program: three rotating full-body
 * sessions (A/B/C — matching how swimmers are actually programmed, not a bodybuilding body-part
 * split) whose exercise selection and set/rep scheme both shift with the athlete's periodization
 * phase toward their goal race (src/domain/periodization.ts) — base (general prep, moderate
 * reps, leave 2-3 reps in reserve) -> build (rising load, lower reps) -> peak (adds an explosive
 * jump/med-ball primer before the lifts, lower reps still) -> taper (volume cut, stays
 * explosive but far from failure, matching the pool taper's own volume cut). Falls back to the
 * 'base' scheme when there's no goal race date (see buildSwimDrylandGymSession) — a sensible
 * year-round default rather than requiring a race date to get sound programming.
 */
const SWIM_SC_PROGRAM: Record<PeriodizationPhase, Record<'A' | 'B' | 'C', GymBlock[]>> = {
  base: {
    A: [
      { exercise: 'squats', sets: 3, reps: '8', benefit: 'kickPower' },
      { exercise: 'romanianDeadlift', sets: 3, reps: '8', benefit: 'kickPower' },
      { exercise: 'benchPress', sets: 3, reps: '8', benefit: 'pullStrength' },
      { exercise: 'bentOverRows', sets: 3, reps: '10', benefit: 'pullStrength' },
      { exercise: 'bulgarianSplitSquat', sets: 2, reps: '8', benefit: 'kickPower' },
      { exercise: 'plank', sets: 3, reps: '30-40s', benefit: 'corePower' },
      { exercise: 'shoulderExternalRotation', sets: 2, reps: '12-15', benefit: 'shoulderHealth' },
    ],
    B: [
      { exercise: 'walkingLunges', sets: 3, reps: '8', benefit: 'kickPower' },
      { exercise: 'hipThrust', sets: 3, reps: '10', benefit: 'kickPower' },
      { exercise: 'pullUps', sets: 3, reps: '8-10', benefit: 'pullStrength' },
      { exercise: 'shoulderPress', sets: 2, reps: '8-10', benefit: 'shoulderHealth' },
      { exercise: 'bentOverRows', sets: 3, reps: '10', benefit: 'pullStrength' },
      { exercise: 'deadBug', sets: 3, reps: '8', benefit: 'corePower' },
      { exercise: 'facePulls', sets: 2, reps: '12-15', benefit: 'shoulderHealth' },
    ],
    C: [
      { exercise: 'squats', sets: 3, reps: '8', benefit: 'kickPower' },
      { exercise: 'romanianDeadlift', sets: 2, reps: '8', benefit: 'kickPower' },
      { exercise: 'pushUps', sets: 3, reps: '8-12', benefit: 'shoulderHealth' },
      { exercise: 'pullUps', sets: 3, reps: '8-10', benefit: 'pullStrength' },
      { exercise: 'stepUp', sets: 2, reps: '8', benefit: 'kickPower' },
      { exercise: 'pallofPress', sets: 3, reps: '10', benefit: 'corePower' },
      { exercise: 'shoulderExternalRotation', sets: 2, reps: '15', benefit: 'shoulderHealth' },
    ],
  },
  build: {
    A: [
      { exercise: 'squats', sets: 3, reps: '6-8', benefit: 'kickPower' },
      { exercise: 'romanianDeadlift', sets: 3, reps: '6-8', benefit: 'kickPower' },
      { exercise: 'benchPress', sets: 3, reps: '6-8', benefit: 'pullStrength' },
      { exercise: 'bentOverRows', sets: 3, reps: '8', benefit: 'pullStrength' },
      { exercise: 'bulgarianSplitSquat', sets: 2, reps: '8', benefit: 'kickPower' },
      { exercise: 'hollowHold', sets: 3, reps: '20-30s', benefit: 'corePower' },
    ],
    B: [
      { exercise: 'romanianDeadlift', sets: 3, reps: '5-6', benefit: 'kickPower' },
      { exercise: 'pullUps', sets: 3, reps: '6-8', benefit: 'pullStrength' },
      { exercise: 'shoulderPress', sets: 3, reps: '8', benefit: 'shoulderHealth' },
      { exercise: 'walkingLunges', sets: 2, reps: '8', benefit: 'kickPower' },
      { exercise: 'bentOverRows', sets: 3, reps: '8', benefit: 'pullStrength' },
      { exercise: 'russianTwists', sets: 3, reps: '20', benefit: 'corePower' },
    ],
    C: [
      { exercise: 'squats', sets: 3, reps: '6', benefit: 'kickPower' },
      { exercise: 'stepUp', sets: 3, reps: '8', benefit: 'kickPower' },
      { exercise: 'benchPress', sets: 3, reps: '8', benefit: 'pullStrength' },
      { exercise: 'pullUps', sets: 3, reps: '6-8', benefit: 'pullStrength' },
      { exercise: 'hipThrust', sets: 2, reps: '8-10', benefit: 'kickPower' },
      { exercise: 'facePulls', sets: 2, reps: '12-15', benefit: 'shoulderHealth' },
    ],
  },
  peak: {
    A: [
      { exercise: 'squatJump', sets: 3, reps: '3', benefit: 'explosiveStart' },
      { exercise: 'medBallRotationalThrow', sets: 3, reps: '4', benefit: 'corePower' },
      { exercise: 'squats', sets: 3, reps: '5', benefit: 'kickPower' },
      { exercise: 'romanianDeadlift', sets: 3, reps: '6', benefit: 'kickPower' },
      { exercise: 'benchPress', sets: 3, reps: '6', benefit: 'pullStrength' },
      { exercise: 'bentOverRows', sets: 3, reps: '8', benefit: 'pullStrength' },
      { exercise: 'hollowHold', sets: 3, reps: '20-30s', benefit: 'corePower' },
    ],
    B: [
      { exercise: 'squatJump', sets: 3, reps: '3', benefit: 'explosiveStart' },
      { exercise: 'bulgarianSplitSquat', sets: 3, reps: '6', benefit: 'kickPower' },
      { exercise: 'pullUps', sets: 3, reps: '6', benefit: 'pullStrength' },
      { exercise: 'shoulderPress', sets: 3, reps: '6-8', benefit: 'shoulderHealth' },
      { exercise: 'bentOverRows', sets: 3, reps: '8', benefit: 'pullStrength' },
      { exercise: 'shoulderExternalRotation', sets: 2, reps: '15', benefit: 'shoulderHealth' },
    ],
    C: [
      { exercise: 'squatJump', sets: 3, reps: '3', benefit: 'explosiveStart' },
      { exercise: 'romanianDeadlift', sets: 3, reps: '5', benefit: 'kickPower' },
      { exercise: 'stepUp', sets: 2, reps: '6', benefit: 'kickPower' },
      { exercise: 'pullUps', sets: 3, reps: '6-8', benefit: 'pullStrength' },
      { exercise: 'benchPress', sets: 2, reps: '8', benefit: 'pullStrength' },
      { exercise: 'deadBug', sets: 3, reps: '8', benefit: 'corePower' },
    ],
  },
  taper: {
    A: [
      { exercise: 'squatJump', sets: 3, reps: '3', benefit: 'explosiveStart' },
      { exercise: 'squats', sets: 2, reps: '4-5', benefit: 'kickPower' },
      { exercise: 'pullUps', sets: 2, reps: '5-6', benefit: 'pullStrength' },
      { exercise: 'benchPress', sets: 2, reps: '5-6', benefit: 'pullStrength' },
      { exercise: 'romanianDeadlift', sets: 2, reps: '6', benefit: 'kickPower' },
      { exercise: 'hollowHold', sets: 2, reps: '20s', benefit: 'corePower' },
    ],
    B: [
      { exercise: 'squatJump', sets: 3, reps: '3', benefit: 'explosiveStart' },
      { exercise: 'medBallRotationalThrow', sets: 3, reps: '4', benefit: 'corePower' },
      { exercise: 'bulgarianSplitSquat', sets: 2, reps: '6', benefit: 'kickPower' },
      { exercise: 'bentOverRows', sets: 2, reps: '6', benefit: 'pullStrength' },
      { exercise: 'shoulderPress', sets: 2, reps: '6', benefit: 'shoulderHealth' },
      { exercise: 'shoulderExternalRotation', sets: 2, reps: '15', benefit: 'shoulderHealth' },
    ],
    C: [
      { exercise: 'squatJump', sets: 2, reps: '3', benefit: 'explosiveStart' },
      { exercise: 'medBallRotationalThrow', sets: 2, reps: '4', benefit: 'corePower' },
      { exercise: 'squats', sets: 2, reps: '6', benefit: 'kickPower' },
      { exercise: 'bentOverRows', sets: 2, reps: '6', benefit: 'pullStrength' },
      { exercise: 'pushUps', sets: 2, reps: '8', benefit: 'shoulderHealth' },
      { exercise: 'deadBug', sets: 2, reps: '8', benefit: 'corePower' },
    ],
  },
};

const LEG_DOMINANT_EXERCISES: GymExercise[] = [
  'squats',
  'romanianDeadlift',
  'bulgarianSplitSquat',
  'stepUp',
  'hipThrust',
  'walkingLunges',
  'squatJump',
  'calfRaises',
];

const SHOULDER_LOADING_EXERCISES: GymExercise[] = [
  'benchPress',
  'shoulderPress',
  'pullUps',
  'pushUps',
  'pushUpPlus',
  'tricepsDips',
  'medBallRotationalThrow',
];

/** Drops blocks whose exercise is in `exclude`, unless that would leave fewer than 2 blocks — a session cut down to nothing isn't a safer session, just a missing one. */
function filterGymBlocks(blocks: GymBlock[], exclude: GymExercise[]): GymBlock[] {
  if (exclude.length === 0) return blocks;
  const filtered = blocks.filter((b) => !exclude.includes(b.exercise));
  return filtered.length >= 2 ? filtered : blocks;
}

/**
 * One of the three rotating swim S&C days (see SWIM_SC_PROGRAM), safety-filtered and
 * level-adjusted. `followedByHardSwim` drops leg-dominant exercises (same "don't pre-fatigue the
 * legs before a hard kick/sprint swim" reasoning already applied to the old focus-based
 * rotation); `avoidShoulder` drops heavy pressing/pulling for recent shoulder-pain feedback or a
 * standing shoulder injury; `extraExclude` folds in any other self-declared injury's exercise
 * exclusions (src/domain/medical.ts's exercisesToAvoidForMedical).
 */
export function buildSwimDrylandGymSession(
  phase: PeriodizationPhase | undefined,
  dayLetter: 'A' | 'B' | 'C',
  level: AthleteLevel,
  durationMin: number,
  followedByHardSwim: boolean,
  avoidShoulder: boolean,
  extraExclude: GymExercise[] = [],
): GymBlock[] {
  const base = SWIM_SC_PROGRAM[phase ?? 'base'][dayLetter];
  const exclude = [
    ...(followedByHardSwim ? LEG_DOMINANT_EXERCISES : []),
    ...(avoidShoulder ? SHOULDER_LOADING_EXERCISES : []),
    ...extraExclude,
  ];
  let blocks = filterGymBlocks(base, exclude);
  if (level === 'beginner') blocks = blocks.slice(0, 5);
  if (level === 'advanced' && durationMin >= 60) {
    blocks = [...blocks, { exercise: 'conditioningFinisher', sets: 3, reps: 'rounds' }];
  }
  return blocks;
}

/**
 * A pre-race warmup — deliberately different from a practice warmup (buildWarmup above): it's
 * built to end with the body remembering exactly what race pace/effort feels like, not to build
 * aerobic volume. Standard elite-level structure: easy loosening swim, a short technique-focused
 * drill, a progressive build set, starts practice, then a couple of short reps at (or a touch
 * faster than) goal race pace, finishing with an easy swim-down before resting up to the race.
 * Reuses existing SetStepKind values (warmupSwim/drill/sprintBuild/sprintAllOut/recoverySwim)
 * plus one new one (raceStartPractice) rather than inventing a parallel vocabulary.
 */
export function buildRaceWarmup(
  raceDistance: number,
  stroke: StrokeKey,
  poolLength: PoolLength,
  pace100Sec?: number,
): SetStep[] {
  const round = (m: number) => roundToPoolLength(m, poolLength);
  const drillStroke = stroke === 'choice' ? 'freestyle' : stroke;
  // Short races get short, punchy race-pace reps; longer races get double-length ones so the
  // body rehearses turns/breathing pattern at something closer to actual race rhythm.
  const fastRepDistance = raceDistance <= 100 ? round(poolLength) : round(poolLength * 2);

  return [
    {
      kind: 'warmupSwim',
      reps: 1,
      repDistance: round(poolLength * 12),
      distance: round(poolLength * 12),
      stroke,
      equipment: [],
      zone: 'recovery',
    },
    repStep('drill', 4, round(poolLength), [], 'technique', { stroke: drillStroke }),
    repStep('sprintBuild', 4, round(poolLength * 2), [], 'sprint', { stroke, restSec: 20 }),
    repStep('raceStartPractice', 4, round(poolLength), [], 'sprint', { stroke, restSec: 45, restSecMax: 60 }),
    repStep('sprintAllOut', 2, fastRepDistance, [], 'sprint', {
      stroke,
      restSec: 60,
      restSecMax: 90,
      // A touch faster than actual goal pace, so the last effort the body remembers before the
      // race is at least as fast as what it's about to be asked for.
      paceSec: pace100Sec !== undefined ? pace100Sec * 0.95 * (fastRepDistance / 100) : undefined,
    }),
    {
      kind: 'recoverySwim',
      reps: 1,
      repDistance: round(poolLength * 4),
      distance: round(poolLength * 4),
      stroke,
      equipment: [],
      zone: 'recovery',
    },
  ];
}

/** Positive splitting (going out too fast) is a mistake, not a strategy — races 400+ get a negative-split recommendation; shorter races are raced at an even effort throughout. */
export function raceDayPacingStrategy(raceDistance: number): PacingStrategy {
  return raceDistance >= 400 ? 'negativeSplit' : 'evenSplit';
}

/** Half-race target splits from the athlete's benchmark pace. A negative split comes through the first half ~3% slower than even pace and closes ~3% faster, averaging out to the same overall target. */
export function raceDaySplits(
  raceDistance: number,
  pace100Sec: number,
  strategy: PacingStrategy,
): { totalTargetSec: number; splits: RaceSplit[] } {
  const totalTargetSec = pace100Sec * (raceDistance / 100);
  const half = totalTargetSec / 2;
  if (strategy === 'evenSplit') {
    return {
      totalTargetSec,
      splits: [
        { segment: 'firstHalf', targetSec: half },
        { segment: 'secondHalf', targetSec: half },
      ],
    };
  }
  return {
    totalTargetSec,
    splits: [
      { segment: 'firstHalf', targetSec: half * 1.03 },
      { segment: 'secondHalf', targetSec: half * 0.97 },
    ],
  };
}

const STROKE_TACTIC: Partial<Record<RaceStroke, RaceTacticKey>> = {
  freestyle: 'strokeFreestyleBilateral',
  backstroke: 'strokeBackstrokeCounting',
  breaststroke: 'strokeBreaststrokePullout',
  butterfly: 'strokeButterflyRhythm',
};

/**
 * Race tactics as typed keys (see src/i18n/format.ts for the translated text) rather than
 * formatted sentences — same structured-output pattern as SetStepKind/GymExercise. 'im' has no
 * stroke-specific entry (its tactics are mostly about transitions between strokes, out of scope
 * for now).
 */
export function raceTacticalNotes(raceDistance: number, stroke: RaceStroke): RaceTacticKey[] {
  const notes: RaceTacticKey[] = [];
  if (raceDistance <= 100) {
    notes.push('sprintStart', 'sprintNoBreathOff');
  } else if (raceDistance >= 400) {
    notes.push('distancePacing', 'distanceSighting');
  } else {
    notes.push('middleDistanceBuild');
  }
  notes.push('turnsBreakouts');
  const strokeTactic = STROKE_TACTIC[stroke];
  if (strokeTactic) notes.push(strokeTactic);
  return notes;
}

/**
 * Builds a `'generalFitness'` gym session (an athlete with zero pool sessions/week — see
 * buildSwimDrylandGymSession for the swim-dryland equivalent). `style` applies a set/rep scheme
 * on top of whatever exercises `focus` selects (or, for `'cardio'`, replaces them entirely with
 * a single steady-state cardio block — a duration-based activity doesn't fit the sets/reps
 * shape at all) — see GymTrainingStyle's doc comment. `medicalExclude` folds in any self-declared
 * injury's exercise exclusions (src/domain/medical.ts's exercisesToAvoidForMedical).
 */
export function buildGymSession(
  focus: GymFocus,
  durationMin: number,
  level: AthleteLevel,
  style?: GymTrainingStyle,
  medicalExclude: GymExercise[] = [],
): GymBlock[] {
  if (style === 'cardio') {
    return [{ exercise: 'cardioSession', sets: 1, reps: `${durationMin} min` }];
  }

  const base = GENERAL_FITNESS_EXERCISES[focus] ?? GENERAL_FITNESS_EXERCISES.fullBody!;
  let blocks = filterGymBlocks(base, medicalExclude);
  if (level === 'beginner') blocks = blocks.slice(0, 3);
  if (level === 'advanced' && durationMin >= 60 && !style) {
    blocks = [...blocks, { exercise: 'conditioningFinisher', sets: 3, reps: 'rounds' }];
  }

  if (style === 'circuit') {
    return blocks.map((b) => ({ ...b, sets: 3, reps: 'rounds' }));
  }
  const scheme = style ? STYLE_SCHEME[style] : undefined;
  if (scheme) {
    return blocks.map((b) => ({ ...b, sets: scheme.sets, reps: scheme.reps }));
  }
  return blocks;
}
