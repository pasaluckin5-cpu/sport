import AsyncStorage from '@react-native-async-storage/async-storage';

import { StrokeCountEntry } from '@/domain/types';

const STROKE_LOG_KEY = 'swim-planner/stroke-log';

export async function loadStrokeLog(): Promise<StrokeCountEntry[]> {
  const raw = await AsyncStorage.getItem(STROKE_LOG_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StrokeCountEntry[];
  } catch {
    return [];
  }
}

export async function saveStrokeLog(entries: StrokeCountEntry[]): Promise<void> {
  await AsyncStorage.setItem(STROKE_LOG_KEY, JSON.stringify(entries));
}
