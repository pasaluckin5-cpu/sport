import AsyncStorage from '@react-native-async-storage/async-storage';

const PROGRESS_KEY = 'swim-planner/learn-to-swim-progress';

/**
 * Local-only for now (unlike the main AthleteProfile/history, which sync to Supabase when
 * signed in) — this is a small, self-contained checklist, not something a coach needs to see or
 * that needs cross-device continuity to be useful. `completedDays` is a plain count (not a set
 * of specific day numbers) since the curriculum is strictly sequential — there's no notion of
 * "day 5 done but day 3 not," only "how many days in a row have been completed."
 */
export interface LearnToSwimProgress {
  minutesPerDay: number;
  completedDays: number;
}

export async function loadLearnToSwimProgress(): Promise<LearnToSwimProgress | null> {
  const raw = await AsyncStorage.getItem(PROGRESS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LearnToSwimProgress;
  } catch {
    return null;
  }
}

export async function saveLearnToSwimProgress(progress: LearnToSwimProgress): Promise<void> {
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export async function clearLearnToSwimProgress(): Promise<void> {
  await AsyncStorage.removeItem(PROGRESS_KEY);
}
