import AsyncStorage from '@react-native-async-storage/async-storage';

import { MedicalProfile } from '@/domain/types';

const MEDICAL_KEY = 'swim-planner/medical-profile';

/**
 * Local-only — like learn-to-swim progress, self-declared health data doesn't get synced to
 * Supabase or shown to a coach in this pass; that's a deliberate scope decision (making health
 * data visible to a coach deserves its own explicit consent step, not a silent default), not an
 * oversight. See src/domain/medical.ts for how it's used.
 */
export async function loadMedicalProfile(): Promise<MedicalProfile | null> {
  const raw = await AsyncStorage.getItem(MEDICAL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MedicalProfile;
  } catch {
    return null;
  }
}

export async function saveMedicalProfile(profile: MedicalProfile): Promise<void> {
  await AsyncStorage.setItem(MEDICAL_KEY, JSON.stringify(profile));
}
