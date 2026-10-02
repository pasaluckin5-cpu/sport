import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { generateWeekPlan } from '@/domain/planGenerator';
import { AthleteProfile, WeekPlan } from '@/domain/types';
import { loadProfile, saveProfile } from '@/storage/profile-storage';
import { fetchCloudProfile, upsertCloudProfile } from '@/supabase/sync';

import { useAuth } from './auth-context';
import { useHistory } from './history-context';
import { useMedical } from './medical-context';

interface PlanContextValue {
  profile: AthleteProfile | null;
  weekPlan: WeekPlan | null;
  isReady: boolean;
  updateProfile: (profile: AthleteProfile) => Promise<void>;
}

const PlanContext = createContext<PlanContextValue | null>(null);

/**
 * Функция адаптации плана: собирает контекст прошлой недели, 
 * проверяет медицинские ограничения (травмы/болезни) и формирует детальные вводные 
 * для генератора или расшифровки тренировок.
 */
function buildAdaptivePlanContext(
  feedbackHistory: any[],
  weekCounts: any,
  medical: any
) {
  // 1. Анализ самочувствия и обратной связи с прошлой недели
  const lastFeedbacks = feedbackHistory.slice(-7); // Берем последние дни
  const hasFatigue = lastFeedbacks.some((f) => f.fatigueLevel && f.fatigueLevel > 4);
  
  // 2. Проверка медицинских ограничений / травм
  const activeInjuries = medical?.injuries?.filter((inj: any) => inj.active) || [];
  const hasMedicalRestrictions = activeInjuries.length > 0 || medical?.isSick;

  // 3. Формирование модификаторов для генератора
  return {
    feedbackHistory,
    recentWeekCounts: weekCounts,
    medical,
    adaptationFlags: {
      hasFatigue,
      hasMedicalRestrictions,
      activeInjuriesCount: activeInjuries.length,
      // Можно передать флаг снижения интенсивности, если есть травмы или сильная усталость
      shouldReduceIntensity: hasFatigue || hasMedicalRestrictions,
    },
  };
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [isReady, setIsReady] = useState(false);
  const { session } = useAuth();
  const { feedbackHistory, weekCounts } = useHistory();
  const { medical } = useMedical();

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

  // Синхронизация с облаком Supabase при входе
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
  }, [session?.user.id, isReady]);

  // Генерация недели с использованием функции адаптации контекста
  const weekPlan = useMemo(() => {
    if (!profile) return null;

    const adaptiveContext = buildAdaptivePlanContext(
      feedbackHistory, 
      weekCounts, 
      medical
    );

    return generateWeekPlan(profile, adaptiveContext);
  }, [profile, feedbackHistory, weekCounts, medical]);

  const value = useMemo<PlanContextValue>(
    () => ({
      profile,
      weekPlan,
      isReady,
      updateProfile: async (next: AthleteProfile) => {
        try {
          await saveProfile(next);
          setProfile(next);
          if (session) {
            await upsertCloudProfile(session.user.id, next);
          }
        } catch (error) {
          console.error('Failed to update profile:', error);
          throw error;
        }
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
