import type { TFunction } from 'i18next';

import { findWorldRecord, nextRankTarget, rankForTime } from '@/domain/standards';
import { focusEmphasis, formatPace100, specialtyFactor } from '@/domain/workoutLibrary';
import { DayPlan, DistanceUnit, Gender, GymBlock, GymMode, PaceBenchmark, RaceStroke, SetStep, Zone } from '@/domain/types';

/** "m"/"yd" — a universal abbreviation, not translated per-language. */
export function unitAbbrev(unit: DistanceUnit): string {
  return unit === 'yards' ? 'yd' : 'm';
}

function formatRest(step: SetStep, t: TFunction): string {
  if (step.restSec === undefined) return '';
  const range =
    step.restSecMax !== undefined && step.restSecMax !== step.restSec
      ? `${step.restSec}-${step.restSecMax}s`
      : `${step.restSec}s`;
  return `, ${t('rest')} ${range}`;
}

export function formatSetStep(step: SetStep, t: TFunction, unit: DistanceUnit): string {
  const abbrev = unitAbbrev(unit);
  const prefix = step.reps > 1 ? `${step.reps} x ${step.repDistance}${abbrev} ` : `${step.distance}${abbrev} `;
  const stroke = step.stroke ? t(`stroke.${step.stroke}`) : undefined;
  // Drills get real, stroke-specific content (e.g. "6-kick switch" for backstroke vs. "3
  // kicks, 1 pull" for breaststroke) via i18next's context feature — setKind.drill_<stroke> —
  // falling back to the generic setKind.drill template when no such variant exists.
  const context = step.kind === 'drill' && step.stroke && step.stroke !== 'choice' ? step.stroke : undefined;
  const kindText = t(`setKind.${step.kind}`, { ...(stroke ? { stroke } : {}), context });
  const paceText = step.paceSec !== undefined ? ` @ ${formatPace100(step.paceSec)}` : '';
  return `${prefix}${kindText}${paceText}${formatRest(step, t)}`;
}

const NUMERIC_REPS = /^[\d\-–]+s?$/;

export function formatGymBlock(block: GymBlock, t: TFunction): string {
  const exercise = t(`gymExercise.${block.exercise}`);
  const benefitSuffix = block.benefit ? ` (${t(`gymBenefit.${block.benefit}`)})` : '';
  if (block.reps === 'max') return `${exercise} — ${block.sets} x ${t('reps.max')}${benefitSuffix}`;
  if (block.reps === 'rounds') return `${exercise} — ${block.sets} ${t('reps.rounds')}${benefitSuffix}`;
  if (NUMERIC_REPS.test(block.reps)) return `${exercise} — ${block.sets} x ${block.reps}${benefitSuffix}`;
  return `${exercise}${benefitSuffix}`;
}

export function gymModeLabel(mode: GymMode, t: TFunction): string {
  return t(`plan.gymMode.${mode}`);
}

export function zoneLabel(zone: Zone, t: TFunction): string {
  return t(`zone.${zone}.label`);
}

export function swimSessionTitle(zone: Zone, t: TFunction): string {
  return t('swimSession', { zone: zoneLabel(zone, t) });
}

/**
 * A short, coach-style summary of what to emphasize, shown when the athlete has stated a
 * specialty (primary strokes and/or primary race distances). Returns null when neither is set,
 * so the caller can skip rendering it entirely.
 */
export function focusNoteText(
  primaryStrokes: RaceStroke[] | undefined,
  primaryDistances: number[] | undefined,
  unit: DistanceUnit,
  t: TFunction,
): string | null {
  const hasStrokes = !!primaryStrokes && primaryStrokes.length > 0;
  const hasDistances = !!primaryDistances && primaryDistances.length > 0;
  if (!hasStrokes && !hasDistances) return null;

  const subject = [
    hasStrokes ? primaryStrokes!.map((s) => t(`stroke.${s}`)).join(' / ') : undefined,
    hasDistances ? primaryDistances!.map((d) => `${d}${unitAbbrev(unit)}`).join('/') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  const emphasis = t(`focus.${focusEmphasis(specialtyFactor(primaryDistances))}`);
  return t('plan.focusNote', { subject, emphasis });
}

export interface RecordsProgress {
  yourTime: string;
  worldRecord?: string;
  percentOff?: string;
  currentRank?: string;
  goal: string;
}

/**
 * Compares a freestyle time-trial benchmark against the world record and Russian ЕВСК
 * classification standards (src/domain/standards.ts) and returns display-ready lines, or a
 * reason code when there isn't enough profile info yet to compute anything.
 */
export function recordsProgressText(
  gender: Gender | undefined,
  benchmark: PaceBenchmark | undefined,
  unit: DistanceUnit,
  t: TFunction,
): RecordsProgress | 'needsGender' | 'needsBenchmark' {
  if (!gender) return 'needsGender';
  if (!benchmark || benchmark.timeSec <= 0) return 'needsBenchmark';

  const { distance, timeSec } = benchmark;
  const abbrev = unitAbbrev(unit);
  const result: RecordsProgress = {
    yourTime: t('progress.records.yourTime', { distance, unit: abbrev, time: formatPace100(timeSec) }),
    goal: t('progress.records.noStandard'),
  };

  const record = findWorldRecord(gender, 'freestyle', distance);
  if (record) {
    result.worldRecord = t('progress.records.worldRecord', {
      context: gender,
      time: formatPace100(record.timeSec),
      holder: record.holder,
      year: record.year,
    });
    const percentOff = ((timeSec - record.timeSec) / record.timeSec) * 100;
    if (percentOff > 0) result.percentOff = t('progress.records.percentOff', { percent: percentOff.toFixed(1) });
  }

  const current = rankForTime(gender, distance, timeSec);
  if (current) result.currentRank = t('progress.records.currentRank', { rank: t(`evskRank.${current}`) });

  const next = nextRankTarget(gender, distance, timeSec);
  if (next) {
    result.goal = t('progress.records.nextRank', {
      rank: t(`evskRank.${next.rank}`),
      time: formatPace100(next.timeSec),
      diff: next.secondsToImprove.toFixed(1),
    });
  } else if (current === 'msmk') {
    result.goal = t('progress.records.maxRank');
  }

  return result;
}

/** Plain-text rendering of a day's session(s), for sharing with a coach or training partner. */
export function formatDayShareText(day: DayPlan, dayName: string, unit: DistanceUnit, t: TFunction): string {
  const lines: string[] = [`${t('common.appName')} — ${dayName}`];

  if (day.pool) {
    const abbrev = unitAbbrev(unit);
    lines.push('', `${swimSessionTitle(day.pool.zone, t)} · ${day.pool.totalDistance}${abbrev}`);
    (['warmup', 'main', 'cooldown'] as const).forEach((section) => {
      const steps = day.pool![section];
      if (steps.length === 0) return;
      lines.push('', `${t(`plan.${section}`)}:`);
      steps.forEach((step) => lines.push(`- ${formatSetStep(step, t, unit)}`));
    });
  }

  if (day.gym) {
    lines.push('', `${t(`gymFocus.${day.gym.focus}`)} · ${day.gym.durationMin}${t('common.min')}`);
    day.gym.blocks.forEach((block) => lines.push(`- ${formatGymBlock(block, t)}`));
  }

  return lines.join('\n');
}
