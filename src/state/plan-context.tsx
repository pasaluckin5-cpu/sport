import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { generateWeekPlan } from '@/domain/planGenerator';
import { AthleteProfile, WeekPlan } from '@/domain/types';
import { loadProfile, saveProfile } from '@/storage/profile-storage';

interface PlanContextValue {
  profile: AthleteProfile | null;
  weekPlan: WeekPlan | null;
  isReady: boolean;
  updateProfile: (profile: AthleteProfile) => Promise<void>;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadProfile().then((stored) => {
      if (!cancelled) {
        setProfile(stored);
        setIsReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const weekPlan = useMemo(() => (profile ? generateWeekPlan(profile) : null), [profile]);

  const value = useMemo<PlanContextValue>(
    () => ({
      profile,
      weekPlan,
      isReady,
      updateProfile: async (next: AthleteProfile) => {
        await saveProfile(next);
        setProfile(next);
      },
    }),
    [profile, weekPlan, isReady],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within a PlanProvider');
  return ctx;
}
