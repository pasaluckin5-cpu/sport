export type AthleteLevel = 'beginner' | 'intermediate' | 'advanced';

export type SwimGoal = 'fitness' | 'endurance' | 'speed' | 'technique';

export type Equipment =
  | 'fins'
  | 'paddles'
  | 'pullBuoy'
  | 'kickboard'
  | 'snorkel'
  | 'parachute'
  | 'tempoTrainer'
  | 'band';

/** Training zones, ordered roughly from easiest to hardest effort. */
export type Zone = 'recovery' | 'technique' | 'aerobicBase' | 'threshold' | 'vo2max' | 'sprint';

export interface SetStep {
  label: string;
  distanceM: number;
  equipment: Equipment[];
  zone: Zone;
}

export interface PoolSession {
  zone: Zone;
  title: string;
  durationMin: number;
  warmup: SetStep[];
  main: SetStep[];
  cooldown: SetStep[];
  totalDistanceM: number;
  equipmentUsed: Equipment[];
}

export type GymFocus = 'fullBody' | 'upperBody' | 'lowerBody' | 'core' | 'mobility';

export interface GymBlock {
  label: string;
  detail: string;
}

export interface GymSession {
  title: string;
  durationMin: number;
  focus: GymFocus;
  blocks: GymBlock[];
}

export interface DayPlan {
  dayIndex: number; // 0 = Monday .. 6 = Sunday
  pool?: PoolSession;
  gym?: GymSession;
}

/** A recent time-trial result, e.g. "400m in 6:40", used to derive a real target pace. */
export interface PaceBenchmark {
  distanceM: number;
  timeSec: number;
}

export interface AthleteProfile {
  level: AthleteLevel;
  goal: SwimGoal;
  poolSessionsPerWeek: number; // 1-7
  poolSessionDurationMin: number; // minutes per pool session
  gymSessionsPerWeek: number; // 0-5
  equipment: Equipment[];
  /** Optional — when present, session volume and set paces are derived from this instead of the level table. */
  benchmark?: PaceBenchmark;
}

export interface WeekPlan {
  days: DayPlan[]; // length 7, Monday first
  totalPoolDistanceM: number;
  generatedAt: string; // ISO timestamp
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
