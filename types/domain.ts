export type RunStatus = 'draft' | 'ready' | 'active' | 'ended';

export type FuelType = 'petrol' | 'diesel' | 'electric' | 'hybrid';

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
  topSpeed?: number;
};

export type SummaryDriverStat = {
  name: string;
  carMake: string;
  carModel: string;
  topSpeedKmh: number | null;
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
  route?: RouteData;
  drivers?: Record<string, DriverRecord>;
  hazards?: Record<string, Hazard>;
  summary?: RunSummary;
};
