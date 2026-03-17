import { Theme } from '@react-navigation/native';

export type ThemeMode = 'system' | 'dark' | 'light';
export type AppTheme = {
  colors: {
    background: string;
    surface: string;
    surfaceElevated: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
    accentMuted: string;
    success: string;
    warning: string;
    danger: string;
    border: string;
    onAccent: string;
  };
};

export const APP_THEME_STORAGE_KEY = 'clubrun.theme.mode';

const shared = {
  accent: '#E63946',
  onAccent: '#FFF7F8',
};

export const themes: Record<'dark' | 'light', AppTheme> = {
  dark: {
    colors: {
      background: '#0D1117',
      surface: '#161B22',
      surfaceElevated: '#21262D',
      textPrimary: '#F0F6FC',
      textSecondary: '#8B949E',
      accent: shared.accent,
      accentMuted: 'rgba(230, 57, 70, 0.2)',
      success: '#3FB950',
      warning: '#D29922',
      danger: '#F85149',
      border: '#30363D',
      onAccent: shared.onAccent,
    },
  },
  light: {
    colors: {
      background: '#F8FAFC',
      surface: '#FFFFFF',
      surfaceElevated: '#F1F5F9',
      textPrimary: '#0F172A',
      textSecondary: '#64748B',
      accent: shared.accent,
      accentMuted: 'rgba(230, 57, 70, 0.1)',
      success: '#16A34A',
      warning: '#CA8A04',
      danger: '#DC2626',
      border: '#E2E8F0',
      onAccent: shared.onAccent,
    },
  },
};

export function resolveThemeMode(mode: ThemeMode, systemMode: 'dark' | 'light') {
  return mode === 'system' ? systemMode : mode;
}

export function buildNavigationTheme(theme: AppTheme): Theme {
  return {
    dark: theme === themes.dark,
    colors: {
      primary: theme.colors.accent,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      notification: theme.colors.warning,
    },
    fonts: {
      regular: {
        fontFamily: 'System',
        fontWeight: '400',
      },
      medium: {
        fontFamily: 'System',
        fontWeight: '500',
      },
      bold: {
        fontFamily: 'System',
        fontWeight: '700',
      },
      heavy: {
        fontFamily: 'System',
        fontWeight: '800',
      },
    },
  };
}
