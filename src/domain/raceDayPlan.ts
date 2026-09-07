import { hasAnyMedicalCaution } from './medical';
import { AthleteProfile, MedicalProfile, RaceDayPlan } from './types';
import { basePace100Sec, buildRaceWarmup, raceDayPacingStrategy, raceDaySplits, raceTacticalNotes } from './workoutLibrary';

/**
 * A pre-race warmup/pacing/tactics plan for the athlete's goal race. Undefined when there's
 * nothing to build one for: no swimming (poolSessionsPerWeek === 0) or no goal race date set —
 * this is deliberately tied to an actual upcoming race, not a generic "how to race" reference.
 * Race distance/stroke default to the athlete's stated primary distance/stroke, falling back to
 * their benchmark distance or plain freestyle/100m when unset. `medical` isn't independent
 * AthleteProfile data (see src/domain/medical.ts) — when any injury/condition is flagged, a
 * `'medicalCaution'` tactical note is added rather than silently changing the athlete's own
 * chosen race stroke/distance, which is a personal/competitive choice, not the app's to override.
 */
export function buildRaceDayPlan(profile: AthleteProfile, medical?: MedicalProfile): RaceDayPlan | undefined {
  if (profile.poolSessionsPerWeek === 0 || !profile.goalRaceDate) return undefined;

  const raceDistance = profile.primaryDistances?.[0] ?? profile.benchmark?.distance ?? 100;
  const stroke = profile.primaryStrokes?.[0] ?? 'freestyle';
  const pace100Sec = profile.benchmark ? basePace100Sec(profile.benchmark) : undefined;

  const warmup = buildRaceWarmup(raceDistance, stroke, profile.poolLength, pace100Sec);
  const pacingStrategy = raceDayPacingStrategy(raceDistance);
  const tacticalNotes = raceTacticalNotes(raceDistance, stroke);
  if (hasAnyMedicalCaution(medical)) tacticalNotes.unshift('medicalCaution');

  if (pace100Sec === undefined) {
    return { raceDistance, stroke, warmup, pacingStrategy, tacticalNotes };
  }
  const { totalTargetSec, splits } = raceDaySplits(raceDistance, pace100Sec, pacingStrategy);
  return { raceDistance, stroke, warmup, pacingStrategy, totalTargetSec, splits, tacticalNotes };
}
