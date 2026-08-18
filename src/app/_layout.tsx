import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import '@/i18n';
import { HistoryProvider } from '@/state/history-context';
import { LanguageProvider } from '@/state/language-context';
import { PlanProvider } from '@/state/plan-context';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <LanguageProvider>
        <PlanProvider>
          <HistoryProvider>
            <AnimatedSplashOverlay />
            <AppTabs />
          </HistoryProvider>
        </PlanProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
