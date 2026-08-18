import { AthleteLevel, Equipment, GymBlock, GymFocus, PaceBenchmark, SetStep, Zone } from './types';

/**
 * Rough continuous-swimming output per hour of pool time, by level. Used only to size
 * total session volume from a duration — not a real pace prediction. Superseded by a
 * pace benchmark when the athlete provides one (see basePace100Sec/estimateMPerHour).
 */
export const PACE_M_PER_HOUR: Record<AthleteLevel, number> = {
  beginner: 1800,
  intermediate: 2600,
  advanced: 3400,
};

/**
 * A session's real swimming time is diluted by rest intervals, warmup/cooldown pacing,
 * and turns — so "meters covered per hour" is well below a flat-out benchmark pace.
 * This factor converts a raw time-trial pace into that realistic session-average pace.
 */
const SESSION_EFFECTIVE_PACE_FACTOR = 1.35;

/** Target main-set pace per 100m, as a multiple of the athlete's base (threshold) pace. */
const ZONE_PACE_FACTOR: Partial<Record<Zone, number>> = {
  aerobicBase: 1.12,
  threshold: 1.0,
  vo2max: 0.93,
};

/** Seconds per 100m implied by a time-trial benchmark. */
export function basePace100Sec(benchmark: PaceBenchmark): number {
  return (benchmark.timeSec / benchmark.distanceM) * 100;
}

