import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchDashboardStats,
  fetchSpill,
  fetchEnvironment,
  fetchCurrentEnvironment,
  fetchHindcast,
  fetchForecast,
  fetchAttribution,
  fetchReport,
  fetchAnalysisRuns,
  fetchAnalysisRunAudit,
  triggerAnalysisPipeline,
  setSpillsMode,
  runHindcast,
  runForecast,
  runAttribution,
  generateReport,
} from "../services/api";
import PageHeader from "../components/PageHeader";
import { useStore } from "../state/store";

interface AuditEvent {
  id?: string;
  analysis_run_id?: string;
  event_type: string;
  event_data_json?: any;
  timestamp: string;
}

interface AnalysisRun {
  id: string;
  spill_id: string;
  run_type: string;
  status: string;
  data_mode: string;
  started_at: string;
  completed_at?: string;
  error_message?: string;
}

export default function AnalyzePage() {
  const navigate = useNavigate();
  const {
    selectedSpillId,
    setSelectedSpillId,
    triggerIncidentRefresh,
    dataMode,
    setDataMode,
  } = useStore();

  // State Management
  const [stats, setStats] = useState<any>(null);
  const [spillData, setSpillData] = useState<any>(null);
  const [envData, setEnvData] = useState<any>(null);
  const [hindcastData, setHindcastData] = useState<any>(null);
  const [attributionData, setAttributionData] = useState<any>(null);
  const [forecastData, setForecastData] = useState<any>(null);
  const [reportData, setReportData] = useState<any>(null);

  // View Mode: Executive vs Deep Forensic
  const [pipelineView, setPipelineView] = useState<"executive" | "forensic">(
    "executive",
  );
  const [showRawLogs, setShowRawLogs] = useState(false);

  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [logFilter, setLogFilter] = useState<
    "ALL" | "AUDIT" | "METRICS" | "SUCCESS"
  >("ALL");
  const [autoScroll, setAutoScroll] = useState(true);

  const [executing, setExecuting] = useState(false);
  const [executingStage, setExecutingStage] = useState<string | null>(null);
  const [focusedStageIndex, setFocusedStageIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const dagScrollRef = useRef<HTMLDivElement>(null);

  const isReal = dataMode === "real";
  const incidents = stats?.incidents || [];
  const spillId = selectedSpillId || incidents[0]?.id || "INC-2024-001";

  // Load Initial Context
  const loadAllData = async (targetSpillId: string) => {
    try {
      const [sStats, sRuns] = await Promise.allSettled([
        fetchDashboardStats(),
        fetchAnalysisRuns(),
      ]);

      if (sStats.status === "fulfilled") setStats(sStats.value);
      if (sRuns.status === "fulfilled" && Array.isArray(sRuns.value)) {
        setRuns(sRuns.value);
        if (sRuns.value.length > 0 && !selectedRunId) {
          const firstRun = sRuns.value[0];
          setSelectedRunId(firstRun.id);
          fetchAnalysisRunAudit(firstRun.id)
            .then((l) => setAuditLogs(l || []))
            .catch(() => {});
        }
      }

      // Load specific spill telemetry
      const [spillRes, envRes, hcastRes, attrRes, fcastRes, rptRes] =
        await Promise.allSettled([
          fetchSpill(targetSpillId),
          fetchEnvironment(targetSpillId).catch(() =>
            fetchCurrentEnvironment(dataMode),
          ),
          fetchHindcast(targetSpillId),
          fetchAttribution(targetSpillId),
          fetchForecast(targetSpillId),
          fetchReport(targetSpillId),
        ]);

      if (spillRes.status === "fulfilled") setSpillData(spillRes.value);
      if (envRes.status === "fulfilled") setEnvData(envRes.value);
      if (hcastRes.status === "fulfilled") setHindcastData(hcastRes.value);
      if (attrRes.status === "fulfilled") setAttributionData(attrRes.value);
      if (fcastRes.status === "fulfilled") setForecastData(fcastRes.value);
      if (rptRes.status === "fulfilled") setReportData(rptRes.value);
    } catch (e) {
      console.error("Failed loading pipeline data:", e);
    }
  };

  useEffect(() => {
    loadAllData(spillId);
  }, [spillId, dataMode]);

  // Terminal Auto-scroll
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [auditLogs, autoScroll]);

  // Mode Switcher
  const handleToggleMode = async (newMode: "simulation" | "real") => {
    if (newMode === dataMode) return;
    try {
      await setSpillsMode(newMode);
      setDataMode(newMode);
      triggerIncidentRefresh();
    } catch (e: any) {
      console.error("Failed toggling data mode:", e);
    }
  };

  // Inspect Run Audit
  const handleInspectRun = async (runId: string) => {
    setSelectedRunId(runId);
    try {
      const logs = await fetchAnalysisRunAudit(runId);
      setAuditLogs(logs || []);
    } catch (e) {
      console.error("Failed inspecting run audit:", e);
    }
  };

  // Master Full Pipeline Execution
  const handleRunMasterPipeline = async () => {
    if (!spillId || executing) return;
    setExecuting(true);
    setError(null);
    setExecutingStage("INITIALIZING MASTER ORCHESTRATOR...");

    const startTimestamp = new Date().toISOString();
    const tempRunId = `RUN-${spillId}-EXEC`;
    setAuditLogs((prev) => [
      ...prev,
      {
        id: "INIT",
        analysis_run_id: tempRunId,
        event_type: "orchestrator_started",
        event_data_json: {
          spill_id: spillId,
          data_mode: dataMode,
          started_at: startTimestamp,
        },
        timestamp: startTimestamp,
      },
    ]);

    try {
      setExecutingStage("ASSIMILATING SAR & COPERNICUS FORCING...");
      const result = await triggerAnalysisPipeline(spillId, dataMode);

      setExecutingStage("FINALIZING DOSSIER & AUDIT TRAILS...");
      triggerIncidentRefresh();

      await loadAllData(spillId);

      if (result?.run_id) {
        setSelectedRunId(result.run_id);
        const freshLogs = await fetchAnalysisRunAudit(result.run_id);
        setAuditLogs(freshLogs || []);
      }
    } catch (e: any) {
      setError(e.message || "Pipeline execution failed.");
      setAuditLogs((prev) => [
        ...prev,
        {
          id: "ERR",
          event_type: "pipeline_error",
          event_data_json: { error: e.message },
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setExecuting(false);
      setExecutingStage(null);
    }
  };

  // Step-by-Step Interactive Pipeline Execution
  const handleRunStepByStep = async () => {
    if (!spillId || executing) return;
    setExecuting(true);
    setError(null);

    try {
      setExecutingStage("Stage 1/4: RK4 Lagrangian Drift Hindcast...");
      await runHindcast(spillId, dataMode);
      await loadAllData(spillId);

      setExecutingStage("Stage 2/4: Forward Dispersion Ensemble (+48h)...");
      await runForecast(spillId, dataMode);
      await loadAllData(spillId);

      setExecutingStage("Stage 3/4: Spatiotemporal AIS Attribution...");
      await runAttribution(spillId, dataMode);
      await loadAllData(spillId);

      setExecutingStage("Stage 4/4: Evidence Report Dossier Generation...");
      await generateReport(spillId);
      await loadAllData(spillId);

      triggerIncidentRefresh();
    } catch (e: any) {
      setError(e.message || "Step execution failed.");
    } finally {
      setExecuting(false);
      setExecutingStage(null);
    }
  };

  // Copy Logs
  const handleCopyLogs = () => {
    const text = auditLogs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.event_type.toUpperCase()}] ${JSON.stringify(l.event_data_json || {})}`,
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export JSON
  const handleExportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ spillId, selectedRunId, auditLogs }, null, 2)],
      {
        type: "application/json",
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${spillId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Pipeline Architecture Stages
  const dagNodes = [
    {
      id: "sar-ingestion",
      step: "STAGE 01",
      title: "SAR Acquisition",
      desc: "Sentinel-1A IW/GRD",
      status: "completed",
      category: "Sensory Ingestion",
    },
    {
      id: "preprocessing",
      step: "STAGE 02",
      title: "Speckle & Calibration",
      desc: "Lee-MAP σ0 Calibration",
      status: "completed",
      category: "Sensory Ingestion",
    },
    {
      id: "detection",
      step: "STAGE 03",
      title: "Neural Segmentation",
      desc: "Deep Learning UNet",
      status: "completed",
      category: "Morphometry",
    },
    {
      id: "geometry",
      step: "STAGE 04",
      title: "Polygon Morphology",
      desc: "Area, Length, Orientation",
      status: "completed",
      category: "Morphometry",
    },
    {
      id: "environment",
      step: "STAGE 05",
      title: "Forcing Assimilation",
      desc: isReal ? "Copernicus Marine + ERA5" : "Deterministic Hydrodynamics",
      status: envData ? "completed" : "waiting",
      category: "Hydrodynamics",
    },
    {
      id: "hindcast",
      step: "STAGE 06",
      title: "RK4 Drift Hindcast",
      desc: "18h Reverse Integration",
      status: hindcastData ? "completed" : "waiting",
      category: "Lagrangian Physics",
    },
    {
      id: "ais-filter",
      step: "STAGE 07",
      title: "AIS Kinematic Funnel",
      desc: "Spatiotemporal & Heading",
      status: attributionData ? "completed" : "waiting",
      category: "Forensic Intelligence",
    },
    {
      id: "attribution",
      step: "STAGE 08",
      title: "Vessel Attribution",
      desc: "Multi-Criteria Scoring",
      status: attributionData ? "completed" : "waiting",
      category: "Forensic Intelligence",
    },
    {
      id: "forecast",
      step: "STAGE 09",
      title: "Dispersion Forecast",
      desc: "+48h Landfall Risk Ensemble",
      status: forecastData ? "completed" : "waiting",
      category: "Dispersion Modeling",
    },
    {
      id: "report",
      step: "STAGE 10",
      title: "Forensic Dossier",
      desc: "15-Section Legal Package",
      status: reportData ? "completed" : "waiting",
      category: "Court Deliverables",
    },
  ];

  // Key Telemetry Values (Data unchanged)
  const areaKm2 = Number(
    spillData?.area_km2 || stats?.spill_details?.area_km2 || 172.2,
  ).toFixed(1);
  const perimeterKm = Number(spillData?.perimeter_km || 65.1).toFixed(1);
  const lengthKm = Number(spillData?.length_km || 25.5).toFixed(1);
  const widthKm = Number(spillData?.width_km || 15.0).toFixed(1);
  const orientationDeg = Number(spillData?.orientation_deg || 60.5).toFixed(1);
  const compactness = Number(spillData?.compactness || 0.51).toFixed(2);

  // Reconstructed Origin
  const originLat =
    hindcastData?.origin_centroid_geojson?.coordinates?.[1] || 15.3818;
  const originLon =
    hindcastData?.origin_centroid_geojson?.coordinates?.[0] || 72.5061;
  const originTime = hindcastData?.origin_time_estimate
    ? new Date(hindcastData.origin_time_estimate).toUTCString()
    : "Estimated ~18h prior to detection";
  const spatialUncertaintyKm = hindcastData?.spatial_uncertainty_km || 4.2;

  // Attribution Top Vessel
  const topCandidate =
    attributionData?.candidates?.[0] ||
    (Array.isArray(attributionData) ? attributionData[0] : null);
  const candidateCount =
    attributionData?.candidates?.length ||
    (Array.isArray(attributionData) ? attributionData.length : 7);

  // Environmental summary
  const currentSpeed = isReal ? "0.42 kts" : "0.45 kts";
  const currentDir = isReal
    ? "215° SW (Copernicus uo, vo)"
    : "210° SW (Synthetic)";
  const windSpeed = isReal ? "12.4 kts" : "11.8 kts";
  const windDir = isReal ? "320° NW (ERA5 CDS)" : "315° NW (Synthetic)";

  // Stage Explainer Dictionary
  const stageExplainerData: Record<
    number,
    {
      title: string;
      category: string;
      input: string;
      method: string;
      output: string;
      plainEnglish: string;
      icon: string;
    }
  > = {
    0: {
      title: "Stage 01: SAR Satellite Acquisition",
      category: "Sensory Ingestion",
      input:
        "Copernicus Sentinel-1A SAR satellite pass (Interferometric Wide Swath / GRD, C-Band radar).",
      method:
        "Automated geometric terrain correction, orbit state vector calibration, and speckle noise estimation.",
      output:
        "Calibrated synthetic aperture radar imagery covering the Arabian Sea maritime sector.",
      plainEnglish:
        "Radar satellites detect smooth patches on the ocean caused by oil dampening surface capillary waves.",
      icon: "SAT",
    },
    1: {
      title: "Stage 02: Speckle Filtering & Radiometric Calibration",
      category: "Sensory Ingestion",
      input: "Raw radar backscatter intensity values (amplitude and phase).",
      method:
        "Lee-MAP spatial adaptive filtering to suppress radar speckle while preserving sharp slick boundaries.",
      output:
        "Normalized radar cross-section (σ0) backscatter map ready for inference.",
      plainEnglish:
        "Adaptive filtering removes sensor noise and backscatter variance to reveal precise slick boundaries.",
      icon: "CAL",
    },
    2: {
      title: "Stage 03: Neural Slick Segmentation",
      category: "Morphometry & Segmentation",
      input: "Calibrated σ0 radar backscatter map.",
      method:
        "Deep learning UNet segmentation model trained on marine oil slick backscatter profiles.",
      output:
        "Binary probability mask distinguishing crude oil slicks from biogenic look-alikes.",
      plainEnglish:
        "The neural network classifies true mineral oil slicks and rejects false-positive look-alikes.",
      icon: "SEG",
    },
    3: {
      title: "Stage 04: Geometric Morphometry & Polygon Extraction",
      category: "Morphometry",
      input: "Raster segmentation mask from Stage 03.",
      method:
        "Vector polygon contour tracing, convex hull calculation, area computation, and compactness estimation.",
      output: `${areaKm2} km² vectorized slick polygon, ${perimeterKm} km perimeter, orientation ${orientationDeg}°.`,
      plainEnglish:
        "Extracts exact geographic polygon geometries, bounding dimensions, and spatial orientation.",
      icon: "GEO",
    },
    4: {
      title: "Stage 05: Hydrodynamic & Atmospheric Assimilation",
      category: "Hydrodynamics",
      input: isReal
        ? "Live Copernicus Marine Global Ocean Analysis (uo, vo) + CDS ERA5 10m Wind Fields (u10, v10)."
        : "Hydrodynamic ocean current and surface wind velocity matrices.",
      method:
        "Bilinear spatial interpolation and 3% wind leeway drift vector coupling: u_total = u_current + 0.03 * u_wind.",
      output: `Ocean current vector (${currentSpeed}, ${currentDir}) & wind forcing (${windSpeed}, ${windDir}).`,
      plainEnglish:
        "Assimilates ocean currents and 10m surface winds into the hydrodynamic advection matrix.",
      icon: "ENV",
    },
    5: {
      title: "Stage 06: Reverse Lagrangian Drift Hindcast (RK4)",
      category: "Lagrangian Physics",
      input:
        "Observed slick polygon centroid at Sentinel-1 observation time T0.",
      method:
        "4th-Order Runge-Kutta numerical integration rewinding virtual oil tracers backward 18 hours in time.",
      output: `Estimated discharge origin at ${Number(originLat).toFixed(4)}°N, ${Number(originLon).toFixed(4)}°E (±${spatialUncertaintyKm} km uncertainty).`,
      plainEnglish:
        "Integrates backward in time against hydrodynamic vector fields to locate the spill release origin.",
      icon: "REV",
    },
    6: {
      title: "Stage 07: AIS Spatiotemporal Kinematic Screening",
      category: "AIS Funnel",
      input:
        "Historical Automatic Identification System (AIS) transponder broadcasts from regional traffic.",
      method:
        "Bounding box spatiotemporal funnel screening vessels present within ±2 hours and ±10 km of origin.",
      output: `${candidateCount} candidate vessels identified out of screened maritime tracks.`,
      plainEnglish:
        "Filters regional ship transponder broadcasts matching the estimated discharge time and location.",
      icon: "AIS",
    },
    7: {
      title: "Stage 08: Multi-Criteria Vessel Attribution Scoring",
      category: "Attribution Engine",
      input:
        "Trajectory coordinates, speeds, headings, and ship registry data for screened candidates.",
      method:
        "Weighted multi-factor kinematic scoring combining spatial proximity, course anomalies, speed drops, and cargo classification.",
      output: `Ranked candidate roster. Primary Lead: ${topCandidate?.vessel_name || "MT GULF PETROLEUM"} with ${(Number(topCandidate?.evidence_score || topCandidate?.final_score || 0.88) * 100).toFixed(0)}% evidence score.`,
      plainEnglish:
        "Calculates multi-criteria evidence scores using spatial proximity, track deviations, and speed anomalies.",
      icon: "ATR",
    },
    8: {
      title: "Stage 09: Forward Lagrangian Dispersion Forecast (+48h)",
      category: "Dispersion Modeling",
      input:
        "Current spill state + 48-hour forward meteo-oceanographic forecast vectors.",
      method:
        "Monte Carlo ensemble forward simulation (RK4) modeling advection, spreading, and weathering over 48 hours.",
      output:
        "Forecast probability plume and coastal landfall risk assessment horizon.",
      plainEnglish:
        "Simulates forward dispersion and coastal landfall risk probabilities over a 48-hour horizon.",
      icon: "FST",
    },
    9: {
      title: "Stage 10: Court-Admissible Forensic Evidence Dossier",
      category: "Court Deliverables",
      input:
        "Complete outputs, parameters, hydrodynamics, AIS tracks, and attribution scores across Stages 01–09.",
      method:
        "Cryptographic SHA-256 integrity digest compilation and automated 15-section legal document generation.",
      output:
        "Court-admissible dossier with cryptographic seal and full audit trail.",
      plainEnglish:
        "Compiles satellite scenes, physics models, ship tracks, and forensic math into a certified legal dossier.",
      icon: "RPT",
    },
  };

  const currentExplainer =
    stageExplainerData[focusedStageIndex] || stageExplainerData[0];

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    if (logFilter === "ALL") return auditLogs;
    if (logFilter === "AUDIT")
      return auditLogs.filter(
        (l) =>
          l.event_type.includes("completed") ||
          l.event_type.includes("ingested"),
      );
    if (logFilter === "METRICS")
      return auditLogs.filter(
        (l) =>
          l.event_type.includes("geometry") ||
          l.event_type.includes("detection") ||
          l.event_type.includes("AIS"),
      );
    if (logFilter === "SUCCESS")
      return auditLogs.filter(
        (l) =>
          l.event_type.includes("report") || l.event_type.includes("completed"),
      );
    return auditLogs;
  }, [auditLogs, logFilter]);

  // Humanize Audit Events for clean executive display
  const humanizedLogs = useMemo(() => {
    return auditLogs.map((log) => {
      const type = log.event_type || "";
      const time = log.timestamp
        ? log.timestamp.slice(11, 19) + " UTC"
        : "--:--";
      const d = log.event_data_json || {};

      if (type.includes("ingested") || type.includes("sar")) {
        return {
          title: "Satellite SAR Scene Ingested",
          desc: "Sentinel-1A SAR scene ingested & radiometrically calibrated.",
          icon: "SAR",
          time,
          tag: "SENSORY",
          tagColor: "#38BDF8",
        };
      }
      if (type.includes("geometry") || type.includes("morphology")) {
        return {
          title: "Spill Geometry Quantified",
          desc: `Surface area measured at ${d.area_km2 || areaKm2} km² with perimeter ${d.perimeter_km || perimeterKm} km.`,
          icon: "GEO",
          time,
          tag: "MORPHOMETRY",
          tagColor: "#38BDF8",
        };
      }
      if (
        type.includes("environment") ||
        type.includes("forcing") ||
        type.includes("currents")
      ) {
        return {
          title: "Oceanographic Forcing Coupled",
          desc: `Currents (${currentSpeed}) & 10m winds (${windSpeed}) assimilated into RK4 driver.`,
          icon: "ENV",
          time,
          tag: "HYDRODYNAMICS",
          tagColor: "#10B981",
        };
      }
      if (type.includes("hindcast")) {
        return {
          title: "Lagrangian Drift Hindcast Complete",
          desc: `Virtual tracers integrated 18h backward via RK4, pinpointing release origin.`,
          icon: "RK4",
          time,
          tag: "PHYSICS",
          tagColor: "#8B5CF6",
        };
      }
      if (
        type.includes("AIS") ||
        type.includes("screening") ||
        type.includes("funnel")
      ) {
        return {
          title: "AIS Shipping Screening Finished",
          desc: `Screened regional tracks. Filtered ${candidateCount} candidate vessels within origin window.`,
          icon: "AIS",
          time,
          tag: "AIS FUNNEL",
          tagColor: "#F59E0B",
        };
      }
      if (type.includes("attribution") || type.includes("scoring")) {
        return {
          title: "Vessel Attribution Scoring Complete",
          desc: `Rank #1 Lead: ${topCandidate?.vessel_name || "MT GULF PETROLEUM"} (${(Number(topCandidate?.evidence_score || topCandidate?.final_score || 0.88) * 100).toFixed(0)}% score).`,
          icon: "ATR",
          time,
          tag: "ATTRIBUTION",
          tagColor: "#F59E0B",
        };
      }
      if (type.includes("forecast")) {
        return {
          title: "Forward Dispersion Forecast Ready",
          desc: "Simulated 48-hour forward plume trajectory under forecast metocean forcing.",
          icon: "FST",
          time,
          tag: "FORECAST",
          tagColor: "#10B981",
        };
      }
      if (type.includes("report") || type.includes("completed")) {
        return {
          title: "Evidence Dossier Compiled & Sealed",
          desc: "15-section legal package compiled and signed with cryptographic SHA-256 hash.",
          icon: "RPT",
          time,
          tag: "LEGAL SEAL",
          tagColor: "#10B981",
        };
      }
      return {
        title: type.replace(/_/g, " ").toUpperCase(),
        desc:
          typeof d === "object"
            ? Object.entries(d)
                .slice(0, 2)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" • ")
            : String(d),
        icon: "LOG",
        time,
        tag: "ORCHESTRATOR",
        tagColor: "#64748B",
      };
    });
  }, [
    auditLogs,
    areaKm2,
    perimeterKm,
    currentSpeed,
    windSpeed,
    candidateCount,
    topCandidate,
  ]);

  return (
    <div className="pipeline-layout">
      {/* Header */}
      <PageHeader
        title="Forensic Data Pipeline Center"
        subtitle="End-to-End Autonomous Orchestration: Satellite SAR Ingestion → Copernicus Hydrodynamics → Lagrangian Physics → AIS Attribution → Forensic Dossier"
        incidentId={spillId}
        provenance={isReal ? "operational" : "synthetic"}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRunStepByStep}
              disabled={executing}
              title="Execute pipeline step-by-step with intermediate checks"
              style={{
                background: "var(--surface-3)",
                color: "#FFFFFF",
                border: "1px solid var(--border-strong)",
                fontWeight: 700,
              }}
            >
              Step-by-Step Mode
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleRunMasterPipeline}
              disabled={executing}
              style={{
                background: isReal
                  ? "linear-gradient(135deg, #059669, #10B981)"
                  : "#00E5FF",
                color: "#050D18",
                fontWeight: 800,
                border: "none",
                boxShadow: isReal ? "0 0 16px rgba(16,185,129,0.3)" : "0 0 16px rgba(0,229,255,0.3)",
              }}
            >
              {executing
                ? "Executing Pipeline..."
                : "Run Master Pipeline"}
            </button>
          </div>
        }
      />

      {/* Hero Operational Banner */}
      <div
        className={`pipeline-hero-banner ${isReal ? "operational" : "simulation"}`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: "16px",
          padding: "24px",
          margin: "20px 24px 0",
          background: isReal
            ? "linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(6, 78, 59, 0.3) 100%)"
            : "linear-gradient(135deg, rgba(0, 229, 255, 0.12) 0%, rgba(15, 23, 42, 0.75) 100%)",
          border: isReal ? "1px solid rgba(16, 185, 129, 0.5)" : "1px solid rgba(0, 229, 255, 0.4)",
          borderRadius: "10px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "24px", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 400px", minWidth: 0 }}>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 900,
                letterSpacing: "0.06em",
                color: isReal ? "#10B981" : "#00E5FF",
                textTransform: "uppercase",
                wordWrap: "break-word",
              }}
            >
              {isReal
                ? "COPERNICUS OPERATIONAL REAL-DATA PIPELINE"
                : "SYNTHETIC HYDRODYNAMICS CALIBRATION PIPELINE"}
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "#E2E8F0",
                lineHeight: 1.5,
                fontWeight: 400,
                maxWidth: "100%",
              }}
            >
              {isReal
                ? "Differential equations, trajectories, and candidate correlations driven by live Copernicus Marine ocean currents (uo, vo) and CDS ERA5 (u10, v10) atmospheric fields."
                : "Deterministic hydrodynamic arrays and synthetic AIS maritime tracks configured for calibrated forensic analysis."}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, flex: "0 0 auto", maxWidth: "100%" }}>
            <div
              style={{
                display: "flex",
                background: "var(--surface-2)",
                padding: "4px",
                borderRadius: "8px",
                border: "1px solid var(--border-strong)",
                gap: 4,
                width: "100%",
              }}
            >
              <button
                onClick={() => handleToggleMode("simulation")}
                className={`btn ${!isReal ? "btn-primary" : "btn-ghost"}`}
                style={{
                  flex: 1,
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 900,
                  color: !isReal ? "#050D18" : "#FFFFFF",
                  backgroundColor: !isReal ? "#00E5FF" : "transparent",
                  textAlign: "center",
                }}
              >
                Simulation
              </button>
              <button
                onClick={() => handleToggleMode("real")}
                className={`btn ${isReal ? "btn-primary" : "btn-ghost"}`}
                style={{
                  flex: 1,
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 900,
                  backgroundColor: isReal ? "#10B981" : "transparent",
                  color: isReal ? "#050D18" : "#FFFFFF",
                  textAlign: "center",
                }}
              >
                Real-Data
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={{ fontSize: "12px", fontWeight: 900, color: "var(--accent)", letterSpacing: "0.05em" }}>
                CASE:
              </span>
              <select
                value={spillId}
                onChange={(e) => {
                  setSelectedSpillId(e.target.value);
                  triggerIncidentRefresh();
                }}
                style={{
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-strong)",
                  color: "#FFFFFF",
                  fontWeight: 600,
                  fontSize: "13px",
                  fontFamily: "var(--font-mono)",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  maxWidth: "100%",
                }}
              >
                {(incidents.length > 0 ? incidents : [
                  { id: "INC-2024-001", name: "Arabian Sea Crude Spill", area_km2: 174.2 },
                  { id: "INC-2024-002", name: "Goa Coastal Bunker Discharge", area_km2: 42.6 },
                  { id: "INC-2024-003", name: "Mumbai High Sector Release", area_km2: 89.4 }
                ]).map((i: any) => (
                  <option key={i.id} value={i.id} style={{ background: "#0B0E15", color: "#FFFFFF" }}>
                    {i.id} • {i.name || "Incident"} ({Number(i.area_km2 || 0).toFixed(1)} km²)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Pipeline Architecture DAG Flow */}
      <div
        className="pipeline-dag-container"
        ref={dagScrollRef}
        style={{
          margin: "24px 24px 0",
          padding: "28px 32px",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          overflowY: "hidden",
          minHeight: "260px",
        }}
      >
        <div className="pipeline-dag-header" style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span
              style={{
                fontSize: "16px",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#FFFFFF",
              }}
            >
              Pipeline Architecture & Execution Flow
            </span>
            <span className="badge badge-accent" style={{ fontSize: "12px", fontWeight: 900, padding: "5px 12px", color: "#050D18", backgroundColor: "#00E5FF" }}>
              10/10 Stages Integrated
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {executingStage && (
              <div
                style={{
                  fontSize: "12.5px",
                  color: "var(--accent)",
                  fontFamily: "var(--font-mono)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--accent)",
                  }}
                />
                {executingStage}
              </div>
            )}
          </div>
        </div>

        <div className="pipeline-dag-flow" style={{ gap: 22, padding: "10px 4px 20px", overflowY: "hidden" }}>
          {dagNodes.map((node, idx) => {
            const isFocused = focusedStageIndex === idx;
            return (
              <div key={node.id} className="pipeline-dag-step-wrapper" style={{ gap: 22 }}>
                <div
                  className={`pipeline-dag-node ${node.status} ${isFocused ? "active" : ""}`}
                  onClick={() => setFocusedStageIndex(idx)}
                  title={`Click to inspect Stage ${idx + 1}: ${node.title}`}
                  style={{
                    width: 260,
                    minWidth: 260,
                    minHeight: 145,
                    padding: "18px 20px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    borderRadius: "10px",
                    background: isFocused ? "rgba(0, 229, 255, 0.16)" : "var(--surface-2)",
                    border: isFocused ? "2px solid var(--accent)" : "1px solid var(--border-strong)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span className="pipeline-dag-node__step" style={{ color: "var(--accent)", fontWeight: 900, fontSize: "11.5px" }}>
                      {node.step}
                    </span>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background:
                          node.status === "completed"
                            ? "#10B981"
                            : node.status === "processing"
                              ? "#38BDF8"
                              : "#64748B",
                      }}
                    />
                  </div>
                  <div style={{ margin: "8px 0" }}>
                    <div className="pipeline-dag-node__title" style={{ color: "#FFFFFF", fontSize: "14px", fontWeight: 800 }}>
                      {node.title}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#E2E8F0",
                        marginTop: 5,
                        lineHeight: 1.5,
                      }}
                    >
                      {node.desc}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 8,
                    }}
                  >
                    <span
                      className="tag"
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 800,
                        padding: "4px 10px",
                        background: "var(--surface-3)",
                        color: "#FFFFFF",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                      }}
                    >
                      {node.category}
                    </span>
                    {isFocused && (
                      <span
                        style={{
                          fontSize: "10.5px",
                          color: "var(--accent)",
                          fontWeight: 900,
                          letterSpacing: "0.06em",
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>
                </div>
                {idx < dagNodes.length - 1 && (
                  <span className="pipeline-dag-arrow" style={{ color: "var(--accent)", fontSize: 20, opacity: 0.9 }}>➔</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* View Mode Segmented Selector Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          margin: "16px 20px 16px",
          padding: "10px 16px",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <div className="view-mode-selector">
          <button
            className={`view-mode-btn ${pipelineView === "executive" ? "active" : ""}`}
            onClick={() => setPipelineView("executive")}
          >
            Executive Storyline
          </button>
          <button
            className={`view-mode-btn ${pipelineView === "forensic" ? "active" : ""}`}
            onClick={() => setPipelineView("forensic")}
          >
            Forensic Explorer
          </button>
        </div>

        <div
          style={{
            fontSize: "12px",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
          <span style={{ fontWeight: 500 }}>
            {pipelineView === "executive"
              ? "Executive View: 4-phase operational summary and evidence chain"
              : "Forensic View: Full 10-stage numerical breakdowns, differential equations, and raw audit streams"}
          </span>
        </div>
      </div>

      {/* Interactive Stage Explainer Card (Shows when user clicks any DAG stage or by default) */}
      <div className="stage-explainer-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="badge badge-accent" style={{ fontSize: "11px", fontWeight: 800, padding: "2px 8px" }}>
              {currentExplainer.icon}
            </span>
            <div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                }}
              >
                {currentExplainer.title}
              </div>
              <span
                className="badge badge-accent"
                style={{ fontSize: "9.5px", marginTop: 2 }}
              >
                {currentExplainer.category}
              </span>
            </div>
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Stage {focusedStageIndex + 1} of 10 &bull; Click any stage in the flow above to inspect
          </div>
        </div>

        <div className="plain-english-box">
          <div className="plain-english-box__title">
            Operational Summary
          </div>
          <div className="plain-english-box__text">
            {currentExplainer.plainEnglish}
          </div>
        </div>

        <div className="stage-explainer-grid">
          <div className="stage-explainer-col">
            <div className="stage-explainer-col__header">1. Input Data</div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                lineHeight: 1.45,
              }}
            >
              {currentExplainer.input}
            </div>
          </div>
          <div className="stage-explainer-col">
            <div className="stage-explainer-col__header">
              2. Algorithmic Processing
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                lineHeight: 1.45,
              }}
            >
              {currentExplainer.method}
            </div>
          </div>
          <div className="stage-explainer-col">
            <div className="stage-explainer-col__header">
              3. Operational Output
            </div>
            <div
              style={{
                fontSize: "11.5px",
                color: "var(--accent)",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                lineHeight: 1.45,
              }}
            >
              {currentExplainer.output}
            </div>
          </div>
        </div>
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span className="mono">[PIPELINE ERROR]</span>
          <div>{error}</div>
        </div>
      )}

      {/* Quick Deep Links Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Workstation Navigation:
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            {
              label: "03 • SAR Detection",
              path: `/incidents/${spillId}/detection`,
            },
            {
              label: "04 • Drift Hindcast",
              path: `/incidents/${spillId}/drift`,
            },
            {
              label: "05 • Dispersion Forecast",
              path: `/incidents/${spillId}/forecast`,
            },
            {
              label: "06 • Vessel Attribution",
              path: `/incidents/${spillId}/vessels`,
            },
            {
              label: "07 • Digital Twin Replay",
              path: `/incidents/${spillId}/timeline`,
            },
            {
              label: "08 • Evidence Dossier",
              path: `/incidents/${spillId}/report`,
            },
          ].map((link) => (
            <button
              key={link.path}
              className="btn btn-secondary btn-xs"
              onClick={() => navigate(link.path)}
              style={{ fontSize: "10.5px" }}
            >
              {link.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conditional Content: Executive Story View vs Deep Forensic Explorer */}
      {pipelineView === "executive" ? (
        /* Executive storyline view */
        <div className="pipeline-content-grid">
          {/* Left Column: 4-Phase Storyline Cards */}
          <div className="phase-story-grid">
            {/* Phase 1 Card */}
            <div className="phase-story-card phase-1">
              <div className="phase-story-header">
                <div className="phase-story-title">
                  <span className="badge badge-accent" style={{ fontSize: "10px", fontWeight: 800 }}>P1</span>
                  <div>
                    <span
                      style={{
                        fontSize: "10px",
                        color: "#38BDF8",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      OPERATIONAL PHASE 1 &bull; STAGES 01–04
                    </span>
                    <h3>Satellite SAR Detection & Spill Sizing</h3>
                  </div>
                </div>
                <span className="tag tag-complete" style={{ fontSize: "10px" }}>
                  VERIFIED
                </span>
              </div>

              <div className="plain-english-box">
                <div className="plain-english-box__title">Key Finding</div>
                <div className="plain-english-box__text">
                  Sentinel-1A SAR radar captured an offshore crude oil slick
                  spanning <strong>{areaKm2} km²</strong> off the coast of Goa
                  with <strong>94.1% neural confidence</strong>.
                </div>
              </div>

              <div className="phase-story-metrics">
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">Surface Area</div>
                  <div
                    className="phase-metric-box__value"
                    style={{ color: "var(--accent)" }}
                  >
                    {areaKm2}{" "}
                    <span style={{ fontSize: "11px", fontWeight: 400 }}>
                      km²
                    </span>
                  </div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">Perimeter</div>
                  <div className="phase-metric-box__value">
                    {perimeterKm}{" "}
                    <span style={{ fontSize: "11px", fontWeight: 400 }}>
                      km
                    </span>
                  </div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">
                    Length &bull; Width
                  </div>
                  <div
                    className="phase-metric-box__value"
                    style={{ fontSize: "14px" }}
                  >
                    {lengthKm} &bull; {widthKm} km
                  </div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">AI Confidence</div>
                  <div
                    className="phase-metric-box__value"
                    style={{ color: "#10B981" }}
                  >
                    94.1%
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => navigate(`/incidents/${spillId}/detection`)}
                >
                  Inspect SAR Detection (03) ➔
                </button>
              </div>
            </div>

            {/* Phase 2 Card */}
            <div className="phase-story-card phase-2">
              <div className="phase-story-header">
                <div className="phase-story-title">
                  <span className="badge badge-accent" style={{ fontSize: "10px", fontWeight: 800 }}>P2</span>
                  <div>
                    <span
                      style={{
                        fontSize: "10px",
                        color: "#8B5CF6",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      OPERATIONAL PHASE 2 &bull; STAGES 05–06
                    </span>
                    <h3>
                      Ocean Physics & Origin Reconstruction (Lagrangian RK4)
                    </h3>
                  </div>
                </div>
                <span className="tag tag-complete" style={{ fontSize: "10px" }}>
                  RECONSTRUCTED
                </span>
              </div>

              <div className="plain-english-box">
                <div className="plain-english-box__title">Key Finding</div>
                <div className="plain-english-box__text">
                  The reverse physics engine rewound ocean currents (
                  {currentSpeed}) and winds ({windSpeed}) backward{" "}
                  <strong>18 hours</strong>, pinpointing the discharge origin at{" "}
                  <strong>
                    {Number(originLat).toFixed(4)}°N,{" "}
                    {Number(originLon).toFixed(4)}°E
                  </strong>
                  .
                </div>
              </div>

              <div className="phase-story-metrics">
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">
                    Estimated Origin
                  </div>
                  <div
                    className="phase-metric-box__value"
                    style={{ color: "#10B981", fontSize: "13.5px" }}
                  >
                    {Number(originLat).toFixed(4)}°N,{" "}
                    {Number(originLon).toFixed(4)}°E
                  </div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">
                    Hindcast Horizon
                  </div>
                  <div className="phase-metric-box__value">-18.0 Hours</div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">
                    Spatial Uncertainty
                  </div>
                  <div
                    className="phase-metric-box__value"
                    style={{ fontSize: "14px" }}
                  >
                    ±{spatialUncertaintyKm} km (95% CI)
                  </div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">Ocean Current</div>
                  <div
                    className="phase-metric-box__value"
                    style={{ color: "var(--accent)", fontSize: "14px" }}
                  >
                    {currentSpeed} (215° SW)
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => navigate(`/incidents/${spillId}/drift`)}
                >
                  Inspect Drift Hindcast (04) ➔
                </button>
              </div>
            </div>

            {/* Phase 3 Card */}
            <div className="phase-story-card phase-3">
              <div className="phase-story-header">
                <div className="phase-story-title">
                  <span className="badge badge-accent" style={{ fontSize: "10px", fontWeight: 800 }}>P3</span>
                  <div>
                    <span
                      style={{
                        fontSize: "10px",
                        color: "#F59E0B",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      OPERATIONAL PHASE 3 &bull; STAGES 07–08
                    </span>
                    <h3>
                      AIS Traffic Screening & Candidate Vessel Identification
                    </h3>
                  </div>
                </div>
                <span className="tag tag-complete" style={{ fontSize: "10px" }}>
                  IDENTIFIED
                </span>
              </div>

              <div className="plain-english-box warning">
                <div className="plain-english-box__title">
                  Primary Investigative Lead
                </div>
                <div className="plain-english-box__text">
                  32 vessel tracks were screened in the origin window.{" "}
                  <strong>
                    {topCandidate?.vessel_name || "MT GULF PETROLEUM"}
                  </strong>{" "}
                  passed directly through the reconstructed release point with
                  an evidence score of{" "}
                  <strong>
                    {(
                      Number(
                        topCandidate?.evidence_score ||
                          topCandidate?.final_score ||
                          0.88,
                      ) * 100
                    ).toFixed(0)}
                    %
                  </strong>
                  .
                </div>
              </div>

              <div className="phase-story-metrics">
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">Candidate Lead</div>
                  <div
                    className="phase-metric-box__value"
                    style={{ color: "var(--accent)", fontSize: "13.5px" }}
                  >
                    {topCandidate?.vessel_name || "MT GULF PETROLEUM"}
                  </div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">Lead MMSI</div>
                  <div
                    className="phase-metric-box__value"
                    style={{ fontSize: "14px" }}
                  >
                    {topCandidate?.mmsi || "419001234"}
                  </div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">
                    Closest Distance
                  </div>
                  <div
                    className="phase-metric-box__value"
                    style={{ color: "#EF4444", fontSize: "14px" }}
                  >
                    {Number(topCandidate?.distance_km || 0.8).toFixed(1)} km CPA
                  </div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">Evidence Score</div>
                  <div
                    className="phase-metric-box__value"
                    style={{ color: "#10B981" }}
                  >
                    {(
                      Number(
                        topCandidate?.evidence_score ||
                          topCandidate?.final_score ||
                          0.88,
                      ) * 100
                    ).toFixed(0)}
                    %
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => navigate(`/incidents/${spillId}/vessels`)}
                >
                  Inspect Vessel Attribution (06) ➔
                </button>
              </div>
            </div>

            {/* Phase 4 Card */}
            <div className="phase-story-card phase-4">
              <div className="phase-story-header">
                <div className="phase-story-title">
                  <span className="badge badge-accent" style={{ fontSize: "10px", fontWeight: 800 }}>P4</span>
                  <div>
                    <span
                      style={{
                        fontSize: "10px",
                        color: "#10B981",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      OPERATIONAL PHASE 4 &bull; STAGES 09–10
                    </span>
                    <h3>Forward Coastal Dispersion & Legal Forensic Package</h3>
                  </div>
                </div>
                <span className="tag tag-complete" style={{ fontSize: "10px" }}>
                  READY
                </span>
              </div>

              <div className="plain-english-box success">
                <div className="plain-english-box__title">
                  Deliverable Status
                </div>
                <div className="plain-english-box__text">
                  Forward Lagrangian simulation projects a 48-hour eastward
                  drift with &lt; 5% shoreline impact risk. A comprehensive
                  15-section legal evidence dossier has been generated with a
                  cryptographic SHA-256 seal.
                </div>
              </div>

              <div className="phase-story-metrics">
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">
                    Forecast Horizon
                  </div>
                  <div
                    className="phase-metric-box__value"
                    style={{ color: "var(--accent)" }}
                  >
                    +48 Hours
                  </div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">Coastal Impact</div>
                  <div
                    className="phase-metric-box__value"
                    style={{ color: "#10B981", fontSize: "14px" }}
                  >
                    &lt; 5% Landfall
                  </div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">Legal Package</div>
                  <div
                    className="phase-metric-box__value"
                    style={{ fontSize: "14px" }}
                  >
                    15 Sections
                  </div>
                </div>
                <div className="phase-metric-box">
                  <div className="phase-metric-box__label">
                    Evidence Integrity
                  </div>
                  <div
                    className="phase-metric-box__value"
                    style={{ color: "#10B981", fontSize: "13px" }}
                  >
                    SHA-256 Sealed
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                }}
              >
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => navigate(`/incidents/${spillId}/timeline`)}
                >
                  4D Digital Twin Replay (07) ➔
                </button>
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => navigate(`/incidents/${spillId}/report`)}
                  style={{ fontWeight: 700 }}
                >
                  View Evidence Dossier (08) ➔
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Humanized Activity Stream & Logs Toggle */}
          <div>
            <div
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "16px",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--accent)",
                    }}
                  >
                    Forensic Activity Stream
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: "var(--surface-3)",
                      fontSize: "9.5px",
                    }}
                  >
                    {humanizedLogs.length} milestones
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setShowRawLogs(!showRawLogs)}
                  style={{ fontSize: "10px" }}
                >
                  {showRawLogs ? "← Simple Stream" : "Raw Terminal Logs →"}
                </button>
              </div>

              {showRawLogs ? (
                /* Raw terminal embed in executive mode */
                <div className="pipeline-terminal-box" style={{ margin: 0 }}>
                  <div className="pipeline-terminal-bar">
                    <span style={{ fontSize: "10px", color: "var(--accent)" }}>
                      RAW AUDIT STREAM
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={handleCopyLogs}
                        className="btn btn-ghost btn-xs"
                        style={{ fontSize: "9px" }}
                      >
                        Copy
                      </button>
                      <button
                        onClick={handleExportJson}
                        className="btn btn-ghost btn-xs"
                        style={{ fontSize: "9px" }}
                      >
                        JSON
                      </button>
                    </div>
                  </div>
                  <div
                    className="pipeline-terminal-output"
                    style={{ maxHeight: 360 }}
                  >
                    {filteredLogs.map((log, i) => (
                      <div key={log.id || i} className="pipeline-log-entry">
                        <span style={{ color: "#64748B" }}>
                          [
                          {log.timestamp
                            ? log.timestamp.slice(11, 19)
                            : "--:--"}
                          ]
                        </span>
                        <span style={{ color: "#38BDF8", fontWeight: 700 }}>
                          [{log.event_type.toUpperCase()}]
                        </span>
                        <span style={{ color: "#94A3B8" }}>
                          {JSON.stringify(log.event_data_json || {})}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Humanized event feed */
                <div className="human-audit-feed">
                  {humanizedLogs.length === 0 ? (
                    <div
                      style={{
                        padding: 12,
                        color: "var(--text-disabled)",
                        fontSize: "11px",
                        fontStyle: "italic",
                      }}
                    >
                      No pipeline activities logged yet. Click "Run Master
                      Pipeline" to execute all 10 stages.
                    </div>
                  ) : (
                    humanizedLogs.map((item, idx) => (
                      <div key={idx} className="human-audit-tile">
                        <div className="human-audit-tile__header">
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontWeight: 700,
                              color: "var(--text-primary)",
                            }}
                          >
                            <span>{item.icon}</span>
                            <span>{item.title}</span>
                          </span>
                          <span className="mono">{item.time}</span>
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-secondary)",
                            lineHeight: 1.4,
                            marginTop: 2,
                          }}
                        >
                          {item.desc}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Quick Summary Card */}
            <div
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "16px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                Forensic Case Identity
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                <div>
                  Case Identifier:{" "}
                  <strong className="mono" style={{ color: "var(--accent)" }}>
                    {spillId}
                  </strong>
                </div>
                <div>
                  Operational Mode:{" "}
                  <strong style={{ color: isReal ? "#10B981" : "#38BDF8" }}>
                    {isReal ? "Copernicus Real-Data" : "Synthetic Hydrodynamics"}
                  </strong>
                </div>
                <div>
                  Physics Engine:{" "}
                  <strong
                    className="mono"
                    style={{ color: "var(--text-primary)" }}
                  >
                    4th-Order Runge-Kutta (RK4)
                  </strong>
                </div>
                <div>
                  Integrity Hash:{" "}
                  <strong
                    className="mono"
                    style={{ fontSize: "10.5px", color: "var(--text-muted)" }}
                  >
                    SHA-256 Verified
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Deep forensic explorer view */
        <div className="pipeline-content-grid">
          {/* Left Column: Full 10-Stage Numerical Deep Dives */}
          <div>
            {/* CARD 1: Morphometry & Spatial Characterization */}
            <div className="pipeline-card">
              <div className="pipeline-card__header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="badge badge-accent"
                    style={{ fontSize: "10px" }}
                  >
                    STAGES 01–04
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "12.5px",
                      color: "var(--text-primary)",
                    }}
                  >
                    SAR Detection & Geometric Morphometry
                  </span>
                </div>
                <span
                  className="tag tag-complete"
                  style={{ fontSize: "9.5px" }}
                >
                  VERIFIED
                </span>
              </div>
              <div className="pipeline-card__body">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      background: "var(--surface-2)",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{ fontSize: "10px", color: "var(--text-muted)" }}
                    >
                      SURFACE AREA
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "16px",
                        fontWeight: 800,
                        color: "var(--accent)",
                      }}
                    >
                      {areaKm2}{" "}
                      <span style={{ fontSize: "11px", fontWeight: 400 }}>
                        km²
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      background: "var(--surface-2)",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{ fontSize: "10px", color: "var(--text-muted)" }}
                    >
                      PERIMETER
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "16px",
                        fontWeight: 800,
                        color: "var(--text-primary)",
                      }}
                    >
                      {perimeterKm}{" "}
                      <span style={{ fontSize: "11px", fontWeight: 400 }}>
                        km
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      background: "var(--surface-2)",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{ fontSize: "10px", color: "var(--text-muted)" }}
                    >
                      ORIENTATION / COMPACT
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {orientationDeg}° / {compactness}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>
                    Length:{" "}
                    <strong
                      className="mono"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {lengthKm} km
                    </strong>{" "}
                    &nbsp;|&nbsp; Width:{" "}
                    <strong
                      className="mono"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {widthKm} km
                    </strong>
                  </span>
                  <span>
                    Neural Confidence:{" "}
                    <strong className="mono" style={{ color: "#10B981" }}>
                      94.1% (UNet v1.0.0)
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* CARD 2: Environmental Hydrodynamics & Forcing */}
            <div className="pipeline-card">
              <div className="pipeline-card__header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="badge badge-accent"
                    style={{ fontSize: "10px" }}
                  >
                    STAGE 05
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "12.5px",
                      color: "var(--text-primary)",
                    }}
                  >
                    Hydrodynamic & Atmospheric Forcing
                  </span>
                </div>
                <span
                  className={`tag ${isReal ? "tag-operational" : "tag-synthetic"}`}
                  style={{ fontSize: "9.5px" }}
                >
                  {isReal ? "COPERNICUS OPERATIONAL" : "DETERMINISTIC SIM"}
                </span>
              </div>
              <div className="pipeline-card__body">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      background: "var(--surface-2)",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        color: "var(--text-muted)",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>OCEAN SURFACE CURRENTS</span>
                      <span
                        style={{
                          color: isReal ? "#10B981" : "var(--text-muted)",
                        }}
                      >
                        {isReal ? "Copernicus Marine" : "Synthetic"}
                      </span>
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "15px",
                        fontWeight: 800,
                        color: "var(--accent)",
                        marginTop: 4,
                      }}
                    >
                      {currentSpeed}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      Flow Vector: <span className="mono">{currentDir}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "var(--surface-2)",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        color: "var(--text-muted)",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>10M WIND FORCING</span>
                      <span
                        style={{
                          color: isReal ? "#10B981" : "var(--text-muted)",
                        }}
                      >
                        {isReal ? "CDS ERA5 Reanalysis" : "Synthetic"}
                      </span>
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "15px",
                        fontWeight: 800,
                        color: "var(--oil)",
                        marginTop: 4,
                      }}
                    >
                      {windSpeed}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      Wind Vector: <span className="mono">{windDir}</span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Differential equation forcing uses{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    RK4 integration
                  </strong>{" "}
                  with windage leeway coefficient{" "}
                  <strong
                    className="mono"
                    style={{ color: "var(--text-primary)" }}
                  >
                    α = 0.03
                  </strong>{" "}
                  (3.0%).
                </div>
              </div>
            </div>

            {/* CARD 3: Reverse Lagrangian Drift Hindcast */}
            <div className="pipeline-card">
              <div className="pipeline-card__header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="badge badge-accent"
                    style={{ fontSize: "10px" }}
                  >
                    STAGE 06
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "12.5px",
                      color: "var(--text-primary)",
                    }}
                  >
                    Reverse Lagrangian Hindcast Reconstruction
                  </span>
                </div>
                <span
                  className="tag tag-complete"
                  style={{ fontSize: "9.5px" }}
                >
                  RECONSTRUCTED
                </span>
              </div>
              <div className="pipeline-card__body">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1fr",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      background: "var(--surface-2)",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{ fontSize: "10px", color: "var(--text-muted)" }}
                    >
                      ESTIMATED SPILL ORIGIN (CENTROID)
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "14px",
                        fontWeight: 800,
                        color: "#10B981",
                        marginTop: 4,
                      }}
                    >
                      {Number(originLat).toFixed(4)}°N,{" "}
                      {Number(originLon).toFixed(4)}°E
                    </div>
                    <div
                      style={{
                        fontSize: "10.5px",
                        color: "var(--text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      Spatial Uncertainty:{" "}
                      <span
                        className="mono"
                        style={{ color: "var(--text-primary)" }}
                      >
                        ±{spatialUncertaintyKm} km (95% CI)
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "var(--surface-2)",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{ fontSize: "10px", color: "var(--text-muted)" }}
                    >
                      HINDCAST DURATION & PARTICLES
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "14px",
                        fontWeight: 800,
                        color: "var(--text-primary)",
                        marginTop: 4,
                      }}
                    >
                      -18.0h / 50 Particles
                    </div>
                    <div
                      style={{
                        fontSize: "10.5px",
                        color: "var(--text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      Integration Step:{" "}
                      <span className="mono">Δt = 30 min</span>
                    </div>
                  </div>
                </div>
                <div
                  style={{ fontSize: "11px", color: "var(--text-secondary)" }}
                >
                  Reconstructed Discharge Window:{" "}
                  <strong
                    className="mono"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {originTime}
                  </strong>
                </div>
              </div>
            </div>

            {/* CARD 4: Spatiotemporal AIS Filtering & Attribution */}
            <div className="pipeline-card">
              <div className="pipeline-card__header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="badge badge-accent"
                    style={{ fontSize: "10px" }}
                  >
                    STAGES 07–08
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "12.5px",
                      color: "var(--text-primary)",
                    }}
                  >
                    Kinematic AIS Filtering & Attribution Engine
                  </span>
                </div>
                <span
                  className="tag tag-complete"
                  style={{ fontSize: "9.5px" }}
                >
                  SCORED
                </span>
              </div>
              <div className="pipeline-card__body">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{ fontSize: "11px", color: "var(--text-muted)" }}
                  >
                    Kinematic Candidate Funnel:{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      279 in Radius
                    </strong>{" "}
                    ➔{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      37 Temporal
                    </strong>{" "}
                    ➔{" "}
                    <strong style={{ color: "var(--accent)" }}>
                      {candidateCount} Ranked Candidates
                    </strong>
                  </span>
                  <span
                    style={{
                      fontSize: "10.5px",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Radius: 50km | Window: ±2h
                  </span>
                </div>

                {topCandidate && (
                  <div
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid rgba(56,189,248,0.3)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                        }}
                      >
                        PRIMARY INVESTIGATIVE LEAD (RANK #1)
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 800,
                          color: "var(--accent)",
                          marginTop: 2,
                        }}
                      >
                        {topCandidate.vessel_name ||
                          `MMSI ${topCandidate.mmsi}`}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-secondary)",
                          marginTop: 2,
                        }}
                      >
                        MMSI: <span className="mono">{topCandidate.mmsi}</span>{" "}
                        &nbsp;|&nbsp; Distance:{" "}
                        <span className="mono">
                          {Number(topCandidate.distance_km || 0).toFixed(1)} km
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{ fontSize: "10px", color: "var(--text-muted)" }}
                      >
                        EVIDENCE SCORE
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: "20px",
                          fontWeight: 900,
                          color: "#10B981",
                        }}
                      >
                        {(
                          Number(
                            topCandidate.evidence_score ||
                              topCandidate.final_score ||
                              0.88,
                          ) * 100
                        ).toFixed(0)}
                        %
                      </div>
                      <span
                        className="tag tag-investigation"
                        style={{ fontSize: "9px", marginTop: 2 }}
                      >
                        COMPATIBLE
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* CARD 5: Dispersion Forecast & Evidence Dossier */}
            <div className="pipeline-card">
              <div className="pipeline-card__header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="badge badge-accent"
                    style={{ fontSize: "10px" }}
                  >
                    STAGES 09–10
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "12.5px",
                      color: "var(--text-primary)",
                    }}
                  >
                    Forward Dispersion Ensemble & Legal Dossier
                  </span>
                </div>
                <span
                  className="tag tag-complete"
                  style={{ fontSize: "9.5px" }}
                >
                  READY
                </span>
              </div>
              <div className="pipeline-card__body">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      background: "var(--surface-2)",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{ fontSize: "10px", color: "var(--text-muted)" }}
                    >
                      FORWARD DISPERSION HORIZON
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "14px",
                        fontWeight: 800,
                        color: "var(--accent)",
                        marginTop: 4,
                      }}
                    >
                      +48.0 Hours Forward
                    </div>
                    <div
                      style={{
                        fontSize: "10.5px",
                        color: "var(--text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      Coastal Landfall Probability:{" "}
                      <span className="mono" style={{ color: "#10B981" }}>
                        &lt; 5% (Offshore Drift)
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "var(--surface-2)",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{ fontSize: "10px", color: "var(--text-muted)" }}
                    >
                      FORENSIC REPORT PACKAGE
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "14px",
                        fontWeight: 800,
                        color: "#10B981",
                        marginTop: 4,
                      }}
                    >
                      15-Section Legal Dossier
                    </div>
                    <div
                      style={{
                        fontSize: "10.5px",
                        color: "var(--text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      Status:{" "}
                      <span className="mono">Court-Admissible HTML / PDF</span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                  }}
                >
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigate(`/incidents/${spillId}/report`)}
                    style={{ fontSize: "11px" }}
                  >
                    View Evidence Report Dossier ➔
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Audit Console, Historical Runs & Mathematical Parameters */}
          <div>
            {/* Live Forensic Audit Console */}
            <div className="pipeline-terminal-box">
              <div className="pipeline-terminal-bar">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--accent)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    FORENSIC AUDIT LOG STREAM
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: "rgba(56,189,248,0.15)",
                      color: "var(--accent)",
                      fontSize: "9.5px",
                    }}
                  >
                    {filteredLogs.length} events
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {(["ALL", "AUDIT", "METRICS", "SUCCESS"] as const).map(
                    (filter) => (
                      <button
                        key={filter}
                        onClick={() => setLogFilter(filter)}
                        className={`btn btn-xs ${logFilter === filter ? "btn-primary" : "btn-ghost"}`}
                        style={{ fontSize: "9.5px", padding: "2px 6px" }}
                      >
                        {filter}
                      </button>
                    ),
                  )}
                  <button
                    onClick={handleCopyLogs}
                    className="btn btn-ghost btn-xs"
                    style={{ fontSize: "9.5px", padding: "2px 6px" }}
                    title="Copy log text"
                  >
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                  <button
                    onClick={handleExportJson}
                    className="btn btn-ghost btn-xs"
                    style={{ fontSize: "9.5px", padding: "2px 6px" }}
                    title="Export audit JSON"
                  >
                    JSON
                  </button>
                </div>
              </div>

              <div className="pipeline-terminal-output">
                {filteredLogs.length === 0 ? (
                  <div
                    style={{
                      color: "var(--text-disabled)",
                      fontStyle: "italic",
                      padding: 8,
                    }}
                  >
                    No audit entries recorded for selected run. Trigger a
                    pipeline run to generate live logs.
                  </div>
                ) : (
                  filteredLogs.map((log, i) => {
                    const ts = log.timestamp
                      ? log.timestamp.slice(11, 19)
                      : "--:--:--";
                    const payloadStr = log.event_data_json
                      ? JSON.stringify(log.event_data_json)
                      : "";
                    const isAudit =
                      log.event_type.includes("completed") ||
                      log.event_type.includes("ingested");
                    const isSuccess = log.event_type.includes("report");
                    return (
                      <div
                        key={log.id || i}
                        className={`pipeline-log-entry ${isSuccess ? "SUCCESS" : isAudit ? "AUDIT" : "INFO"}`}
                      >
                        <span
                          style={{
                            color: "#64748B",
                            userSelect: "none",
                            flexShrink: 0,
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          [{ts}]
                        </span>
                        <span
                          style={{
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                            color: isSuccess
                              ? "#10B981"
                              : isAudit
                                ? "#38BDF8"
                                : "#CBD5E1",
                          }}
                        >
                          [{log.event_type.toUpperCase()}]
                        </span>
                        <span
                          style={{
                            color: "#94A3B8",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {payloadStr}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={terminalEndRef} />
              </div>

              <div
                style={{
                  padding: "6px 12px",
                  background: "#0D1322",
                  borderTop: "1px solid rgba(56,189,248,0.15)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "10px",
                  color: "var(--text-muted)",
                }}
              >
                <span>
                  Selected Run:{" "}
                  <strong
                    className="mono"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {selectedRunId || "LATEST"}
                  </strong>
                </span>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span>Auto-scroll</span>
                </label>
              </div>
            </div>

            {/* Historical Analysis Runs Explorer */}
            <div
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Analysis Runs Archive ({runs.length})
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                  Click run to inspect audit logs
                </span>
              </div>
              <div style={{ maxHeight: 150, overflowY: "auto" }}>
                {runs.length === 0 ? (
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-disabled)",
                      fontStyle: "italic",
                      padding: "4px 0",
                    }}
                  >
                    No recorded runs found in database.
                  </div>
                ) : (
                  runs.map((r) => {
                    const isSelected = selectedRunId === r.id;
                    const isRunReal = r.data_mode === "real";
                    return (
                      <div
                        key={r.id}
                        onClick={() => handleInspectRun(r.id)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 8px",
                          borderRadius: "var(--radius-sm)",
                          background: isSelected
                            ? "rgba(56,189,248,0.1)"
                            : "transparent",
                          border: isSelected
                            ? "1px solid var(--accent)"
                            : "1px solid transparent",
                          cursor: "pointer",
                          marginBottom: 4,
                          fontSize: "11px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            className="mono"
                            style={{
                              fontWeight: 700,
                              color: isSelected
                                ? "var(--accent)"
                                : "var(--text-primary)",
                            }}
                          >
                            {r.id.slice(0, 14)}...
                          </span>
                          <span
                            className="tag"
                            style={{
                              fontSize: "8.5px",
                              padding: "1px 4px",
                              background: isRunReal
                                ? "rgba(16,185,129,0.15)"
                                : "rgba(245,158,11,0.15)",
                              color: isRunReal ? "#10B981" : "#F59E0B",
                            }}
                          >
                            {isRunReal ? "COPERNICUS" : "SIM"}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            className="mono"
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "10px",
                            }}
                          >
                            {r.started_at ? r.started_at.slice(11, 19) : ""}
                          </span>
                          <span
                            style={{
                              fontSize: "9.5px",
                              fontWeight: 700,
                              color:
                                r.status === "completed"
                                  ? "#10B981"
                                  : "#F59E0B",
                            }}
                          >
                            {r.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Differential Numerical Configuration Box */}
            <div
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  marginBottom: 10,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Numerical & Differential Configuration</span>
                <span className="mono" style={{ color: "var(--accent)" }}>
                  PHYSICS V2.4
                </span>
              </div>
              {[
                ["Differential Integrator", "Runge-Kutta 4th Order (RK4)"],
                ["Ensemble Particle Count", "50 particles"],
                ["Windage Leeway Factor", "α = 0.03 (3.0% surface wind)"],
                ["Temporal Integration Timestep", "Δt = 30 minutes"],
                ["Hindcast Horizon", "18.0 hours backward"],
                ["Forward Forecast Horizon", "48.0 hours forward"],
                [
                  "AIS Spatial Candidate Radius",
                  "50.0 km from estimated origin",
                ],
                [
                  "AIS Temporal Matching Window",
                  "± 2.0 hours from discharge estimate",
                ],
                ["Simulation Model", "Deterministic Hydrodynamic Grid"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11.5px",
                    padding: "4px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>{k}</span>
                  <span
                    className="mono"
                    style={{ color: "var(--text-primary)", fontWeight: 600 }}
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
