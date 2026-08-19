/** ISO-8601 week key, e.g. "2026-W08". Used both as a history key and to seed weekly variation. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thursday of this ISO week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNum = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Stable hash of a week key into 0..modulo-1, used to rotate zone/stroke order across weeks. */
export function weekKeyToOffset(weekKey: string, modulo: number): number {
  if (modulo <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < weekKey.length; i++) {
    hash = (hash * 31 + weekKey.charCodeAt(i)) >>> 0;
  }
  return hash % modulo;
}

export function rotateArray<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return items;
  const shift = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
}

/**
 * Inverse of isoWeekKey: the Monday (UTC midnight) of the given ISO week key. Used by
 * periodization.ts to measure "days until race" from the week being generated rather than
 * from "today", so generateWeekPlan stays a pure function of its inputs (same weekKey always
 * yields the same days-until-race, whenever it's actually called).
 */
export function weekKeyToMonday(weekKey: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return new Date(NaN);
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}