export function formatPace100(sec: number): string {
  const rounded = Math.round(sec);
  const min = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${min}:${s.toString().padStart(2, '0')}`;
}

function targetPaceSuffix(zone: Zone, pace100Sec: number | undefined, repDistanceM: number): string {
  const factor = pace100Sec !== undefined ? ZONE_PACE_FACTOR[zone] : undefined;
  if (factor === undefined) return '';
  const repPaceSec = pace100Sec! * factor * (repDistanceM / 100);
  return ` @ ${formatPace100(repPaceSec)}`;
}

export function estimateMPerHour(level: AthleteLevel, benchmark?: PaceBenchmark): number {
  if (!benchmark) return PACE_M_PER_HOUR[level];
  const effectivePace100 = basePace100Sec(benchmark) * SESSION_EFFECTIVE_PACE_FACTOR;
  return (100 * 3600) / effectivePace100;
}

export const ZONE_LABELS: Record<Zone, string> = {
  recovery: 'Recovery',
  technique: 'Technique',
  aerobicBase: 'Aerobic base',
  threshold: 'Threshold',
  vo2max: 'VO2max',
  sprint: 'Sprint',
};

export const ZONE_DESCRIPTIONS: Record<Zone, string> = {
  recovery: 'Easy, loosening swim to aid recovery between harder days.',
  technique: 'Drill-focused work on stroke mechanics at low intensity.',
  aerobicBase: 'Steady, moderate swimming to build aerobic endurance.',
  threshold: 'Sustained, comfortably-hard swimming at your best-sustainable pace.',
  vo2max: 'Hard intervals with short rest to raise aerobic capacity.',
  sprint: 'Short, maximal-effort reps with full recovery between them.',
};

const STROKE_ROTATION = ['Freestyle', 'IM', 'Freestyle', 'Backstroke', 'Freestyle', 'Choice', 'Freestyle'];

function strokeFor(dayIndex: number): string {
  return STROKE_ROTATION[dayIndex % STROKE_ROTATION.length];
}

function round25(meters: number): number {
  return Math.max(25, Math.round(meters / 25) * 25);
}

function has(equipment: Equipment[], id: Equipment): boolean {
  return equipment.includes(id);
}

export function sessionVolumeM(level: AthleteLevel, durationMin: number, benchmark?: PaceBenchmark): number {
  return round25((estimateMPerHour(level, benchmark) * durationMin) / 60);
}

export function buildWarmup(meters: number, equipment: Equipment[], dayIndex: number): SetStep[] {
  const steps: SetStep[] = [];
  const easyMeters = has(equipment, 'pullBuoy') ? round25(meters * 0.6) : meters;
  steps.push({
    label: `Easy swim, ${strokeFor(dayIndex)}, building into the session`,
    distanceM: easyMeters,
    equipment: [],
    zone: 'recovery',
  });
  if (has(equipment, 'pullBuoy')) {
    const rest = round25(meters - easyMeters);
    if (rest > 0) {
      steps.push({
        label: 'Easy pull, long stroke, focus on body position',
        distanceM: rest,
        equipment: ['pullBuoy'],
        zone: 'recovery',
      });
    }
  }
  return steps;
}

export function buildCooldown(meters: number): SetStep[] {
  return [
    {
      label: 'Easy choice swim, shake out the arms and legs',
      distanceM: meters,
      equipment: [],
      zone: 'recovery',
    },
  ];
}

function repSet(
  label: string,
  reps: number,
  repDistanceM: number,
  equipment: Equipment[],
  zone: Zone,
): SetStep {
  return {
    label: `${reps} x ${repDistanceM}m ${label}`,
    distanceM: reps * repDistanceM,
    equipment,
    zone,
  };
}

function fitReps(targetMeters: number, repDistanceM: number, minReps = 2): number {
  return Math.max(minReps, Math.round(targetMeters / repDistanceM));
}

export function buildMainSet(
  zone: Zone,
  meters: number,
  equipment: Equipment[],
  level: AthleteLevel,
  dayIndex: number,
  pace100Sec?: number,
): SetStep[] {
  const stroke = strokeFor(dayIndex);
  const steps: SetStep[] = [];

  switch (zone) {
    case 'technique': {
      const drillDistance = level === 'beginner' ? 25 : 50;
      const drillMeters = round25(meters * 0.55);
      const drillEquip: Equipment[] = has(equipment, 'snorkel') ? ['snorkel'] : [];
      steps.push(
        repSet(
          `drill (catch-up, single-arm, or fist swim), ${stroke}`,
          fitReps(drillMeters, drillDistance),
          drillDistance,
          drillEquip,
          'technique',
        ),
      );
      const restMeters = round25(meters - drillMeters);
      if (restMeters > 0) {
        const buildEquip: Equipment[] = has(equipment, 'paddles') ? ['paddles'] : [];
        steps.push(
          repSet(
            `swim, smooth build focusing on the drill cue, ${stroke}`,
            fitReps(restMeters, drillDistance * 2),
            drillDistance * 2,
            buildEquip,
            'technique',
          ),
        );
      }
      break;
    }
    case 'aerobicBase': {
      const repDistance = level === 'beginner' ? 50 : level === 'intermediate' ? 100 : 150;
      const swimMeters = round25(meters * (has(equipment, 'kickboard') || has(equipment, 'fins') ? 0.75 : 1));
      steps.push(
        repSet(
          `${stroke}, moderate steady pace${targetPaceSuffix('aerobicBase', pace100Sec, repDistance)}, rest 15-20s`,
          fitReps(swimMeters, repDistance),
          repDistance,
          [],
          'aerobicBase',
        ),
      );
      const kickMeters = round25(meters - swimMeters);
      if (kickMeters > 0) {
        const kickEquip: Equipment[] = [
          ...(has(equipment, 'kickboard') ? (['kickboard'] as Equipment[]) : []),
          ...(has(equipment, 'fins') ? (['fins'] as Equipment[]) : []),
        ];
        steps.push(repSet('steady kick, moderate effort', fitReps(kickMeters, 50), 50, kickEquip, 'aerobicBase'));
      }
      break;
    }
    case 'threshold': {
      const repDistance = level === 'beginner' ? 50 : level === 'intermediate' ? 100 : 200;
      const pullMeters = has(equipment, 'pullBuoy') && has(equipment, 'paddles') ? round25(meters * 0.3) : 0;
      const swimMeters = round25(meters - pullMeters);
      steps.push(
        repSet(
          `${stroke}, best-sustainable ("threshold") pace${targetPaceSuffix('threshold', pace100Sec, repDistance)}, rest 10-15s`,
          fitReps(swimMeters, repDistance),
          repDistance,
          [],
          'threshold',
        ),
      );
      if (pullMeters > 0) {
        steps.push(
          repSet('pull, strong steady pace, rest 15s', fitReps(pullMeters, repDistance), repDistance, ['pullBuoy', 'paddles'], 'threshold'),
        );
      }
      break;
    }
    case 'vo2max': {
      const repDistance = level === 'beginner' ? 50 : 100;
      steps.push(
        repSet(
          `${stroke}, hard effort (8-9/10)${targetPaceSuffix('vo2max', pace100Sec, repDistance)}, rest 20-30s`,
          fitReps(meters * 0.8, repDistance),
          repDistance,
          [],
          'vo2max',
        ),
      );
      const remainder = round25(meters * 0.2);
      const kickEquip: Equipment[] = has(equipment, 'fins') ? ['fins'] : [];
      steps.push(repSet('fast kick, rest 20s', fitReps(remainder, 25), 25, kickEquip, 'vo2max'));
      break;
    }
    case 'sprint': {
      const repDistance = 25;
      const sprintEquip: Equipment[] = has(equipment, 'parachute') ? ['parachute'] : [];
      steps.push(
        repSet('all-out sprint, full recovery, rest 45-60s', fitReps(meters * 0.6, repDistance), repDistance, sprintEquip, 'sprint'),
      );
      const buildMeters = round25(meters * 0.4);
      steps.push(repSet(`${stroke} build, easy to fast, rest 20s`, fitReps(buildMeters, 50), 50, [], 'sprint'));
      break;
    }
    case 'recovery': {
      const equip: Equipment[] = has(equipment, 'pullBuoy') ? ['pullBuoy'] : [];
      steps.push({
        label: `Easy continuous ${stroke.toLowerCase()} swim, conversational effort`,
        distanceM: meters,
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
    { label: 'Squats', detail: '3 x 10-12, moderate load' },
    { label: 'Push-ups', detail: '3 x max reps' },
    { label: 'Bent-over rows', detail: '3 x 10-12' },
    { label: 'Plank', detail: '3 x 30-45s' },
  ],
  upperBody: [
    { label: 'Pull-ups or lat pulldown', detail: '4 x 6-10' },
    { label: 'Bench press or push-ups', detail: '4 x 8-10' },
    { label: 'Shoulder external rotations (band)', detail: '3 x 15, light resistance' },
    { label: 'Triceps dips', detail: '3 x 10-12' },
  ],
  lowerBody: [
    { label: 'Squats', detail: '4 x 8-10' },
    { label: 'Romanian deadlifts', detail: '3 x 10' },
    { label: 'Walking lunges', detail: '3 x 12 per leg' },
    { label: 'Calf raises', detail: '3 x 15' },
  ],
  core: [
    { label: 'Plank', detail: '3 x 45-60s' },
    { label: 'Dead bug', detail: '3 x 12 per side' },
    { label: 'Russian twists', detail: '3 x 20' },
    { label: 'Hollow body hold', detail: '3 x 20-30s' },
  ],
  mobility: [
    { label: 'Shoulder dislocates (band or stick)', detail: '2 x 10' },
    { label: "World's greatest stretch", detail: '2 x 5 per side' },
    { label: 'Thoracic rotations', detail: '2 x 10 per side' },
    { label: 'Ankle mobility drills', detail: '2 x 10 per side' },
  ],
};

export function buildGymSession(focus: GymFocus, durationMin: number, level: AthleteLevel): GymBlock[] {
  const base = GYM_EXERCISES[focus];
  if (level === 'beginner') return base.slice(0, 3);
  if (level === 'advanced' && durationMin >= 60) return [...base, { label: 'Extra conditioning finisher', detail: '3 rounds, light intensity' }];
  return base;
}
