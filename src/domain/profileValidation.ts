import { AthleteLevel, AthleteProfile, DistanceUnit, Equipment, PoolLength, TrainingGoal } from './types';

const LEVELS: AthleteLevel[] = ['beginner', 'intermediate', 'advanced'];
const GOALS: TrainingGoal[] = ['fitness', 'endurance', 'speed', 'technique'];
const UNITS: DistanceUnit[] = ['meters', 'yards'];
const POOL_LENGTHS: PoolLength[] = [25, 50];
const EQUIPMENT_IDS: Equipment[] = ['fins', 'paddles', 'pullBuoy', 'kickboard', 'snorkel', 'parachute', 'tempoTrainer', 'band'];

/** Parses and validates a profile backup pasted in by the user — an external-content boundary. */
export function parseProfileBackup(text: string): AthleteProfile | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (!LEVELS.includes(d.level as AthleteLevel)) return null;
  if (!GOALS.includes(d.goal as TrainingGoal)) return null;
  if (typeof d.poolSessionsPerWeek !== 'number') return null;
  if (typeof d.poolSessionDurationMin !== 'number') return null;
  if (typeof d.gymSessionsPerWeek !== 'number') return null;
  if (!Array.isArray(d.equipment) || !d.equipment.every((e) => EQUIPMENT_IDS.includes(e as Equipment))) return null;

  const unit: DistanceUnit = UNITS.includes(d.unit as DistanceUnit) ? (d.unit as DistanceUnit) : 'meters';
  const poolLength: PoolLength = POOL_LENGTHS.includes(d.poolLength as PoolLength) ? (d.poolLength as PoolLength) : 25;

  let benchmark: AthleteProfile['benchmark'];
  if (d.benchmark && typeof d.benchmark === 'object') {
    const b = d.benchmark as Record<string, unknown>;
    if (typeof b.distance === 'number' && typeof b.timeSec === 'number' && b.timeSec > 0) {
      benchmark = { distance: b.distance, timeSec: b.timeSec };
    }
  }

  return {
    level: d.level as AthleteLevel,
    goal: d.goal as TrainingGoal,
    poolSessionsPerWeek: d.poolSessionsPerWeek as number,
    poolSessionDurationMin: d.poolSessionDurationMin as number,
    gymSessionsPerWeek: d.gymSessionsPerWeek as number,
    equipment: d.equipment as Equipment[],
    unit,
    poolLength,
    benchmark,
  };
}
