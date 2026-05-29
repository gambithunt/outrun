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

  function activeRunSeed(overrides = {}) {
    return {
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
          ...overrides,
        },
      },
    };
  }

  function validHazard(overrides = {}) {
    return {
      type: 'police',
      reportedBy: 'driver_1',
      reporterName: 'Jamie',
      lat: -26.2041,
      lng: 28.0473,
      timestamp: 2000,
      dismissed: false,
      reportCount: 1,
      ...overrides,
    };
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

  it('allows a signed-in user to write their own persistent profile and garage car', async () => {
    await assertSucceeds(
      driverDb('driver_1').ref('users/driver_1').set({
        displayName: 'Jamie',
        homeClub: 'Night Shift',
        createdAt: 1,
        updatedAt: 1,
        stats: {
          totalRuns: 0,
          totalDistanceKm: 0,
          hazardsReported: 0,
          mostUsedCarId: null,
        },
      })
    );

    await assertSucceeds(
      driverDb('driver_1').ref('garage/driver_1/car_1').set({
        id: 'car_1',
        nickname: 'Daily',
        make: 'BMW',
        model: 'M2',
        fuelType: 'petrol',
        createdAt: 1,
        updatedAt: 1,
      })
    );

    await assertFails(
      driverDb('driver_2').ref('users/driver_1').set({
        displayName: 'Intruder',
        createdAt: 1,
        updatedAt: 1,
        stats: {
          totalRuns: 0,
          totalDistanceKm: 0,
          hazardsReported: 0,
        },
      })
    );
  });

  it('allows an organiser to write their scheduled run index and invite another user', async () => {
    await seed({
      runs: {
        run_future: {
          name: 'Night Cruise',
          joinCode: '444444',
          adminId: 'admin_1',
          status: 'draft',
          createdAt: 1,
          startedAt: null,
          endedAt: null,
          maxDrivers: 12,
        },
      },
    });

    await assertSucceeds(
      adminDb().ref('userRuns/admin_1/run_future').set({
        scheduledFor: 1000,
        name: 'Night Cruise',
      })
    );

    await assertSucceeds(
      adminDb().ref('runInvites/driver_2/run_future').set({
        runId: 'run_future',
        invitedBy: 'admin_1',
        invitedAt: 1000,
        status: 'pending',
      })
    );

    await assertFails(
      driverDb('driver_3').ref('runInvites/driver_2/run_future').set({
        runId: 'run_future',
        invitedBy: 'driver_3',
        invitedAt: 1000,
        status: 'pending',
      })
    );
  });

  it('allows an authenticated admin to create a draft run and its join code', async () => {
    await assertSucceeds(
      adminDb().ref('runs/run_1').set({
        name: 'Sunrise Run',
        description: 'Scenic club morning drive',
        joinCode: '123456',
        adminId: 'admin_1',
        status: 'draft',
        createdAt: 1,
        startedAt: null,
        endedAt: null,
        maxDrivers: 12,
      })
    );

    await assertSucceeds(
      adminDb().ref('joinCodes/123456').set({
        runId: 'run_1',
        createdAt: 1,
      })
    );
  });

  it('allows drivers to write only their own location and stats nodes', async () => {
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

    await assertSucceeds(
      driverDb('driver_1').ref('runs/run_1/drivers/driver_1/stats').set({
        topSpeed: 31.2,
        avgMovingSpeedMs: 14.2,
        totalDistanceKm: 54,
        totalDriveTimeMinutes: 68,
        movingTimeMinutes: 62,
        stoppedTimeMinutes: 6,
        stopCount: 2,
        avgStopTimeSec: 180,
        maxGForce: 0.42,
      })
    );

    await assertFails(
      driverDb('driver_2').ref('runs/run_1/drivers/driver_1/stats').set({
        topSpeed: 31.2,
        maxGForce: 0.42,
      })
    );

    await assertFails(
      driverDb('driver_1').ref('runs/run_1/drivers/driver_1/stats').set({
        topSpeed: 'fast',
        maxGForce: 0.42,
      })
    );
  });

  it('rejects partial driver records without profile snapshots', async () => {
    await seed(activeRunSeed());

    await assertFails(
      adminDb().ref('runs/run_1/drivers/admin_1').set({
        presence: 'online',
      })
    );

    await assertFails(
      driverDb('driver_3').ref('runs/run_1/drivers/driver_3/location').set({
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

  it('allows an authenticated pre-join driver to read a draft run for the join transaction', async () => {
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

    await assertSucceeds(driverDb('driver_1').ref('runs/run_1').get());
  });

  it('allows a pre-join driver transaction to add their driver record to an active run with a route', async () => {
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
          maxDrivers: 3,
          route: {
            points: [
              [-26.2041, 28.0473],
              [-25.7479, 28.2293],
            ],
            distanceMetres: 12000,
            source: 'drawn',
          },
        },
      },
    });

    await assertSucceeds(
      driverDb('driver_1').ref('runs/run_1').transaction((currentRun) => {
        if (!currentRun || typeof currentRun !== 'object') {
          return currentRun;
        }

        const drivers = currentRun.drivers || {};
        return {
          ...currentRun,
          drivers: {
            ...drivers,
            driver_1: {
              profile: {
                name: 'Jamie',
                carMake: 'BMW',
                carModel: 'M2',
                fuelType: 'petrol',
              },
              joinedAt: 10,
              leftAt: null,
              stats: {},
            },
          },
        };
      })
    );
  });

  it('rejects pre-join transactions that preserve malformed driver records', async () => {
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
          maxDrivers: 3,
          route: {
            points: [
              [-26.2041, 28.0473],
              [-25.7479, 28.2293],
            ],
            distanceMetres: 12000,
            source: 'drawn',
          },
          drivers: {
            admin_1: {
              location: {
                lat: -26.2041,
                lng: 28.0473,
                heading: 0,
                speed: 0,
                accuracy: 5,
                timestamp: 1000,
              },
            },
          },
        },
      },
    });

    await assertFails(
      driverDb('driver_1').ref('runs/run_1').transaction((currentRun) => {
        if (!currentRun || typeof currentRun !== 'object') {
          return currentRun;
        }

        const drivers = currentRun.drivers || {};
        return {
          ...currentRun,
          drivers: {
            ...drivers,
            driver_1: {
              profile: {
                name: 'Jamie',
                carMake: 'BMW',
                carModel: 'M2',
                fuelType: 'petrol',
              },
              joinedAt: 10,
              leftAt: null,
              stats: {},
            },
          },
        };
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

  it('allows drivers to write only their own personal summary', async () => {
    await seed(activeRunSeed());

    const personalSummary = {
      name: 'Jamie',
      carMake: 'BMW',
      carModel: 'M3',
      fuelType: 'petrol',
      driverStatus: 'finished',
      totalDistanceKm: 54,
      totalDriveTimeMinutes: 60,
      movingTimeMinutes: 54,
      stoppedTimeMinutes: 6,
      topSpeedKmh: 110,
      avgMovingSpeedKmh: 54,
      maxGForce: 0.42,
    };

    await assertSucceeds(driverDb('driver_1').ref('runs/run_1/drivers/driver_1/summary').set(personalSummary));
    await assertFails(driverDb('driver_2').ref('runs/run_1/drivers/driver_1/summary').set(personalSummary));
    await assertSucceeds(adminDb().ref('runs/run_1/drivers/driver_1/summary').set(personalSummary));
    await assertFails(driverDb('driver_1').ref('runs/run_1/drivers/driver_1/summary').set({
      ...personalSummary,
      totalDistanceKm: 'far',
    }));
  });

  it('allows an admin to reopen route planning by moving a lobby run from ready back to draft', async () => {
    await seed({
      runs: {
        run_1: {
          name: 'Sunrise Run',
          joinCode: '123456',
          adminId: 'admin_1',
          status: 'ready',
          createdAt: 1,
          startedAt: 2,
          endedAt: null,
          maxDrivers: 15,
        },
      },
    });

    await assertFails(driverDb('driver_1').ref('runs/run_1/status').set('draft'));
    await assertSucceeds(adminDb().ref('runs/run_1/status').set('draft'));
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
    await seed(
      activeRunSeed({
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
      })
    );

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

  it('rejects malformed hazard create payloads', async () => {
    await seed(activeRunSeed());

    await assertSucceeds(driverDb('driver_1').ref('runs/run_1/hazards/valid_hazard').set(validHazard()));

    const missingType = validHazard();
    delete missingType.type;
    await assertFails(driverDb('driver_1').ref('runs/run_1/hazards/missing_type').set(missingType));

    await assertFails(
      driverDb('driver_1').ref('runs/run_1/hazards/invalid_type').set(
        validHazard({
          type: 'traffic',
        })
      )
    );

    const missingCoordinate = validHazard();
    delete missingCoordinate.lat;
    await assertFails(driverDb('driver_1').ref('runs/run_1/hazards/missing_coordinate').set(missingCoordinate));

    await assertFails(
      driverDb('driver_1').ref('runs/run_1/hazards/bad_latitude').set(
        validHazard({
          lat: 91,
        })
      )
    );

    await assertFails(
      driverDb('driver_1').ref('runs/run_1/hazards/bad_longitude').set(
        validHazard({
          lng: -181,
        })
      )
    );

    await assertFails(
      driverDb('driver_1').ref('runs/run_1/hazards/bad_report_count').set(
        validHazard({
          reportCount: 2,
        })
      )
    );

    await assertFails(
      driverDb('driver_1').ref('runs/run_1/hazards/bad_timestamp').set(
        validHazard({
          timestamp: 'now',
        })
      )
    );
  });

  it('rejects hazard writes from non-participants and inactive runs', async () => {
    await seed(activeRunSeed());

    await assertFails(
      driverDb('driver_3').ref('runs/run_1/hazards/intruder_hazard').set(
        validHazard({
          reportedBy: 'driver_3',
          reporterName: 'Intruder',
        })
      )
    );

    await seed(
      activeRunSeed({
        status: 'ready',
        hazards: null,
      })
    );

    await assertFails(driverDb('driver_1').ref('runs/run_1/hazards/inactive_hazard').set(validHazard()));
  });

  it('allows participants to increment existing active hazard report counts without changing immutable fields', async () => {
    await seed(
      activeRunSeed({
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
      })
    );

    await assertSucceeds(
      driverDb('driver_2').ref('runs/run_1/hazards/hazard_1').set({
        type: 'pothole',
        reportedBy: 'driver_1',
        reporterName: 'Jamie',
        lat: -26.2041,
        lng: 28.0473,
        timestamp: 1000,
        dismissed: false,
        reportCount: 2,
      })
    );

    await assertFails(
      driverDb('driver_2').ref('runs/run_1/hazards/hazard_1').set({
        type: 'police',
        reportedBy: 'driver_1',
        reporterName: 'Jamie',
        lat: -26.2041,
        lng: 28.0473,
        timestamp: 1000,
        dismissed: false,
        reportCount: 2,
      })
    );
  });

  it('accepts only v1 native hazard types', async () => {
    await seed(activeRunSeed());

    for (const type of ['pothole', 'roadworks', 'police', 'mobile_camera', 'debris', 'broken_down_car']) {
      await assertSucceeds(
        driverDb('driver_1').ref(`runs/run_1/hazards/${type}`).set(
          validHazard({
            type,
          })
        )
      );
    }

    await assertFails(
      driverDb('driver_1').ref('runs/run_1/hazards/animal').set(
        validHazard({
          type: 'animal',
        })
      )
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
