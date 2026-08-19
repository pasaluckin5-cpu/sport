import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { generateWeekPlan } from '@/domain/planGenerator';
import { AthleteProfile, WeekPlan } from '@/domain/types';
import { loadProfile, saveProfile } from '@/storage/profile-storage';
import { fetchCloudProfile, upsertCloudProfile } from '@/supabase/sync';

import { useAuth } from './auth-context';
import { useHistory } from './history-context';

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
  const { session } = useAuth();
  const { recentFeedback } = useHistory();

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

  // On sign-in: cloud is the source of truth if it already has a profile (e.g. a returning
  // user on a new device); otherwise this is a first sign-in, so the local profile — if any —
  // is uploaded once as a one-time migration. Signing out changes nothing here: whatever is
  // currently loaded stays in state and in the local AsyncStorage cache, so the app keeps
  // working exactly as it does today with no account at all.
  useEffect(() => {
    if (!session || !isReady) return;
    let cancelled = false;
    fetchCloudProfile(session.user.id).then((cloudProfile) => {
      if (cancelled) return;
      if (cloudProfile) {
        setProfile(cloudProfile);
        saveProfile(cloudProfile);
      } else if (profile) {
        upsertCloudProfile(session.user.id, profile);
      }
    });
    return () => {
      cancelled = true;
    };
    // Only re-run when the signed-in user changes, not on every local profile edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, isReady]);

  const weekPlan = useMemo(
    () => (profile ? generateWeekPlan(profile, { recentFeedback }) : null),
    [profile, recentFeedback],
  );

  const value = useMemo<PlanContextValue>(
    () => ({
      profile,
      weekPlan,
      isReady,
      updateProfile: async (next: AthleteProfile) => {
        await saveProfile(next);
        setProfile(next);
        if (session) await upsertCloudProfile(session.user.id, next);
      },
    }),
    [profile, weekPlan, isReady, session],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within a PlanProvider');
  return ctx;
}
