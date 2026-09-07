import { describe, expect, it } from 'vitest';

import { findWorldRecord, nextRankTarget, rankForTime } from './standards';

describe('findWorldRecord', () => {
  it('finds a known event', () => {
    const record = findWorldRecord('male', 'freestyle', 100);
    expect(record).toBeDefined();
    expect(record!.timeSec).toBeGreaterThan(0);
  });

  it('returns undefined for an event with no tracked record', () => {
    expect(findWorldRecord('male', 'breaststroke', 50)).toBeUndefined();
  });
});

describe('rankForTime', () => {
  it('returns null for a time slower than Class III', () => {
    expect(rankForTime('female', 100, 200)).toBeNull();
  });

  it('returns the fastest rank a time qualifies for', () => {
    // Women's 100m free: msmk 52.68 .. rank3 79.1 — 55s clears msmk-adjacent (ms) but not msmk.
    expect(rankForTime('female', 100, 55)).toBe('ms');
    expect(rankForTime('female', 100, 52)).toBe('msmk');
  });

  it('returns null for a distance with no standard', () => {
    expect(rankForTime('male', 837, 60)).toBeNull();
  });
});

describe('nextRankTarget', () => {
  it('targets Class III for a beginner time', () => {
    const next = nextRankTarget('male', 100, 90);
    expect(next?.rank).toBe('rank3');
    expect(next?.secondsToImprove).toBeGreaterThan(0);
  });

  it('returns null once a time already beats МСМК', () => {
    expect(nextRankTarget('male', 100, 40)).toBeNull();
  });

  it('secondsToImprove is the gap to the next standard', () => {
    const next = nextRankTarget('male', 400, 300);
    expect(next).not.toBeNull();
    expect(next!.timeSec).toBeLessThan(300);
    expect(next!.secondsToImprove).toBeCloseTo(300 - next!.timeSec, 5);
  });
});
