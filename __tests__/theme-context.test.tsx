import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import SettingsScreen from '@/app/settings';
import { useAppTheme } from '@/contexts/ThemeContext';
import { renderWithProviders } from '@/test-utils/render';

function ThemeProbe() {
  const { mode, resolvedMode } = useAppTheme();

  return (
    <>
      <Text>{mode}</Text>
      <Text>{resolvedMode}</Text>
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
  });

  it('persists manual mode changes from settings', async () => {
    renderWithProviders(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('theme-option-dark'));

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('clubrun.theme.mode', 'dark')
    );
  });
});
