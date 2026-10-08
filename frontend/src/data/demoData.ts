/**
 * Temporary simulation data for OilTrace AI.
 *
 * IMPORTANT: this module must only ever be imported by `src/services/api.ts`.
 * UI components read data through the service layer so that these fixtures can
 * be deleted once the real backend is wired up.
 */

import type {
  DriftPrediction,
  GlobeTarget,
  InvestigationScenario,
  MaritimeRoute,
  MonitoringStation,
  PlatformStat,
  SpillDetection,
  TrackedShip,
  Vessel,
} from "@/types";

export const demoSpills: SpillDetection[] = [
  {
    id: "SPL-2411-018",
    name: "Gulf of Suez Slick",
    region: "Gulf of Suez",
    center: { lat: 28.412, lon: 33.187 },
    areaKm2: 42.6,
    confidence: 0.94,
    severity: "critical",
    status: "attributing",
    detectedAt: "2026-09-19T04:12:00Z",
    satellite: "Sentinel-1A",
  },
  {
    id: "SPL-2411-014",
    name: "Malacca Strait Sheen",
    region: "Strait of Malacca",
    center: { lat: 2.874, lon: 101.316 },
    areaKm2: 11.3,
    confidence: 0.81,
    severity: "moderate",
    status: "detected",
    detectedAt: "2026-09-18T21:47:00Z",
    satellite: "Sentinel-1B",
  },
  {
    id: "SPL-2411-009",
    name: "North Sea Discharge",
    region: "North Sea",
    center: { lat: 56.921, lon: 3.408 },
    areaKm2: 7.9,
    confidence: 0.88,
    severity: "high",
    status: "attributed",
    detectedAt: "2026-09-17T09:05:00Z",
    satellite: "RADARSAT-2",
  },
];

export const demoVessels: Vessel[] = [
  {
    mmsi: "636019281",
    name: "ATLAS MERIDIAN",
    type: "tanker",
    flag: "LR",
    position: { lat: 28.517, lon: 33.061 },
    headingDeg: 148,
    speedKn: 11.4,
    lastReportAt: "2026-09-19T03:55:00Z",
    correlationScore: 0.91,
  },
  {
    mmsi: "477553900",
    name: "HAI FENG 07",
    type: "cargo",
    flag: "HK",
    position: { lat: 28.298, lon: 33.402 },
    headingDeg: 312,
    speedKn: 13.8,
    lastReportAt: "2026-09-19T04:02:00Z",
    correlationScore: 0.37,
  },
  {
    mmsi: "538007412",
    name: "NORD PELAGIC",
    type: "tanker",
    flag: "MH",
    position: { lat: 2.951, lon: 101.204 },
    headingDeg: 64,
    speedKn: 9.2,
    lastReportAt: "2026-09-18T21:30:00Z",
    correlationScore: 0.68,
  },
];

export const demoDriftPredictions: DriftPrediction[] = [
  {
    spillId: "SPL-2411-018",
    horizonHours: 24,
    generatedAt: "2026-09-19T05:00:00Z",
    model: "HYCOM + ERA5 ensemble",
    path: [
      { hourOffset: 0, position: { lat: 28.412, lon: 33.187 }, uncertaintyKm: 0.8 },
      { hourOffset: 6, position: { lat: 28.386, lon: 33.241 }, uncertaintyKm: 2.4 },
      { hourOffset: 12, position: { lat: 28.344, lon: 33.318 }, uncertaintyKm: 4.9 },
      { hourOffset: 18, position: { lat: 28.297, lon: 33.402 }, uncertaintyKm: 7.6 },
      { hourOffset: 24, position: { lat: 28.241, lon: 33.489 }, uncertaintyKm: 11.2 },
    ],
  },
];

export const demoPlatformStats: PlatformStat[] = [
  {
    id: "coverage",
    label: "Ocean coverage",
    value: "71%",
    caption: "Global SAR revisit",
  },
  {
    id: "detections",
    label: "Slicks detected",
    value: "1,284",
    caption: "Last 30 days",
  },
  {
    id: "attribution",
    label: "Source match",
    value: "92.4%",
    caption: "AIS correlation rate",
  },
  {
    id: "latency",
    label: "Alert latency",
    value: "< 18m",
    caption: "Pass to notification",
  },
];

