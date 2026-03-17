import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import SettingsScreen from '@/app/settings';
import { useAppTheme } from '@/contexts/ThemeContext';
import { renderWithProviders } from '@/test-utils/render';

function ThemeProbe() {
  const { mode, navigationTheme, resolvedMode } = useAppTheme();

  return (
    <>
      <Text>{mode}</Text>
      <Text>{resolvedMode}</Text>
      <Text testID="text-navigation-theme-primary">{navigationTheme.colors.primary}</Text>
    </>
  );
}

describe('ThemeContext', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults to system mode', () => {
    renderWithProviders(<ThemeProbe />);

    expect(screen.getByText('system')).toBeTruthy();
    expect(screen.getByTestId('text-navigation-theme-primary')).toHaveTextContent('#E63946');
  });

  it('persists manual mode changes from settings', async () => {
    renderWithProviders(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('theme-option-dark'));

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('clubrun.theme.mode', 'dark')
    );
  });
});
