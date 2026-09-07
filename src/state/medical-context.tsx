import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { EMPTY_MEDICAL } from '@/domain/medical';
import { InjurySeverity, MedicalCondition, MedicalProfile, PainArea } from '@/domain/types';
import { loadMedicalProfile, saveMedicalProfile } from '@/storage/medical-storage';

interface MedicalContextValue {
  isReady: boolean;
  /** Never null to consumers — defaults to no injuries/conditions until the athlete adds any. */
  medical: MedicalProfile;
  toggleInjury: (area: PainArea) => void;
  setInjurySeverity: (area: PainArea, severity: InjurySeverity) => void;
  toggleCondition: (condition: MedicalCondition) => void;
}

const MedicalContext = createContext<MedicalContextValue | null>(null);

export function MedicalProvider({ children }: { children: ReactNode }) {
  const [medical, setMedical] = useState<MedicalProfile>(EMPTY_MEDICAL);
  const [isReady, setIsReady] = useState(false);

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

  const value = useMemo<MedicalContextValue>(
    () => ({
      isReady,
      medical,
      toggleInjury: (area) => {
        const exists = medical.injuries.some((i) => i.area === area);
        const next: MedicalProfile = {
          ...medical,
          injuries: exists
            ? medical.injuries.filter((i) => i.area !== area)
            : [...medical.injuries, { area, severity: 'mild' }],
        };
        setMedical(next);
        saveMedicalProfile(next);
      },
      setInjurySeverity: (area, severity) => {
        const next: MedicalProfile = {
          ...medical,
          injuries: medical.injuries.map((i) => (i.area === area ? { ...i, severity } : i)),
        };
        setMedical(next);
        saveMedicalProfile(next);
      },
      toggleCondition: (condition) => {
        const exists = medical.conditions.includes(condition);
        const next: MedicalProfile = {
          ...medical,
          conditions: exists ? medical.conditions.filter((c) => c !== condition) : [...medical.conditions, condition],
        };
        setMedical(next);
        saveMedicalProfile(next);
      },
    }),
    [medical, isReady],
  );

  return <MedicalContext.Provider value={value}>{children}</MedicalContext.Provider>;
}

export function useMedical(): MedicalContextValue {
  const ctx = useContext(MedicalContext);
  if (!ctx) throw new Error('useMedical must be used within a MedicalProvider');
  return ctx;
}
