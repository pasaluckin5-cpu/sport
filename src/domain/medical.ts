import { Equipment, GymExercise, Injury, InjurySeverity, MedicalCondition, MedicalProfile, PainArea, RaceStroke, Zone } from './types';

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

export function hasAnyMedicalCaution(medical: MedicalProfile | undefined): boolean {
  return !!medical && (medical.injuries.length > 0 || medical.conditions.length > 0);
}

export function hasShoulderInjury(medical: MedicalProfile | undefined): boolean {
  return !!hasInjury(medical, 'shoulder');
}

const ZONE_INTENSITY_ORDER: Zone[] = ['recovery', 'technique', 'aerobicBase', 'threshold', 'vo2max', 'sprint'];

/**
 * A conservative max training zone per condition, where going all-out without medical clearance
 * is standard general caution, not a novel claim — each condition caps at a different tier based
 * on well-known general exercise guidance, not a flat "any condition = be careful":
 * - `recentSurgery` caps hardest (`aerobicBase`) — still in general recovery.
 * - `heartCondition`, `pregnancy`, `highBloodPressure` cap at `threshold` — moderate, steady
 *   effort is broadly fine; max-effort/near-max-heart-rate or acute-BP-spiking work (all-out
 *   sprints) should be cleared by a doctor first.
 * - `asthma`, `epilepsy` cap one tier higher, at `vo2max` — sustained hard intervals are fine,
 *   but repeated all-out sprints with minimal recovery (a common bronchospasm trigger for
 *   asthma) or the breath-holding/hyperventilation pattern of max-effort sprint sets (a
 *   possible seizure-risk factor for epilepsy) are the specific thing to avoid, not moderate-
 *   hard aerobic work.
 * - `diabetes`, `anemia`, `scoliosis`, `osteoporosis`, and `other` have no zone cap — diabetes's
 *   and anemia's caution is about session duration/fatigue (see medicalVolumeMultiplier), not an
 *   intensity ceiling; scoliosis's and osteoporosis's are entirely about which *gym* exercises
 *   load the spine/skeleton (see exercisesToAvoidForMedical below), not swim/cardio intensity —
 *   swimming itself is commonly recommended as low-impact exercise for both.
 */
const CONDITION_ZONE_CAP: Partial<Record<MedicalCondition, Zone>> = {
  recentSurgery: 'aerobicBase',
  heartCondition: 'threshold',
  pregnancy: 'threshold',
  highBloodPressure: 'threshold',
  asthma: 'vo2max',
  epilepsy: 'vo2max',
};

