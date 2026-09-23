import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppLanguage, SUPPORTED_LANGUAGES } from '@/i18n';

const LANGUAGE_KEY = 'swim-planner/language';

export async function loadLanguage(): Promise<AppLanguage | null> {
  const raw = await AsyncStorage.getItem(LANGUAGE_KEY);
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(raw ?? '') ? (raw as AppLanguage) : null;
}

export async function saveLanguage(language: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, language);
}
