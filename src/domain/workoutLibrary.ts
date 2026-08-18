import {
  AthleteLevel,
  DistanceUnit,
  Equipment,
  GymBlock,
  GymExercise,
  GymFocus,
  GymMode,
  PaceBenchmark,
  PoolLength,
  RaceStroke,
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
 * (`GymMode: 'generalFitness'`). No swim connection implied.
 */
const GENERAL_FITNESS_EXERCISES: Record<GymFocus, GymBlock[]> = {
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
};

/**
 * Swim-specific dryland work — used whenever the athlete has at least one pool session/week
 * (`GymMode: 'swimDryland'`). Every exercise is chosen for a specific in-water payoff (tagged
 * via `benefit`) rather than generic strength: rotator-cuff/scapular work for shoulder-injury
 * prevention, pulling strength for the catch/pull phase, explosive hip extension for starts and
 * turns, ankle/hip mobility for kick range of motion, and rotational core control for the
 * streamline position and body roll.
 */
const SWIM_DRYLAND_EXERCISES: Record<GymFocus, GymBlock[]> = {
  fullBody: [
    { exercise: 'medBallRotationalThrow', sets: 3, reps: '12', benefit: 'corePower' },
    { exercise: 'pullUps', sets: 3, reps: '6-10', benefit: 'pullStrength' },
    { exercise: 'squatJump', sets: 3, reps: '8-10', benefit: 'explosiveStart' },
    { exercise: 'hollowHold', sets: 3, reps: '20-30s', benefit: 'corePower' },
  ],
  upperBody: [
    { exercise: 'pullUps', sets: 4, reps: '6-10', benefit: 'pullStrength' },
    { exercise: 'shoulderExternalRotation', sets: 3, reps: '15', benefit: 'shoulderHealth' },
    { exercise: 'yTWRaises', sets: 3, reps: '10', benefit: 'shoulderHealth' },
    { exercise: 'pushUpPlus', sets: 3, reps: '10-12', benefit: 'shoulderHealth' },
  ],
  lowerBody: [
    { exercise: 'squatJump', sets: 3, reps: '8-10', benefit: 'explosiveStart' },
    { exercise: 'bulgarianSplitSquat', sets: 3, reps: '10', benefit: 'kickPower' },
    { exercise: 'calfRaises', sets: 3, reps: '15', benefit: 'kickPower' },
    { exercise: 'romanianDeadlift', sets: 3, reps: '10', benefit: 'kickPower' },
  ],
  core: [
    { exercise: 'hollowHold', sets: 3, reps: '20-30s', benefit: 'corePower' },
    { exercise: 'sidePlankReach', sets: 3, reps: '10', benefit: 'corePower' },
    { exercise: 'deadBug', sets: 3, reps: '12', benefit: 'corePower' },
    { exercise: 'russianTwists', sets: 3, reps: '20', benefit: 'corePower' },
  ],
  mobility: [
    { exercise: 'shoulderDislocates', sets: 2, reps: '10', benefit: 'shoulderHealth' },
    { exercise: 'thoracicRotations', sets: 2, reps: '10', benefit: 'mobility' },
    { exercise: 'ankleMobility', sets: 2, reps: '10', benefit: 'kickPower' },
    { exercise: 'hip9090Mobility', sets: 2, reps: '8', benefit: 'mobility' },
  ],
};

export function buildGymSession(focus: GymFocus, durationMin: number, level: AthleteLevel, mode: GymMode): GymBlock[] {
  const catalog = mode === 'swimDryland' ? SWIM_DRYLAND_EXERCISES : GENERAL_FITNESS_EXERCISES;
  const base = catalog[focus];
  if (level === 'beginner') return base.slice(0, 3);
  if (level === 'advanced' && durationMin >= 60) {
    return [...base, { exercise: 'conditioningFinisher' as GymExercise, sets: 3, reps: 'rounds' }];
  }
  return base;
}
