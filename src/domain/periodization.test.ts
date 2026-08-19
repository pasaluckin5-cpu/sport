import { describe, expect, it } from 'vitest';

import {
  avoidShoulderLoad,
  daysUntilRace,
  feedbackVolumeMultiplier,
  periodizationPhase,
  summarizeFeedback,
  volumeMultiplier,
} from './periodization';
import { SessionFeedback } from './types';
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
    expect(summary.avgDifficultyScore).toBe(0.5);
    expect(summary.shoulderPainFlagged).toBe(false);
    expect(summary.sampleCount).toBe(0);
  });

  it('flags shoulder pain when any recent entry logged it', () => {
    const entries: SessionFeedback[] = [{ difficulty: 'moderate' }, { difficulty: 'hard', pain: ['shoulder'] }];
    expect(summarizeFeedback(entries).shoulderPainFlagged).toBe(true);
  });

  it('does not flag shoulder pain for other pain areas', () => {
    const entries: SessionFeedback[] = [{ difficulty: 'moderate', pain: ['knee', 'back'] }];
    expect(summarizeFeedback(entries).shoulderPainFlagged).toBe(false);
  });

  it('averages difficulty scores toward the "too hard" end when sessions were logged tough', () => {
    const entries: SessionFeedback[] = [{ difficulty: 'tooHard' }, { difficulty: 'tooHard' }];
    expect(summarizeFeedback(entries).avgDifficultyScore).toBe(1);
  });
});

describe('feedbackVolumeMultiplier', () => {
  it('stays neutral with fewer than 2 samples', () => {
    expect(feedbackVolumeMultiplier({ avgDifficultyScore: 1, shoulderPainFlagged: false, sampleCount: 0 })).toBe(1);
    expect(feedbackVolumeMultiplier({ avgDifficultyScore: 1, shoulderPainFlagged: false, sampleCount: 1 })).toBe(1);
  });

  it('backs off volume after a run of hard/too-hard sessions', () => {
    expect(feedbackVolumeMultiplier({ avgDifficultyScore: 0.9, shoulderPainFlagged: false, sampleCount: 3 })).toBeLessThan(1);
  });

  it('nudges volume up after a run of easy sessions', () => {
    expect(feedbackVolumeMultiplier({ avgDifficultyScore: 0.1, shoulderPainFlagged: false, sampleCount: 3 })).toBeGreaterThan(1);
  });

  it('stays neutral for a moderate average', () => {
    expect(feedbackVolumeMultiplier({ avgDifficultyScore: 0.4, shoulderPainFlagged: false, sampleCount: 3 })).toBe(1);
  });
});

describe('avoidShoulderLoad', () => {
  it('mirrors the summary flag', () => {
    expect(avoidShoulderLoad({ avgDifficultyScore: 0.5, shoulderPainFlagged: true, sampleCount: 2 })).toBe(true);
    expect(avoidShoulderLoad({ avgDifficultyScore: 0.5, shoulderPainFlagged: false, sampleCount: 2 })).toBe(false);
  });
});