/** The most restrictive (lowest-intensity) cap across every flagged condition, or undefined if none apply. */
export function medicalZoneCap(medical: MedicalProfile | undefined): Zone | undefined {
  if (!medical) return undefined;
  let cap: Zone | undefined;
  for (const condition of medical.conditions) {
    const conditionCap = CONDITION_ZONE_CAP[condition];
    if (!conditionCap) continue;
    if (!cap || ZONE_INTENSITY_ORDER.indexOf(conditionCap) < ZONE_INTENSITY_ORDER.indexOf(cap)) {
      cap = conditionCap;
    }
  }
  return cap;
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
 * Per-condition volume cut — distinct from the zone cap above (a condition can call for shorter/
 * lighter sessions without necessarily capping peak intensity, e.g. diabetes): `recentSurgery`
 * cuts hardest (still healing); `heartCondition`, `pregnancy`, and `diabetes` cut next-hardest
 * (0.85) — a heart condition and pregnancy both already carry a zone cap above, and diabetes
 * carries hypoglycemia risk that rises with prolonged session duration even without a hard
 * effort, so cutting overall volume is the relevant general caution there rather than an
 * intensity ceiling — `anemia` joins that bucket for the same duration-sensitive reason (reduced
 * oxygen-carrying capacity makes sustained/prolonged effort the thing to moderate, not peak
 * intensity); every other flagged condition (`highBloodPressure`, `asthma`, `epilepsy`,
 * `scoliosis`, `osteoporosis`, `other`) gets the mildest general cut (0.9) — "declared something,
 * so trim volume a bit" as a baseline caution alongside whatever more specific adjustment that
 * condition also gets (zone cap, equipment/exercise avoidance — see below).
 */
const CONDITION_VOLUME_MULTIPLIER: Record<MedicalCondition, number> = {
  recentSurgery: 0.7,
  heartCondition: 0.85,
  pregnancy: 0.85,
  diabetes: 0.85,
  anemia: 0.85,
  highBloodPressure: 0.9,
  asthma: 0.9,
  epilepsy: 0.9,
  scoliosis: 0.9,
  osteoporosis: 0.9,
  other: 0.9,
};

/**
 * The most conservative applicable volume cut — each flagged condition contributes its own cut
 * (see CONDITION_VOLUME_MULTIPLIER) and each injury contributes its own severity-scaled cut.
 * Takes the minimum (worst case) across all of these rather than multiplying them together, so
 * several simultaneous flags don't compound into an unrealistically tiny session.
 */
export function medicalVolumeMultiplier(medical: MedicalProfile | undefined): number {
  if (!medical) return 1;
  let mult = 1;
  for (const condition of medical.conditions) {
    mult = Math.min(mult, CONDITION_VOLUME_MULTIPLIER[condition]);
  }
  for (const injury of medical.injuries) {
    mult = Math.min(mult, INJURY_SEVERITY_MULTIPLIER[injury.severity]);
  }
  return mult;
}

/**
 * Well-established stroke/injury pairings: breaststroke's whip kick loads both the knee and the
 * hip (so both injury areas avoid it — deduplicated via a Set since an athlete can flag both at
 * once); butterfly's repetitive spinal extension loads the back.
 */
export function strokesToAvoid(medical: MedicalProfile | undefined): RaceStroke[] {
  const avoided = new Set<RaceStroke>();
  if (hasInjury(medical, 'knee')) avoided.add('breaststroke');
  if (hasInjury(medical, 'hip')) avoided.add('breaststroke');
  if (hasInjury(medical, 'back')) avoided.add('butterfly');
  return Array.from(avoided);
}

/**
 * Specific gym exercises to drop for a flagged injury area — well-known load patterns (heavy
 * pressing/pulling for shoulder, squat/hinge/jump patterns for knee, loaded spinal flexion or
 * heavy hinging for back, weight-bearing wrist extension for wrist, hip-flexion-under-load for
 * hip, ankle-loading/impact patterns for ankle), not an attempt to cover every possible exercise.
 * Used to filter whatever exercise list a gym day would otherwise get (see workoutLibrary.ts),
 * for both the swim-dryland S&C program and the general-fitness split.
 */
const EXERCISES_TO_AVOID_BY_INJURY: Record<PainArea, GymExercise[]> = {
  shoulder: ['benchPress', 'shoulderPress', 'pullUps', 'pushUps', 'pushUpPlus', 'tricepsDips', 'medBallRotationalThrow'],
  knee: ['squats', 'romanianDeadlift', 'bulgarianSplitSquat', 'stepUp', 'walkingLunges', 'squatJump', 'hipThrust', 'calfRaises'],
  back: ['romanianDeadlift', 'squats', 'russianTwists', 'squatJump', 'medBallRotationalThrow'],
  wrist: ['pushUps', 'pushUpPlus', 'plank', 'tricepsDips', 'benchPress'],
  hip: ['hipThrust', 'walkingLunges', 'bulgarianSplitSquat', 'stepUp', 'squats'],
  ankle: ['squatJump', 'calfRaises', 'stepUp', 'walkingLunges', 'bulgarianSplitSquat'],
  other: [],
};

/**
 * Gym exercises to drop for a flagged condition — targeted at whatever that condition's own
 * loading concern actually is, not a single shared list:
 * - `highBloodPressure` and `pregnancy` both drop explosive/plyometric work (a maximal,
 *   breath-holding/Valsalva-type effort like a jump or a rotational throw can spike blood
 *   pressure acutely; general prenatal guidance is to avoid new high-impact/explosive movements).
 * - `scoliosis` drops heavy axial spinal loading and loaded-rotation exercises — the same general
 *   caution already applied to a *back injury* (see EXERCISES_TO_AVOID_BY_INJURY above), since a
 *   spinal curvature carries the same "don't heavily load or twist the spine" concern; this is
 *   specifically a gym-side adjustment (see medicalZoneCap's doc comment — swimming itself isn't
 *   restricted for scoliosis).
 * - `osteoporosis` drops the same explosive/high-impact pair as highBloodPressure/pregnancy —
 *   reduced bone density raises fracture risk under sudden high-impact or explosive loading,
 *   general caution for this condition specifically (also a gym-side-only adjustment, same
 *   reasoning as scoliosis: low-impact swimming isn't restricted).
 * The jump/throw exercises are also the ones the swim-dryland peak/taper phases add as an
 * explosive primer (see SWIM_SC_PROGRAM in workoutLibrary.ts), so all of these reuse
 * `filterGymBlocks`'s floor-of-2 safety net exactly like the per-injury exclusions above.
 */
const EXERCISES_TO_AVOID_BY_CONDITION: Partial<Record<MedicalCondition, GymExercise[]>> = {
  highBloodPressure: ['squatJump', 'medBallRotationalThrow'],
  pregnancy: ['squatJump', 'medBallRotationalThrow'],
  scoliosis: ['squats', 'romanianDeadlift', 'russianTwists', 'squatJump', 'medBallRotationalThrow'],
  osteoporosis: ['squatJump', 'medBallRotationalThrow'],
};

export function exercisesToAvoidForMedical(medical: MedicalProfile | undefined): GymExercise[] {
  if (!medical) return [];
  const avoided = new Set<GymExercise>();
  for (const injury of medical.injuries) {
    for (const exercise of EXERCISES_TO_AVOID_BY_INJURY[injury.area]) avoided.add(exercise);
  }
  for (const condition of medical.conditions) {
    for (const exercise of EXERCISES_TO_AVOID_BY_CONDITION[condition] ?? []) avoided.add(exercise);
  }
  return Array.from(avoided);
}

/**
 * Pool equipment to drop for a flagged condition — `asthma` because a drag parachute adds
 * substantial breathing resistance right when sprint sets already demand the most air; `epilepsy`
 * because a snorkel could complicate breathing/rescue if a seizure happened in the water. Merged
 * into the athlete's equipment the same way shoulder-pain feedback already drops `paddles` (see
 * planGenerator.ts's assemblePoolSession) — a downgrade for the week, not a permanently lost
 * piece of gear.
 */
const EQUIPMENT_TO_AVOID_BY_CONDITION: Partial<Record<MedicalCondition, Equipment[]>> = {
  asthma: ['parachute'],
  epilepsy: ['snorkel'],
};

/**
 * Pool equipment to drop for a flagged injury area — `wrist` because paddles add substantial
 * hand/wrist loading on the catch and pull; `ankle` because fins add resistance/range load right
 * at the joint during kick sets. Merged alongside the condition-based exclusions above; shoulder's
 * own paddle avoidance is handled separately in planGenerator.ts (it's driven by the same flag
 * that also downgrades a gym day to mobility, not just an equipment swap).
 */
const EQUIPMENT_TO_AVOID_BY_INJURY: Partial<Record<PainArea, Equipment[]>> = {
  wrist: ['paddles'],
  ankle: ['fins'],
};

export function equipmentToAvoidForMedical(medical: MedicalProfile | undefined): Equipment[] {
  if (!medical) return [];
  const avoided = new Set<Equipment>();
  for (const condition of medical.conditions) {
    for (const equipment of EQUIPMENT_TO_AVOID_BY_CONDITION[condition] ?? []) avoided.add(equipment);
  }
  for (const injury of medical.injuries) {
    for (const equipment of EQUIPMENT_TO_AVOID_BY_INJURY[injury.area] ?? []) avoided.add(equipment);
  }
  return Array.from(avoided);
}
