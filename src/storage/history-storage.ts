import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = 'swim-planner/completion-history';

/** Keys look like "2026-W08:2:pool" — weekKey:dayIndex:kind. */
export type CompletionMap = Record<string, true>;

export async function loadHistory(): Promise<CompletionMap> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as CompletionMap;
  } catch {
    return {};
  }
}

export async function saveHistory(history: CompletionMap): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}
