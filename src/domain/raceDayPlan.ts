import { AthleteProfile, RaceDayPlan } from './types';
import { basePace100Sec, buildRaceWarmup, raceDayPacingStrategy, raceDaySplits, raceTacticalNotes } from './workoutLibrary';

/**
 * A pre-race warmup/pacing/tactics plan for the athlete's goal race. Undefined when there's
 * nothing to build one for: no swimming (poolSessionsPerWeek === 0) or no goal race date set —
 * this is deliberately tied to an actual upcoming race, not a generic "how to race" reference.
 * Race distance/stroke default to the athlete's stated primary distance/stroke, falling back to
 * their benchmark distance or plain freestyle/100m when unset.
 */
export function buildRaceDayPlan(profile: AthleteProfile): RaceDayPlan | undefined {
  if (profile.poolSessionsPerWeek === 0 || !profile.goalRaceDate) return undefined;

  const raceDistance = profile.primaryDistances?.[0] ?? profile.benchmark?.distance ?? 100;
  const stroke = profile.primaryStrokes?.[0] ?? 'freestyle';
  const pace100Sec = profile.benchmark ? basePace100Sec(profile.benchmark) : undefined;

  const warmup = buildRaceWarmup(raceDistance, stroke, profile.poolLength, pace100Sec);
  const pacingStrategy = raceDayPacingStrategy(raceDistance);
  const tacticalNotes = raceTacticalNotes(raceDistance, stroke);

  if (pace100Sec === undefined) {
    return { raceDistance, stroke, warmup, pacingStrategy, tacticalNotes };
  }
  const { totalTargetSec, splits } = raceDaySplits(raceDistance, pace100Sec, pacingStrategy);
  return { raceDistance, stroke, warmup, pacingStrategy, totalTargetSec, splits, tacticalNotes };
}