/* -------------------------------------------------------------------------
 * Globe hero fixtures
 *
 * Shipping corridors below follow real-world maritime traffic lanes. Ship
 * positions and speeds are simulated; they will be replaced by live AIS
 * reports without any change to the globe components.
 * ---------------------------------------------------------------------- */

export const demoMaritimeRoutes: MaritimeRoute[] = [
  {
    id: "RT-SUEZ-GIB",
    name: "Suez — Gibraltar corridor",
    waypoints: [
      { lat: 29.9, lon: 32.55 },
      { lat: 31.6, lon: 32.3 },
      { lat: 33.4, lon: 28.0 },
      { lat: 35.4, lon: 20.5 },
      { lat: 37.2, lon: 11.5 },
      { lat: 37.0, lon: 2.0 },
      { lat: 35.95, lon: -5.6 },
      { lat: 36.2, lon: -12.0 },
    ],
  },
  {
    id: "RT-MALACCA-EA",
    name: "Malacca — East Asia lane",
    waypoints: [
      { lat: 5.5, lon: 96.5 },
      { lat: 2.9, lon: 101.3 },
      { lat: 1.3, lon: 104.0 },
      { lat: 6.5, lon: 108.5 },
      { lat: 14.0, lon: 113.5 },
      { lat: 21.5, lon: 118.0 },
      { lat: 28.5, lon: 123.5 },
      { lat: 33.5, lon: 128.0 },
    ],
  },
  {
    id: "RT-NATL",
    name: "North Atlantic crossing",
    waypoints: [
      { lat: 51.9, lon: 4.1 },
      { lat: 50.5, lon: -2.0 },
      { lat: 49.5, lon: -12.0 },
      { lat: 46.5, lon: -25.0 },
      { lat: 43.0, lon: -40.0 },
      { lat: 41.0, lon: -55.0 },
      { lat: 40.5, lon: -70.0 },
      { lat: 40.6, lon: -73.9 },
    ],
  },
  {
    id: "RT-HORMUZ-CAPE",
    name: "Hormuz — Cape of Good Hope",
    waypoints: [
      { lat: 26.5, lon: 56.4 },
      { lat: 22.5, lon: 60.0 },
      { lat: 14.0, lon: 58.0 },
      { lat: 5.0, lon: 52.0 },
      { lat: -6.0, lon: 44.0 },
      { lat: -18.0, lon: 38.0 },
      { lat: -30.0, lon: 31.5 },
      { lat: -35.5, lon: 20.0 },
    ],
  },
  {
    id: "RT-PANAMA-ASIA",
    name: "Panama — Transpacific",
    waypoints: [
      { lat: 8.9, lon: -79.5 },
      { lat: 10.5, lon: -95.0 },
      { lat: 15.0, lon: -115.0 },
      { lat: 21.0, lon: -140.0 },
      { lat: 27.0, lon: -165.0 },
      { lat: 32.0, lon: 175.0 },
      { lat: 34.5, lon: 150.0 },
      { lat: 35.4, lon: 139.8 },
    ],
  },
  {
    id: "RT-AUS-CN",
    name: "Pilbara — East China lane",
    waypoints: [
      { lat: -20.6, lon: 116.8 },
      { lat: -15.0, lon: 118.5 },
      { lat: -8.0, lon: 120.0 },
      { lat: -2.0, lon: 121.5 },
      { lat: 6.0, lon: 122.0 },
      { lat: 15.0, lon: 120.5 },
      { lat: 24.0, lon: 120.0 },
      { lat: 30.6, lon: 122.1 },
    ],
  },
];

