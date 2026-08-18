import {
  AthleteLevel,
  DistanceUnit,
  Equipment,
  GymBlock,
  GymExercise,
  GymFocus,
  PaceBenchmark,
  PoolLength,
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

const STROKE_ROTATION: StrokeKey[] = ['freestyle', 'im', 'freestyle', 'backstroke', 'freestyle', 'choice', 'freestyle'];

function strokeFor(dayIndex: number, weekOffset: number): StrokeKey {
  return STROKE_ROTATION[(dayIndex + weekOffset) % STROKE_ROTATION.length];
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

export function buildWarmup(
  distance: number,
  equipment: Equipment[],
  dayIndex: number,
  poolLength: PoolLength,
  weekOffset: number,
): SetStep[] {
  const steps: SetStep[] = [];
  const stroke = strokeFor(dayIndex, weekOffset);
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
  dayIndex: number,
  poolLength: PoolLength,
  weekOffset: number,
  pace100Sec?: number,
): SetStep[] {
  const stroke = strokeFor(dayIndex, weekOffset);
  const steps: SetStep[] = [];
  const round = (m: number) => roundToPoolLength(m, poolLength);

  switch (zone) {
    case 'technique': {
      const drillDistance = level === 'beginner' ? poolLength : poolLength * 2;
      const drillTotal = round(distance * 0.55);
      const drillEquip: Equipment[] = has(equipment, 'snorkel') ? ['snorkel'] : [];
      steps.push(repStep('drill', fitReps(drillTotal, drillDistance), drillDistance, drillEquip, 'technique', { stroke }));
      const restTotal = round(distance - drillTotal);
      if (restTotal > 0) {
        const buildEquip: Equipment[] = has(equipment, 'paddles') ? ['paddles'] : [];
        steps.push(
          repStep('drillBuild', fitReps(restTotal, drillDistance * 2), drillDistance * 2, buildEquip, 'technique', { stroke }),
        );
      }
      break;
    }
    case 'aerobicBase': {
      const repDistance = level === 'beginner' ? poolLength : poolLength * 2;
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
      const repDistance = level === 'beginner' ? poolLength : poolLength * (level === 'intermediate' ? 2 : 4);
      const pullTotal = has(equipment, 'pullBuoy') && has(equipment, 'paddles') ? round(distance * 0.3) : 0;
      const swimTotal = round(distance - pullTotal);
      steps.push(
        repStep('thresholdSwim', fitReps(swimTotal, repDistance), repDistance, [], 'threshold', {
          stroke,
          restSec: 10,
          restSecMax: 15,
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
      const repDistance = level === 'beginner' ? poolLength : poolLength * 2;
      steps.push(
        repStep('vo2Swim', fitReps(distance * 0.8, repDistance), repDistance, [], 'vo2max', {
          stroke,
          restSec: 20,
          restSecMax: 30,
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

const GYM_EXERCISES: Record<GymFocus, GymBlock[]> = {
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

export function buildGymSession(focus: GymFocus, durationMin: number, level: AthleteLevel): GymBlock[] {
  const base = GYM_EXERCISES[focus];
  if (level === 'beginner') return base.slice(0, 3);
  if (level === 'advanced' && durationMin >= 60) {
    return [...base, { exercise: 'conditioningFinisher' as GymExercise, sets: 3, reps: 'rounds' }];
  }
  return base;
}
