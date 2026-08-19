import { Difficulty, PeriodizationPhase, SessionFeedback } from './types';
import { weekKeyToMonday } from './week';

/**
 * Days from the Monday of `weekKey` to `goalRaceDate` (ISO yyyy-mm-dd). Undefined when no goal
 * date is set (or it fails to parse) — the caller then skips periodization entirely rather than
 * guessing a phase. Negative once the race date has passed.
 */
export function daysUntilRace(weekKey: string, goalRaceDate?: string): number | undefined {
  if (!goalRaceDate) return undefined;
  const monday = weekKeyToMonday(weekKey);
  const race = new Date(`${goalRaceDate}T00:00:00Z`);
  if (Number.isNaN(monday.getTime()) || Number.isNaN(race.getTime())) return undefined;
  const msPerDay = 24 * 3600 * 1000;
  return Math.round((race.getTime() - monday.getTime()) / msPerDay);
}

/**
 * Standard four-phase periodization, bucketed purely on days-until-race: base (general prep,
 * far out or after the race has passed) -> build (rising load) -> peak (race-specific, high
 * intensity, closing in) -> taper (volume cut in the final week). Thresholds are the common
 * coaching rules of thumb for an age-group/masters swim season, not a sport-science citation.
 */
export function periodizationPhase(days: number | undefined): PeriodizationPhase | undefined {
  if (days === undefined) return undefined;
  if (days < 0) return 'base'; // race has passed — back to general prep for the next one
  if (days <= 7) return 'taper';
  if (days <= 28) return 'peak';
  if (days <= 70) return 'build';
  return 'base';
}

const PHASE_VOLUME_MULTIPLIER: Record<PeriodizationPhase, number> = {
  base: 1,
  build: 1,
  peak: 0.9,
  taper: 0.65,
};

export function volumeMultiplier(phase: PeriodizationPhase | undefined): number {
  return phase ? PHASE_VOLUME_MULTIPLIER[phase] : 1;
}

export interface FeedbackSummary {
  /** 0 (recent sessions logged as easy) .. 1 (logged as too hard). 0.5 (neutral) with no data. */
  avgDifficultyScore: number;
  shoulderPainFlagged: boolean;
  sampleCount: number;
}

const DIFFICULTY_SCORE: Record<Difficulty, number> = { easy: 0, moderate: 0.4, hard: 0.7, tooHard: 1 };

/** Folds a handful of recent post-session feedback entries into one adaptation signal. */
export function summarizeFeedback(recentFeedback: SessionFeedback[] = []): FeedbackSummary {
  if (recentFeedback.length === 0) {
    return { avgDifficultyScore: 0.5, shoulderPainFlagged: false, sampleCount: 0 };
  }
  const avgDifficultyScore =
    recentFeedback.reduce((sum, f) => sum + DIFFICULTY_SCORE[f.difficulty], 0) / recentFeedback.length;
  const shoulderPainFlagged = recentFeedback.some((f) => f.pain?.includes('shoulder'));
  return { avgDifficultyScore, shoulderPainFlagged, sampleCount: recentFeedback.length };
}

/**
 * Backs volume off when recent sessions have skewed hard/too-hard, nudges it up slightly when
 * they've skewed easy, and stays neutral with fewer than 2 samples (too little signal to trust).
 */
export function feedbackVolumeMultiplier(summary: FeedbackSummary): number {
  if (summary.sampleCount < 2) return 1;
  if (summary.avgDifficultyScore >= 0.75) return 0.85;
  if (summary.avgDifficultyScore <= 0.15) return 1.05;
  return 1;
}

export function avoidShoulderLoad(summary: FeedbackSummary): boolean {
  return summary.shoulderPainFlagged;
}