export const demoTrackedShips: TrackedShip[] = [
  {
    id: "SHP-01",
    name: "MV Ocean Star",
    type: "tanker",
    latitude: 33.4,
    longitude: 28.0,
    route: "RT-SUEZ-GIB",
    speed: 0.016,
    speedKn: 14.2,
  },
  {
    id: "SHP-02",
    name: "MV Cape Vanguard",
    type: "container",
    latitude: 37.0,
    longitude: 2.0,
    route: "RT-SUEZ-GIB",
    speed: 0.012,
    speedKn: 18.6,
  },
  {
    id: "SHP-03",
    name: "MV Nord Pelagic",
    type: "tanker",
    latitude: 2.9,
    longitude: 101.3,
    route: "RT-MALACCA-EA",
    speed: 0.014,
    speedKn: 12.4,
  },
  {
    id: "SHP-04",
    name: "MV Hansa Aurora",
    type: "cargo",
    latitude: 43.0,
    longitude: -40.0,
    route: "RT-NATL",
    speed: 0.011,
    speedKn: 15.8,
  },
  {
    id: "SHP-05",
    name: "RV Gulf Sentinel",
    type: "research",
    latitude: 5.0,
    longitude: 52.0,
    route: "RT-HORMUZ-CAPE",
    speed: 0.013,
    speedKn: 9.6,
  },
  {
    id: "SHP-06",
    name: "MV Pacific Herald",
    type: "container",
    latitude: 21.0,
    longitude: -140.0,
    route: "RT-PANAMA-ASIA",
    speed: 0.01,
    speedKn: 20.1,
  },
  {
    id: "SHP-07",
    name: "MV Pilbara Star",
    type: "cargo",
    latitude: -8.0,
    longitude: 120.0,
    route: "RT-AUS-CN",
    speed: 0.015,
    speedKn: 13.7,
  },
];

/** Passive ocean sensor stations, drawn as small monitoring points. */
export const demoMonitoringStations: MonitoringStation[] = [
  { id: "MON-01", position: { lat: 24.5, lon: -45.0 } },
  { id: "MON-02", position: { lat: -12.0, lon: -25.0 } },
  { id: "MON-03", position: { lat: 46.0, lon: -32.0 } },
  { id: "MON-04", position: { lat: 12.0, lon: 65.0 } },
  { id: "MON-05", position: { lat: -28.0, lon: 88.0 } },
  { id: "MON-06", position: { lat: 8.0, lon: 135.0 } },
  { id: "MON-07", position: { lat: 34.0, lon: 158.0 } },
  { id: "MON-08", position: { lat: -38.0, lon: 152.0 } },
  { id: "MON-09", position: { lat: 18.0, lon: -155.0 } },
  { id: "MON-10", position: { lat: -18.0, lon: -110.0 } },
  { id: "MON-11", position: { lat: 56.0, lon: -18.0 } },
  { id: "MON-12", position: { lat: -45.0, lon: 40.0 } },
];

/** Demonstration detection the hero focuses on during the CTA transition. */
export const demoGlobeTarget: GlobeTarget = {
  id: "SPL-2411-018",
  label: "Gulf of Suez slick",
  position: { lat: 28.412, lon: 33.187 },
  confidence: 0.942,
};

/* -------------------------------------------------------------------------
 * Investigation screen fixtures
 *
 * A self-contained scenario: one detection in the Laccadive Sea plus the
 * candidate vessels attributed to it. Replaced later by the real backend
 * response for the detection opened from the globe.
 * ---------------------------------------------------------------------- */

export const demoInvestigationScenario: InvestigationScenario = {
  id: "SPL-2411-031",
  name: "Laccadive Sea Discharge",
  satellite: "Sentinel-1A",
  spill: {
    areaKm2: 18.4,
    confidence: 0.942,
    estimatedAgeHours: [6, 10],
    location: { lat: 10.32, lon: 72.41 },
  },
  vessels: [
    {
      id: "VSL-101",
      name: "MV Ocean Star",
      mmsi: "563044200",
      type: "tanker",
      flag: "SG",
      position: { lat: 10.58, lon: 72.18 },
      headingDeg: 42,
      speedKn: 11.2,
      correlationScore: 0.92,
    },
    {
      id: "VSL-102",
      name: "MV Sea Queen",
      mmsi: "538009877",
      type: "tanker",
      flag: "MH",
      position: { lat: 9.96, lon: 72.52 },
      headingDeg: 298,
      speedKn: 9.8,
      correlationScore: 0.71,
    },
    {
      id: "VSL-103",
      name: "MV Eastern Wind",
      mmsi: "477336514",
      type: "cargo",
      flag: "HK",
      position: { lat: 10.42, lon: 72.88 },
      headingDeg: 224,
      speedKn: 13.4,
      correlationScore: 0.38,
    },
  ],
};
