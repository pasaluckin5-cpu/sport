import { Difficulty, PeriodizationPhase, SessionFeedback, SessionKind, WeekCompletionCount, Zone } from './types';
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
  /** 0 (trending easy) .. 1 (trending too hard). 0.5 (neutral) with no data. */
  emaDifficultyScore: number;
  shoulderPainFlagged: boolean;
  sampleCount: number;
}

const DIFFICULTY_SCORE: Record<Difficulty, number> = { easy: 0, moderate: 0.4, hard: 0.7, tooHard: 1 };

/**
 * How much weight each newer sample carries versus everything before it. Lower = longer memory
 * (old sessions keep influencing the trend for longer); higher = faster-adapting. 0.3 means the
 * last ~10 sessions dominate the trend while older ones fade rather than vanish outright.
 */
const EMA_ALPHA = 0.3;

/** How far back to look for an active shoulder-pain flag — recent only, so a one-off strain from months ago doesn't permanently restrict paddles/upper-body work forever. */
const RECENT_PAIN_WINDOW = 4;

/**
 * Folds the athlete's entire logged feedback history (see SessionFeedback, newest-first) into
 * one adaptation signal, using an exponential moving average rather than a flat mean of a fixed
 * recent window — so the trend keeps adapting as new sessions come in while still carrying
 * forward the shape of months of history, with older entries fading in influence gradually
 * instead of dropping out abruptly at a cutoff.
 */
export function summarizeFeedback(feedbackHistoryNewestFirst: SessionFeedback[] = []): FeedbackSummary {
  if (feedbackHistoryNewestFirst.length === 0) {
    return { emaDifficultyScore: 0.5, shoulderPainFlagged: false, sampleCount: 0 };
  }
  const oldestFirst = [...feedbackHistoryNewestFirst].reverse();
  let ema = DIFFICULTY_SCORE[oldestFirst[0].difficulty];
  for (let i = 1; i < oldestFirst.length; i++) {
    ema = EMA_ALPHA * DIFFICULTY_SCORE[oldestFirst[i].difficulty] + (1 - EMA_ALPHA) * ema;
  }
  const shoulderPainFlagged = feedbackHistoryNewestFirst
    .slice(0, RECENT_PAIN_WINDOW)
    .some((f) => f.pain?.includes('shoulder'));
  return { emaDifficultyScore: ema, shoulderPainFlagged, sampleCount: feedbackHistoryNewestFirst.length };
}

/**
 * Backs volume off when the difficulty trend has drifted toward hard/too-hard, nudges it up
 * slightly when it's drifted toward easy, and stays neutral with fewer than 2 samples (too
 * little signal to trust).
 */
export function feedbackVolumeMultiplier(summary: FeedbackSummary): number {
  if (summary.sampleCount < 2) return 1;
  if (summary.emaDifficultyScore >= 0.75) return 0.85;
  if (summary.emaDifficultyScore <= 0.15) return 1.05;
  return 1;
}

export function avoidShoulderLoad(summary: FeedbackSummary): boolean {
  return summary.shoulderPainFlagged;
}

/** Falls back to an easier zone once a zone has been consistently rated too hard — see overloadedZones. */
const EASIER_ZONE: Partial<Record<Zone, Zone>> = {
  sprint: 'aerobicBase',
  vo2max: 'aerobicBase',
  threshold: 'aerobicBase',
};

const ZONE_BIAS_MIN_SAMPLES = 3;
const ZONE_BIAS_THRESHOLD = 0.75;

/**
 * Per-zone difficulty trend, from feedback entries that recorded which zone the session was
 * (pool sessions only — see SessionFeedback.zone). Surfaces zones the athlete has consistently
 * found too hard across their history — not just "sessions in general feel hard" — so the
 * weekly zone rotation can ease off specifically that zone instead of cutting volume everywhere.
 * Requires at least 3 samples for a zone before acting on it; too little evidence to single out
 * one zone otherwise.
 */
