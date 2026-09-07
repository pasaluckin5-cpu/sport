import { GymExercise, Injury, InjurySeverity, MedicalCondition, MedicalProfile, PainArea, RaceStroke, Zone } from './types';

/**
 * Self-declared medical data, not diagnosed — everything below is a general, conservative
 * caution rule, never a personalized medical recommendation. The mechanical adjustments here
 * (equipment/stroke/exercise avoidance, zone caps, volume cuts) mirror well-established
 * swim-coaching and general exercise-caution knowledge (the same kind of thing a coach would
 * ask an athlete about before programming); they are deliberately *not* attempts at
 * condition-specific medical prescriptions. See MedicalSection's disclaimer text
 * (src/components/medical-section.tsx) — every screen that reads this data also shows it.
 */

export const EMPTY_MEDICAL: MedicalProfile = { injuries: [], conditions: [] };

function hasInjury(medical: MedicalProfile | undefined, area: PainArea): Injury | undefined {
  return medical?.injuries.find((i) => i.area === area);
}

function hasCondition(medical: MedicalProfile | undefined, condition: MedicalCondition): boolean {
  return !!medical?.conditions.includes(condition);
}

export function hasAnyMedicalCaution(medical: MedicalProfile | undefined): boolean {
  return !!medical && (medical.injuries.length > 0 || medical.conditions.length > 0);
}

export function hasShoulderInjury(medical: MedicalProfile | undefined): boolean {
  return !!hasInjury(medical, 'shoulder');
}

const ZONE_INTENSITY_ORDER: Zone[] = ['recovery', 'technique', 'aerobicBase', 'threshold', 'vo2max', 'sprint'];

/**
 * A conservative max training zone for conditions where going all-out without medical clearance
 * is standard general caution, not a novel claim: recent surgery caps hardest (still in general
 * recovery), a heart condition or pregnancy caps at the next tier down (moderate effort is
 * broadly fine; max-effort/near-max-heart-rate work should be cleared by a doctor first).
 */
export function medicalZoneCap(medical: MedicalProfile | undefined): Zone | undefined {
  if (hasCondition(medical, 'recentSurgery')) return 'aerobicBase';
  if (hasCondition(medical, 'heartCondition') || hasCondition(medical, 'pregnancy')) return 'threshold';
  return undefined;
}

/** Downgrades `zone` to `cap` if it's more intense than the cap; leaves it alone otherwise (or if there's no cap). */
export function capZoneIntensity(zone: Zone, cap: Zone | undefined): Zone {
  if (!cap) return zone;
  const zoneRank = ZONE_INTENSITY_ORDER.indexOf(zone);
  const capRank = ZONE_INTENSITY_ORDER.indexOf(cap);
  return zoneRank > capRank ? cap : zone;
}

const INJURY_SEVERITY_MULTIPLIER: Record<InjurySeverity, number> = { mild: 1, moderate: 0.9, severe: 0.75 };

/**
 * The most conservative applicable volume cut — recent surgery cuts hardest, any other flagged
 * condition cuts mildly, and each injury contributes its own severity-scaled cut. Takes the
 * minimum (worst case) across all of these rather than multiplying them together, so several
 * simultaneous flags don't compound into an unrealistically tiny session.
 */
export function medicalVolumeMultiplier(medical: MedicalProfile | undefined): number {
  if (!medical) return 1;
  let mult = hasCondition(medical, 'recentSurgery') ? 0.7 : medical.conditions.length > 0 ? 0.9 : 1;
  for (const injury of medical.injuries) {
    mult = Math.min(mult, INJURY_SEVERITY_MULTIPLIER[injury.severity]);
  }
  return mult;
}

/** Well-established stroke/injury pairings: breaststroke's whip kick loads the knee; butterfly's repetitive spinal extension loads the back. */
export function strokesToAvoid(medical: MedicalProfile | undefined): RaceStroke[] {
  const avoided: RaceStroke[] = [];
  if (hasInjury(medical, 'knee')) avoided.push('breaststroke');
  if (hasInjury(medical, 'back')) avoided.push('butterfly');
  return avoided;
}

/**
 * Specific gym exercises to drop for a flagged injury area — well-known load patterns (heavy
 * pressing/pulling for shoulder, squat/hinge/jump patterns for knee, loaded spinal flexion or
 * heavy hinging for back), not an attempt to cover every possible exercise. Used to filter
 * whatever exercise list a gym day would otherwise get (see workoutLibrary.ts), for both the
 * swim-dryland S&C program and the general-fitness split.
 */
const EXERCISES_TO_AVOID_BY_INJURY: Record<PainArea, GymExercise[]> = {
  shoulder: ['benchPress', 'shoulderPress', 'pullUps', 'pushUps', 'pushUpPlus', 'tricepsDips', 'medBallRotationalThrow'],
  knee: ['squats', 'romanianDeadlift', 'bulgarianSplitSquat', 'stepUp', 'walkingLunges', 'squatJump', 'hipThrust', 'calfRaises'],
  back: ['romanianDeadlift', 'squats', 'russianTwists', 'squatJump', 'medBallRotationalThrow'],
  other: [],
};

export function exercisesToAvoidForMedical(medical: MedicalProfile | undefined): GymExercise[] {
  if (!medical) return [];
  const avoided = new Set<GymExercise>();
  for (const injury of medical.injuries) {
    for (const exercise of EXERCISES_TO_AVOID_BY_INJURY[injury.area]) avoided.add(exercise);
  }
  return Array.from(avoided);
}
