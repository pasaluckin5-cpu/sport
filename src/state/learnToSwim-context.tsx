import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { buildLearnToSwimPlan } from '@/domain/learnToSwim';
import { LearnToSwimDay, LearnToSwimPlan, LearnToSwimStage } from '@/domain/types';
import {
  clearLearnToSwimProgress,
  loadLearnToSwimProgress,
  LearnToSwimProgress,
  saveLearnToSwimProgress,
} from '@/storage/learnToSwim-storage';

import { useMedical } from './medical-context';

interface LearnToSwimContextValue {
  isReady: boolean;
  progress: LearnToSwimProgress | null;
  plan: LearnToSwimPlan | null;
  /** The next not-yet-completed day, or null once every day is done (see isFinished). */
  currentDay: LearnToSwimDay | null;
  isFinished: boolean;
  /** Self-reported "mini goals" checklist — see src/domain/learnToSwim.ts's isMilestoneUnlocked. */
  achievedMilestones: LearnToSwimStage[];
  start: (minutesPerDay: number) => Promise<void>;
  setMinutesPerDay: (minutesPerDay: number) => Promise<void>;
  markCurrentDayDone: () => Promise<void>;
  toggleMilestone: (stage: LearnToSwimStage) => Promise<void>;
  reset: () => Promise<void>;
}

const LearnToSwimContext = createContext<LearnToSwimContextValue | null>(null);

export function LearnToSwimProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<LearnToSwimProgress | null>(null);
  const [isReady, setIsReady] = useState(false);
  const { medical } = useMedical();

  useEffect(() => {
    let cancelled = false;
    loadLearnToSwimProgress().then((stored) => {
      if (!cancelled) {
        setProgress(stored);
        setIsReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const plan = useMemo(
    () => (progress ? buildLearnToSwimPlan(progress.minutesPerDay, medical) : null),
    [progress, medical],
  );

  const value = useMemo<LearnToSwimContextValue>(() => {
    // A pace change can shrink totalDays out from under a completedDays count logged under a
    // slower pace — clamp rather than let currentDay index past the end of the new plan.
    const clampedCompleted = plan ? Math.min(progress?.completedDays ?? 0, plan.totalDays) : 0;
    const currentDay = plan ? (plan.days[clampedCompleted] ?? null) : null;
    const isFinished = plan ? clampedCompleted >= plan.totalDays : false;

    return {
      isReady,
      progress,
      plan,
      currentDay,
      isFinished,
      achievedMilestones: progress?.achievedMilestones ?? [],
      start: async (minutesPerDay: number) => {
        const next: LearnToSwimProgress = { minutesPerDay, completedDays: 0, achievedMilestones: [] };
        setProgress(next);
        await saveLearnToSwimProgress(next);
      },
      setMinutesPerDay: async (minutesPerDay: number) => {
        if (!progress) return;
        const nextPlan = buildLearnToSwimPlan(minutesPerDay, medical);
        const next: LearnToSwimProgress = {
          ...progress,
          minutesPerDay,
          completedDays: Math.min(progress.completedDays, nextPlan.totalDays),
        };
        setProgress(next);
        await saveLearnToSwimProgress(next);
      },
      markCurrentDayDone: async () => {
        if (!progress || !plan) return;
        const next: LearnToSwimProgress = {
          ...progress,
          completedDays: Math.min(progress.completedDays + 1, plan.totalDays),
        };
        setProgress(next);
        await saveLearnToSwimProgress(next);
      },
      toggleMilestone: async (stage: LearnToSwimStage) => {
        if (!progress) return;
        const achieved = progress.achievedMilestones ?? [];
        const exists = achieved.includes(stage);
        const next: LearnToSwimProgress = {
          ...progress,
          achievedMilestones: exists ? achieved.filter((s) => s !== stage) : [...achieved, stage],
        };
        setProgress(next);
        await saveLearnToSwimProgress(next);
      },
      reset: async () => {
        setProgress(null);
        await clearLearnToSwimProgress();
      },
    };
  }, [progress, plan, isReady, medical]);

  return <LearnToSwimContext.Provider value={value}>{children}</LearnToSwimContext.Provider>;
}

export function useLearnToSwim(): LearnToSwimContextValue {
  const ctx = useContext(LearnToSwimContext);
  if (!ctx) throw new Error('useLearnToSwim must be used within a LearnToSwimProvider');
  return ctx;
}
