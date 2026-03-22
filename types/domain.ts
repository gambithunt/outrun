export type RunStatus = 'draft' | 'ready' | 'active' | 'ended';

export type FuelType = 'petrol' | 'diesel' | 'electric' | 'hybrid';

export type RunVisibility = 'private' | 'club' | 'public';

export type HazardType =
  | 'pothole'
  | 'roadworks'
  | 'police'
  | 'debris'
  | 'animal'
  | 'broken_down_car';

export type DriverProfile = {
  name: string;
  carMake: string;
  carModel: string;
  engineSize?: string;
  engineUnit?: 'cc' | 'litres';
  fuelType: FuelType;
  fuelEfficiency?: number;
  fuelUnit?: 'mpg' | 'mi_per_kwh';
};

export type DriverLocation = {
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  accuracy: number;
  timestamp: number;
};

export type DriverStats = {
  topSpeed?: number;              // m/s — raw GPS peak speed
  avgMovingSpeedMs?: number;      // m/s — mean speed only while moving (≥ 0.5 m/s)
  totalDistanceKm?: number;       // km  — haversine sum of consecutive GPS points
  totalDriveTimeMinutes?: number; // min — first to last recorded GPS point
  stopCount?: number;             // number of stops lasting ≥ 15 seconds
  avgStopTimeSec?: number;        // average stop duration in seconds
};

export type SummaryDriverStat = {
  name: string;
  carMake: string;
  carModel: string;
  topSpeedKmh: number | null;
  avgMovingSpeedKmh: number | null;
  totalDistanceKm: number | null;
  totalDriveTimeMinutes: number | null;
  stopCount: number | null;
  avgStopTimeSec: number | null;
  fuelUsedLitres?: number;
  fuelUsedKwh?: number;
  fuelType: FuelType;
};

export type CollectiveFuelSummary = {
  petrolLitres: number;
  dieselLitres: number;
  hybridLitres: number;
  electricKwh: number;
};

export type HazardSummary = {
  total: number;
  byType: Partial<Record<HazardType, number>>;
};

export type SummaryRoutePreview = {
  points: [number, number][];
  speedBuckets: number[];
};

export type UserStats = {
  totalRuns: number;
  totalDistanceKm: number;
  hazardsReported: number;
  mostUsedCarId?: string | null;
};

export type UserProfile = {
  displayName: string;
  homeClub?: string;
  createdAt: number;
  updatedAt: number;
  stats: UserStats;
};

export type GarageCar = {
  id: string;
  nickname: string;
  make: string;
  model: string;
  fuelType: FuelType;
  createdAt: number;
  updatedAt: number;
};

export type RecentCrewContact = {
  userId: string;
  displayName: string;
  homeClub?: string;
  lastRunName?: string;
  lastSeenAt: number;
};

export type ScheduledRunMeta = {
  scheduledFor: number;
  visibility: RunVisibility;
  createdBy: string;
};

export type RunInvite = {
  runId: string;
  invitedBy: string;
  invitedAt: number;
  status: 'pending' | 'accepted';
};

export type RunInviteSummary = {
  totalInvites: number;
  acceptedInvites: number;
  lastUpdatedAt: number;
};

export type DriverRecord = {
  profile: DriverProfile;
  location?: DriverLocation;
  joinedAt: number;
  leftAt: number | null;
  stats?: DriverStats;
};

export type RouteData = {
  points: [number, number][];
  distanceMetres: number;
  durationSeconds?: number;
  source: 'drawn' | 'gpx';
  stops?: RouteStopDraft[];
};

export type RouteStopKind = 'start' | 'waypoint' | 'destination';

export type RouteStopInputMethod = 'search' | 'coordinates' | 'pin' | 'current_location';

export type RouteStopDraft = {
  id: string;
  kind: RouteStopKind;
  label: string;
  lat: number | null;
  lng: number | null;
  source: RouteStopInputMethod;
  placeId?: string;
};

export type Hazard = {
  type: HazardType;
  reportedBy: string;
  reporterName: string;
  lat: number;
  lng: number;
  timestamp: number;
  dismissed: boolean;
  reportCount: number;
};

export type RunSummary = {
  totalDistanceKm: number;
  totalDriveTimeMinutes: number;
  driverStats: Record<string, SummaryDriverStat>;
  collectiveFuel: CollectiveFuelSummary;
  hazardSummary: HazardSummary;
  routePreview?: SummaryRoutePreview;
  generatedAt: number;
};

export type Run = {
  name: string;
  description?: string;
  joinCode: string;
  adminId: string;
  status: RunStatus;
  createdAt: number;
  startedAt: number | null;
  driveStartedAt?: number | null;
  endedAt: number | null;
  maxDrivers: number;
  scheduledFor?: number;
  createdBy?: string;
  visibility?: RunVisibility;
  inviteSummary?: RunInviteSummary;
  route?: RouteData;
  drivers?: Record<string, DriverRecord>;
  hazards?: Record<string, Hazard>;
  summary?: RunSummary;
};
