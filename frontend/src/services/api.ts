import {
  demoDriftPredictions,
  demoInvestigationScenario,
  demoMaritimeRoutes,
  demoMonitoringStations,
  demoPlatformStats,
  demoSpills,
  demoTrackedShips,
  demoVessels,
} from "@/data/demoData";
import type {
  Coordinates,
  DriftPrediction,
  GlobeSceneData,
  InvestigationScenario,
  PlatformStat,
  SpillDetection,
  SpillSeverity,
  SpillStatus,
  TrackedShip,
  Vessel,
  VesselCandidate,
  VesselType,
} from "@/types";

const RAW_API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? "https://oiltrace-ai-backend-wpvr.onrender.com"
    : "");
export const BASE_URL = RAW_API_BASE.replace(/\/+$/, "");

export function getApiUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_URL}${cleanPath}`;
}

async function fetchJson<T>(endpoint: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

function normalizeVesselType(rawType?: string): VesselType {
  const value = rawType?.toLowerCase() || "";
  if (value.includes("tanker") || value.includes("crude") || value.includes("oil")) return "tanker";
  if (value.includes("container")) return "container";
  if (value.includes("cargo") || value.includes("bulk") || value.includes("carrier")) return "cargo";
  if (value.includes("research") || value.includes("survey")) return "research";
  if (value.includes("fish")) return "fishing";
  if (value.includes("tug")) return "tug";
  return "other";
}

function toSpillDetection(spill: any): SpillDetection {
  const centroid = typeof spill.centroid_geojson === "string"
    ? JSON.parse(spill.centroid_geojson)
    : spill.centroid_geojson;
  return {
    id: spill.id,
    name: spill.incident_name || spill.id,
    region: spill.region_name || "Arabian Sea",
    center: {
      lat: centroid?.coordinates?.[1] ?? 15.42,
      lon: centroid?.coordinates?.[0] ?? 72.68,
    },
    areaKm2: Number(spill.area_km2 || 0),
    confidence: Number(spill.detection_confidence ?? 0.85),
    severity: (spill.severity?.toLowerCase() || "high") as SpillSeverity,
    status: (spill.status === "active" ? "detected" : spill.status || "detected") as SpillStatus,
    detectedAt: spill.detection_time || spill.satellite_acquisition_time || spill.created_at || new Date().toISOString(),
    satellite: spill.satellite_image_id || "Sentinel-1A",
  };
}

export async function fetchSpills(): Promise<any[]> {
  return await fetchJson<any[]>("/api/spills/") || [];
}

export async function fetchSpill(id: string): Promise<any | null> {
  return fetchJson<any>(`/api/spills/${encodeURIComponent(id)}`);
}

export async function fetchSpillImage(id: string, _mode = "composite"): Promise<any | null> {
  return fetchJson<any>(`/api/spills/${encodeURIComponent(id)}/image`);
}

export async function fetchScenes(): Promise<any[]> {
  return await fetchJson<any[]>("/api/scenes") || [];
}

export async function fetchAllTracks(spillId?: string): Promise<any[]> {
  return await fetchJson<any[]>(`/api/vessels/tracks${spillId ? `?spill_id=${encodeURIComponent(spillId)}` : ""}`) || [];
}

export async function fetchEnvironment(spillId: string): Promise<any | null> {
  return fetchJson<any>(`/api/spills/${encodeURIComponent(spillId)}/environment`);
}

function environmentEndpoint(field: "current" | "wind", spillIdOrMode: string): string {
  if (spillIdOrMode === "real" || spillIdOrMode === "simulation") {
    return `/api/environment/${field === "wind" ? "wind" : "current"}?mode=${spillIdOrMode}`;
  }
  return `/api/spills/${encodeURIComponent(spillIdOrMode)}/environment/${field === "current" ? "currents" : "wind"}`;
}

export async function fetchCurrentEnvironment(spillIdOrMode = "simulation"): Promise<any | null> {
  const endpoint = spillIdOrMode === "real" || spillIdOrMode === "simulation"
    ? `/api/environment/current?mode=${spillIdOrMode}`
    : `/api/spills/${encodeURIComponent(spillIdOrMode)}/environment/current`;
  return fetchJson<any>(endpoint);
}

export async function fetchCurrents(spillIdOrMode = "simulation"): Promise<any | null> {
  return fetchJson<any>(environmentEndpoint("current", spillIdOrMode));
}

export async function fetchWind(spillIdOrMode = "simulation"): Promise<any | null> {
  return fetchJson<any>(environmentEndpoint("wind", spillIdOrMode));
}

export async function fetchAttribution(spillId: string): Promise<any | null> {
  return fetchJson<any>(`/api/attribution/${encodeURIComponent(spillId)}`);
}

export async function fetchLiveVessels(
  spillId?: string,
  lat?: number,
  lon?: number,
  radiusDeg = 1.5,
): Promise<any | null> {
  const params = new URLSearchParams();
  if (spillId) params.set('spill_id', spillId);
  if (lat !== undefined) params.set('lat', String(lat));
  if (lon !== undefined) params.set('lon', String(lon));
  params.set('radius_deg', String(radiusDeg));
  return fetchJson<any>(`/api/ais/live?${params.toString()}`);
}

export async function runHindcast(spillId: string, modeOrHours: string | number = "simulation"): Promise<any | null> {
  const mode = typeof modeOrHours === "string" ? modeOrHours : undefined;
  const suffix = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  return fetchJson<any>(`/api/spills/${encodeURIComponent(spillId)}/hindcast${suffix}`, { method: "POST" });
}

export async function runForecast(spillId: string, modeOrHours: string | number = "simulation"): Promise<any | null> {
  const mode = typeof modeOrHours === "string" ? modeOrHours : undefined;
  const suffix = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  return fetchJson<any>(`/api/spills/${encodeURIComponent(spillId)}/forecast${suffix}`, { method: "POST" });
}

export async function runAttribution(spillId: string, dataMode = "simulation"): Promise<any | null> {
  return fetchJson<any>('/api/attribution/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spill_id: spillId, data_mode: dataMode }),
  });
}

export async function generateReport(spillId: string): Promise<any | null> {
  return fetchJson<any>(`/api/reports/${encodeURIComponent(spillId)}/generate`, { method: 'POST' });
}

export async function fetchReport(spillId: string): Promise<any | null> {
  return fetchJson<any>(`/api/reports/${encodeURIComponent(spillId)}`);
}

export function getReportHtmlUrl(spillId: string): string {
  return `${BASE_URL}/api/reports/${encodeURIComponent(spillId)}/html`;
}

export async function fetchHindcast(spillId: string): Promise<any | null> {
  return fetchJson<any>(`/api/spills/${encodeURIComponent(spillId)}/hindcast`);
}

export async function fetchForecast(spillId: string): Promise<any | null> {
  return fetchJson<any>(`/api/spills/${encodeURIComponent(spillId)}/forecast`);
}

export async function fetchDashboardStats(): Promise<any | null> {
  return fetchJson<any>('/api/dashboard/stats');
}

export async function fetchAnalysisRuns(): Promise<any[]> {
  return await fetchJson<any[]>('/api/analysis/') || [];
}

export async function fetchAnalysisRunAudit(runId: string): Promise<any[]> {
  return await fetchJson<any[]>(`/api/analysis/${encodeURIComponent(runId)}/audit`) || [];
}

export async function triggerAnalysisPipeline(payloadOrSpillId: any, dataMode = 'simulation'): Promise<any | null> {
  const payload = typeof payloadOrSpillId === 'string'
    ? { spill_id: payloadOrSpillId, data_mode: dataMode }
    : payloadOrSpillId;
  return fetchJson<any>('/api/analysis/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function setSpillsMode(mode: string): Promise<any | null> {
  return fetchJson<any>('/api/spills/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data_mode: mode }),
  });
}

export async function fetchAlerts(status?: string): Promise<any[]> {
  return await fetchJson<any[]>(`/api/alerts${status ? `?status=${encodeURIComponent(status)}` : ""}`) || [];
}

export async function acknowledgeAlert(alertId: string, operator = 'operator'): Promise<any | null> {
  return fetchJson<any>(`/api/alerts/${encodeURIComponent(alertId)}/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acknowledged_by: operator }),
  });
}

