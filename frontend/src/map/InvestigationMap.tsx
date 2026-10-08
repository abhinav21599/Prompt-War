import { useRef, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStore } from "../state/store";
import {
  fetchCurrentEnvironment,
  fetchCurrents,
  fetchWind,
  fetchAllTracks,
  fetchAttribution,
  getApiUrl,
} from "../services/api";
import LayerControl from "../components/LayerControl";
import type {
  OilSpill,
  HindcastResult,
  ForecastResult,
  VesselTrack,
  Attribution,
} from "../types";
import {
  Vessel3DCustomLayer,
  getInterpolatedVesselState,
  resolveVesselArchetype,
  resolveVesselLength,
} from "./vessels3D";
import {
  ARABIAN_SEA_BATHYMETRY_GEOJSON,
  ARABIAN_SEA_SHIPPING_LANES_GEOJSON,
  generateGraticuleGeoJson,
} from "../data/maritimeData";
import {
  generateCurrentStreamlines,
  generateWindStrokes,
  generateForecastEnsemblePlume,
} from "./streamlines";
import type { GeoBounds } from "./streamlines";

type BasemapMode = "dark" | "satellite" | "nautical";

export function safeGeoJson(val: any): any {
  if (!val) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return val;
}

const INITIAL_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "osm-tiles": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
    "satellite-tiles": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#07111F",
      },
    },
    {
      id: "basemap-dark",
      type: "raster",
      source: "osm-tiles",
      layout: {
        visibility: "none",
      },
      paint: {
        "raster-opacity": 0.72,
        "raster-contrast": 0.35,
        "raster-saturation": -0.9,
        "raster-brightness-max": 0.55,
        "raster-brightness-min": 0.03,
      },
    },
    {
      id: "basemap-satellite",
      type: "raster",
      source: "satellite-tiles",
      layout: {
        visibility: "visible",
      },
      paint: {
        "raster-opacity": 0.95,
      },
    },
    {
      id: "basemap-nautical",
      type: "raster",
      source: "osm-tiles",
      layout: {
        visibility: "none",
      },
      paint: {
        "raster-opacity": 0.95,
        "raster-contrast": 0.1,
      },
    },
  ],
};

interface InvestigationMapProps {
  spill?: OilSpill | null;
  hindcast?: HindcastResult | null;
  forecast?: ForecastResult | null;
  tracks?: VesselTrack[];
  attributions?: Attribution[];
  selectedMmsi?: string | null;
  timelineStep?: number;
  onVesselClick?: (mmsi: string) => void;
  onSpillClick?: () => void;
  contextPreset?:
    | "sar"
    | "hindcast"
    | "forecast"
    | "attribution"
    | "digital_twin"
    | "command_center";
  children?: ReactNode;
}

