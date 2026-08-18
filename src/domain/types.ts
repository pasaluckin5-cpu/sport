export type AthleteLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * Applies to both swim training and gym-only training (see `AthleteProfile.poolSessionsPerWeek`)
 * — for a gym-only athlete "technique" means movement quality/mobility-focused work rather than
 * stroke technique.
 */
export type TrainingGoal = 'fitness' | 'endurance' | 'speed' | 'technique';

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

export type DistanceUnit = 'meters' | 'yards';

/** Pool course length, in the athlete's chosen unit (e.g. a 25m or 50m pool; a 25yd or 50yd pool). */
export type PoolLength = 25 | 50;

export type StrokeKey = 'freestyle' | 'backstroke' | 'breaststroke' | 'butterfly' | 'im' | 'choice';

/** The four competitive strokes plus IM — selectable as an athlete's specialty (excludes 'choice'). */
export type RaceStroke = Exclude<StrokeKey, 'choice'>;

/**
 * What a main-set step actually is, kept as a key rather than a formatted sentence so the UI
 * layer can translate it. Each kind maps to one i18n template (see src/i18n/format.ts).
 */
export type SetStepKind =
  | 'warmupSwim'
  | 'warmupPull'
  | 'cooldown'
  | 'drill'
  | 'drillBuild'
  | 'steadySwim'
  | 'steadyKick'
  | 'thresholdSwim'
  | 'thresholdPull'
  | 'vo2Swim'
  | 'vo2Kick'
  | 'sprintAllOut'
  | 'sprintBuild'
  | 'recoverySwim';

export interface SetStep {
  kind: SetStepKind;
  reps: number;
  repDistance: number;
  distance: number;
  stroke?: StrokeKey;
  /** Rest between reps, in seconds. A range (e.g. 15-20s) sets both restSec and restSecMax. */
  restSec?: number;
  restSecMax?: number;
  /** Target time for repDistance, in seconds, when a pace benchmark is known. */
  paceSec?: number;
  equipment: Equipment[];
  zone: Zone;
}

export interface PoolSession {
  zone: Zone;
  durationMin: number;
  warmup: SetStep[];
  main: SetStep[];
  cooldown: SetStep[];
  totalDistance: number;
  equipmentUsed: Equipment[];
}

export type GymFocus = 'fullBody' | 'upperBody' | 'lowerBody' | 'core' | 'mobility';

/** Which gym exercise catalog to draw from — see workoutLibrary.ts's two catalogs. */
export type GymMode = 'swimDryland' | 'generalFitness';

/**
 * What a swim-dryland exercise is actually *for*, shown to the athlete so the gym work reads
 * as connected to their swimming rather than a generic add-on. Only set in `'swimDryland'` mode.
 */
export type SwimBenefit = 'shoulderHealth' | 'pullStrength' | 'kickPower' | 'corePower' | 'explosiveStart' | 'mobility';

export type GymExercise =
  | 'squats'
  | 'pushUps'
  | 'bentOverRows'
  | 'plank'
  | 'pullUps'
  | 'benchPress'
  | 'shoulderExternalRotation'
  | 'tricepsDips'
  | 'romanianDeadlift'
  | 'walkingLunges'
  | 'calfRaises'
  | 'deadBug'
  | 'russianTwists'
  | 'hollowHold'
  | 'shoulderDislocates'
  | 'worldsGreatestStretch'
  | 'thoracicRotations'
  | 'ankleMobility'
  | 'conditioningFinisher'
  | 'yTWRaises'
  | 'pushUpPlus'
  | 'medBallRotationalThrow'
  | 'squatJump'
  | 'bulgarianSplitSquat'
  | 'hipThrust'
  | 'sidePlankReach'
  | 'hip9090Mobility';

export interface GymBlock {
  exercise: GymExercise;
  sets: number;
  /** Language-neutral reps/time notation, e.g. "10-12", "max", "30-45s". */
  reps: string;
  /** Only set in `'swimDryland'` mode — which swim quality this exercise supports. */
  benefit?: SwimBenefit;
}

export interface GymSession {
  durationMin: number;
  focus: GymFocus;
  mode: GymMode;
  blocks: GymBlock[];
}

export interface DayPlan {
  dayIndex: number; // 0 = Monday .. 6 = Sunday
  pool?: PoolSession;
  gym?: GymSession;
  /** Whether this day's session(s) have been marked done (see src/state/history-context.tsx). */
  completed?: boolean;
}

/** A recent time-trial result, e.g. "400m in 6:40", used to derive a real target pace. */
export interface PaceBenchmark {
  distance: number;
  timeSec: number;
}

/**
 * Only used to compare `benchmark` against gender-specific reference data (world records, ЕВСК
 * classification standards — see src/domain/standards.ts) — optional, and never required for
 * plan generation itself.
 */
export type Gender = 'male' | 'female';

/** A logged stroke count over a distance (technique-efficiency tracking, e.g. SWOLF-style). */
export interface StrokeCountEntry {
  id: string;
  dateISO: string;
  distance: number; // in the athlete's unit
  strokeCount: number;
}

export interface AthleteProfile {
  level: AthleteLevel;
  goal: TrainingGoal;
  /** 0-7. Zero means "no pool training" — a gym/fitness-only plan (see GymMode). */
  poolSessionsPerWeek: number;
  poolSessionDurationMin: number; // minutes per pool session
  gymSessionsPerWeek: number; // 0-7
  equipment: Equipment[];
  unit: DistanceUnit;
  poolLength: PoolLength;
  /** Optional — when present, session volume and set paces are derived from this instead of the level table. */
  benchmark?: PaceBenchmark;
  /** Which strokes the athlete races/focuses on. Empty/absent = generic freestyle-biased default. */
  primaryStrokes?: RaceStroke[];
  /** Main race distance(s) trained for, in the athlete's unit (e.g. 100, 200) — biases main-set rep
   *  length and rest toward sprint- or distance-style training. Empty/absent = neutral mid-distance. */
  primaryDistances?: number[];
  /** Optional — only unlocks the world-record/ЕВСК-rank comparison in the Progress section. */
  gender?: Gender;
}

export interface WeekPlan {
  days: DayPlan[]; // length 7, Monday first
  totalPoolDistance: number;
  generatedAt: string; // ISO timestamp
  /** ISO week key (e.g. "2026-W08") this plan was generated for — see src/domain/week.ts. */
  weekKey: string;
}

export const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
