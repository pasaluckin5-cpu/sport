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
  | 'recoverySwim'
  | 'raceStartPractice';

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

/**
 * 'chest'/'back'/'shoulders'/'arms'/'push'/'pull' only appear in `'generalFitness'` mode, chosen
 * via `AthleteProfile.gymSplit` below — swim-dryland sessions are always 'fullBody' (a periodized
 * A/B/C full-body program — see workoutLibrary.ts's SWIM_SC_PROGRAM — rather than a body-part
 * split, matching how swimmers are actually programmed in practice).
 */
export type GymFocus = 'fullBody' | 'upperBody' | 'lowerBody' | 'core' | 'mobility' | 'chest' | 'back' | 'shoulders' | 'arms' | 'push' | 'pull';

/** Which gym exercise catalog to draw from — see workoutLibrary.ts's two catalogs. */
export type GymMode = 'swimDryland' | 'generalFitness';

/**
 * How a `'generalFitness'` gym-only profile's sessions are scheduled across the week — standard
 * strength-training split terminology. Only meaningful when `poolSessionsPerWeek === 0`; unset
 * falls back to the existing goal-based rotation. 'bodyPartSplit' pairs muscle groups (e.g.
 * chest+triceps-adjacent push work) across ~4-5 days; 'broSplit' is the more granular one
 * muscle-group-per-day version (5-6 days) colloquially known by that name.
 */
export type GymSplit = 'fullBody' | 'upperLower' | 'pushPull' | 'pushPullLegs' | 'bodyPartSplit' | 'broSplit';

/**
 * The set/rep/rest emphasis for a `'generalFitness'` gym-only profile's sessions — independent
 * of `GymSplit` (which day trains what) and applied on top of it. 'cardio' replaces the day's
 * strength blocks entirely with a single steady-state cardio block rather than reinterpreting
 * sets/reps for it. Unset falls back to the existing default (moderate, hypertrophy-ish) scheme.
 */
export type GymTrainingStyle = 'strength' | 'hypertrophy' | 'endurance' | 'functional' | 'circuit' | 'cardio';

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
  | 'hip9090Mobility'
  | 'shoulderPress'
  | 'facePulls'
  | 'stepUp'
  | 'pallofPress'
  | 'lateralRaises'
  | 'bicepCurls'
  | 'cardioSession';

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

/** How a completed session felt, logged by the athlete right after marking it done. */
export type Difficulty = 'easy' | 'moderate' | 'hard' | 'tooHard';

/** Where it hurt, if anywhere — 'other' covers anything not worth its own category. */
export type PainArea = 'shoulder' | 'knee' | 'back' | 'other';

export interface SessionFeedback {
  difficulty: Difficulty;
  pain?: PainArea[];
  /** Only set for pool sessions — lets the generator learn which zones the athlete finds hard. */
  zone?: Zone;
}

export type InjurySeverity = 'mild' | 'moderate' | 'severe';

/** A standing injury the athlete has declared — distinct from SessionFeedback.pain (a one-off flag on a single session): this persists across weeks until the athlete removes it. Reuses PainArea since it's the same set of body areas. */
export interface Injury {
  area: PainArea;
  severity: InjurySeverity;
}

/**
 * Self-declared, not diagnosed — the app applies only general, conservative caution (see
 * src/domain/medical.ts), never a personalized medical recommendation. Kept separate from
 * AthleteProfile (see src/state/medical-context.tsx) since it's a property of the person, not
 * of any one training program — both the main plan and the learn-to-swim program read it.
 */
export interface MedicalProfile {
  injuries: Injury[];
  conditions: MedicalCondition[];
}

export type MedicalCondition =
  | 'asthma'
  | 'heartCondition'
  | 'pregnancy'
  | 'diabetes'
  | 'highBloodPressure'
  | 'epilepsy'
  | 'scoliosis'
  | 'recentSurgery'
  | 'other';

/** Completed-session count for one ISO week — see src/state/history-context.tsx. */
export interface WeekCompletionCount {
  weekKey: string;
  count: number;
}

/** A day can have an independent pool session and/or gym session — see src/state/history-context.tsx. */
export type SessionKind = 'pool' | 'gym';

