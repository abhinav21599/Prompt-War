/**
 * Unified Domain contracts for OilTrace AI.
 * Combines 3D Globe interactive views, tactical scenarios, and full operational analytics.
 */

export type DataMode = 'simulation' | 'real';
export type Provenance = 'observed' | 'reconstructed' | 'predicted' | 'synthetic' | 'operational';
export type SpillStatus = 'processing' | 'detected' | 'no_detection' | 'error' | 'attributing' | 'attributed' | 'archived';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type SpillSeverity = 'low' | 'moderate' | 'medium' | 'high' | 'critical';
export type ServiceStatus = 'online' | 'degraded' | 'unavailable';
export type RunType = 'hindcast' | 'forecast';

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export type VesselType = 'tanker' | 'cargo' | 'container' | 'research' | 'fishing' | 'tug' | 'other' | string;

export interface SpillDetection {
  id: string;
  name: string;
  region: string;
  center: Coordinates;
  areaKm2: number;
  confidence: number;
  severity: SpillSeverity;
  status: SpillStatus;
  detectedAt: string;
  satellite: string;
}

export interface Vessel {
  mmsi: string;
  imo?: string;
  name: string;
  vessel_name?: string;
  type: VesselType;
  vessel_type?: string;
  call_sign?: string;
  flag: string;
  length_m?: number;
  beam_m?: number;
  draught_m?: number;
  gross_tonnage?: number;
  position: Coordinates;
  headingDeg: number;
  speedKn: number;
  lastReportAt: string;
  correlationScore: number;
  data_mode?: DataMode;
  provenance?: Provenance;
}

export interface DriftPoint {
  hourOffset: number;
  position: Coordinates;
  uncertaintyKm: number;
}

export interface DriftPrediction {
  spillId: string;
  horizonHours: number;
  generatedAt: string;
  model: string;
  path: DriftPoint[];
}

export interface PlatformStat {
  id: string;
  label: string;
  value: string;
  caption?: string;
  delta?: string;
}

export interface MaritimeRoute {
  id: string;
  name: string;
  waypoints: Coordinates[];
}

export interface TrackedShip {
  id: string;
  name: string;
  type: VesselType;
  latitude: number;
  longitude: number;
  route: string;
  speed: number;
  speedKn: number;
}

export interface MonitoringStation {
  id: string;
  position: Coordinates;
}

export interface GlobeTarget {
  id: string;
  label: string;
  position: Coordinates;
  confidence: number;
}

export type GlobeScanState = 'idle' | 'focusing';

export interface GlobeSceneData {
  ships: TrackedShip[];
  routes: MaritimeRoute[];
  stations: MonitoringStation[];
  target: GlobeTarget;
}

export interface VesselCandidate {
  id: string;
  name: string;
  mmsi: string;
  type: VesselType;
  flag: string;
  position: Coordinates;
  headingDeg: number;
  speedKn: number;
  correlationScore: number;
}

export interface SpillAnalysis {
  areaKm2: number;
  confidence: number;
  estimatedAgeHours: [number, number];
  location: Coordinates;
}

export interface InvestigationScenario {
  id: string;
  name: string;
  satellite: string;
  spill: SpillAnalysis;
  vessels: VesselCandidate[];
}

export interface AISObservation {
  id?: string;
  mmsi: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  sog_knots?: number;
  cog_deg?: number;
  heading_deg?: number;
  nav_status?: string;
  data_mode?: DataMode;
  provenance?: Provenance;
}

export interface VesselTrack {
  id?: string;
  mmsi: string;
  spill_id?: string;
  track_geojson?: GeoJSONLineString;
  start_time?: string;
  end_time?: string;
  point_count?: number;
  vessel_name?: string;
  vessel_type?: string;
  data_mode?: DataMode;
  provenance?: Provenance;
  observations?: AISObservation[];
  [key: string]: any;
}

export interface EvidenceFactor {
  factor: string;
  label: string;
  raw_value: number;
  raw_unit: string;
  normalized: number;
  weight: number;
  contribution: number;
}

export interface Attribution {
  id?: string;
  mmsi: string;
  spill_id?: string;
  rank: number;
  vessel_name?: string;
  vessel_type?: string;
  imo?: string;
  flag?: string;
  length_m?: number;
  gross_tonnage?: number;
  distance_km?: number;
  time_delta_h?: number;
  track_overlap_score?: number;
  heading_compat_score?: number;
  ais_continuity_score?: number;
  evidence_score?: number;
  data_confidence?: number;
  final_score: number;
  factors?: EvidenceFactor[];
  behaviour_observations?: string[];
  ais_gap_detected?: boolean;
  ais_gap_duration_min?: number;
  slowdown_observed?: boolean;
  course_change_observed?: boolean;
  ais_coverage_pct?: number;
  data_mode?: DataMode;
  provenance?: Provenance;
  [key: string]: any;
}

export interface OilSpill {
  id: string;
  satellite_image_id?: string;
  incident_name?: string;
  status?: SpillStatus;
  detected_class?: string;
  detection_confidence?: number;
  spill_polygon_geojson?: GeoJSONPolygon;
  centroid_geojson?: GeoJSONPoint;
  bounding_box_geojson?: GeoJSONPolygon;
  area_km2?: number;
  perimeter_km?: number;
  length_km?: number;
  width_km?: number;
  orientation_deg?: number;
  compactness?: number;
  detection_time?: string;
  satellite_acquisition_time?: string;
  data_mode?: DataMode;
  provenance?: Provenance;
  model_version?: string;
  preprocessing_version?: string;
  model_threshold?: number;
  region_name?: string;
  severity?: Severity;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface HindcastResult {
  [key: string]: any;
}

export interface ForecastResult {
  [key: string]: any;
}

export interface SatelliteImage {
  id: string;
  filename: string;
  file_size_bytes: number;
  format: string;
  crs: string;
  resolution_m: number;
  acquisition_time: string;
  region_name: string;
  bounds_geojson: GeoJSONPolygon;
  channels: number;
  width_px: number;
  height_px: number;
  satellite_name: string;
  data_mode: DataMode;
  provenance: Provenance;
  source: string;
  metadata_json?: Record<string, unknown>;
}
