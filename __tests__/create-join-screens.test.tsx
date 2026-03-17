jest.mock('@/lib/runService', () => ({
  createRunWithFirebase: jest.fn(),
  resolveJoinCodeWithFirebase: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';

import CreateRunScreen from '@/app/create';
import JoinRunScreen from '@/app/join';
import { createRunWithFirebase, resolveJoinCodeWithFirebase } from '@/lib/runService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { renderWithProviders } from '@/test-utils/render';

describe('create and join screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRunSessionStore.getState().clearSession();
  });

  it('shows validation feedback when creating a run without a name', async () => {
    (createRunWithFirebase as jest.Mock).mockRejectedValue(new Error('Run name is required.'));
    const screen = renderWithProviders(<CreateRunScreen />);

    fireEvent.press(screen.getByTestId('button-submit-run'));

    await waitFor(() => expect(screen.getByText('Run name is required.')).toBeTruthy());
  });

  it('shows the generated join code after creating a run', async () => {
    (createRunWithFirebase as jest.Mock).mockResolvedValue({
      runId: 'run_42',
      joinCode: '123456',
      adminId: 'driver_admin',
      run: {
        name: 'Morning Run',
        status: 'draft',
        maxDrivers: 24,
      },
    });

    const screen = renderWithProviders(<CreateRunScreen />);

    fireEvent.changeText(screen.getByTestId('input-run-name'), 'Morning Run');
    fireEvent.changeText(screen.getByTestId('input-run-max-drivers'), '24');
    fireEvent.press(screen.getByTestId('button-submit-run'));

    await waitFor(() => expect(screen.getByTestId('text-generated-code')).toHaveTextContent('123456'));
    expect(createRunWithFirebase).toHaveBeenCalledWith({
      name: 'Morning Run',
      description: '',
      maxDrivers: 24,
    });
    expect(useRunSessionStore.getState()).toEqual(
      expect.objectContaining({
        runId: 'run_42',
        driverId: 'driver_admin',
        role: 'admin',
      })
    );
  });

  it('uses the default maxDrivers value when the admin leaves it unchanged', async () => {
    (createRunWithFirebase as jest.Mock).mockResolvedValue({
      runId: 'run_42',
      joinCode: '123456',
      adminId: 'driver_admin',
      run: {
        name: 'Morning Run',
        status: 'draft',
        maxDrivers: 15,
      },
    });

    const screen = renderWithProviders(<CreateRunScreen />);

    expect(screen.getByTestId('input-run-max-drivers')).toHaveProp('value', '15');
    fireEvent.changeText(screen.getByTestId('input-run-name'), 'Morning Run');
    fireEvent.press(screen.getByTestId('button-submit-run'));

    await waitFor(() =>
      expect(createRunWithFirebase).toHaveBeenCalledWith({
        name: 'Morning Run',
        description: '',
        maxDrivers: 15,
      })
    );
  });

  it('shows an error for an unresolved join code', async () => {
    (resolveJoinCodeWithFirebase as jest.Mock).mockResolvedValue(null);
    const screen = renderWithProviders(<JoinRunScreen />);

    fireEvent.changeText(screen.getByTestId('input-join-code'), '654321');
    fireEvent.press(screen.getByTestId('button-submit-join-code'));

    await waitFor(() => expect(screen.getByText('No run found for that join code.')).toBeTruthy());
  });

  it('shows the resolved run id when a join code succeeds', async () => {
    (resolveJoinCodeWithFirebase as jest.Mock).mockResolvedValue({ runId: 'run_77' });
    const screen = renderWithProviders(<JoinRunScreen />);

    fireEvent.changeText(screen.getByTestId('input-join-code'), '654321');
    fireEvent.press(screen.getByTestId('button-submit-join-code'));

    await waitFor(() => expect(screen.getByTestId('text-resolved-run-id')).toHaveTextContent('run_77'));
  });
});
