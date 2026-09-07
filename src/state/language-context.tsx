import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import i18n, { AppLanguage } from '@/i18n';
import { loadLanguage, saveLanguage } from '@/storage/language-storage';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');

  useEffect(() => {
    let cancelled = false;
    loadLanguage().then((stored) => {
      if (!cancelled && stored) {
        setLanguageState(stored);
        i18n.changeLanguage(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: async (next: AppLanguage) => {
        await i18n.changeLanguage(next);
        await saveLanguage(next);
        setLanguageState(next);
      },
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
