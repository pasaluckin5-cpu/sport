import { describe, expect, it } from 'vitest';

import { basePace100Sec, estimateMPerHour, formatPace100, PACE_M_PER_HOUR } from './workoutLibrary';

describe('basePace100Sec', () => {
  it('converts a time trial into seconds per 100m', () => {
    // 400m in 6:40 (400s) -> 100s per 100m
    expect(basePace100Sec({ distanceM: 400, timeSec: 400 })).toBeCloseTo(100);
  });
});

describe('formatPace100', () => {
  it('formats seconds as m:ss', () => {
    expect(formatPace100(95)).toBe('1:35');
    expect(formatPace100(60)).toBe('1:00');
    expect(formatPace100(5)).toBe('0:05');
  });
});

describe('estimateMPerHour', () => {
  it('falls back to the level table with no benchmark', () => {
    expect(estimateMPerHour('advanced')).toBe(PACE_M_PER_HOUR.advanced);
  });

  it('derives a higher rate for a faster benchmark pace', () => {
    const slow = estimateMPerHour('intermediate', { distanceM: 400, timeSec: 480 }); // 2:00/100m
    const fast = estimateMPerHour('intermediate', { distanceM: 400, timeSec: 320 }); // 1:20/100m
    expect(fast).toBeGreaterThan(slow);
  });
});
