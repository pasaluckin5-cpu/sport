import type { TFunction } from 'i18next';

import { findWorldRecord, nextRankTarget, rankForTime } from '@/domain/standards';
import { focusEmphasis, formatPace100, specialtyFactor } from '@/domain/workoutLibrary';
import {
  DayPlan,
  DistanceUnit,
  Gender,
  GymBlock,
  GymMode,
  LearnToSwimDrill,
  LearnToSwimStage,
  PaceBenchmark,
  PeriodizationPhase,
  RaceDayPlan,
  RaceStroke,
  SetStep,
  Zone,
} from '@/domain/types';

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
function buildRecordsProgress(gender: Gender, stroke: RaceStroke, distance: number, timeSec: number, unit: DistanceUnit, t: TFunction): RecordsProgress {
  const abbrev = unitAbbrev(unit);
  const result: RecordsProgress = {
    yourTime: t('progress.records.yourTime', { distance, unit: abbrev, time: formatPace100(timeSec) }),
    goal: t('progress.records.noStandard'),
  };

  const record = findWorldRecord(gender, stroke, distance);
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

  // ЕВСК classification standards are freestyle-only (src/domain/standards.ts) — other strokes
  // still get the world-record comparison above, just no rank/goal line.
  if (stroke === 'freestyle') {
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
  }

  return result;
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
  return buildRecordsProgress(gender, 'freestyle', benchmark.distance, benchmark.timeSec, unit, t);
}

/**
 * Same comparison as recordsProgressText, but for a friend's logged result (src/supabase/
 * results.ts), which — unlike the local benchmark — carries its own real stroke rather than
 * always assuming freestyle.
 */
export function friendResultProgressText(
  gender: Gender,
  stroke: RaceStroke,
  distance: number,
  timeSec: number,
  unit: DistanceUnit,
  t: TFunction,
): RecordsProgress {
  return buildRecordsProgress(gender, stroke, distance, timeSec, unit, t);
}

/**
 * A short "coach note" for the athlete's current periodization phase (src/domain/
 * periodization.ts), shown only when a goal race date is set. daysUntilRace < 0 (the date has
 * passed) gets its own phrasing rather than a nonsensical negative day count.
 */
export function periodizationNoteText(phase: PeriodizationPhase, daysUntilRace: number, t: TFunction): string {
  if (daysUntilRace < 0) return t('plan.periodization.pastRace');
  return t(`plan.periodization.${phase}`, { days: daysUntilRace });
}

/** Pacing line for a race-day plan — falls back to effort-based text when there's no benchmark pace to derive exact splits from. */
export function raceDayPacingText(plan: RaceDayPlan, unit: DistanceUnit, t: TFunction): string {
  const abbrev = unitAbbrev(unit);
  if (plan.totalTargetSec === undefined || !plan.splits) {
    return t(`raceDay.pacing.noBenchmark.${plan.pacingStrategy}`, { distance: plan.raceDistance, unit: abbrev });
  }
  const [firstHalf, secondHalf] = plan.splits;
  return t(`raceDay.pacing.${plan.pacingStrategy}`, {
    distance: plan.raceDistance,
    unit: abbrev,
    total: formatPace100(plan.totalTargetSec),
    firstHalf: formatPace100(firstHalf.targetSec),
    secondHalf: formatPace100(secondHalf.targetSec),
  });
}

export function raceTacticText(key: RaceDayPlan['tacticalNotes'][number], t: TFunction): string {
  return t(`raceDay.tactic.${key}`);
}

export function learnToSwimStageLabel(stage: LearnToSwimStage, t: TFunction): string {
  return t(`learnToSwim.stage.${stage}.label`);
}

/** The stage's "mini goal" — a concrete, checkable skill target (e.g. "float unassisted for 10 seconds"). */
export function learnToSwimMilestoneText(stage: LearnToSwimStage, t: TFunction): string {
  return t(`learnToSwim.milestone.${stage}`);
}

export function formatLearnToSwimDrill(drill: LearnToSwimDrill, t: TFunction): string {
  return `${drill.minutes}${t('common.min')} · ${t(`learnToSwim.drill.${drill.kind}`)}`;
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
