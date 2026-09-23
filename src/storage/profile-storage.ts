import AsyncStorage from '@react-native-async-storage/async-storage';

import { AthleteProfile } from '@/domain/types';

const PROFILE_KEY = 'swim-planner/athlete-profile';

export async function loadProfile(): Promise<AthleteProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AthleteProfile;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: AthleteProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