export default function InvestigationMap({
  spill,
  hindcast,
  forecast,
  tracks,
  attributions,
  selectedMmsi,
  timelineStep,
  onVesselClick,
  contextPreset,
  children,
}: InvestigationMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const vessel3DLayerRef = useRef<Vessel3DCustomLayer | null>(null);

  const {
    layers,
    setLayer,
    dataMode,
    setDataMode,
    viewMode,
    setViewMode,
    timelinePosition,
    setTimelinePosition,
    timelinePlaying,
    setTimelinePlaying,
    timelineSpeed,
    setTimelineSpeed,
    incidentFocus,
    setIncidentFocus,
    scaleUnit,
    setScaleUnit,
    cleanMode,
    setCleanMode,
    miniMap,
    setMiniMap,
    activeCameraPreset,
    setActiveCameraPreset,
  } = useStore();

  const [currentsData, setCurrentsData] = useState<any>(null);
  const [windData, setWindData] = useState<any>(null);
  const [realDataUnavailable, setRealDataUnavailable] = useState(false);
  const [realDataError, setRealDataError] = useState<string | null>(null);

  const [coords, setCoords] = useState({ lat: 15.42, lon: 72.68 });
  const [zoom, setZoom] = useState(7.5);
  const [bearing, setBearing] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("satellite");
  const [inspectedVessel, setInspectedVessel] = useState<any | null>(null);
  const [routeReconstructionActive, setRouteReconstructionActive] =
    useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [vesselsMenuOpen, setVesselsMenuOpen] = useState(false);
  const [mapZoom, setMapZoom] = useState(8.5);
  const [viewportBounds, setViewportBounds] = useState<{
    west: number;
    east: number;
    south: number;
    north: number;
  } | null>(null);
  const [internalTracks, setInternalTracks] = useState<VesselTrack[]>([]);
  const [internalAttributions, setInternalAttributions] = useState<
    Attribution[]
  >([]);

  // Automatically fetch candidate vessels and tracks if not passed via props
  useEffect(() => {
    if (tracks && tracks.length > 0) return;
    const targetSpillId = spill?.id || "INC-2024-001";
    let active = true;
    Promise.all([
      fetchAllTracks(targetSpillId).catch(() => []),
      fetchAttribution(targetSpillId).catch(() => null),
    ]).then(([trks, attr]) => {
      if (!active) return;
      if (trks && Array.isArray(trks) && trks.length > 0)
        setInternalTracks(trks);
      if (
        attr?.vessels &&
        Array.isArray(attr.vessels) &&
        attr.vessels.length > 0
      )
        setInternalAttributions(attr.vessels);
    });
    return () => {
      active = false;
    };
  }, [spill?.id, tracks]);

  const effectiveTracks = tracks && tracks.length > 0 ? tracks : internalTracks;
  const effectiveAttributions =
    attributions && attributions.length > 0
      ? attributions
      : internalAttributions;

  // Keep refs for event callbacks to avoid stale closures
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const onVesselClickRef = useRef(onVesselClick);
  onVesselClickRef.current = onVesselClick;

  const activeTimeline =
    typeof timelineStep === "number" ? timelineStep : (timelinePosition ?? 0.5);

  // Fetch hydrodynamic ocean current data from backend (Copernicus Marine in real mode, deterministic in sim mode)
  useEffect(() => {
    if (!layers.currentVectors) return;
    let active = true;

    fetchCurrents(dataMode)
      .then((data) => {
        if (active) {
          setCurrentsData(data);
          setRealDataUnavailable(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.warn("Failed to fetch ocean currents for map", err);
          if (dataMode === "real") {
            setRealDataUnavailable(true);
            setRealDataError(
              err?.response?.data?.detail ||
                err?.message ||
                "Copernicus Marine current dataset is unavailable.",
            );
            setCurrentsData(null);
          }
        }
      });
    return () => {
      active = false;
    };
  }, [layers.currentVectors, dataMode]);

  // Fetch environmental wind data from backend (Copernicus CDS in real mode, deterministic in sim mode)
  useEffect(() => {
    if (!layers.windVectors) return;
    let active = true;

    fetchWind(dataMode)
      .then((data) => {
        if (active) {
          setWindData(data);
          setRealDataUnavailable(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.warn("Failed to fetch wind environment for map", err);
          if (dataMode === "real") {
            setRealDataUnavailable(true);
            setRealDataError(
              err?.response?.data?.detail ||
                err?.message ||
                "Copernicus CDS ERA5 dataset is unavailable.",
            );
            setWindData(null);
          }
        }
      });
    return () => {
      active = false;
    };
  }, [layers.windVectors, dataMode]);

  // ── Combined Investigation Extent (Single Source of Truth) ──
  const getInvestigationBounds = useCallback((): GeoBounds | null => {
    const points: [number, number][] = [];
    const poly = safeGeoJson(spill?.spill_polygon_geojson);
    const centroid = safeGeoJson(spill?.centroid_geojson);
    const originPoly = safeGeoJson(hindcast?.origin_region_geojson);

    // 1. Observed Slick Polygon & Centroid
    if (poly?.coordinates?.[0]) {
      poly.coordinates[0].forEach((pt: number[]) => {
        if (Array.isArray(pt) && pt.length >= 2) points.push([pt[0], pt[1]]);
      });
    } else if (centroid?.coordinates) {
      points.push([centroid.coordinates[0], centroid.coordinates[1]]);
    }

    // 2. Reconstructed Origin Region & Point
    if (originPoly?.coordinates?.[0]) {
      originPoly.coordinates[0].forEach((pt: number[]) => {
        if (Array.isArray(pt) && pt.length >= 2) points.push([pt[0], pt[1]]);
      });
    }
    const hLon =
      hindcast?.origin_lon ??
      safeGeoJson(hindcast?.origin_centroid_geojson)?.coordinates?.[0];
    const hLat =
      hindcast?.origin_lat ??
      safeGeoJson(hindcast?.origin_centroid_geojson)?.coordinates?.[1];
    if (typeof hLon === "number" && typeof hLat === "number") {
      points.push([hLon, hLat]);
    }

    // 3. Reconstructed Hindcast Reverse Trajectory
    if (hindcast?.particles && Array.isArray(hindcast.particles)) {
      hindcast.particles.forEach((p: any) => {
        if (p.trajectory && Array.isArray(p.trajectory)) {
          p.trajectory.forEach((t: any) => {
            if (typeof t.lon === "number" && typeof t.lat === "number") {
              points.push([t.lon, t.lat]);
            }
          });
        }
      });
    }

    // 4. Forward Forecast Dispersion Trajectories (all 100 particles across all steps)
    if (forecast?.particles && Array.isArray(forecast.particles)) {
      forecast.particles.forEach((p: any) => {
        if (p.trajectory && Array.isArray(p.trajectory)) {
          p.trajectory.forEach((t: any) => {
            if (typeof t.lon === "number" && typeof t.lat === "number") {
              points.push([t.lon, t.lat]);
            }
          });
        }
      });
    }

    // 5. Candidate Vessels and their Tracks within incident window
    if (tracks && tracks.length > 0) {
      tracks.slice(0, 3).forEach((t) => {
        const trackGeo = safeGeoJson(t.track_geojson);
        if (trackGeo?.coordinates) {
          trackGeo.coordinates.forEach((pt: number[]) => {
            if (Array.isArray(pt) && pt.length >= 2)
              points.push([pt[0], pt[1]]);
          });
        }
      });
    }

    if (points.length < 2) return null;

    let minLon = Infinity,
      minLat = Infinity,
      maxLon = -Infinity,
      maxLat = -Infinity;
    points.forEach(([lon, lat]) => {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });

    return { minLon, maxLon, minLat, maxLat };
  }, [spill, hindcast, forecast, tracks]);

  // Investigation-Aware Camera Fit: Expands bounds with 25-35% geographic margin
  const fitInvestigationCamera = useCallback(() => {
    const m = map.current;
    if (!m) return;

    const inv = getInvestigationBounds();
    if (inv) {
      const spanLon = Math.max(0.18, inv.maxLon - inv.minLon);
      const spanLat = Math.max(0.16, inv.maxLat - inv.minLat);

      // Add 28% geographic margin so incident is clearly framed with surrounding metocean context
      const padLon = Math.max(0.14, spanLon * 0.28);
      const padLat = Math.max(0.14, spanLat * 0.28);

      const paddedMinLon = inv.minLon - padLon;
      const paddedMaxLon = inv.maxLon + padLon;
      const paddedMinLat = inv.minLat - padLat;
      const paddedMaxLat = inv.maxLat + padLat;

      m.fitBounds(
        [
          [paddedMinLon, paddedMinLat],
          [paddedMaxLon, paddedMaxLat],
        ],
        { padding: 48, maxZoom: 10.2, duration: 850 },
      );
    } else {
      const centroid = safeGeoJson(spill?.centroid_geojson);
      const center = centroid?.coordinates || [72.68, 15.42];
      m.flyTo({ center, zoom: 9.2, duration: 800 });
    }
  }, [getInvestigationBounds, spill]);

  // Backward-compatible alias
  const fitBoundsToScene = fitInvestigationCamera;

  const fitInvestigationCameraRef = useRef(fitInvestigationCamera);
  useEffect(() => {
    fitInvestigationCameraRef.current = fitInvestigationCamera;
  });

  // Camera Presets Manager
  const applyCameraPreset = useCallback(
    (preset: "investigation" | "vessel" | "origin" | "slick" | "full") => {
      const m = map.current;
      if (!m) return;
      if (useStore.getState().activeCameraPreset !== preset) {
        setActiveCameraPreset(preset);
      }

      if (preset === "investigation") {
        const centroid = safeGeoJson(spill?.centroid_geojson);
        const center = centroid?.coordinates || [72.68, 15.42];
        m.easeTo({
          center,
          zoom: 9.8,
          pitch: viewMode === "3d" ? 52 : 0,
          bearing: viewMode === "3d" ? -15 : 0,
          duration: 800,
        });
      } else if (preset === "vessel") {
        const targetMmsi =
          inspectedVessel?.mmsi || selectedMmsi || attributions?.[0]?.mmsi;
        const selTrack = tracks?.find(
          (t) => String(t.mmsi) === String(targetMmsi),
        );
        if (selTrack) {
          const state = getInterpolatedVesselState(selTrack, activeTimeline);
          m.easeTo({
            center: [state.lon, state.lat],
            zoom: 12.0,
            pitch: viewMode === "3d" ? 58 : 0,
            bearing: viewMode === "3d" ? -18 : 0,
            duration: 800,
          });
        }
      } else if (preset === "origin") {
        const originCentroid = hindcast
          ? [hindcast.origin_lon, hindcast.origin_lat]
          : [72.54, 15.35];
        m.easeTo({
          center: originCentroid as [number, number],
          zoom: 11.2,
          pitch: viewMode === "3d" ? 48 : 0,
          bearing: viewMode === "3d" ? -10 : 0,
          duration: 800,
        });
      } else if (preset === "slick") {
        const centroid = safeGeoJson(spill?.centroid_geojson);
        const center = centroid?.coordinates || [72.68, 15.42];
        m.easeTo({
          center,
          zoom: 11.8,
          pitch: viewMode === "3d" ? 42 : 0,
          bearing: 0,
          duration: 800,
        });
      } else if (preset === "full") {
        fitInvestigationCameraRef.current();
      }
    },
    [
      setActiveCameraPreset,
      spill,
      viewMode,
      inspectedVessel,
      selectedMmsi,
      attributions,
      tracks,
      activeTimeline,
      hindcast,
    ],
  );

  const applyCameraPresetRef = useRef(applyCameraPreset);
  useEffect(() => {
    applyCameraPresetRef.current = applyCameraPreset;
  });

  // Apply context preset when map loads or contextPreset prop changes
  useEffect(() => {
    if (!mapLoaded || !map.current || !contextPreset) return;
    switch (contextPreset) {
      case "sar":
        applyCameraPresetRef.current("slick");
        break;
      case "hindcast":
      case "forecast":
      case "digital_twin":
      case "command_center":
        fitInvestigationCameraRef.current();
        break;
      case "attribution":
        applyCameraPresetRef.current("vessel");
        break;
    }
  }, [contextPreset, mapLoaded]);

  // Auto-frame investigation camera when asynchronous incident geometry arrives
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    if (contextPreset === "sar" || contextPreset === "attribution") return;
    fitInvestigationCameraRef.current();
  }, [
    spill?.id,
    forecast?.particles?.length,
    hindcast?.origin_lon,
    hindcast?.particles?.length,
    tracks?.length,
    mapLoaded,
    contextPreset,
  ]);

  // Sync selected vessel when prop changes
  useEffect(() => {
    if (!selectedMmsi) {
      setInspectedVessel(null);
      return;
    }
    const t = tracks?.find((trk) => String(trk.mmsi) === String(selectedMmsi));
    const attr = attributions?.find(
      (a) => String(a.mmsi) === String(selectedMmsi),
    );
    if (t) {
      const state = getInterpolatedVesselState(t, activeTimeline);
      const archetype = resolveVesselArchetype(t.vessel_type, t.vessel_name);
      const realLength = resolveVesselLength(
        archetype,
        (t as any).length_m || attr?.length_m,
      );
      setInspectedVessel({
        ...state,
        mmsi: t.mmsi,
        vessel_name: t.vessel_name || `MMSI ${t.mmsi}`,
        vessel_type: t.vessel_type || "Commercial Vessel",
        length_m: realLength,
        flag: attr?.flag || (t as any).flag || "—",
        rank: attr?.rank || null,
        final_score: attr?.final_score || null,
        distance_km: attr?.distance_km || null,
        time_delta_h: attr?.time_delta_h != null ? attr.time_delta_h : null,
      });
    }
  }, [selectedMmsi, tracks, attributions, activeTimeline]);

  // Handle switching view mode (2D / 3D)
  const handleSetViewMode = useCallback(
    (mode: "2d" | "3d") => {
      setViewMode(mode);
      const m = map.current;
      if (!m) return;
      if (mode === "3d") {
        m.easeTo({ pitch: 56, bearing: -18, duration: 800 });
      } else {
        m.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      }
    },
    [setViewMode],
  );

  // Listen for Escape key to exit Clear Map mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && cleanMode) {
        setCleanMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cleanMode, setCleanMode]);

  // Switch basemaps cleanly: satellite <-> dark
  const setBasemap = (mode: BasemapMode) => {
    const m = map.current;
    if (!m) return;
    setBasemapMode(mode);

    try {
      if (m.getLayer("basemap-dark")) {
        m.setLayoutProperty(
          "basemap-dark",
          "visibility",
          mode === "dark" ? "visible" : "none",
        );
      }
      if (m.getLayer("basemap-satellite")) {
        m.setLayoutProperty(
          "basemap-satellite",
          "visibility",
          mode === "satellite" ? "visible" : "none",
        );
      }
      if (m.getLayer("basemap-nautical")) {
        m.setLayoutProperty("basemap-nautical", "visibility", "none");
      }
    } catch (e) {
      console.warn("Failed to switch basemap visibility", e);
    }
  };

  const toggleBasemap = () => {
    setBasemap(basemapMode === "satellite" ? "dark" : "satellite");
  };

  // Map Initialization
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: INITIAL_STYLE,
      center: [72.68, 15.42],
      zoom: 7.5,
      minZoom: 3,
      maxZoom: 17,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });
    map.current = m;

    m.on("mousemove", (e) => {
      setCoords({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      if (
        viewModeRef.current === "3d" &&
        layersRef.current.vessels3D &&
        vessel3DLayerRef.current
      ) {
        const hit = vessel3DLayerRef.current.raycast(e.point);
        m.getCanvas().style.cursor = hit ? "pointer" : "";
      }
    });

    m.on("zoom", () => {
      setZoom(Number(m.getZoom().toFixed(1)));
    });

    m.on("zoomend", () => {
      setMapZoom(m.getZoom());
      setZoom(Number(m.getZoom().toFixed(1)));
      const b = m.getBounds();
      if (b) {
        setViewportBounds({
          west: Number(b.getWest().toFixed(2)),
          east: Number(b.getEast().toFixed(2)),
          south: Number(b.getSouth().toFixed(2)),
          north: Number(b.getNorth().toFixed(2)),
        });
      }
    });

    m.on("moveend", () => {
      const c = m.getCenter();
      setCoords({
        lat: Number(c.lat.toFixed(4)),
        lon: Number(c.lng.toFixed(4)),
      });
      setZoom(Number(m.getZoom().toFixed(1)));
      setMapZoom(m.getZoom());
      setBearing(Math.round(m.getBearing()));
      setPitch(Math.round(m.getPitch()));
      const b = m.getBounds();
      if (b) {
        setViewportBounds({
          west: Number(b.getWest().toFixed(2)),
          east: Number(b.getEast().toFixed(2)),
          south: Number(b.getSouth().toFixed(2)),
          north: Number(b.getNorth().toFixed(2)),
        });
      }
    });

    m.on("rotate", () => {
      setBearing(Math.round(m.getBearing()));
      setPitch(Math.round(m.getPitch()));
    });

    m.on("pitch", () => {
      setPitch(Math.round(m.getPitch()));
    });

    m.on("click", (e) => {
      if (
        viewModeRef.current === "3d" &&
        layersRef.current.vessels3D &&
        vessel3DLayerRef.current
      ) {
        const hit = vessel3DLayerRef.current.raycast(e.point);
        if (hit) {
          if (onVesselClickRef.current)
            onVesselClickRef.current(String(hit.mmsi));
          setInspectedVessel(hit);
          m.easeTo({
            center: [hit.lon, hit.lat],
            zoom: Math.max(m.getZoom(), 11.2),
            pitch: 56,
            bearing: -18,
            duration: 700,
          });
        }
      }
    });

    m.on("load", () => {
      addDataLayers(m);
      // Activate satellite basemap by default
      try {
        if (m.getLayer("basemap-dark")) m.setLayoutProperty("basemap-dark", "visibility", "none");
        if (m.getLayer("basemap-satellite")) m.setLayoutProperty("basemap-satellite", "visibility", "visible");
        if (m.getLayer("basemap-nautical")) m.setLayoutProperty("basemap-nautical", "visibility", "none");
      } catch (e) {
        console.warn("Failed to set initial satellite basemap", e);
      }
      setMapLoaded(true);
      m.resize();
      const b = m.getBounds();
      if (b) {
        setViewportBounds({
          west: Number(b.getWest().toFixed(2)),
          east: Number(b.getEast().toFixed(2)),
          south: Number(b.getSouth().toFixed(2)),
          north: Number(b.getNorth().toFixed(2)),
        });
      }
      setTimeout(fitInvestigationCamera, 300);
    });

    const handleResize = () => {
      if (m) m.resize();
    };
    window.addEventListener("resize", handleResize);

    // Continuous container resize observer (Section 19)
    let ro: ResizeObserver | null = null;
    if (mapContainer.current) {
      ro = new ResizeObserver(() => {
        if (m) m.resize();
      });
      ro.observe(mapContainer.current);
    }

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", handleResize);
      if (vessel3DLayerRef.current) {
        try {
          vessel3DLayerRef.current.onRemove();
        } catch {
          // ignore
        }
        vessel3DLayerRef.current = null;
      }
      m.remove();
      map.current = null;
    };
  }, []);

  const addDataLayers = (m: maplibregl.Map) => {
    // 0. Coordinate Graticule (Lat/Lon grid)
    if (!m.getSource("coord-grid-src")) {
      m.addSource("coord-grid-src", {
        type: "geojson",
        data: generateGraticuleGeoJson() as any,
      });
      m.addLayer({
        id: "coord-grid-line",
        type: "line",
        source: "coord-grid-src",
        layout: {
          visibility: layers.coordGrid ? "visible" : "none",
        },
        paint: {
          "line-color": "#334155",
          "line-width": 0.8,
          "line-opacity": 0.45,
          "line-dasharray": [2, 4],
        },
      });
    }

    // 1. Maritime Bathymetric Contours Layer
    if (!m.getSource("bathymetry-src")) {
      m.addSource("bathymetry-src", {
        type: "geojson",
        data: ARABIAN_SEA_BATHYMETRY_GEOJSON as any,
      });
      m.addLayer({
        id: "bathymetry-line",
        type: "line",
        source: "bathymetry-src",
        filter: ["==", "$type", "LineString"],
        layout: {
          visibility: layers.bathymetry ? "visible" : "none",
        },
        paint: {
          "line-color": [
            "match",
            ["get", "depth"],
            20,
            "#0D9488",
            50,
            "#14B8A6",
            100,
            "#0284C7",
            200,
            "#0369A1",
            500,
            "#1E3A8A",
            "#0F172A",
          ],
          "line-width": ["case", ["==", ["get", "depth"], 200], 1.8, 1.0],
          "line-opacity": 0.55,
          "line-dasharray": [
            "case",
            ["==", ["get", "depth"], 200],
            ["literal", [4, 2]],
            ["literal", [2, 2]],
          ],
        },
      });
      m.addLayer({
        id: "bathymetry-labels",
        type: "symbol",
        source: "bathymetry-src",
        filter: ["==", "$type", "Point"],
        minzoom: 8.0,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": 9,
          "text-offset": [0, 0],
          "text-anchor": "center",
          visibility: layers.bathymetry ? "visible" : "none",
        },
        paint: {
          "text-color": "#38BDF8",
          "text-halo-color": "#0B0F14",
          "text-halo-width": 1.5,
          "text-opacity": 0.8,
        },
      });
    }

    // 2. Charted Shipping Corridors & TSS Centerlines
    if (!m.getSource("shipping-lanes-src")) {
      m.addSource("shipping-lanes-src", {
        type: "geojson",
        data: ARABIAN_SEA_SHIPPING_LANES_GEOJSON as any,
      });
      m.addLayer({
        id: "shipping-lanes-fill",
        type: "fill",
        source: "shipping-lanes-src",
        filter: ["==", "$type", "Polygon"],
        layout: {
          visibility: layers.shippingLanes ? "visible" : "none",
        },
        paint: {
          "fill-color": "#C084FC",
          "fill-opacity": 0.06,
        },
      });
      m.addLayer({
        id: "shipping-lanes-line",
        type: "line",
        source: "shipping-lanes-src",
        layout: {
          visibility: layers.shippingLanes ? "visible" : "none",
        },
        paint: {
          "line-color": "#D946EF",
          "line-width": [
            "case",
            ["==", ["get", "type"], "CENTERLINE"],
            1.6,
            1.0,
          ],
          "line-dasharray": [4, 3],
          "line-opacity": 0.45,
        },
      });
      m.addLayer({
        id: "shipping-lanes-labels",
        type: "symbol",
        source: "shipping-lanes-src",
        filter: ["==", "$type", "Point"],
        minzoom: 7.5,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": 9.5,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          visibility: layers.shippingLanes ? "visible" : "none",
        },
        paint: {
          "text-color": "#E879F9",
          "text-halo-color": "#0B0F14",
          "text-halo-width": 1.5,
          "text-opacity": 0.75,
        },
      });
    }

    // 3. Georeferenced SAR Satellite Scene Raster Layer
    if (!m.getSource("sar-scene-src")) {
      const sceneId =
        spill?.satellite_image_id ||
        spill?.id ||
        "S1A_IW_GRDH_1SDV_20240315T060000_demo";
      const centroid = safeGeoJson(spill?.centroid_geojson);
      const lon = centroid?.coordinates?.[0] || 72.7;
      const lat = centroid?.coordinates?.[1] || 15.4;
      m.addSource("sar-scene-src", {
        type: "image",
        url: getApiUrl(`/api/scenes/${encodeURIComponent(sceneId)}/image?mode=composite`),
        coordinates: [
          [lon - 0.35, lat + 0.25],
          [lon + 0.35, lat + 0.25],
          [lon + 0.35, lat - 0.25],
          [lon - 0.35, lat - 0.25],
        ],
      });
      m.addLayer({
        id: "sar-scene-layer",
        type: "raster",
        source: "sar-scene-src",
        layout: {
          visibility: layers.satellite ? "visible" : "none",
        },
        paint: {
          "raster-opacity": contextPreset === "sar" ? 0.82 : 0.15,
        },
      });
    }

    // 4. Spill polygon source & high-visibility scientific overlay
    if (!m.getSource("spill-src")) {
      m.addSource("spill-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "spill-fill",
        type: "fill",
        source: "spill-src",
        paint: {
          "fill-color": "#FF7A00",
          "fill-opacity": incidentFocus ? 0.45 : 0.28,
        },
      });
      m.addLayer({
        id: "spill-line-glow",
        type: "line",
        source: "spill-src",
        paint: {
          "line-color": "#F5B82E",
          "line-width": 5.0,
          "line-opacity": 0.35,
        },
      });
      m.addLayer({
        id: "spill-line",
        type: "line",
        source: "spill-src",
        paint: {
          "line-color": "#FF7A00",
          "line-width": 2.4,
        },
      });
      m.addLayer({
        id: "spill-label",
        type: "symbol",
        source: "spill-src",
        minzoom: 7.5,
        layout: {
          "text-field": "OBSERVED OIL SLICK",
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": 10,
          "text-offset": [0, -1.2],
          "text-anchor": "bottom",
          visibility: layers.slickGeometry ? "visible" : "none",
        },
        paint: {
          "text-color": "#FF7A00",
          "text-halo-color": "#07111F",
          "text-halo-width": 2,
        },
      });
    }

    // 5. Reconstructed discharge origin source & uncertainty envelope
    if (!m.getSource("origin-src")) {
      m.addSource("origin-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "origin-fill",
        type: "fill",
        source: "origin-src",
        paint: {
          "fill-color": "#A879FF",
          "fill-opacity": incidentFocus ? 0.35 : 0.2,
        },
      });
      m.addLayer({
        id: "origin-line",
        type: "line",
        source: "origin-src",
        paint: {
          "line-color": "#A879FF",
          "line-width": 2.0,
          "line-dasharray": [3, 2],
        },
      });
      m.addLayer({
        id: "origin-label",
        type: "symbol",
        source: "origin-src",
        minzoom: 8.0,
        layout: {
          "text-field": "RECONSTRUCTED ORIGIN",
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": 9.5,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          visibility: layers.originRegion ? "visible" : "none",
        },
        paint: {
          "text-color": "#A879FF",
          "text-halo-color": "#07111F",
          "text-halo-width": 2,
        },
      });
    }

    // 6. Hindcast trajectory & backward drift (Lagrangian reverse RK4)
    if (!m.getSource("hindcast-src")) {
      m.addSource("hindcast-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "hindcast-line",
        type: "line",
        source: "hindcast-src",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": "#A879FF",
          "line-width": 2.4,
          "line-dasharray": [4, 2],
          "line-opacity": 0.85,
        },
      });
      m.addLayer({
        id: "hindcast-pts",
        type: "circle",
        source: "hindcast-src",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 2.5,
          "circle-color": "#A879FF",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#FFFFFF",
          "circle-opacity": 0.85,
        },
      });
    }

    // 7. Forecast forward dispersion ensemble & confidence envelope
    if (!m.getSource("forecast-src")) {
      m.addSource("forecast-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "forecast-envelope-fill",
        type: "fill",
        source: "forecast-src",
        filter: ["==", ["get", "level"], "90% Dispersion Envelope"],
        paint: {
          "fill-color": "#8D7CFF",
          "fill-opacity": 0.16,
        },
      });
      m.addLayer({
        id: "forecast-envelope-line",
        type: "line",
        source: "forecast-src",
        filter: ["==", ["get", "level"], "90% Dispersion Envelope"],
        paint: {
          "line-color": "#8D7CFF",
          "line-width": 1.4,
          "line-dasharray": [3, 2],
          "line-opacity": 0.75,
        },
      });
      m.addLayer({
        id: "forecast-core-fill",
        type: "fill",
        source: "forecast-src",
        filter: ["==", ["get", "level"], "50% Core Plume"],
        paint: {
          "fill-color": "#A879FF",
          "fill-opacity": 0.26,
        },
      });
      m.addLayer({
        id: "forecast-traj-line",
        type: "line",
        source: "forecast-src",
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          ["!=", ["get", "level"], "center"],
        ],
        paint: {
          "line-color": "#8D7CFF",
          "line-width": 1.1,
          "line-opacity": 0.55,
          "line-dasharray": [2, 2],
        },
      });
      m.addLayer({
        id: "forecast-mean-line",
        type: "line",
        source: "forecast-src",
        filter: ["==", ["get", "level"], "center"],
        paint: {
          "line-color": "#C084FC",
          "line-width": 2.6,
          "line-opacity": 0.95,
        },
      });
      m.addLayer({
        id: "forecast-pts",
        type: "circle",
        source: "forecast-src",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 2.2,
          "circle-color": "#8D7CFF",
          "circle-stroke-width": 0.8,
          "circle-stroke-color": "#FFFFFF",
          "circle-opacity": 0.85,
        },
      });
    }

    // 8. Vessel tracks
    if (!m.getSource("tracks-src")) {
      m.addSource("tracks-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "tracks-line",
        type: "line",
        source: "tracks-src",
        paint: {
          "line-color": ["get", "color"],
          "line-width": [
            "case",
            ["get", "isSelected"],
            3.8,
            ["get", "isCandidate"],
            2.6,
            1.2,
          ],
          "line-opacity": [
            "case",
            ["get", "isSelected"],
            1.0,
            ["get", "isCandidate"],
            0.9,
            incidentFocus ? 0.08 : 0.45,
          ],
        },
      });
    }

    // 9. Directional flow chevrons along vessel tracks
    if (!m.getSource("tracks-flow-src")) {
      m.addSource("tracks-flow-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "tracks-flow-chevrons",
        type: "symbol",
        source: "tracks-flow-src",
        minzoom: 8.5,
        layout: {
          "text-field": "▲",
          "text-size": ["case", ["get", "isSelected"], 13, 9],
          "text-rotate": ["get", "bearing"],
          "text-rotation-alignment": "map",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": ["get", "color"],
          "text-opacity": ["case", ["get", "isSelected"], 0.95, 0.65],
          "text-halo-color": "#0B0F14",
          "text-halo-width": 1,
        },
      });
    }

    // 10. Vessel heading rays
    if (!m.getSource("headings-src")) {
      m.addSource("headings-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "headings-line",
        type: "line",
        source: "headings-src",
        layout: {
          visibility: layers.vesselHeadings ? "visible" : "none",
        },
        paint: {
          "line-color": "#38BDF8",
          "line-width": ["case", ["get", "isSelected"], 2.5, 1.5],
          "line-dasharray": [2, 2],
          "line-opacity": 0.85,
        },
      });
      m.addLayer({
        id: "headings-arrow",
        type: "circle",
        source: "headings-src",
        filter: ["==", "$type", "Point"],
        layout: {
          visibility: layers.vesselHeadings ? "visible" : "none",
        },
        paint: {
          "circle-radius": 3.2,
          "circle-color": "#00E5FF",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#FFFFFF",
        },
      });
    }

    // 11. Maritime Route Reconstruction Tie-Line
    if (!m.getSource("route-tie-src")) {
      m.addSource("route-tie-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "route-tie-line",
        type: "line",
        source: "route-tie-src",
        paint: {
          "line-color": "#00E5FF",
          "line-width": 2.2,
          "line-dasharray": [3, 2],
          "line-opacity": 0.9,
        },
      });
    }

    // Load custom high-definition ship marker asset
    if (!m.hasImage("ship-marker-icon")) {
      try {
        const loadPromise = m.loadImage("/ship-marker.png");
        if (loadPromise && typeof (loadPromise as any).then === "function") {
          (loadPromise as any)
            .then((result: any) => {
              const img = result?.data || result;
              if (img && !m.hasImage("ship-marker-icon")) {
                m.addImage("ship-marker-icon", img);
              }
            })
            .catch((err: any) =>
              console.warn("Failed to load /ship-marker.png for MapLibre:", err),
            );
        }
      } catch (e) {
        console.warn("MapLibre loadImage error:", e);
      }
    }

    // 12. AIS Vessel Layers (Image Marker + Glowing Candidate Aura + Center Pip)
    if (!m.getSource("vessels-src")) {
      m.addSource("vessels-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // 12a. Glowing halo for suspect candidates and selected vessel
      m.addLayer({
        id: "vessels-halo",
        type: "circle",
        source: "vessels-src",
        paint: {
          "circle-radius": [
            "case",
            ["get", "isSelected"],
            24,
            ["get", "isCandidate"],
            18,
            12,
          ],
          "circle-color": ["get", "color"],
          "circle-opacity": [
            "case",
            ["get", "isSelected"],
            0.45,
            ["get", "isCandidate"],
            0.3,
            0.12,
          ],
          "circle-blur": 0.6,
        },
      });

      // 12b. Tactical 3D Ship Asset Marker Icon
      m.addLayer({
        id: "vessels-ship-icon",
        type: "symbol",
        source: "vessels-src",
        layout: {
          "icon-image": "ship-marker-icon",
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            0.1,
            8,
            0.18,
            10,
            0.28,
            12,
            0.45,
            15,
            0.75,
            17,
            1.1,
          ],
          "icon-rotate": ["coalesce", ["get", "heading"], ["get", "cog"], 0],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          visibility: layers.aisVessels ? "visible" : "none",
        },
        paint: {
          "icon-opacity": [
            "case",
            ["get", "isSelected"],
            1.0,
            ["get", "isCandidate"],
            0.95,
            0.82,
          ],
        },
      });

      // 12c. Core center pip indicator
      m.addLayer({
        id: "vessels-pts",
        type: "circle",
        source: "vessels-src",
        paint: {
          "circle-radius": [
            "case",
            ["get", "isSelected"],
            5,
            ["get", "isCandidate"],
            4,
            3,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#FFFFFF",
          "circle-opacity": 0.95,
        },
      });

      // 13. Smart Vessel Tactical Labels
      m.addLayer({
        id: "vessel-labels",
        type: "symbol",
        source: "vessels-src",
        minzoom: 8.0,
        layout: {
          "text-field": [
            "format",
            ["get", "vessel_name"],
            { "font-scale": 1.0, "text-color": "#FFFFFF" },
            [
              "case",
              ["!=", ["get", "rank"], null],
              ["concat", "\n[#", ["to-string", ["get", "rank"]], " SUSPECT]"],
              "",
            ],
            { "font-scale": 0.82, "text-color": "#F59E0B" },
          ],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": 11,
          "text-offset": [0, 1.8],
          "text-anchor": "top",
          "text-allow-overlap": false,
          visibility: layers.vesselLabels ? "visible" : "none",
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "#0B0F14",
          "text-halo-width": 2,
        },
      });

      const handleVesselClick = (e: any) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const p = feat.properties || {};
        const mmsi = String(p.mmsi);
        if (mmsi && onVesselClickRef.current) onVesselClickRef.current(mmsi);
        setInspectedVessel(p);
      };

      m.on("click", "vessels-pts", handleVesselClick);
      m.on("click", "vessels-ship-icon", handleVesselClick);
      m.on("click", "vessels-halo", handleVesselClick);

      m.on("mouseenter", "vessels-ship-icon", () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", "vessels-ship-icon", () => {
        m.getCanvas().style.cursor = "";
      });
      m.on("mouseenter", "vessels-pts", () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", "vessels-pts", () => {
        m.getCanvas().style.cursor = "";
      });
    }

    // 14. Centroid marker with beacon ring
    if (!m.getSource("centroid-src")) {
      m.addSource("centroid-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "centroid-pulse",
        type: "circle",
        source: "centroid-src",
        paint: {
          "circle-radius": 12,
          "circle-color": "#F59E0B",
          "circle-opacity": 0.25,
        },
      });
      m.addLayer({
        id: "centroid-pt",
        type: "circle",
        source: "centroid-src",
        paint: {
          "circle-radius": 5,
          "circle-color": "#F59E0B",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#FFFFFF",
        },
      });
    }

    // 15. Continuous Ocean Current Streamlines & Laminar Flow Layer
    if (!m.getSource("currents-src")) {
      m.addSource("currents-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "currents-streamlines",
        type: "line",
        source: "currents-src",
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility: layers.currentVectors ? "visible" : "none",
        },
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#00D9E8"],
          "line-width": ["coalesce", ["get", "width"], 1.6],
          "line-opacity": ["coalesce", ["get", "opacity"], 0.75],
        },
      });
      m.addLayer({
        id: "currents-streamlines-flow",
        type: "line",
        source: "currents-src",
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility:
            layers.currentVectors && layers.flowAnimation ? "visible" : "none",
        },
        paint: {
          "line-color": "#00D9E8",
          "line-width": 1.4,
          "line-opacity": 0.6,
          "line-dasharray": [4, 4],
        },
      });
    }

    // 16. Subtle Atmospheric Wind Vector Field Layer (10m ERA5)
    if (!m.getSource("winds-src")) {
      m.addSource("winds-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "winds-streamlines",
        type: "line",
        source: "winds-src",
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility: layers.windVectors ? "visible" : "none",
        },
        paint: {
          "line-color": "#38BDF8",
          "line-width": 1.0,
          "line-opacity": 0.38,
          "line-dasharray": [3, 4],
        },
      });
    }

    // 17. 3D Vessel Layer (Custom WebGL Three.js Layer)
    if (!m.getLayer("3d-vessels-layer")) {
      try {
        const custom3d = new Vessel3DCustomLayer("3d-vessels-layer");
        vessel3DLayerRef.current = custom3d;
        m.addLayer(custom3d as any);
      } catch (err) {
        console.warn(
          "WebGL 3D Vessel Layer initialization failed, falling back to 2D:",
          err,
        );
        setViewMode("2d");
      }
    }
  };

  // Sync layer visibilities
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;

    const setVisibility = (id: string, vis: boolean) => {
      if (m.getLayer(id)) {
        m.setLayoutProperty(id, "visibility", vis ? "visible" : "none");
      }
    };

    setVisibility("sar-scene-layer", layers.satellite);
    setVisibility("spill-fill", layers.slickGeometry);
    setVisibility("spill-line-glow", layers.slickGeometry);
    setVisibility("spill-line", layers.slickGeometry);
    setVisibility("spill-label", layers.slickGeometry);
    setVisibility("origin-fill", layers.originRegion);
    setVisibility("origin-line", layers.originRegion);
    setVisibility("origin-label", layers.originRegion);
    setVisibility("hindcast-line", layers.hindcast);
    setVisibility("hindcast-pts", layers.hindcast);
    setVisibility("forecast-envelope-fill", layers.forecast);
    setVisibility("forecast-envelope-line", layers.forecast);
    setVisibility("forecast-core-fill", layers.forecast);
    setVisibility("forecast-traj-line", layers.forecast);
    setVisibility("forecast-pts", layers.forecast);
    setVisibility("currents-streamlines", layers.currentVectors);
    setVisibility(
      "currents-streamlines-flow",
      layers.currentVectors && layers.flowAnimation,
    );
    setVisibility("winds-streamlines", layers.windVectors);
    setVisibility("vessel-labels", layers.vesselLabels);
    setVisibility("headings-line", layers.vesselHeadings);
    setVisibility("headings-arrow", layers.vesselHeadings);
    setVisibility("bathymetry-line", layers.bathymetry);
    setVisibility("bathymetry-labels", layers.bathymetry);
    setVisibility("shipping-lanes-fill", layers.shippingLanes);
    setVisibility("shipping-lanes-line", layers.shippingLanes);
    setVisibility("shipping-lanes-labels", layers.shippingLanes);
    setVisibility("tracks-line", layers.vesselTracks);
    setVisibility("tracks-flow-chevrons", layers.vesselTracks);
    setVisibility("vessels-pts", layers.aisVessels);
    setVisibility("coord-grid-line", layers.coordGrid);
  }, [
    layers.satellite,
    layers.slickGeometry,
    layers.originRegion,
    layers.hindcast,
    layers.forecast,
    layers.currentVectors,
    layers.windVectors,
    layers.flowAnimation,
    layers.vesselTracks,
    layers.aisVessels,
    layers.vesselLabels,
    layers.vesselHeadings,
    layers.bathymetry,
    layers.shippingLanes,
    layers.coordGrid,
    mapLoaded,
  ]);

  // Environmental Laminar Flow Animation
  useEffect(() => {
    if (!layers.flowAnimation) return;
    let animId: number;
    let step = 0;
    let lastTime = 0;

    const animate = (time: number) => {
      if (time - lastTime > 45) {
        lastTime = time;
        step = (step + 1) % 24;
        const m = map.current;
        if (m && m.isStyleLoaded()) {
          try {
            if (m.getLayer("currents-streamlines-flow")) {
              const d1 = 3 + (step % 5);
              const d2 = Math.max(1, 5 - (step % 5));
              m.setPaintProperty(
                "currents-streamlines-flow",
                "line-dasharray",
                [d1, d2],
              );
            }
          } catch {
            // style loading
          }
        }
      }
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [layers.flowAnimation, mapLoaded]);

  // Digital Twin Timeline Playback Tick
  useEffect(() => {
    if (!timelinePlaying) return;
    const interval = setInterval(() => {
      const current = useStore.getState().timelinePosition;
      const next = current + 0.015 * timelineSpeed;
      setTimelinePosition(next >= 1.0 ? 0.0 : next);
    }, 150);
    return () => clearInterval(interval);
  }, [timelinePlaying, timelineSpeed, setTimelinePosition]);

  // Update spill layer
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const src = m.getSource("spill-src") as maplibregl.GeoJSONSource;
    if (!src) return;
    const features = [];
    const poly = safeGeoJson(spill?.spill_polygon_geojson);
    const centroid = safeGeoJson(spill?.centroid_geojson);

    if (poly && layers.slickGeometry) {
      features.push({
        type: "Feature",
        geometry: poly,
        properties: {
          provenance: spill?.provenance,
          area_km2: spill?.area_km2?.toFixed(2),
          perimeter_km: spill?.perimeter_km?.toFixed(2),
          confidence: `${((spill?.detection_confidence || 0) * 100).toFixed(1)}%`,
          acq_time: spill?.satellite_acquisition_time?.slice(0, 16) + " UTC",
        },
      });
    }
    src.setData({ type: "FeatureCollection", features } as any);

    const centSrc = m.getSource("centroid-src") as maplibregl.GeoJSONSource;
    if (centSrc && centroid) {
      centSrc.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: centroid, properties: {} }],
      } as any);
    }
  }, [spill, layers.slickGeometry, incidentFocus, mapLoaded]);

  // Dynamically update SAR satellite raster layer when incident/spill changes
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const sceneId = spill?.satellite_image_id || spill?.id;
    if (!sceneId) return;

    const centroid = safeGeoJson(spill?.centroid_geojson);
    const lon = centroid?.coordinates?.[0] || 72.7;
    const lat = centroid?.coordinates?.[1] || 15.4;
    const coords: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ] = [
      [lon - 0.35, lat + 0.25],
      [lon + 0.35, lat + 0.25],
      [lon + 0.35, lat - 0.25],
      [lon - 0.35, lat - 0.25],
    ];

    const src = m.getSource("sar-scene-src") as maplibregl.ImageSource;
    const newUrl = getApiUrl(`/api/scenes/${encodeURIComponent(sceneId)}/image?mode=composite`);
    if (src && typeof src.updateImage === "function") {
      try {
        src.updateImage({ url: newUrl, coordinates: coords as any });
      } catch {
        // safe ignore
      }
    }
  }, [
    spill?.satellite_image_id,
    spill?.id,
    spill?.centroid_geojson,
    mapLoaded,
  ]);

  // Update origin region
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const src = m.getSource("origin-src") as maplibregl.GeoJSONSource;
    if (!src) return;
    const originPoly = safeGeoJson(hindcast?.origin_region_geojson);
    const features =
      originPoly && layers.originRegion
        ? [
            {
              type: "Feature",
              geometry: originPoly,
              properties: {
                time_uncertainty: hindcast?.origin_time_uncertainty_h,
                spatial_uncertainty:
                  hindcast?.spatial_uncertainty_km?.toFixed(1),
              },
            },
          ]
        : [];
    src.setData({ type: "FeatureCollection", features } as any);
  }, [hindcast, layers.originRegion, incidentFocus, mapLoaded]);

  // Update hindcast reconstructed drift trajectory
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const src = m.getSource("hindcast-src") as maplibregl.GeoJSONSource;
    if (!src || !hindcast?.particles || !layers.hindcast) {
      src?.setData({ type: "FeatureCollection", features: [] } as any);
      return;
    }

    const hindcastRatio =
      typeof activeTimeline === "number"
        ? Math.min(1, Math.max(0, activeTimeline / 0.5))
        : 0.5;

    const features: any[] = [];
    const sampleStride = Math.max(
      1,
      Math.floor(hindcast.particles.length / 24),
    );

    hindcast.particles.forEach((p: any, idx: number) => {
      if (!p?.trajectory || p.trajectory.length === 0) return;
      const stepIdx = Math.min(
        Math.floor(hindcastRatio * p.trajectory.length),
        p.trajectory.length - 1,
      );
      const pos = p.trajectory[stepIdx];
      if (!pos || typeof pos.lon !== "number" || typeof pos.lat !== "number")
        return;

      if (idx % sampleStride === 0) {
        // Representative trajectory track
        const lineCoords = p.trajectory
          .slice(0, stepIdx + 1)
          .map((t: any) => [t.lon, t.lat]);
        if (lineCoords.length >= 2) {
          features.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: lineCoords },
            properties: { pid: p.particle_id },
          });
        }
        // Representative particle point
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [pos.lon, pos.lat] },
          properties: { pid: p.particle_id },
        });
      }
    });

    src.setData({ type: "FeatureCollection", features } as any);
  }, [hindcast, layers.hindcast, activeTimeline, mapLoaded]);

  // Update forecast dispersion ensemble & confidence plume
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const src = m.getSource("forecast-src") as maplibregl.GeoJSONSource;
    if (!src || !forecast?.particles || !layers.forecast) {
      src?.setData({ type: "FeatureCollection", features: [] } as any);
      return;
    }

    const forecastRatio =
      typeof activeTimeline === "number"
        ? Math.min(1, Math.max(0, (activeTimeline - 0.5) / 0.5))
        : 0.5;

    const {
      envelope,
      corePlume,
      trajectories,
      representativePoints,
      meanTrajectory,
    } = generateForecastEnsemblePlume(forecast.particles, forecastRatio);

    const features = [
      ...envelope.features,
      ...corePlume.features,
      ...(meanTrajectory ? meanTrajectory.features : []),
      ...trajectories.features,
      ...representativePoints.features,
    ];

    src.setData({ type: "FeatureCollection", features } as any);
  }, [forecast, layers.forecast, activeTimeline, mapLoaded]);

  // Update vessel tracks + 2D points + headings + flow chevrons + tie-line + 3D layer
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const trackSrc = m.getSource("tracks-src") as maplibregl.GeoJSONSource;
    const vesselSrc = m.getSource("vessels-src") as maplibregl.GeoJSONSource;
    const headingSrc = m.getSource("headings-src") as maplibregl.GeoJSONSource;
    const flowSrc = m.getSource("tracks-flow-src") as maplibregl.GeoJSONSource;
    const tieSrc = m.getSource("route-tie-src") as maplibregl.GeoJSONSource;
    if (!trackSrc || !vesselSrc) return;

    const attrMap = new Map<string, Attribution>();
    (effectiveAttributions || []).forEach((a) =>
      attrMap.set(String(a.mmsi), a),
    );
    const candidateMmsis = new Set(
      (effectiveAttributions || []).slice(0, 3).map((a) => String(a.mmsi)),
    );

    const trackFeatures: any[] = [];
    const vesselFeatures: any[] = [];
    const headingFeatures: any[] = [];
    const flowFeatures: any[] = [];
    const tieFeatures: any[] = [];

    const activeMmsi = inspectedVessel?.mmsi || selectedMmsi;

    (effectiveTracks || []).forEach((t) => {
      const mmsi = String(t.mmsi);
      const attr = attrMap.get(mmsi);
      const rank = attr?.rank;
      const isCandidate = candidateMmsis.has(mmsi);
      const isSelected = mmsi === String(activeMmsi);

      const color = isSelected
        ? "#00E5FF" // High-visibility Cyan
        : rank === 1
          ? "#F59E0B" // Amber Gold (Top Candidate)
          : rank === 2
            ? "#38BDF8" // Sky Blue
            : rank === 3
              ? "#10B981" // Emerald
              : "#64748B"; // Neutral Slate

      if (layers.vesselTracks && t.track_geojson) {
        trackFeatures.push({
          type: "Feature",
          geometry: t.track_geojson,
          properties: {
            mmsi: t.mmsi,
            color,
            isCandidate,
            isSelected,
          },
        });

        // Compute directional chevrons along track line
        const coords = t.track_geojson.coordinates;
        if (coords && coords.length >= 2) {
          const sampleInterval = Math.max(1, Math.floor(coords.length / 8));
          for (let i = 0; i < coords.length - 1; i += sampleInterval) {
            const pA = coords[i];
            const pB = coords[i + 1];
            const dx = pB[0] - pA[0];
            const dy = pB[1] - pA[1];
            const chevronBearing = (Math.atan2(dx, dy) * 180) / Math.PI;
            flowFeatures.push({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [(pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2],
              },
              properties: {
                bearing: chevronBearing,
                color,
                isSelected,
                isCandidate,
              },
            });
          }
        }
      }

      if (layers.aisVessels) {
        const state = getInterpolatedVesselState(t, activeTimeline);
        const headingDeg = state.heading != null ? state.heading : state.cog;
        const archetype = resolveVesselArchetype(t.vessel_type, t.vessel_name);
        const realLength = resolveVesselLength(
          archetype,
          (t as any).length_m || attr?.length_m,
        );

        vesselFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [state.lon, state.lat] },
          properties: {
            mmsi: t.mmsi,
            vessel_name: t.vessel_name || `MMSI ${t.mmsi}`,
            vessel_type: t.vessel_type || "Commercial Vessel",
            length_m: realLength,
            flag: attr?.flag || (t as any).flag || "—",
            rank: rank || null,
            final_score: attr?.final_score || null,
            distance_km: attr?.distance_km || null,
            time_delta_h: attr?.time_delta_h != null ? attr.time_delta_h : null,
            sog: state.sog,
            speed: state.sog,
            heading: state.heading,
            cog: state.cog,
            color,
            isCandidate,
            isSelected,
          },
        });

        // Compute heading ray
        if (layers.vesselHeadings && headingDeg != null && !isNaN(headingDeg)) {
          const rad = (headingDeg * Math.PI) / 180;
          const cosLat = Math.cos((state.lat * Math.PI) / 180);
          const rayDeg = 0.018; // ~2 km
          const endLon =
            state.lon + (Math.sin(rad) * rayDeg) / Math.max(cosLat, 0.1);
          const endLat = state.lat + Math.cos(rad) * rayDeg;

          headingFeatures.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [state.lon, state.lat],
                [endLon, endLat],
              ],
            },
            properties: { mmsi: t.mmsi, isSelected },
          });
          headingFeatures.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [endLon, endLat] },
            properties: { mmsi: t.mmsi, isSelected },
          });
        }

        // Maritime Route Reconstruction Tie-Line
        if (
          isSelected &&
          (routeReconstructionActive || isCandidate) &&
          hindcast
        ) {
          tieFeatures.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [state.lon, state.lat],
                [hindcast.origin_lon, hindcast.origin_lat],
              ],
            },
            properties: {
              distance_km: attr?.distance_km?.toFixed(2) || "2.41",
            },
          });
        }
      }
    });

    trackSrc.setData({
      type: "FeatureCollection",
      features: trackFeatures,
    } as any);
    vesselSrc.setData({
      type: "FeatureCollection",
      features: vesselFeatures,
    } as any);
    if (headingSrc)
      headingSrc.setData({
        type: "FeatureCollection",
        features: headingFeatures,
      } as any);
    if (flowSrc)
      flowSrc.setData({
        type: "FeatureCollection",
        features: flowFeatures,
      } as any);
    if (tieSrc)
      tieSrc.setData({
        type: "FeatureCollection",
        features: tieFeatures,
      } as any);

    // Dynamic 2D circle opacity and ship icon visibility toggle in 3D mode
    const is3DActive = viewMode === "3d" && !!layers.vessels3D;
    if (m.getLayer("vessels-pts")) {
      m.setPaintProperty(
        "vessels-pts",
        "circle-opacity",
        is3DActive ? 0.05 : 0.95,
      );
      m.setPaintProperty(
        "vessels-pts",
        "circle-stroke-opacity",
        is3DActive ? 0.05 : 1.0,
      );
    }
    if (m.getLayer("vessels-ship-icon")) {
      m.setLayoutProperty(
        "vessels-ship-icon",
        "visibility",
        is3DActive ? "none" : layers.aisVessels ? "visible" : "none",
      );
    }
    if (m.getLayer("vessels-halo")) {
      m.setLayoutProperty(
        "vessels-halo",
        "visibility",
        is3DActive ? "none" : layers.aisVessels ? "visible" : "none",
      );
    }

    // Update 3D WebGL Layer
    if (vessel3DLayerRef.current) {
      vessel3DLayerRef.current.updateVessels(
        effectiveTracks || [],
        effectiveAttributions || [],
        activeMmsi || null,
        activeTimeline,
        layers,
        viewMode === "3d",
      );
    }
  }, [
    effectiveTracks,
    effectiveAttributions,
    selectedMmsi,
    inspectedVessel,
    activeTimeline,
    routeReconstructionActive,
    hindcast,
    layers.vesselTracks,
    layers.aisVessels,
    layers.vessels3D,
    layers.vesselHeadings,
    layers.vesselLabels,
    viewMode,
    incidentFocus,
    mapLoaded,
  ]);

  // Update Ocean Current Streamlines & Wind Vector Strokes on map
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const currentSrc = m.getSource("currents-src") as maplibregl.GeoJSONSource;
    const windSrc = m.getSource("winds-src") as maplibregl.GeoJSONSource;
    if (!currentSrc || !windSrc) return;

    const invBounds = getInvestigationBounds();

    if (layers.currentVectors) {
      let rawVectors: any[] = [];
      if (
        currentsData &&
        (currentsData.current_vectors?.length ||
          currentsData.sample_vectors?.length ||
          currentsData.points?.length)
      ) {
        rawVectors =
          currentsData.current_vectors ||
          currentsData.sample_vectors ||
          currentsData.points;
      } else {
        // Continuous deterministic simulation velocity grid across Arabian Sea operational theater (Seed 26143)
        for (let lat = 10.0; lat <= 20.0; lat += 0.4) {
          for (let lon = 68.0; lon <= 76.0; lon += 0.4) {
            const u = 0.18 + 0.03 * (lat - 15.42) - 0.015 * (lon - 72.68);
            const v = 0.12 + 0.02 * (lon - 72.68) + 0.01 * (lat - 15.42);
            const spd = Math.sqrt(u * u + v * v);
            rawVectors.push({
              lon: Number(lon.toFixed(2)),
              lat: Number(lat.toFixed(2)),
              current_u: u,
              current_v: v,
              current_speed: spd,
              current_direction_deg: 58.0,
            });
          }
        }
      }

      const streamGeo = generateCurrentStreamlines(rawVectors, {
        investigationBounds: invBounds || undefined,
        viewportBounds: viewportBounds
          ? {
              minLon: viewportBounds.west,
              maxLon: viewportBounds.east,
              minLat: viewportBounds.south,
              maxLat: viewportBounds.north,
            }
          : undefined,
        zoom: mapZoom,
        centerLon: coords.lon,
        centerLat: coords.lat,
      });
      currentSrc.setData(streamGeo as any);
    } else {
      currentSrc.setData({ type: "FeatureCollection", features: [] } as any);
    }

    if (layers.windVectors) {
      let rawWinds: any[] = [];
      if (
        windData &&
        (windData.sample_vectors?.length || windData.points?.length)
      ) {
        rawWinds = windData.sample_vectors || windData.points;
      } else {
        for (let lat = 10.0; lat <= 20.0; lat += 0.5) {
          for (let lon = 68.0; lon <= 76.0; lon += 0.5) {
            const wu = 5.2 + 0.15 * (lat - 15.42) - 0.08 * (lon - 72.68);
            const wv = 3.8 + 0.1 * (lon - 72.68) + 0.05 * (lat - 15.42);
            rawWinds.push({
              lon: Number(lon.toFixed(2)),
              lat: Number(lat.toFixed(2)),
              wind_u: wu,
              wind_v: wv,
              wind_speed: Math.sqrt(wu * wu + wv * wv),
              wind_direction_deg: 235.0,
            });
          }
        }
      }

      const windGeo = generateWindStrokes(rawWinds, {
        investigationBounds: invBounds || undefined,
        viewportBounds: viewportBounds
          ? {
              minLon: viewportBounds.west,
              maxLon: viewportBounds.east,
              minLat: viewportBounds.south,
              maxLat: viewportBounds.north,
            }
          : undefined,
        zoom: mapZoom,
        centerLon: coords.lon,
        centerLat: coords.lat,
      });
      windSrc.setData(windGeo as any);
    } else {
      windSrc.setData({ type: "FeatureCollection", features: [] } as any);
    }
  }, [
    layers.currentVectors,
    layers.windVectors,
    currentsData,
    windData,
    dataMode,
    mapZoom,
    getInvestigationBounds,
    coords.lon,
    coords.lat,
    mapLoaded,
    viewportBounds?.west,
    viewportBounds?.east,
    viewportBounds?.south,
    viewportBounds?.north,
  ]);

  return (
    <div
      className="map-container"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "320px",
        flex: 1,
        overflow: "hidden",
      }}
    >
      <div
        ref={mapContainer}
        className="map-gl"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {cleanMode && (
        <button
          type="button"
          className="map-btn"
          onClick={() => setCleanMode(false)}
          title="Show map controls (Escape)"
          style={{ position: "absolute", top: 14, right: 14, zIndex: 40 }}
        >
          Show controls
        </button>
      )}

      {!cleanMode && (
        <div
          className="map-hud-top-left"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            maxWidth: "420px",
            zIndex: 30,
          }}
        >
          {/* Main Control Pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(7, 12, 19, 0.94)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "3px 4px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            }}
          >
            {/* Zoom In / Out */}
            <div style={{ display: "flex", gap: 2 }}>
              <button
                type="button"
                className="map-btn"
                style={{ padding: "3px 7px", fontSize: "12px", lineHeight: 1 }}
                title="Zoom in"
                onClick={() => map.current?.zoomIn()}
              >
                +
              </button>
              <button
                type="button"
                className="map-btn"
                style={{ padding: "3px 7px", fontSize: "12px", lineHeight: 1 }}
                title="Zoom out"
                onClick={() => map.current?.zoomOut()}
              >
                −
              </button>
            </div>

            <div style={{ width: 1, height: 16, background: "var(--border)" }} />

            {/* 2D / 3D Mode Toggle */}
            <div style={{ display: "flex", gap: 2 }}>
              <button
                type="button"
                className={`map-btn ${viewMode === "2d" ? "map-btn--active" : ""}`}
                style={{ padding: "3px 7px", fontSize: "11px", fontWeight: 700 }}
                onClick={() => handleSetViewMode("2d")}
                title="2D Tactical Map View"
              >
                2D
              </button>
              <button
                type="button"
                className={`map-btn ${viewMode === "3d" ? "map-btn--active" : ""}`}
                style={{ padding: "3px 7px", fontSize: "11px", fontWeight: 700 }}
                onClick={() => handleSetViewMode("3d")}
                title="3D Perspective View"
              >
                3D
              </button>
            </div>

            <div style={{ width: 1, height: 16, background: "var(--border)" }} />

            {/* Fit Scene */}
            <button
              type="button"
              className="map-btn"
              style={{ padding: "3px 7px", fontSize: "11px" }}
              onClick={fitInvestigationCamera}
              title="Recenter and frame the investigation"
            >
              Fit
            </button>

            {/* Basemap Toggle */}
            <button
              type="button"
              className={`map-btn ${basemapMode === "satellite" ? "map-btn--active" : ""}`}
              style={{ padding: "3px 7px", fontSize: "11px" }}
              onClick={() =>
                setBasemap(basemapMode === "satellite" ? "dark" : "satellite")
              }
              title="Toggle satellite imagery basemap"
            >
              {basemapMode === "satellite" ? "Satellite" : "Dark"}
            </button>

            <div style={{ width: 1, height: 16, background: "var(--border)" }} />

            {/* Tools Dropdown Button */}
            <button
              type="button"
              className={`map-btn ${toolsMenuOpen ? "map-btn--active" : ""}`}
              style={{ padding: "3px 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: 4 }}
              onClick={() => {
                setToolsMenuOpen(!toolsMenuOpen);
                if (vesselsMenuOpen) setVesselsMenuOpen(false);
              }}
              title="Toggle Map Tools & Camera Presets"
            >
              <span>Tools</span>
              <span style={{ fontSize: "9px" }}>{toolsMenuOpen ? "▲" : "▼"}</span>
            </button>

            {/* Suspect Vessels Dropdown Button (if available) */}
            {attributions && attributions.length > 0 && (
              <button
                type="button"
                className={`map-btn ${vesselsMenuOpen ? "map-btn--active" : ""}`}
                style={{
                  padding: "3px 8px",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  color: "#F59E0B",
                }}
                onClick={() => {
                  setVesselsMenuOpen(!vesselsMenuOpen);
                  if (toolsMenuOpen) setToolsMenuOpen(false);
                }}
                title="Inspect Suspect Candidate Vessels"
              >
                <span>Suspects ({Math.min(attributions.length, 3)})</span>
                <span style={{ fontSize: "9px" }}>{vesselsMenuOpen ? "▲" : "▼"}</span>
              </button>
            )}
          </div>

          {/* Tools Menu Dropdown Popover */}
          {toolsMenuOpen && (
            <div
              style={{
                background: "rgba(7, 12, 19, 0.96)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "8px 10px",
                backdropFilter: "blur(12px)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.65)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {/* Camera Presets in 3D */}
              {viewMode === "3d" && (
                <div>
                  <div style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginBottom: 4 }}>
                    CAMERA PRESETS
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {[
                      { id: "investigation", label: "Overview" },
                      { id: "vessel", label: "Lead Vessel" },
                      { id: "origin", label: "Origin" },
                      { id: "slick", label: "Slick" },
                      { id: "full", label: "Full Region" },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`map-btn ${activeCameraPreset === preset.id ? "map-btn--active" : ""}`}
                        style={{ fontSize: "10.5px", padding: "2px 6px" }}
                        onClick={() => {
                          applyCameraPreset(preset.id as any);
                          setToolsMenuOpen(false);
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Map Controls */}
              <div>
                <div style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginBottom: 4 }}>
                  MAP OVERLAYS & VIEW
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  <button
                    type="button"
                    className={`map-btn ${incidentFocus ? "map-btn--active" : ""}`}
                    style={{ fontSize: "10.5px", padding: "2px 6px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIncidentFocus(!incidentFocus);
                    }}
                  >
                    Focus Mode {incidentFocus ? "✓" : ""}
                  </button>
                  <button
                    type="button"
                    className={`map-btn ${layers.flowAnimation ? "map-btn--active" : ""}`}
                    style={{ fontSize: "10.5px", padding: "2px 6px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLayer("flowAnimation", !layers.flowAnimation);
                    }}
                  >
                    Current Flow {layers.flowAnimation ? "ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    className={`map-btn ${showDiagnostics ? "map-btn--active" : ""}`}
                    style={{ fontSize: "10.5px", padding: "2px 6px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDiagnostics(!showDiagnostics);
                      setToolsMenuOpen(false);
                    }}
                  >
                    Diagnostics
                  </button>
                  <button
                    type="button"
                    className="map-btn"
                    style={{ fontSize: "10.5px", padding: "2px 6px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCleanMode(true);
                      setToolsMenuOpen(false);
                    }}
                  >
                    Clean View
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Suspect Vessels Dropdown Popover */}
          {vesselsMenuOpen && attributions && attributions.length > 0 && (
            <div
              style={{
                background: "rgba(7, 12, 19, 0.96)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "8px 10px",
                backdropFilter: "blur(12px)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.65)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              <div style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginBottom: 2 }}>
                PRIMARY SUSPECT VESSELS
              </div>
              {attributions.slice(0, 5).map((candidate) => (
                <button
                  key={candidate.mmsi}
                  type="button"
                  className={`map-btn ${String(candidate.mmsi) === String(inspectedVessel?.mmsi || selectedMmsi) ? "map-btn--active" : ""}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 8px",
                    fontSize: "11px",
                    width: "100%",
                  }}
                  onClick={() => {
                    onVesselClickRef.current?.(candidate.mmsi);
                    const track = tracks?.find(
                      (item) => String(item.mmsi) === String(candidate.mmsi),
                    );
                    if (!track) return;
                    const state = getInterpolatedVesselState(
                      track,
                      activeTimeline,
                    );
                    setInspectedVessel({
                      ...state,
                      mmsi: candidate.mmsi,
                      vessel_name:
                        candidate.vessel_name ||
                        track.vessel_name ||
                        `MMSI ${candidate.mmsi}`,
                      vessel_type:
                        candidate.vessel_type ||
                        track.vessel_type ||
                        "Commercial Vessel",
                      rank: candidate.rank,
                      final_score: candidate.final_score,
                      distance_km: candidate.distance_km,
                      flag: candidate.flag || "—",
                    });
                    map.current?.easeTo({
                      center: [state.lon, state.lat],
                      zoom: 11.5,
                      duration: 700,
                    });
                    setVesselsMenuOpen(false);
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    #{candidate.rank} {candidate.vessel_name || candidate.mmsi}
                  </span>
                  <span style={{ color: "#10B981", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    {(candidate.final_score * 100).toFixed(0)}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Developer Diagnostic Geographic Extent Overlay - Rendered in dedicated bottom-right inspector if enabled */}


      {/* ── Top-Left Floating Diagnostics Panel ── */}
      {showDiagnostics && !cleanMode && (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 14,
            background: "rgba(7, 17, 31, 0.94)",
            border: "1px solid rgba(0, 217, 232, 0.5)",
            borderRadius: "var(--radius-sm, 4px)",
            padding: "10px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--text-primary)",
            zIndex: 40,
            minWidth: 320,
            maxWidth: 360,
            boxShadow: "0 8px 24px rgba(0,0,0,0.65)",
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
              borderBottom: "1px solid var(--border)",
              paddingBottom: 4,
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: "var(--accent)",
                letterSpacing: "0.04em",
              }}
            >
              GEOGRAPHIC EXTENT DIAGNOSTICS
            </span>
            <button
              onClick={() => setShowDiagnostics(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              ✕
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "130px 1fr",
              gap: "3px 8px",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>DATA DOMAIN:</span>
            <span style={{ color: "#00D9E8" }}>68.0–76.0°E, 10.0–20.0°N</span>

            <span style={{ color: "var(--text-muted)" }}>INVESTIGATION:</span>
            <span style={{ color: "#A879FF" }}>
              {(() => {
                const inv = getInvestigationBounds();
                return inv
                  ? `${inv.minLon.toFixed(2)}–${inv.maxLon.toFixed(2)}°E, ${inv.minLat.toFixed(2)}–${inv.maxLat.toFixed(2)}°N`
                  : "Awaiting geometry...";
              })()}
            </span>

            <span style={{ color: "var(--text-muted)" }}>CAMERA ZOOM:</span>
            <span>
              {zoom.toFixed(1)}x (pitch: {pitch}°, bearing: {bearing}°)
            </span>

            <span style={{ color: "var(--text-muted)" }}>VIEWPORT:</span>
            <span>
              {viewportBounds
                ? `${viewportBounds.west.toFixed(2)}–${viewportBounds.east.toFixed(2)}°E, ${viewportBounds.south.toFixed(2)}–${viewportBounds.north.toFixed(2)}°N`
                : "Tracking..."}
            </span>

            <span style={{ color: "var(--text-muted)" }}>FORECAST EXTENT:</span>
            <span>
              {(() => {
                if (!forecast?.particles?.length) return "None computed";
                let fMinLo = Infinity,
                  fMaxLo = -Infinity,
                  fMinLa = Infinity,
                  fMaxLa = -Infinity;
                forecast.particles.forEach((p: any) => {
                  p.trajectory?.forEach((t: any) => {
                    if (t.lon < fMinLo) fMinLo = t.lon;
                    if (t.lon > fMaxLo) fMaxLo = t.lon;
                    if (t.lat < fMinLa) fMinLa = t.lat;
                    if (t.lat > fMaxLa) fMaxLa = t.lat;
                  });
                });
                return `${fMinLo.toFixed(2)}–${fMaxLo.toFixed(2)}°E, ${fMinLa.toFixed(2)}–${fMaxLa.toFixed(2)}°N (${forecast.particles.length} pts)`;
              })()}
            </span>

            <span style={{ color: "var(--text-muted)" }}>HINDCAST EXTENT:</span>
            <span>
              {(() => {
                if (!hindcast) return "None";
                const hLon =
                  hindcast.origin_lon ??
                  safeGeoJson(hindcast.origin_centroid_geojson)
                    ?.coordinates?.[0];
                const hLat =
                  hindcast.origin_lat ??
                  safeGeoJson(hindcast.origin_centroid_geojson)
                    ?.coordinates?.[1];
                const hrs =
                  hindcast.hindcast_hours || hindcast.integration_hours || 18;
                if (typeof hLon === "number" && typeof hLat === "number") {
                  return `${hLon.toFixed(2)}°E, ${hLat.toFixed(2)}°N (T-${hrs}h)`;
                }
                return "None";
              })()}
            </span>
          </div>
        </div>
      )}

      {/* Clean Mode Exit Button */}
      {cleanMode && (
        <div style={{ position: "absolute", top: 14, right: 14, zIndex: 90 }}>
          <button
            type="button"
            className="map-btn map-btn--active"
            onClick={() => setCleanMode(false)}
            style={{ padding: "8px 14px", fontWeight: 800, fontSize: "11.5px", background: "var(--accent)", color: "#0A0F1D", boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }}
          >
            <span>✕</span>
            <span>EXIT CLEAN MODE</span>
          </button>
        </div>
      )}

      {/* Top Right: Layer Control HUD */}
      {!cleanMode && <div className="map-hud-top-right">{children}</div>}

      {/* Docked Smart Maritime Inspector (Bottom-Right, Never blocks center) */}
      {inspectedVessel && !cleanMode && (
        <div
          style={{
            position: "absolute",
            bottom: 68,
            right: 14,
            zIndex: 25,
            width: "310px",
            background: "rgba(11, 15, 20, 0.94)",
            border: "1px solid var(--border-strong, #334155)",
            borderRadius: "var(--radius-sm, 4px)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.7)",
            backdropFilter: "blur(10px)",
            padding: "12px 14px",
            fontFamily: "var(--font-sans, sans-serif)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  letterSpacing: "0.4px",
                }}
              >
                {inspectedVessel.vessel_name || `MMSI ${inspectedVessel.mmsi}`}
              </div>
              <div
                className="mono"
                style={{ fontSize: "10px", color: "var(--text-muted)" }}
              >
                MMSI: {inspectedVessel.mmsi} • FLAG:{" "}
                {inspectedVessel.flag || "—"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInspectedVessel(null)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "13px",
                padding: "2px 4px",
              }}
              title="Close inspector"
            >
              ✕
            </button>
          </div>

          {/* Candidate Status Badge */}
          <div style={{ margin: "6px 0 8px" }}>
            <span
              className="mono"
              style={{
                fontSize: "9px",
                padding: "2px 6px",
                borderRadius: "2px",
                fontWeight: 700,
                display: "inline-block",
                background:
                  inspectedVessel.rank === 1
                    ? "rgba(245,158,11,0.2)"
                    : inspectedVessel.rank
                      ? "rgba(56,189,248,0.2)"
                      : "var(--surface-3)",
                color:
                  inspectedVessel.rank === 1
                    ? "#F59E0B"
                    : inspectedVessel.rank
                      ? "#38BDF8"
                      : "var(--text-secondary)",
                border: `1px solid ${
                  inspectedVessel.rank === 1
                    ? "#F59E0B"
                    : inspectedVessel.rank
                      ? "#38BDF8"
                      : "var(--border)"
                }`,
              }}
            >
              {inspectedVessel.rank === 1
                ? "RANK #1 • EVIDENCE-COMPATIBLE CANDIDATE"
                : inspectedVessel.rank
                  ? `RANK #${inspectedVessel.rank} • SUSPECT CANDIDATE VESSEL`
                  : "COMMERCIAL MARITIME VESSEL"}
            </span>
          </div>

          {/* Vessel Specs & Telemetry Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px 8px",
              fontSize: "11px",
              padding: "6px 0",
              borderTop: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div>
              <span
                style={{ color: "var(--text-secondary)", fontSize: "10px" }}
              >
                Class:{" "}
              </span>
              <strong>{inspectedVessel.vessel_type || "Commercial"}</strong>
            </div>
            <div>
              <span
                style={{ color: "var(--text-secondary)", fontSize: "10px" }}
              >
                Length:{" "}
              </span>
              <span className="mono">{inspectedVessel.length_m || 110} m</span>
            </div>
            <div>
              <span
                style={{ color: "var(--text-secondary)", fontSize: "10px" }}
              >
                SOG / Speed:{" "}
              </span>
              <span className="mono">
                {inspectedVessel.sog || inspectedVessel.speed || 12.4} kn
              </span>
            </div>
            <div>
              <span
                style={{ color: "var(--text-secondary)", fontSize: "10px" }}
              >
                Heading / COG:{" "}
              </span>
              <span className="mono">
                {Math.round(
                  inspectedVessel.heading != null
                    ? inspectedVessel.heading
                    : inspectedVessel.cog || 0,
                )}
                °
              </span>
            </div>
            {inspectedVessel.final_score != null && (
              <div>
                <span
                  style={{ color: "var(--text-secondary)", fontSize: "10px" }}
                >
                  Correlation:{" "}
                </span>
                <span
                  className="mono"
                  style={{ color: "#F59E0B", fontWeight: 700 }}
                >
                  {(Number(inspectedVessel.final_score) * 100).toFixed(1)}%
                </span>
              </div>
            )}
            {inspectedVessel.distance_km != null && (
              <div>
                <span
                  style={{ color: "var(--text-secondary)", fontSize: "10px" }}
                >
                  Origin Dist:{" "}
                </span>
                <span className="mono">
                  {scaleUnit === "nm"
                    ? `${(Number(inspectedVessel.distance_km) * 0.539957).toFixed(2)} NM`
                    : `${Number(inspectedVessel.distance_km).toFixed(2)} km`}
                </span>
              </div>
            )}
          </div>

          {/* Quick Actions Footer */}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button
              type="button"
              className="map-btn"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => {
                map.current?.easeTo({
                  center: [inspectedVessel.lon, inspectedVessel.lat],
                  zoom: 12.2,
                  pitch: viewMode === "3d" ? 58 : 0,
                  bearing: viewMode === "3d" ? -18 : 0,
                  duration: 700,
                });
              }}
            >
              FOCUS
            </button>
            <button
              type="button"
              className={`map-btn ${routeReconstructionActive ? "map-btn--active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() =>
                setRouteReconstructionActive(!routeReconstructionActive)
              }
              title="Toggle Route Tie-Line connecting vessel to reconstructed discharge origin"
            >
              ROUTE TIE
            </button>
            <button
              type="button"
              className="map-btn"
              style={{ color: "var(--accent, #00E5FF)" }}
              onClick={() => {
                if (onVesselClickRef.current)
                  onVesselClickRef.current(String(inspectedVessel.mmsi));
              }}
              title="Open full evidence factor matrix in side panel"
            >
              DOSSIER →
            </button>
          </div>
        </div>
      )}

      {/* Docked Scientific Metocean & Forensic Symbology Legend */}
      {!cleanMode && (
        <div className={`map-legend-dock ${legendOpen ? "expanded" : ""}`}>
          <div className="map-legend-title">
            <span>METOCEAN & FORENSIC</span>
            <button
              type="button"
              className="map-legend-toggle"
              onClick={() => setLegendOpen(!legendOpen)}
              title={legendOpen ? "Collapse Legend" : "Expand Legend"}
            >
              {legendOpen ? "▲" : "▼"}
            </button>
          </div>
          {legendOpen && (
            <>
              {/* Ocean Current Speed Color Scale */}
              <div className="map-legend-row">
                <span className="map-legend-label">CURRENT SPEED (m/s)</span>
                <div className="map-legend-ramp-bar" />
                <div className="map-legend-ramp-ticks">
                  <span>0.0</span>
                  <span>0.2</span>
                  <span>0.5</span>
                  <span>1.0</span>
                  <span>1.5+</span>
                </div>
              </div>

              {/* Wind Vector Atmospheric Forcing */}
              <div
                className="map-legend-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className="map-legend-label" style={{ marginBottom: 0 }}>
                  WIND FORCING (ERA5)
                </span>
                <span
                  className="mono"
                  style={{ fontSize: "9px", color: "#38BDF8" }}
                >
                  10m METOCEAN
                </span>
              </div>

              {/* Investigation Symbology Grid */}
              <div className="map-legend-grid">
                <div className="map-legend-item">
                  <span
                    className="map-legend-swatch"
                    style={{ background: "#FF7A00" }}
                  />
                  <span>Observed Slick</span>
                </div>
                <div className="map-legend-item">
                  <span
                    className="map-legend-swatch"
                    style={{
                      background: "#A879FF",
                      border: "1px dashed #FFFFFF",
                    }}
                  />
                  <span>Origin / Hindcast</span>
                </div>
                <div className="map-legend-item">
                  <span
                    className="map-legend-swatch"
                    style={{ background: "#8D7CFF", opacity: 0.7 }}
                  />
                  <span>Forecast Plume</span>
                </div>
                <div className="map-legend-item">
                  <span
                    className="map-legend-swatch"
                    style={{ background: "#F5B82E", borderRadius: "50%" }}
                  />
                  <span>Candidate Vessel</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Mini Overview Map Inset (Bottom-Left above Legend) */}
      {miniMap && !cleanMode && (
        <div
          style={{
            position: "absolute",
            bottom: legendOpen ? 238 : 110,
            left: 14,
            zIndex: 20,
            width: "124px",
            height: "84px",
            background: "rgba(7, 17, 31, 0.94)",
            border: "1px solid var(--border-strong, #2C415A)",
            borderRadius: "var(--radius-sm, 4px)",
            overflow: "hidden",
            boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
            display: "flex",
            flexDirection: "column",
            transition: "bottom 0.2s ease",
          }}
        >
          <div
            style={{
              padding: "2px 6px",
              fontSize: "8px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              background: "rgba(255,255,255,0.03)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>ARABIAN SEA</span>
            <span>OVERVIEW</span>
          </div>
          <svg
            style={{
              flex: 1,
              width: "100%",
              height: "100%",
              background: "#07111F",
            }}
            viewBox="0 0 120 70"
          >
            {/* India West Coastline contour */}
            <path
              d="M 85 0 L 80 18 L 74 38 L 68 55 L 62 70"
              fill="none"
              stroke="#2C415A"
              strokeWidth="1.5"
            />
            {/* Shelf break (200m isobath) */}
            <path
              d="M 50 0 L 46 20 L 42 42 L 36 70"
              fill="none"
              stroke="#0369A1"
              strokeWidth="0.8"
              strokeDasharray="2 2"
            />
            {/* Incident bounding box */}
            <rect
              x="40"
              y="24"
              width="18"
              height="14"
              fill="rgba(255,122,0,0.25)"
              stroke="#FF7A00"
              strokeWidth="1"
            />
            {/* Viewport indicator */}
            <circle cx="49" cy="31" r="2.5" fill="#00D9E8" />
          </svg>
        </div>
      )}

      {/* Integrated Bottom Investigation Timeline */}
      {!cleanMode && (
        <div
          style={{
            position: "absolute",
            bottom: 50,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 15,
            width: "calc(100% - 360px)",
            maxWidth: "680px",
            background: "rgba(7, 11, 18, 0.95)",
            border: "1px solid var(--border-strong)",
            borderRadius: "6px",
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            boxShadow: "0 6px 24px rgba(0,0,0,0.7)",
            backdropFilter: "blur(10px)",
          }}
        >
          {/* Play / Pause & Step Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="map-btn"
              style={{ padding: "4px 8px", fontSize: "11px", fontWeight: 800, color: "#FFFFFF" }}
              onClick={() => setTimelinePlaying(!timelinePlaying)}
              title={
                timelinePlaying
                  ? "Pause timeline playback"
                  : "Play timeline drift playback"
              }
            >
              {timelinePlaying ? "⏸" : "▶"}
            </button>
            <button
              type="button"
              className="map-btn"
              style={{ padding: "4px 8px", fontSize: "11px", fontWeight: 800, color: "#F59E0B" }}
              onClick={() => setTimelinePosition(0)}
              title="Reset timeline to -18h Reconstructed Origin"
            >
              ⏮
            </button>
            <button
              type="button"
              className="map-btn"
              style={{ padding: "4px 8px", fontSize: "11px", fontWeight: 800, color: "#FFFFFF" }}
              onClick={() => setTimelinePosition(0.5)}
              title="Jump to T0 (Observed Satellite Acquisition)"
            >
              T0
            </button>
            <button
              type="button"
              className="map-btn"
              style={{ padding: "4px 8px", fontSize: "11px", fontWeight: 800, color: "#A78BFA" }}
              onClick={() => setTimelinePosition(1)}
              title="Jump to +48h Predicted Dispersion"
            >
              ⏭
            </button>
          </div>

          {/* Timeline Scrubber Container */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                fontWeight: 800,
              }}
            >
              <span style={{ color: "#F59E0B" }}>-18h (RECONSTRUCTED)</span>
              <span style={{ color: "#FFFFFF" }}>
                T0 (OBSERVED 06:00 UTC)
              </span>
              <span style={{ color: "#A78BFA" }}>+48h (PREDICTED)</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.005"
              value={activeTimeline}
              onChange={(e) => setTimelinePosition(parseFloat(e.target.value))}
              style={{
                width: "100%",
                cursor: "pointer",
                accentColor: activeTimeline <= 0.5 ? "#F59E0B" : "#A78BFA",
                height: "5px",
              }}
            />
          </div>

          {/* Speed Toggle */}
          <button
            type="button"
            className="map-btn"
            style={{ padding: "4px 8px", fontSize: "10px", fontWeight: 800, color: "#FFFFFF", flexShrink: 0 }}
            onClick={() =>
              setTimelineSpeed(
                timelineSpeed === 1 ? 2 : timelineSpeed === 2 ? 5 : 1,
              )
            }
            title="Toggle playback speed (1x, 2x, 5x)"
          >
            {timelineSpeed}x
          </button>
        </div>
      )}

      {/* Bottom Telemetry Bar (Strictly 2 Lines, Zero Scrollbars) */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(7, 11, 18, 0.96)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: "4px 14px",
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          color: "#FFFFFF",
          zIndex: 10,
          gap: "2px",
          height: "44px",
          maxHeight: "44px",
          overflow: "hidden",
          overflowX: "hidden",
          overflowY: "hidden",
          boxSizing: "border-box",
          backdropFilter: "blur(8px)",
        }}
      >
        {/* Line 1: Incident Identity & Temporal Spatial Coordinates */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "nowrap",
            whiteSpace: "nowrap",
            overflow: "hidden",
            lineHeight: "18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden", textOverflow: "ellipsis" }}>
            <span>
              <span style={{ color: "#00E5FF", fontSize: "10.5px", fontWeight: 800 }}>INCIDENT: </span>
              <strong style={{ color: "#FFFFFF", fontWeight: 800 }}>
                {spill?.incident_name || "Arabian Sea Oil Spill"}
              </strong>
            </span>
            <span style={{ color: "rgba(255,255,255,0.25)" }}>|</span>
            <span>
              <span style={{ color: "#00E5FF", fontSize: "10.5px", fontWeight: 800 }}>UTC: </span>
              <span style={{ color: "#FFFFFF", fontWeight: 700 }}>15 MAR 2024 06:00</span>
            </span>
          </div>
          <div style={{ flexShrink: 0 }}>
            <span style={{ color: "#00E5FF", fontSize: "10.5px", fontWeight: 800 }}>CENTER: </span>
            <span style={{ color: "#FFFFFF", fontWeight: 700 }}>
              {coords.lat >= 0 ? `${coords.lat.toFixed(3)}°N` : `${Math.abs(coords.lat).toFixed(3)}°S`}{" "}
              {coords.lon >= 0 ? `${coords.lon.toFixed(3)}°E` : `${Math.abs(coords.lon).toFixed(3)}°W`}
            </span>
          </div>
        </div>

        {/* Line 2: Camera Telemetry & Environmental Source */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "nowrap",
            whiteSpace: "nowrap",
            overflow: "hidden",
            lineHeight: "18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
            <span
              onClick={() => map.current?.easeTo({ bearing: 0, pitch: 0, duration: 600 })}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#FFFFFF" }}
              title="Reset North rotation"
            >
              <span style={{ transform: `rotate(${-bearing}deg)`, display: "inline-block", color: "#00E5FF" }}>▲</span>
              <span style={{ fontWeight: 800 }}>{bearing >= 0 ? `${Math.round(bearing)}°` : `${Math.round(360 + bearing)}°`} N</span>
            </span>
            <span style={{ color: "rgba(255,255,255,0.25)" }}>|</span>
            <span style={{ color: "#FFFFFF", fontWeight: 600 }}>PITCH {Math.round(pitch)}°</span>
            <span style={{ color: "rgba(255,255,255,0.25)" }}>|</span>
            <span style={{ color: "#FFFFFF", fontWeight: 600 }}>ZOOM {zoom.toFixed(1)}x</span>
            <span style={{ color: "rgba(255,255,255,0.25)" }}>|</span>
            <span
              onClick={() => setScaleUnit(scaleUnit === "nm" ? "km" : "nm")}
              style={{ cursor: "pointer", color: "#00E5FF", fontWeight: 800 }}
              title="Switch scale unit"
            >
              SCALE: {scaleUnit.toUpperCase()}
            </span>
          </div>
          <div style={{ flexShrink: 0 }}>
            <span style={{ color: dataMode === "real" ? "#10B981" : "#F59E0B", fontWeight: 800 }}>
              {dataMode === "real" ? "COPERNICUS MARINE + CDS ERA5" : "SYNTHETIC HYDRODYNAMICS"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
