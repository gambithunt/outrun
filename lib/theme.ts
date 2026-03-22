import { Theme } from '@react-navigation/native';

export type ThemeMode = 'system' | 'dark' | 'light';
export type AppTheme = {
  colors: {
    background: string;
    backgroundAlt: string;
    surface: string;
    surfaceElevated: string;
    panel: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
    accentMuted: string;
    accentGlow: string;
    success: string;
    warning: string;
    danger: string;
    border: string;
    onAccent: string;
    tabBar: string;
  };
};

export const APP_THEME_STORAGE_KEY = 'clubrun.theme.mode';

const shared = {
  accent: '#FF5B4D',
  onAccent: '#190909',
};

export const themes: Record<'dark' | 'light', AppTheme> = {
  dark: {
    colors: {
      background: '#070707',
      backgroundAlt: '#121011',
      surface: '#181516',
      surfaceElevated: '#262122',
      panel: '#221D1E',
      textPrimary: '#F5EFEE',
      textSecondary: '#D2BFBB',
      accent: shared.accent,
      accentMuted: 'rgba(255, 91, 77, 0.18)',
      accentGlow: 'rgba(255, 91, 77, 0.42)',
      success: '#69D59E',
      warning: '#F1BA67',
      danger: '#FF7A6B',
      border: '#342C2E',
      onAccent: shared.onAccent,
      tabBar: '#151213',
    },
  },
  light: {
    colors: {
      background: '#F8FAFC',
      backgroundAlt: '#F1F5F9',
      surface: '#FFFFFF',
      surfaceElevated: '#F1F5F9',
      panel: '#FFFFFF',
      textPrimary: '#0F172A',
      textSecondary: '#64748B',
      accent: shared.accent,
      accentMuted: 'rgba(230, 57, 70, 0.1)',
      accentGlow: 'rgba(230, 57, 70, 0.16)',
      success: '#16A34A',
      warning: '#CA8A04',
      danger: '#DC2626',
      border: '#E2E8F0',
      onAccent: shared.onAccent,
      tabBar: '#FFFFFF',
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
