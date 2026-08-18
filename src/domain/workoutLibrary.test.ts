import { describe, expect, it } from 'vitest';

import { basePace100Sec, estimateDistancePerHour, formatPace100, PACE_M_PER_HOUR, roundToPoolLength } from './workoutLibrary';

describe('basePace100Sec', () => {
  it('converts a time trial into seconds per 100 (meters or yards)', () => {
    // 400m in 6:40 (400s) -> 100s per 100m
    expect(basePace100Sec({ distance: 400, timeSec: 400 })).toBeCloseTo(100);
  });
});

describe('formatPace100', () => {
  it('formats seconds as m:ss', () => {
    expect(formatPace100(95)).toBe('1:35');
    expect(formatPace100(60)).toBe('1:00');
    expect(formatPace100(5)).toBe('0:05');
  });
});

describe('roundToPoolLength', () => {
  it('rounds to the nearest whole pool length', () => {
    expect(roundToPoolLength(1010, 25)).toBe(1000);
    expect(roundToPoolLength(1990, 50)).toBe(2000);
    expect(roundToPoolLength(10, 25)).toBe(25);
  });
});

describe('estimateDistancePerHour', () => {
  it('falls back to the level table with no benchmark', () => {
    expect(estimateDistancePerHour('advanced', 'meters')).toBe(PACE_M_PER_HOUR.advanced);
  });

  it('converts the level table to yards when unit is yards', () => {
    const meters = estimateDistancePerHour('intermediate', 'meters');
    const yards = estimateDistancePerHour('intermediate', 'yards');
    expect(yards).toBeGreaterThan(meters);
  });

  it('derives a higher rate for a faster benchmark pace', () => {
    const slow = estimateDistancePerHour('intermediate', 'meters', { distance: 400, timeSec: 480 }); // 2:00/100m
    const fast = estimateDistancePerHour('intermediate', 'meters', { distance: 400, timeSec: 320 }); // 1:20/100m
    expect(fast).toBeGreaterThan(slow);
  });
});
