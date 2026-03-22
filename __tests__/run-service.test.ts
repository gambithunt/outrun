jest.mock('firebase/database', () => ({
  child: jest.fn(),
  get: jest.fn(),
  push: jest.fn(() => ({ key: 'run_generated' })),
  ref: jest.fn(),
  set: jest.fn(),
}));

import { createRun, generateJoinCode, resolveJoinCode, validateRunDraftInput } from '@/lib/runService';

function createMockClient() {
  const writes: Record<string, unknown> = {};

  return {
    writes,
    client: {
      createRunId: jest.fn(() => 'run_123'),
      readJoinCode: jest.fn(async (code: string) => {
        return writes[`join:${code}`] as { runId: string; createdAt: number } | null;
      }),
      writeJoinCode: jest.fn(async (code: string, value: unknown) => {
        writes[`join:${code}`] = value;
      }),
      writeRun: jest.fn(async (runId: string, value: unknown) => {
        writes[`run:${runId}`] = value;
      }),
    },
  };
}

describe('runService', () => {
  it('validates run draft input', () => {
    expect(() => validateRunDraftInput({ name: '   ' })).toThrow('Run name is required.');
    expect(validateRunDraftInput({ name: '  Club drive  ' }).name).toBe('Club drive');
    expect(() => validateRunDraftInput({ name: 'Club drive', maxDrivers: 0 })).toThrow(
      'Max drivers must be between 1 and 50.'
    );
    expect(validateRunDraftInput({ name: 'Club drive', maxDrivers: 22 }).maxDrivers).toBe(22);
  });

  it('generates a zero-padded join code', () => {
    expect(generateJoinCode(() => 0.123456)).toBe('123456');
    expect(generateJoinCode(() => 0)).toBe('000000');
  });

  it('creates a run and persists both run and join code', async () => {
    const { client, writes } = createMockClient();

    const result = await createRun(
      client,
      { name: 'Club drive', maxDrivers: 20 },
      { now: () => 123, random: () => 0.123456 }
    );

    expect(result.joinCode).toBe('123456');
    expect(result.runId).toBe('run_123');
    expect(writes['run:run_123']).toEqual(
      expect.objectContaining({
        name: 'Club drive',
        joinCode: '123456',
        createdAt: 123,
        maxDrivers: 20,
      })
    );
    expect(writes['join:123456']).toEqual({ runId: 'run_123', createdAt: 123 });
  });

  it('uses the authenticated admin uid when one is provided', async () => {
    const { client, writes } = createMockClient();

    const result = await createRun(
      client,
      { name: 'Auth-backed drive' },
      {
        now: () => 222,
        random: () => 0.333333,
        adminId: 'uid_admin_1',
      }
    );

    expect(result.adminId).toBe('uid_admin_1');
    expect(writes['run:run_123']).toEqual(
      expect.objectContaining({
        adminId: 'uid_admin_1',
      })
    );
  });

  it('retries when a join code already exists', async () => {
    const { client } = createMockClient();
    client.readJoinCode = jest
      .fn()
      .mockResolvedValueOnce({ runId: 'existing', createdAt: 1 })
      .mockResolvedValueOnce(null);

    const random = jest
      .fn()
      .mockReturnValueOnce(0.000001)
      .mockReturnValueOnce(0.111111)
      .mockReturnValueOnce(0.222222)
      .mockReturnValue(0.333333);
    const result = await createRun(client, { name: 'Retry drive' }, { now: () => 44, random });

    expect(client.readJoinCode).toHaveBeenNthCalledWith(1, '111111');
    expect(client.readJoinCode).toHaveBeenNthCalledWith(2, '222222');
    expect(result.joinCode).toBe('222222');
  });

  it('resolves a valid join code and rejects malformed codes', async () => {
    const { client } = createMockClient();
    client.readJoinCode = jest.fn().mockResolvedValue({ runId: 'run_999', createdAt: 22 });

    await expect(resolveJoinCode(client, '123456')).resolves.toEqual({ runId: 'run_999', createdAt: 22 });
    await expect(resolveJoinCode(client, '12ab')).rejects.toThrow('Join code must be exactly 6 digits.');
  });

  it('defaults maxDrivers to 15 when none is provided', async () => {
    const { client, writes } = createMockClient();

    await createRun(client, { name: 'Default convoy' }, { now: () => 123, random: () => 0.123456 });

    expect(writes['run:run_123']).toEqual(
      expect.objectContaining({
        maxDrivers: 15,
      })
    );
  });

  it('omits undefined optional fields from the persisted run payload', async () => {
    const { client, writes } = createMockClient();

    await createRun(client, { name: 'No description drive' }, { now: () => 123, random: () => 0.123456 });

    expect(writes['run:run_123']).toEqual(
      expect.not.objectContaining({
        description: undefined,
      })
    );
    expect(writes['run:run_123']).not.toHaveProperty('description');
  });
});
