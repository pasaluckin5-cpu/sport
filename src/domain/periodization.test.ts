import { describe, expect, it } from 'vitest';

import {
  adherenceRatio,
  adherenceVolumeMultiplier,
  avoidShoulderLoad,
  daysUntilRace,
  easeOverloadedZones,
  extractFeedbackHistory,
  feedbackVolumeMultiplier,
  overloadedZones,
  periodizationPhase,
  summarizeFeedback,
  volumeMultiplier,
} from './periodization';
import { SessionFeedback, WeekCompletionCount, Zone } from './types';
import { isoWeekKey, weekKeyToMonday } from './week';

describe('weekKeyToMonday', () => {
  it('is the inverse of isoWeekKey (round-trips through Monday)', () => {
    for (const weekKey of ['2026-W01', '2026-W08', '2026-W52', '2025-W01', '2027-W01', '2020-W53']) {
      const monday = weekKeyToMonday(weekKey);
      expect(isoWeekKey(monday)).toBe(weekKey);
    }
  });

  it('always lands on a Monday', () => {
    for (const weekKey of ['2026-W01', '2026-W08', '2026-W30']) {
      expect(weekKeyToMonday(weekKey).getUTCDay()).toBe(1);
    }
  });
});

describe('daysUntilRace', () => {
  it('returns undefined with no goal race date', () => {
    expect(daysUntilRace('2026-W08', undefined)).toBeUndefined();
  });

  it('returns 0 when the race date is the Monday of weekKey', () => {
    const monday = weekKeyToMonday('2026-W20');
    const iso = monday.toISOString().slice(0, 10);
    expect(daysUntilRace('2026-W20', iso)).toBe(0);
  });

  it('returns a positive count for a future race and negative for a past one', () => {
    const monday = weekKeyToMonday('2026-W20');
    const future = new Date(monday.getTime() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const past = new Date(monday.getTime() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect(daysUntilRace('2026-W20', future)).toBe(14);
    expect(daysUntilRace('2026-W20', past)).toBe(-14);
  });
});

describe('periodizationPhase', () => {
  it('is undefined with no days-until-race input', () => {
    expect(periodizationPhase(undefined)).toBeUndefined();
  });

  it('buckets days-until-race into the four standard phases', () => {
    expect(periodizationPhase(200)).toBe('base');
    expect(periodizationPhase(50)).toBe('build');
    expect(periodizationPhase(20)).toBe('peak');
    expect(periodizationPhase(5)).toBe('taper');
  });

  it('falls back to base once the race date has passed', () => {
    expect(periodizationPhase(-3)).toBe('base');
  });
});

describe('volumeMultiplier', () => {
  it('is 1 for base/build, reduced for peak, most reduced for taper', () => {
    expect(volumeMultiplier('base')).toBe(1);
    expect(volumeMultiplier('build')).toBe(1);
    expect(volumeMultiplier('peak')).toBeLessThan(1);
    expect(volumeMultiplier('taper')).toBeLessThan(volumeMultiplier('peak'));
  });

  it('is neutral (1) when no phase applies', () => {
    expect(volumeMultiplier(undefined)).toBe(1);
  });
});

describe('summarizeFeedback', () => {
  it('defaults to a neutral summary with no feedback', () => {
    const summary = summarizeFeedback([]);
    expect(summary.emaDifficultyScore).toBe(0.5);
    expect(summary.shoulderPainFlagged).toBe(false);
    expect(summary.sampleCount).toBe(0);
  });

  it('flags shoulder pain when a recent entry logged it', () => {
    const entries: SessionFeedback[] = [{ difficulty: 'hard', pain: ['shoulder'] }, { difficulty: 'moderate' }];
    expect(summarizeFeedback(entries).shoulderPainFlagged).toBe(true);
  });

  it('does not flag shoulder pain for other pain areas', () => {
    const entries: SessionFeedback[] = [{ difficulty: 'moderate', pain: ['knee', 'back'] }];
    expect(summarizeFeedback(entries).shoulderPainFlagged).toBe(false);
  });

  it('ignores an old shoulder-pain flag once it has fallen out of the recent window', () => {
    // Newest first: 4 pain-free sessions logged since the one flagged shoulder pain.
    const entries: SessionFeedback[] = [
      { difficulty: 'easy' },
      { difficulty: 'easy' },
      { difficulty: 'easy' },
      { difficulty: 'easy' },
      { difficulty: 'hard', pain: ['shoulder'] },
    ];
    expect(summarizeFeedback(entries).shoulderPainFlagged).toBe(false);
  });

  it('scores a uniformly tough history at 1 regardless of length', () => {
    const entries: SessionFeedback[] = [{ difficulty: 'tooHard' }, { difficulty: 'tooHard' }, { difficulty: 'tooHard' }];
    expect(summarizeFeedback(entries).emaDifficultyScore).toBe(1);
  });

  it('weights recent sessions more than a flat average would (adapts as new data comes in)', () => {
    // Newest first: a long run of "easy" recently, after an older run of "tooHard".
    const trendingEasier: SessionFeedback[] = [
      { difficulty: 'easy' },
      { difficulty: 'easy' },
      { difficulty: 'easy' },
      { difficulty: 'easy' },
      { difficulty: 'tooHard' },
      { difficulty: 'tooHard' },
      { difficulty: 'tooHard' },
      { difficulty: 'tooHard' },
    ];
    const flatAverage = 0.5; // (4 * 0 + 4 * 1) / 8
    expect(summarizeFeedback(trendingEasier).emaDifficultyScore).toBeLessThan(flatAverage);
  });
});

describe('feedbackVolumeMultiplier', () => {
  it('stays neutral with fewer than 2 samples', () => {
    expect(feedbackVolumeMultiplier({ emaDifficultyScore: 1, shoulderPainFlagged: false, sampleCount: 0 })).toBe(1);
    expect(feedbackVolumeMultiplier({ emaDifficultyScore: 1, shoulderPainFlagged: false, sampleCount: 1 })).toBe(1);
  });

  it('backs off volume after a run of hard/too-hard sessions', () => {
    expect(feedbackVolumeMultiplier({ emaDifficultyScore: 0.9, shoulderPainFlagged: false, sampleCount: 3 })).toBeLessThan(1);
  });

  it('nudges volume up after a run of easy sessions', () => {
    expect(feedbackVolumeMultiplier({ emaDifficultyScore: 0.1, shoulderPainFlagged: false, sampleCount: 3 })).toBeGreaterThan(1);
  });

  it('stays neutral for a moderate average', () => {
    expect(feedbackVolumeMultiplier({ emaDifficultyScore: 0.4, shoulderPainFlagged: false, sampleCount: 3 })).toBe(1);
  });
});

describe('avoidShoulderLoad', () => {
  it('mirrors the summary flag', () => {
    expect(avoidShoulderLoad({ emaDifficultyScore: 0.5, shoulderPainFlagged: true, sampleCount: 2 })).toBe(true);
    expect(avoidShoulderLoad({ emaDifficultyScore: 0.5, shoulderPainFlagged: false, sampleCount: 2 })).toBe(false);
  });
});

describe('overloadedZones', () => {
  it('flags a zone only once it has enough consistently-tough samples', () => {
    const entries: SessionFeedback[] = [
      { difficulty: 'tooHard', zone: 'sprint' },
      { difficulty: 'hard', zone: 'sprint' },
    ];
    expect(overloadedZones(entries).has('sprint')).toBe(false); // only 2 samples, needs 3+
    const withThird: SessionFeedback[] = [...entries, { difficulty: 'tooHard', zone: 'sprint' }];
    expect(overloadedZones(withThird).has('sprint')).toBe(true);
  });

  it('does not flag a zone the athlete finds manageable', () => {
    const entries: SessionFeedback[] = [
      { difficulty: 'easy', zone: 'aerobicBase' },
      { difficulty: 'moderate', zone: 'aerobicBase' },
      { difficulty: 'easy', zone: 'aerobicBase' },
    ];
    expect(overloadedZones(entries).size).toBe(0);
  });

  it('ignores feedback entries with no recorded zone (e.g. gym sessions)', () => {
    const entries: SessionFeedback[] = [{ difficulty: 'tooHard' }, { difficulty: 'tooHard' }, { difficulty: 'tooHard' }];
    expect(overloadedZones(entries).size).toBe(0);
  });

  it('tracks each zone independently', () => {
    const entries: SessionFeedback[] = [
      { difficulty: 'tooHard', zone: 'sprint' },
      { difficulty: 'tooHard', zone: 'sprint' },
      { difficulty: 'tooHard', zone: 'sprint' },
      { difficulty: 'easy', zone: 'technique' },
      { difficulty: 'easy', zone: 'technique' },
      { difficulty: 'easy', zone: 'technique' },
    ];
    const result = overloadedZones(entries);
    expect(result.has('sprint')).toBe(true);
    expect(result.has('technique')).toBe(false);
  });
});

describe('easeOverloadedZones', () => {
  it('swaps a hard zone the athlete has struggled with for an easier default', () => {
    const overloaded = new Set<Zone>(['sprint']);
    expect(easeOverloadedZones(['sprint', 'technique', 'sprint'], overloaded)).toEqual([
      'aerobicBase',
      'technique',
      'aerobicBase',
    ]);
  });

  it('leaves zones untouched when nothing is overloaded', () => {
    expect(easeOverloadedZones(['sprint', 'technique'], new Set())).toEqual(['sprint', 'technique']);
  });

  it('leaves an already-easy zone alone even if flagged (no easier fallback defined)', () => {
    const overloaded = new Set<Zone>(['recovery']);
    expect(easeOverloadedZones(['recovery'], overloaded)).toEqual(['recovery']);
  });
});

describe('adherenceRatio', () => {
  const weekCounts: WeekCompletionCount[] = [
    { weekKey: '2026-W10', count: 1 }, // current week, excluded
    { weekKey: '2026-W09', count: 4 },
    { weekKey: '2026-W08', count: 4 },
    { weekKey: '2026-W07', count: 4 },
  ];

  it('is undefined with fewer than 3 weeks of prior history', () => {
    expect(adherenceRatio(weekCounts.slice(0, 2), '2026-W10', 4)).toBeUndefined();
  });

  it('is undefined with no expected sessions', () => {
    expect(adherenceRatio(weekCounts, '2026-W10', 0)).toBeUndefined();
  });

  it('returns 1 (full adherence) when completed counts match expectations', () => {
    expect(adherenceRatio(weekCounts, '2026-W10', 4)).toBe(1);
  });

  it('returns a lower ratio when completed counts fall short of expectations', () => {
    const lowHistory: WeekCompletionCount[] = [
      { weekKey: '2026-W09', count: 1 },
      { weekKey: '2026-W08', count: 2 },
      { weekKey: '2026-W07', count: 1 },
    ];
    expect(adherenceRatio(lowHistory, '2026-W10', 4)).toBeCloseTo(1.33 / 4, 2);
  });
});

describe('adherenceVolumeMultiplier', () => {
  it('is neutral with no ratio or a healthy ratio', () => {
    expect(adherenceVolumeMultiplier(undefined)).toBe(1);
    expect(adherenceVolumeMultiplier(0.9)).toBe(1);
  });

  it('backs off volume when adherence has been consistently low', () => {
    expect(adherenceVolumeMultiplier(0.3)).toBeLessThan(1);
  });
});

describe('extractFeedbackHistory', () => {
  it('ignores plain-true completions (no feedback logged)', () => {
    const map = { '2026-W10:0:pool': true as const, '2026-W10:1:gym': true as const };
    expect(extractFeedbackHistory(map)).toEqual([]);
  });

  it('parses the weekKey/dayIndex/kind out of the map key', () => {
    const map = { '2026-W10:2:pool': { difficulty: 'hard' as const, zone: 'sprint' as const } };
    expect(extractFeedbackHistory(map)).toEqual([
      { weekKey: '2026-W10', dayIndex: 2, kind: 'pool', feedback: { difficulty: 'hard', zone: 'sprint' } },
    ]);
  });

  it('sorts newest first by key', () => {
    const map = {
      '2026-W08:0:pool': { difficulty: 'easy' as const },
      '2026-W10:0:pool': { difficulty: 'hard' as const },
      '2026-W09:0:pool': { difficulty: 'moderate' as const },
    };
    expect(extractFeedbackHistory(map).map((e) => e.weekKey)).toEqual(['2026-W10', '2026-W09', '2026-W08']);
  });

  it('respects a custom limit', () => {
    const map = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`2026-W${10 + i}:0:pool`, { difficulty: 'easy' as const }]),
    );
    expect(extractFeedbackHistory(map, 3)).toHaveLength(3);
  });
});
