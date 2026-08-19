import AsyncStorage from '@react-native-async-storage/async-storage';

import { SessionFeedback } from '@/domain/types';

const HISTORY_KEY = 'swim-planner/completion-history';

/**
 * Keys look like "2026-W08:2:pool" — weekKey:dayIndex:kind. A value of `true` means "marked
 * done, no feedback logged"; a SessionFeedback object means the athlete also logged how it
 * felt (see history-context.tsx's setFeedback) — both count as "completed".
 */
export type CompletionValue = true | SessionFeedback;
export type CompletionMap = Record<string, CompletionValue>;

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
