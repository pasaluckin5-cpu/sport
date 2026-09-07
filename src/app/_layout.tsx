import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import '@/i18n';
import { AuthProvider } from '@/state/auth-context';
import { HistoryProvider } from '@/state/history-context';
import { LanguageProvider } from '@/state/language-context';
import { LearnToSwimProvider } from '@/state/learnToSwim-context';
import { MedicalProvider } from '@/state/medical-context';
import { PlanProvider } from '@/state/plan-context';
import { StrokeLogProvider } from '@/state/strokeLog-context';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <LanguageProvider>
        <AuthProvider>
          {/* Above both PlanProvider and LearnToSwimProvider — each reads useMedical() to fold
              self-declared medical caution into whichever plan it generates. */}
          <MedicalProvider>
            <HistoryProvider>
              <PlanProvider>
                <StrokeLogProvider>
                  <LearnToSwimProvider>
                    <AnimatedSplashOverlay />
                    <AppTabs />
                  </LearnToSwimProvider>
                </StrokeLogProvider>
              </PlanProvider>
            </HistoryProvider>
          </MedicalProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
