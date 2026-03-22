import {
  buildRunsDashboardSections,
  createScheduledRun,
  validateScheduledRunInput,
} from '@/lib/scheduledRunService';
import { Run } from '@/types/domain';

function createRunFixture(partial: Partial<Run> = {}): Run {
  return {
    name: 'Sunrise Run',
    joinCode: '123456',
    adminId: 'admin_1',
    status: 'draft',
    createdAt: 1,
    startedAt: null,
    endedAt: null,
    maxDrivers: 15,
    ...partial,
  };
}

describe('scheduledRunService', () => {
  it('validates a future scheduled run payload', () => {
    expect(() =>
      validateScheduledRunInput(
        {
          name: 'Night Cruise',
          scheduledFor: 900,
        },
        1000
      )
    ).toThrow('Scheduled time must be in the future.');

    expect(
      validateScheduledRunInput(
        {
          name: 'Night Cruise',
          scheduledFor: 2000,
          visibility: 'club',
        },
        1000
      )
    ).toEqual(
      expect.objectContaining({
        name: 'Night Cruise',
        scheduledFor: 2000,
        visibility: 'club',
        maxDrivers: 15,
      })
    );
  });

  it('creates a scheduled run and writes the run plus invite indexes', async () => {
    const writeRun = jest.fn(async () => undefined);
    const writeUserRun = jest.fn(async () => undefined);
    const writeInvite = jest.fn(async () => undefined);

    const result = await createScheduledRun(
      {
        createRunId: () => 'run_future',
        writeRun,
        writeUserRun,
        writeInvite,
      },
      'uid_admin',
      {
        name: 'Night Cruise',
        scheduledFor: 10_000,
        visibility: 'club',
        invitedUserIds: ['uid_2', 'uid_3'],
      },
      {
        now: () => 1000,
        random: () => 0.123456,
      }
    );

    expect(result.runId).toBe('run_future');
    expect(writeRun).toHaveBeenCalledWith(
      'run_future',
      expect.objectContaining({
        adminId: 'uid_admin',
        scheduledFor: 10_000,
        visibility: 'club',
        inviteSummary: expect.objectContaining({
          totalInvites: 2,
        }),
      })
    );
    expect(writeUserRun).toHaveBeenCalledWith('uid_admin', 'run_future', expect.any(Object));
    expect(writeInvite).toHaveBeenCalledTimes(2);
  });

  it('builds dashboard sections with active runs first, then upcoming, then recent history', () => {
    const sections = buildRunsDashboardSections({
      runs: [
        createRunFixture({
          name: 'Upcoming Run',
          scheduledFor: Date.now() + 60_000,
        }),
        createRunFixture({
          name: 'Active Run',
          status: 'active',
        }),
      ],
      history: [
        {
          runId: 'run_history',
          name: 'Last Sunday',
          joinCode: '111111',
          driverId: 'driver_1',
          status: 'ended',
          createdAt: 5,
        },
      ],
      now: Date.now(),
    });

    expect(sections.hero?.name).toBe('Active Run');
    expect(sections.upcoming[0]?.name).toBe('Upcoming Run');
    expect(sections.recent[0]?.name).toBe('Last Sunday');
  });
});
