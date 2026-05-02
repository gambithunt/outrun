import { fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { BottomSheetSurface } from '@/components/ui/BottomSheetSurface';
import { Screen } from '@/components/Screen';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Toast } from '@/components/ui/Toast';
import { renderWithProviders } from '@/test-utils/render';

describe('UI primitives', () => {
  it('renders and presses a button', () => {
    const onPress = jest.fn();
    const screen = renderWithProviders(
      <AppButton label="Create" onPress={onPress} testID="button-test" />
    );

    fireEvent.press(screen.getByTestId('button-test'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders badge, card, input, loading spinner, toast, and bottom sheet surface', () => {
    const onChangeText = jest.fn();
    const screen = renderWithProviders(
      <>
        <AppBadge label="Badge" />
        <AppCard>
          <Text>Card content</Text>
        </AppCard>
        <AppTextInput
          label="Run name"
          value=""
          onChangeText={onChangeText}
          placeholder="Sunday drive"
          testID="input-run-name"
        />
        <BottomSheetSurface>
          <Text>Sheet</Text>
        </BottomSheetSurface>
        <LoadingSpinner />
        <Toast message="Saved" testID="toast-test" />
      </>
    );

    fireEvent.changeText(screen.getByTestId('input-run-name'), 'Club run');
    expect(onChangeText).toHaveBeenCalledWith('Club run');
    expect(screen.getByText('Badge')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByTestId('toast-test')).toBeTruthy();
    expect(screen.getByText('Card content')).toBeTruthy();
    expect(screen.getByText('Sheet')).toBeTruthy();
  });

  it('does not add default top and bottom gutter inside the shared screen wrapper', () => {
    const screen = renderWithProviders(
      <Screen testID="screen-wrapper-test">
        <Text>Edge to edge content</Text>
      </Screen>
    );

    expect(screen.getByTestId('screen-wrapper-test-content')).not.toHaveStyle({
      paddingTop: 20,
      paddingBottom: 24,
    });
  });
});