export function overloadedZones(feedbackHistoryNewestFirst: SessionFeedback[] = []): Set<Zone> {
  const byZone = new Map<Zone, SessionFeedback[]>();
  for (const entry of feedbackHistoryNewestFirst) {
    if (!entry.zone) continue;
    const list = byZone.get(entry.zone) ?? [];
    list.push(entry);
    byZone.set(entry.zone, list);
  }
  const overloaded = new Set<Zone>();
  for (const [zone, entries] of byZone) {
    if (entries.length < ZONE_BIAS_MIN_SAMPLES) continue;
    if (summarizeFeedback(entries).emaDifficultyScore >= ZONE_BIAS_THRESHOLD) overloaded.add(zone);
  }
  return overloaded;
}

/** Swaps any zone the athlete has consistently found too hard for an easier default, for this week only. */
export function easeOverloadedZones(zones: Zone[], overloaded: Set<Zone>): Zone[] {
  return zones.map((zone) => (overloaded.has(zone) ? (EASIER_ZONE[zone] ?? zone) : zone));
}

const ADHERENCE_LOOKBACK_WEEKS = 3;
const ADHERENCE_LOW_RATIO = 0.5;

/**
 * Rough completion-rate signal: how much of the athlete's expected weekly session count they've
 * actually been completing lately, over the most recent weeks with any history (excluding the
 * current, naturally-incomplete week). A sustained low ratio means the current schedule isn't
 * sticking — not necessarily that sessions are too hard — so volume eases back on that basis
 * too, independent of the difficulty-feedback signal. Undefined with fewer than
 * ADHERENCE_LOOKBACK_WEEKS of prior history — too little to trust a trend.
 */
export function adherenceRatio(
  weekCounts: WeekCompletionCount[],
  currentWeekKey: string,
  expectedSessionsPerWeek: number,
): number | undefined {
  if (expectedSessionsPerWeek <= 0) return undefined;
  const pastWeeks = weekCounts.filter((w) => w.weekKey !== currentWeekKey).slice(0, ADHERENCE_LOOKBACK_WEEKS);
  if (pastWeeks.length < ADHERENCE_LOOKBACK_WEEKS) return undefined;
  const avgCompleted = pastWeeks.reduce((sum, w) => sum + w.count, 0) / pastWeeks.length;
  return Math.min(1, avgCompleted / expectedSessionsPerWeek);
}

export function adherenceVolumeMultiplier(ratio: number | undefined): number {
  if (ratio === undefined || ratio >= ADHERENCE_LOW_RATIO) return 1;
  return 0.85;
}

const FEEDBACK_HISTORY_LIMIT = 60;

export interface FeedbackHistoryEntry {
  weekKey: string;
  dayIndex: number;
  kind: SessionKind;
  feedback: SessionFeedback;
}

/**
 * Pulls the logged SessionFeedback entries out of a completion map (see
 * src/storage/history-storage.ts's CompletionMap — typed structurally here as
 * Record<string, true | SessionFeedback> rather than importing that type directly, since the
 * domain layer stays independent of the storage layer), newest first. Shared by
 * HistoryProvider (for its own feedbackHistory selector) and the coach dashboard (reading a
 * fetched athlete's cloud completions), so both get the same recency ordering and cap.
 */
export function extractFeedbackHistory(
  completions: Record<string, true | SessionFeedback>,
  limit = FEEDBACK_HISTORY_LIMIT,
): FeedbackHistoryEntry[] {
  return Object.entries(completions)
    .filter((entry): entry is [string, SessionFeedback] => typeof entry[1] === 'object')
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, limit)
    .map(([key, feedback]) => {
      const [weekKey, dayIndexStr, kind] = key.split(':');
      return { weekKey, dayIndex: Number(dayIndexStr), kind: kind as SessionKind, feedback };
    });
}