export async function runSceneDetection(sceneId: string, threshold: number): Promise<any | null> {
  return fetchJson<any>('/api/scenes/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene_id: sceneId, threshold }),
  });
}

export function getSceneImageUrl(sceneId?: string, mode = 'composite'): string {
  const id = sceneId || 'S1A_IW_GRDH_1SDV_20240315T060000_demo';
  return `${BASE_URL}/api/scenes/${encodeURIComponent(id)}/image?mode=${encodeURIComponent(mode)}`;
}

export const api = {
  async getSpills(): Promise<SpillDetection[]> {
    const data = await fetchSpills();
    return data.length ? data.map(toSpillDetection) : demoSpills;
  },

  async getSpill(id: string): Promise<SpillDetection | null> {
    const data = await fetchSpill(id);
    return data ? toSpillDetection(data) : demoSpills.find((spill) => spill.id === id) ?? null;
  },

  async getVessels(): Promise<Vessel[]> {
    const data = await fetchJson<any[]>('/api/vessels/');
    if (!data?.length) return demoVessels;
    return data.map((vessel) => ({
      mmsi: String(vessel.mmsi),
      name: vessel.vessel_name || `MMSI ${vessel.mmsi}`,
      type: normalizeVesselType(vessel.vessel_type),
      flag: vessel.flag || 'UN',
      position: { lat: vessel.last_latitude ?? 15.4, lon: vessel.last_longitude ?? 72.5 },
      headingDeg: vessel.last_heading ?? 0,
      speedKn: vessel.last_sog_knots ?? 12,
      lastReportAt: vessel.last_timestamp || vessel.created_at || new Date().toISOString(),
      correlationScore: 0.5,
    }));
  },

  async getDriftPrediction(spillId: string): Promise<DriftPrediction | null> {
    return demoDriftPredictions.find((entry) => entry.spillId === spillId) ?? null;
  },

  async getPlatformStats(): Promise<PlatformStat[]> {
    const stats = await fetchDashboardStats();
    if (!stats) return demoPlatformStats;
    return [
      { id: 'active-slicks', label: 'Active Slicks', value: String(stats.active_incidents ?? 1), caption: 'Satellite verified' },
      { id: 'vessels-tracked', label: 'AIS Vessels Tracked', value: String(stats.analyzed_vessels ?? 7), caption: 'Arabian Sea fairway' },
      { id: 'sar-scenes', label: 'SAR Scenes Ingested', value: String(stats.analyzed_scenes ?? 12), caption: 'Sentinel-1 & EO-04' },
      { id: 'high-priority', label: 'Attribution Ready', value: String(stats.high_priority_cases ?? 1), caption: 'Multi-factor forensic leads' },
    ];
  },

  async getGlobeScene(): Promise<GlobeSceneData> {
    const [spills, vessels] = await Promise.all([this.getSpills(), this.getVessels()]);
    const activeSpill = spills[0] || demoSpills[0];
    const ships: TrackedShip[] = vessels === demoVessels || !vessels.length
      ? demoTrackedShips
      : vessels.map((vessel, index) => ({
          id: vessel.mmsi,
          name: vessel.name,
          type: vessel.type,
          latitude: vessel.position.lat,
          longitude: vessel.position.lon,
          route: demoMaritimeRoutes[index % demoMaritimeRoutes.length]?.id || 'RT-ARABIAN-SEA',
          speed: 0.012 + (index % 5) * 0.002,
          speedKn: vessel.speedKn || 14,
        }));
    return {
      ships,
      routes: demoMaritimeRoutes,
      stations: demoMonitoringStations,
      target: {
        id: activeSpill.id,
        label: `${activeSpill.name} (${activeSpill.region})`,
        position: activeSpill.center as Coordinates,
        confidence: activeSpill.confidence,
      },
    };
  },

  async getInvestigationScenario(): Promise<InvestigationScenario> {
    const spills = await this.getSpills();
    const activeSpill = spills[0] || demoSpills[0];
    const attribution = await fetchAttribution(activeSpill.id);
    const candidates: VesselCandidate[] = Array.isArray(attribution?.candidates)
      ? attribution.candidates.map((candidate: any) => ({
          id: `VSL-${candidate.mmsi}`,
          name: candidate.vessel_name || `MMSI ${candidate.mmsi}`,
          mmsi: String(candidate.mmsi),
          type: normalizeVesselType(candidate.vessel_type),
          flag: candidate.flag || 'IN',
          position: {
            lat: candidate.latitude ?? activeSpill.center.lat,
            lon: candidate.longitude ?? activeSpill.center.lon,
          },
          headingDeg: Math.round(candidate.heading_deg ?? 180),
          speedKn: Number(candidate.sog_knots ?? 12.5),
          correlationScore: Number(candidate.final_score ?? candidate.evidence_score ?? 0.75),
        }))
      : demoInvestigationScenario.vessels;
    return {
      id: activeSpill.id,
      name: activeSpill.name,
      satellite: activeSpill.satellite,
      spill: {
        areaKm2: activeSpill.areaKm2,
        confidence: activeSpill.confidence,
        estimatedAgeHours: [6, 18],
        location: activeSpill.center,
      },
      vessels: candidates,
    };
  },
};

export type Api = typeof api;
export default api;