/**
 * Standard athletic periodization phases, derived purely from days-until-race (see
 * src/domain/periodization.ts) — base (general prep) -> build (increasing load) -> peak
 * (race-specific, high-intensity) -> taper (volume cut before the race).
 */
export type PeriodizationPhase = 'base' | 'build' | 'peak' | 'taper';

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
  /** Optional goal race date (ISO yyyy-mm-dd). Drives periodization phase/volume — see periodization.ts. */
  goalRaceDate?: string;
  /** Only meaningful when poolSessionsPerWeek === 0 — see GymSplit's doc comment. */
  gymSplit?: GymSplit;
  /** Only meaningful when poolSessionsPerWeek === 0 — see GymTrainingStyle's doc comment. */
  gymTrainingStyle?: GymTrainingStyle;
}

export interface WeekPlan {
  days: DayPlan[]; // length 7, Monday first
  totalPoolDistance: number;
  generatedAt: string; // ISO timestamp
  /** ISO week key (e.g. "2026-W08") this plan was generated for — see src/domain/week.ts. */
  weekKey: string;
  /** Only set when the athlete has a goalRaceDate — see src/domain/periodization.ts. */
  periodizationPhase?: PeriodizationPhase;
}

export const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

/**
 * The "learn to swim from zero" curriculum's stages, in order — a completely different track
 * from the main training plan (that one assumes the athlete can already swim). See
 * src/domain/learnToSwim.ts.
 */
export type LearnToSwimStage =
  | 'waterComfort'
  | 'floating'
  | 'gliding'
  | 'kicking'
  | 'armStroke'
  | 'breathingCoordination'
  | 'fullStrokeEndurance';

export type LearnToSwimDrillKind =
  | 'breathControl'
  | 'faceSubmersion'
  | 'frontFloat'
  | 'backFloat'
  | 'recoveryToStanding'
  | 'wallPushGlide'
  | 'streamlineGlide'
  | 'flutterKickFront'
  | 'flutterKickBack'
  | 'armCircleStanding'
  | 'armStrokeWithGlide'
  | 'sideBreathing'
  | 'breathingWithKick'
  | 'fullStrokeShort'
  | 'fullStrokeContinuous'
  | 'treadingWater'
  | 'rollToBackFloat';

export interface LearnToSwimDrill {
  kind: LearnToSwimDrillKind;
  minutes: number;
}

export interface LearnToSwimDay {
  dayNumber: number; // 1-based
  stage: LearnToSwimStage;
  drills: LearnToSwimDrill[];
  totalMinutes: number;
}

export interface LearnToSwimPlan {
  totalDays: number;
  minutesPerDay: number;
  days: LearnToSwimDay[];
}

/**
 * A short, typed coaching note for how to race a specific distance/stroke — not a formatted
 * sentence, same "structured, presentation-agnostic" pattern as SetStepKind/GymExercise (see
 * src/i18n/format.ts for the translated text). 'im' has no stroke-specific tactic (its tactics
 * are mostly about transitions, out of scope for now) — only the four solo strokes get one.
 */
export type RaceTacticKey =
  | 'sprintStart'
  | 'sprintNoBreathOff'
  | 'distancePacing'
  | 'distanceSighting'
  | 'middleDistanceBuild'
  | 'turnsBreakouts'
  | 'strokeBreaststrokePullout'
  | 'strokeButterflyRhythm'
  | 'strokeBackstrokeCounting'
  | 'strokeFreestyleBilateral'
  | 'medicalCaution';

/** Positive split (going out too fast) is a mistake pattern, not a strategy — never recommended. */
export type PacingStrategy = 'evenSplit' | 'negativeSplit';

export interface RaceSplit {
  segment: 'firstHalf' | 'secondHalf';
  targetSec: number;
}

/** A pre-race warmup/pacing/tactics plan for the athlete's goal race — see src/domain/raceDayPlan.ts. */
export interface RaceDayPlan {
  raceDistance: number;
  stroke: RaceStroke;
  warmup: SetStep[];
  pacingStrategy: PacingStrategy;
  /** Only set when the athlete has a pace benchmark — otherwise pacing is effort-based only. */
  totalTargetSec?: number;
  splits?: RaceSplit[];
  tacticalNotes: RaceTacticKey[];
}
