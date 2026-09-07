import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { EMPTY_MEDICAL } from '@/domain/medical';
import { InjurySeverity, MedicalCondition, MedicalProfile, PainArea } from '@/domain/types';
import { loadMedicalProfile, saveMedicalProfile } from '@/storage/medical-storage';
import { deleteCloudMedical, fetchCloudMedical, upsertCloudMedical } from '@/supabase/medical';

import { useAuth } from './auth-context';

interface MedicalContextValue {
  isReady: boolean;
  /** Never null to consumers — defaults to no injuries/conditions until the athlete adds any. */
  medical: MedicalProfile;
  toggleInjury: (area: PainArea) => void;
  setInjurySeverity: (area: PainArea, severity: InjurySeverity) => void;
  toggleCondition: (condition: MedicalCondition) => void;
  /** Explicit opt-in gating whether this data is ever synced to Supabase / visible to a linked coach — see medical.ts's doc comment. */
  setShareWithCoach: (share: boolean) => void;
}

const MedicalContext = createContext<MedicalContextValue | null>(null);

export function MedicalProvider({ children }: { children: ReactNode }) {
  const [medical, setMedical] = useState<MedicalProfile>(EMPTY_MEDICAL);
  const [isReady, setIsReady] = useState(false);
  const { session } = useAuth();

  useEffect(() => {
    let cancelled = false;
    loadMedicalProfile().then((stored) => {
      if (!cancelled) {
        setMedical(stored ?? EMPTY_MEDICAL);
        setIsReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Same "cloud wins if it already has a row" pattern as the other providers — but unlike them,
  // there's a third, equally valid outcome: if the athlete has never turned sharing on, nothing
  // is uploaded at all. Self-declared health data staying purely local by default is the whole
  // point of the opt-in (see MedicalProfile.shareWithCoach's doc comment in types.ts).
  useEffect(() => {
    if (!session || !isReady) return;
    let cancelled = false;
    fetchCloudMedical(session.user.id).then((cloudMedical) => {
      if (cancelled) return;
      if (cloudMedical) {
        setMedical(cloudMedical);
        saveMedicalProfile(cloudMedical);
      } else if (medical.shareWithCoach) {
        upsertCloudMedical(session.user.id, medical);
      }
    });
    return () => {
      cancelled = true;
    };
    // Only re-run when the signed-in user changes, not on every local medical-data edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, isReady]);

  function persist(next: MedicalProfile) {
    setMedical(next);
    saveMedicalProfile(next);
    // Keep the cloud row current while sharing is on, the same "downgrade, don't drop" spirit as
    // every other adjustment in this app — a coach looking at stale injury data would be worse
    // than no data at all.
    if (session && next.shareWithCoach) upsertCloudMedical(session.user.id, next);
  }

  const value = useMemo<MedicalContextValue>(
    () => ({
      isReady,
      medical,
      toggleInjury: (area) => {
        const exists = medical.injuries.some((i) => i.area === area);
        persist({
          ...medical,
          injuries: exists
            ? medical.injuries.filter((i) => i.area !== area)
            : [...medical.injuries, { area, severity: 'mild' }],
        });
      },
      setInjurySeverity: (area, severity) => {
        persist({
          ...medical,
          injuries: medical.injuries.map((i) => (i.area === area ? { ...i, severity } : i)),
        });
      },
      toggleCondition: (condition) => {
        const exists = medical.conditions.includes(condition);
        persist({
          ...medical,
          conditions: exists ? medical.conditions.filter((c) => c !== condition) : [...medical.conditions, condition],
        });
      },
      setShareWithCoach: (share) => {
        const next: MedicalProfile = { ...medical, shareWithCoach: share };
        setMedical(next);
        saveMedicalProfile(next);
        if (session) {
          // Turning sharing on uploads the current data immediately (persist() above only
          // pushes on the *next* edit); turning it off deletes the cloud row outright rather
          // than just flipping a flag a coach's query still has to check — actually revoking
          // access, not just soft-hiding it behind RLS.
          if (share) upsertCloudMedical(session.user.id, next);
          else deleteCloudMedical(session.user.id);
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [medical, isReady, session],
  );

  return <MedicalContext.Provider value={value}>{children}</MedicalContext.Provider>;
}

export function useMedical(): MedicalContextValue {
  const ctx = useContext(MedicalContext);
  if (!ctx) throw new Error('useMedical must be used within a MedicalProvider');
  return ctx;
}
