import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en';
import ru from './locales/ru';

export const SUPPORTED_LANGUAGES = ['en', 'ru'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const resources = {
  en: { translation: en },
  ru: { translation: ru },
} as const;

if (!i18n.isInitialized) {
  // eslint-disable-next-line import/no-named-as-default-member -- this is i18next's own instance method, not the named `use` export
  i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    // Supports the CLDR-style _one/_few/_many/_other plural suffixes used in locales/ru.ts.
    compatibilityJSON: 'v4',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
