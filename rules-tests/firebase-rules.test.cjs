const fs = require('fs');
const path = require('path');

const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');

const RULES_PATH = path.join(__dirname, '..', 'database.rules.json');

describe('Realtime Database rules', () => {
  let testEnv;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-clubrun',
      database: {
        host: '127.0.0.1',
        port: 9000,
        rules: fs.readFileSync(RULES_PATH, 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearDatabase();
  });

  async function seed(data) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('/').set(data);
    });
  }

  function adminDb() {
    return testEnv.authenticatedContext('admin_1').database();
  }

  function driverDb(uid = 'driver_1') {
    return testEnv.authenticatedContext(uid).database();
  }

  function guestDb() {
    return testEnv.unauthenticatedContext().database();
  }

  it('allows join codes to be written once and blocks overwrite attempts', async () => {
    await assertSucceeds(
      adminDb().ref('joinCodes/123456').set({
        runId: 'run_1',
        createdAt: 1,
      })
    );

    await assertFails(
      adminDb().ref('joinCodes/123456').set({
        runId: 'run_2',
        createdAt: 2,
      })
    );
  });

  it('allows drivers to write only their own location node', async () => {
    await seed({
      runs: {
        run_1: {
          name: 'Sunrise Run',
          joinCode: '123456',
          adminId: 'admin_1',
          status: 'active',
          createdAt: 1,
          startedAt: 2,
          endedAt: null,
          maxDrivers: 15,
          drivers: {
            driver_1: {
              profile: {
                name: 'Jamie',
                carMake: 'BMW',
                carModel: 'M3',
                fuelType: 'petrol',
              },
              joinedAt: 1,
              leftAt: null,
            },
            driver_2: {
              profile: {
                name: 'Ava',
                carMake: 'Toyota',
                carModel: 'GR86',
                fuelType: 'petrol',
              },
              joinedAt: 1,
              leftAt: null,
            },
          },
        },
      },
    });

    await assertSucceeds(
      driverDb('driver_1').ref('runs/run_1/drivers/driver_1/location').set({
        lat: -26.2041,
        lng: 28.0473,
        heading: 0,
        speed: 0,
        accuracy: 5,
        timestamp: 1000,
      })
    );

    await assertFails(
      driverDb('driver_2').ref('runs/run_1/drivers/driver_1/location').set({
        lat: -26.2041,
        lng: 28.0473,
        heading: 0,
        speed: 0,
        accuracy: 5,
        timestamp: 1000,
      })
    );
  });

  it('allows a participant to claim only their own driver slot via the full run write', async () => {
    await seed({
      runs: {
        run_1: {
          name: 'Sunrise Run',
          joinCode: '123456',
          adminId: 'admin_1',
          status: 'draft',
          createdAt: 1,
          startedAt: null,
          endedAt: null,
          maxDrivers: 2,
        },
      },
    });

    await assertSucceeds(
      driverDb('driver_1').ref('runs/run_1').set({
        name: 'Sunrise Run',
        joinCode: '123456',
        adminId: 'admin_1',
        status: 'draft',
        createdAt: 1,
        startedAt: null,
        endedAt: null,
        maxDrivers: 2,
        drivers: {
          driver_1: {
            profile: {
              name: 'Jamie',
              carMake: 'BMW',
              carModel: 'M3',
              fuelType: 'petrol',
            },
            joinedAt: 10,
            leftAt: null,
          },
        },
      })
    );

    await assertFails(
      driverDb('driver_2').ref('runs/run_1').set({
        name: 'Sunrise Run',
        joinCode: '123456',
        adminId: 'admin_1',
        status: 'active',
        createdAt: 1,
        startedAt: null,
        endedAt: null,
        maxDrivers: 2,
        drivers: {
          driver_2: {
            profile: {
              name: 'Ava',
              carMake: 'Toyota',
              carModel: 'GR86',
              fuelType: 'petrol',
            },
            joinedAt: 10,
            leftAt: null,
          },
        },
      })
    );
  });

  it('allows only admins to write status and summary', async () => {
    await seed({
      runs: {
        run_1: {
          name: 'Sunrise Run',
          joinCode: '123456',
          adminId: 'admin_1',
          status: 'active',
          createdAt: 1,
          startedAt: 2,
          endedAt: null,
          maxDrivers: 15,
          drivers: {
            driver_1: {
              profile: {
                name: 'Jamie',
                carMake: 'BMW',
                carModel: 'M3',
                fuelType: 'petrol',
              },
              joinedAt: 1,
              leftAt: null,
            },
          },
        },
      },
    });

    await assertFails(driverDb('driver_1').ref('runs/run_1/status').set('ended'));
    await assertSucceeds(adminDb().ref('runs/run_1/status').set('ended'));

    const summary = {
      totalDistanceKm: 54,
      totalDriveTimeMinutes: 60,
      driverStats: {},
      collectiveFuel: {
        petrolLitres: 0,
        dieselLitres: 0,
        hybridLitres: 0,
        electricKwh: 0,
      },
      hazardSummary: {
        total: 0,
        byType: {},
      },
      generatedAt: 1000,
    };

    await assertFails(driverDb('driver_1').ref('runs/run_1/summary').set(summary));
    await assertSucceeds(adminDb().ref('runs/run_1/summary').set(summary));
  });

  it('allows only admins to write startedAt and endedAt timestamps', async () => {
    await seed({
      runs: {
        run_1: {
          name: 'Sunrise Run',
          joinCode: '123456',
          adminId: 'admin_1',
          status: 'draft',
          createdAt: 1,
          startedAt: null,
          endedAt: null,
          maxDrivers: 15,
          drivers: {
            driver_1: {
              profile: {
                name: 'Jamie',
                carMake: 'BMW',
                carModel: 'M3',
                fuelType: 'petrol',
              },
              joinedAt: 1,
              leftAt: null,
            },
          },
        },
      },
    });

    await assertFails(driverDb('driver_1').ref('runs/run_1/startedAt').set(100));
    await assertSucceeds(adminDb().ref('runs/run_1/startedAt').set(100));
    await assertFails(driverDb('driver_1').ref('runs/run_1/endedAt').set(200));
  });

  it('allows participants to report hazards but only admins to dismiss them', async () => {
    await seed({
      runs: {
        run_1: {
          name: 'Sunrise Run',
          joinCode: '123456',
          adminId: 'admin_1',
          status: 'active',
          createdAt: 1,
          startedAt: 2,
          endedAt: null,
          maxDrivers: 15,
          drivers: {
            driver_1: {
              profile: {
                name: 'Jamie',
                carMake: 'BMW',
                carModel: 'M3',
                fuelType: 'petrol',
              },
              joinedAt: 1,
              leftAt: null,
            },
            driver_2: {
              profile: {
                name: 'Ava',
                carMake: 'Toyota',
                carModel: 'GR86',
                fuelType: 'petrol',
              },
              joinedAt: 1,
              leftAt: null,
            },
          },
          hazards: {
            hazard_1: {
              type: 'pothole',
              reportedBy: 'driver_1',
              reporterName: 'Jamie',
              lat: -26.2041,
              lng: 28.0473,
              timestamp: 1000,
              dismissed: false,
              reportCount: 1,
            },
          },
        },
      },
    });

    await assertSucceeds(
      driverDb('driver_2').ref('runs/run_1/hazards/hazard_2').set({
        type: 'police',
        reportedBy: 'driver_2',
        reporterName: 'Ava',
        lat: -26.2041,
        lng: 28.0473,
        timestamp: 2000,
        dismissed: false,
        reportCount: 1,
      })
    );

    await assertFails(
      driverDb('driver_2').ref('runs/run_1/hazards/hazard_1').set({
        type: 'pothole',
        reportedBy: 'driver_1',
        reporterName: 'Jamie',
        lat: -26.2041,
        lng: 28.0473,
        timestamp: 1000,
        dismissed: true,
        reportCount: 1,
      })
    );

    await assertSucceeds(
      adminDb().ref('runs/run_1/hazards/hazard_1').set({
        type: 'pothole',
        reportedBy: 'driver_1',
        reporterName: 'Jamie',
        lat: -26.2041,
        lng: 28.0473,
        timestamp: 1000,
        dismissed: true,
        reportCount: 1,
      })
    );
  });

  it('allows admins to remove other drivers from the roster', async () => {
    await seed({
      runs: {
        run_1: {
          name: 'Sunrise Run',
          joinCode: '123456',
          adminId: 'admin_1',
          status: 'active',
          createdAt: 1,
          startedAt: 2,
          endedAt: null,
          maxDrivers: 15,
          drivers: {
            driver_1: {
              profile: {
                name: 'Jamie',
                carMake: 'BMW',
                carModel: 'M3',
                fuelType: 'petrol',
              },
              joinedAt: 1,
              leftAt: null,
            },
            driver_2: {
              profile: {
                name: 'Ava',
                carMake: 'Toyota',
                carModel: 'GR86',
                fuelType: 'petrol',
              },
              joinedAt: 1,
              leftAt: null,
            },
          },
        },
      },
    });

    await assertSucceeds(adminDb().ref('runs/run_1/drivers/driver_2').remove());
    await assertFails(driverDb('driver_1').ref('runs/run_1/drivers/driver_2').remove());
  });

  it('blocks unauthenticated access to join codes and run data', async () => {
    await seed({
      joinCodes: {
        '123456': {
          runId: 'run_1',
          createdAt: 1,
        },
      },
      runs: {
        run_1: {
          name: 'Sunrise Run',
          joinCode: '123456',
          adminId: 'admin_1',
          status: 'draft',
          createdAt: 1,
          startedAt: null,
          endedAt: null,
          maxDrivers: 15,
        },
      },
    });

    await assertFails(guestDb().ref('joinCodes/123456').get());
    await assertFails(guestDb().ref('runs/run_1').get());
  });
});
