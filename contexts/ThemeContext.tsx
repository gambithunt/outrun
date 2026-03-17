import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  AppTheme,
  APP_THEME_STORAGE_KEY,
  ThemeMode,
  buildNavigationTheme,
  resolveThemeMode,
  themes,
} from '@/lib/theme';

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedMode: Exclude<ThemeMode, 'system'>;
  setMode: (mode: ThemeMode) => Promise<void>;
  theme: AppTheme;
  navigationTheme: {
    Provider: typeof NavigationThemeProvider;
    theme: ReturnType<typeof buildNavigationTheme>;
  };
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export { ThemeMode };

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemMode = useColorScheme() === 'light' ? 'light' : 'dark';
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(APP_THEME_STORAGE_KEY).then((value) => {
      if (value === 'system' || value === 'dark' || value === 'light') {
        setModeState(value);
      }
    });
  }, []);

  const resolvedMode = resolveThemeMode(mode, systemMode);
  const theme = themes[resolvedMode];
  const navigationTheme = useMemo(
    () => ({
      Provider: NavigationThemeProvider,
      theme: buildNavigationTheme(theme),
    }),
    [theme]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedMode,
      theme,
      navigationTheme,
      setMode: async (nextMode) => {
        setModeState(nextMode);
        await AsyncStorage.setItem(APP_THEME_STORAGE_KEY, nextMode);
      },
    }),
    [mode, navigationTheme, resolvedMode, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }

  return context;
}
