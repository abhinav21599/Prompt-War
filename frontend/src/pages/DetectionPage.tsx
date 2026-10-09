import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchSpill, fetchSpillImage, getApiUrl, runSceneDetection } from "../services/api";
import ProvenanceBadge from "../components/ProvenanceBadge";
import ProcessingPipeline from "../components/ProcessingPipeline";
import SarLimitation from "../components/SarLimitation";
import PageHeader from "../components/PageHeader";
import InvestigationMap from "../map/InvestigationMap";
import LayerControl from "../components/LayerControl";
import { LoadingState, ErrorState } from "../components/StateComponents";
import { useStore } from "../state/store";

export default function DetectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { dataMode, incidentRefreshTrigger } = useStore();
  const [spill, setSpill] = useState<any>(null);
  const [image, setImage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "sar">("map");
  const [sarMode, setSarMode] = useState<
    "composite" | "calibrated" | "raw" | "mask"
  >("composite");
  const [selectedSceneId, setSelectedSceneId] = useState(
    "S1A_IW_GRDH_1SDV_20240315T060000_demo",
  );
  const [detecting, setDetecting] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchSpill(id), fetchSpillImage(id)])
      .then(([sp, img]) => {
        setSpill(sp);
        setImage(img);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, incidentRefreshTrigger, dataMode]);

  const handleRunDetector = async () => {
    setDetecting(true);
    try {
      const res = await runSceneDetection(selectedSceneId, 0.42);
      setSarMode("mask");
      if (res && res.confidence) {
        setSpill((prev: any) => ({
          ...prev,
          detection_confidence: res.confidence,
          detected_class: res.detected_class || prev.detected_class,
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDetecting(false);
    }
  };

  if (loading)
    return <LoadingState message="Loading satellite detection dataset..." />;
  if (error) return <ErrorState message={error} />;
  if (!spill) return <ErrorState message="Spill record not found" />;

  const stages = [
    {
      label: "1. Scene Ingestion",
      status: "complete" as const,
      detail: image?.filename?.slice(0, 40) + "...",
    },
    {
      label: "2. Metadata Validation",
      status: "complete" as const,
      detail: `CRS: ${image?.crs || "EPSG:4326"}, ${image?.resolution_m || 10}m/px`,
    },
    {
      label: "3. SAR Preprocessing",
      status: "complete" as const,
      detail: `Pipeline v${spill?.preprocessing_version}`,
    },
    {
      label: "4. Deep Inference",
      status: "complete" as const,
      detail: `${spill?.model_version}`,
    },
    {
      label: "5. Mask Segmentation",
      status: "complete" as const,
      detail: `Threshold: ${spill?.model_threshold}`,
    },
    {
      label: "6. Vector Extraction",
      status: "complete" as const,
      detail: `${spill?.area_km2?.toFixed(3)} km²`,
    },
    {
      label: "7. Morphological Characterization",
      status: "complete" as const,
      detail: `Compactness: ${spill?.compactness?.toFixed(4)}`,
    },
  ];

  const metrics = [
    [
      "Detection Confidence",
      `${(spill.detection_confidence * 100).toFixed(1)}%`,
    ],
    ["Class Classification", spill.detected_class],
    ["Surface Sfc Area", `${spill.area_km2?.toFixed(3)} km²`],
    ["Perimeter", `${spill.perimeter_km?.toFixed(3)} km`],
    ["Major Axis (Length)", `${spill.length_km?.toFixed(3)} km`],
    ["Minor Axis (Width)", `${spill.width_km?.toFixed(3)} km`],
    ["Orientation Axis", `${spill.orientation_deg?.toFixed(1)}°`],
    ["Compactness Ratio (4πA/P²)", spill.compactness?.toFixed(6)],
    [
      "Centroid Latitude",
      `${spill.centroid_geojson?.coordinates?.[1]?.toFixed(6)}°N`,
    ],
    [
      "Centroid Longitude",
      `${spill.centroid_geojson?.coordinates?.[0]?.toFixed(6)}°E`,
    ],
    [
      "SAR Acquisition Timestamp",
      `${spill.satellite_acquisition_time?.slice(0, 19)} UTC`,
    ],
    ["Sensor Platform", image?.satellite_name || "Sentinel-1A (C-SAR)"],
    ["Spatial Resolution", `${image?.resolution_m || 10} m/pixel`],
    ["Coordinate System", image?.crs || "WGS 84 (EPSG:4326)"],
    ["Segmentation Model", spill.model_version],
    ["Model Threshold", spill.model_threshold],
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <PageHeader
        title={`${id || "INCIDENT"} — SAR Oil Spill Detection`}
        subtitle={
          spill.incident_name || "SAR Satellite Detection & Characterization"
        }
        incidentId={id}
        provenance={spill.provenance || "observed"}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* View switcher */}
            <div
              style={{
                display: "flex",
                background: "var(--surface-3)",
                padding: "2px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-strong)",
              }}
            >
              <button
                onClick={() => setViewMode("map")}
                className={`btn btn-sm ${viewMode === "map" ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: "11px", padding: "3px 9px" }}
              >
                Live Map
              </button>
              <button
                onClick={() => setViewMode("sar")}
                className={`btn btn-sm ${viewMode === "sar" ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: "11px", padding: "3px 9px" }}
              >
                SAR Radar Scene
              </button>
            </div>

            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate(`/incidents/${id}/drift`)}
              style={{ fontWeight: 600 }}
            >
              Next: Hindcast Drift (04) →
            </button>
          </div>
        }
      />

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: sidebarCollapsed ? "1fr 34px" : "1fr 340px",
          overflow: "hidden",
        }}
      >
        {/* Left: Interactive Map or SAR Viewport */}
        <div
          style={{
            background: "#060A0F",
            position: "relative",
            overflow: "hidden",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Top metadata strip */}
          <div
            style={{
              padding: "6px 12px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--surface-1)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <ProvenanceBadge provenance="observed" />
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {viewMode === "map"
                  ? "LIVE GEOSPATIAL VECTOR OVERLAY — MapLibre GL Interactive Basemap"
                  : "SAR SCENE — Normalized Backscatter Intensity (Sentinel-1)"}
              </span>
            </div>
            <span
              className="mono"
              style={{ fontSize: "11px", color: "var(--text-disabled)" }}
            >
              POLARIZATION: VV + VH | RES: 10M
            </span>
          </div>

          {/* Main viewport area */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {viewMode === "map" ? (
              <InvestigationMap spill={spill} contextPreset="sar">
                <LayerControl />
              </InvestigationMap>
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  background: "#070C14",
                  position: "relative",
                }}
              >
                {/* SAR View Controls Toolbar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 16px",
                    background: "var(--surface-2)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                      }}
                    >
                      SCENE:
                    </span>
                    <select
                      value={selectedSceneId}
                      onChange={(e) => setSelectedSceneId(e.target.value)}
                      style={{
                        padding: "4px 8px",
                        background: "var(--surface-3)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontFamily: "var(--font-mono)",
                        cursor: "pointer",
                      }}
                    >
                      <option value="S1A_IW_GRDH_1SDV_20240315T060000_demo">
                        Goa Offshore (S1A 15-Mar)
                      </option>
                      <option value="S1A_IW_GRDH_1SDV_20240318T054500_kutch">
                        Gulf of Kutch (S1A 18-Mar)
                      </option>
                      <option value="S1C_IW_GRDH_1SDV_20240322T061500_lakshadweep">
                        Lakshadweep Passage (S1C 22-Mar)
                      </option>
                      <option value="S1B_IW_GRDH_1SDV_20240310T053000_clean">
                        Mumbai Baseline Clean (S1B 10-Mar)
                      </option>
                    </select>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        marginLeft: 6,
                      }}
                    >
                      RASTER:
                    </span>
                    {["composite", "calibrated", "raw", "mask"].map((m) => (
                      <button
                        key={m}
                        onClick={() => setSarMode(m as any)}
                        className={`btn btn-sm ${sarMode === m ? "btn-primary" : "btn-ghost"}`}
                        style={{
                          fontSize: "11px",
                          textTransform: "capitalize",
                        }}
                      >
                        {m === "composite"
                          ? "🛰 Composite"
                          : m === "calibrated"
                            ? "📡 Calibrated σ₀"
                            : m === "raw"
                              ? "🌊 Raw Intensity"
                              : "🎯 AI Mask"}
                      </button>
                    ))}
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleRunDetector}
                      disabled={detecting}
                      style={{
                        fontSize: "11px",
                        borderColor: "var(--oil)",
                        color: "var(--oil)",
                      }}
                    >
                      {detecting
                        ? "⚡ Analyzing Sentinel-1 SAR..."
                        : "⚡ Run AI Spill Detector"}
                    </button>
                  </div>
                </div>

                {/* Satellite Imagery Viewport */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    overflow: "auto",
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      maxWidth: "100%",
                      maxHeight: "100%",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    {(() => {
                      return (
                        <img
                          src={getApiUrl(`/api/scenes/${encodeURIComponent(selectedSceneId)}/image?mode=${sarMode}`)}
                          alt="Sentinel-1 SAR Satellite Acquisition"
                          style={{
                            display: "block",
                            maxWidth: "100%",
                            maxHeight: "70vh",
                            objectFit: "contain",
                          }}
                          onError={(e: any) => {
                            if (!e.target.dataset.triedFallback) {
                              e.target.dataset.triedFallback = "true";
                              e.target.src = getApiUrl(`/api/scenes/preview?mode=${sarMode}`);
                            }
                          }}
                        />
                      );
                    })()}

                    {/* Interactive Telemetry Overlay Card */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 12,
                        left: 12,
                        background: "rgba(10, 15, 24, 0.88)",
                        backdropFilter: "blur(6px)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        padding: "8px 12px",
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontWeight: 700,
                          color: "var(--accent)",
                          marginBottom: 2,
                        }}
                      >
                        <span>
                          {image?.satellite_name || "SENTINEL-1A C-SAR IW GRDH"}
                        </span>
                        <span
                          style={{
                            fontSize: "10px",
                            background: "var(--surface-3)",
                            padding: "1px 4px",
                            borderRadius: 2,
                          }}
                        >
                          {image?.resolution_m
                            ? `${image.resolution_m}M RESOLUTION`
                            : "10M RESOLUTION"}
                        </span>
                      </div>
                      <div
                        className="mono"
                        style={{ fontSize: "10px", color: "var(--text-muted)" }}
                      >
                        BOUNDS: [
                        {spill?.centroid_geojson?.coordinates
                          ? `${(spill.centroid_geojson.coordinates[0] - 0.35).toFixed(2)}°E, ${(spill.centroid_geojson.coordinates[1] - 0.25).toFixed(2)}°N → ${(spill.centroid_geojson.coordinates[0] + 0.35).toFixed(2)}°E, ${(spill.centroid_geojson.coordinates[1] + 0.25).toFixed(2)}°N`
                          : "72.35°E, 15.15°N → 73.05°E, 15.65°N"}
                        ]
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid var(--border)",
              background: "var(--surface-1)",
              flexShrink: 0,
            }}
          >
            <SarLimitation />
          </div>
        </div>

        {/* Right panel: detection metrics + pipeline execution trace */}
        {sidebarCollapsed ? (
          <div
            onClick={() => setSidebarCollapsed(false)}
            title="Expand Detection Metrics"
            style={{
              borderLeft: "1px solid var(--border)",
              background: "var(--surface-1)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "12px 0",
              cursor: "pointer",
              userSelect: "none",
              gap: 14,
            }}
          >
            <button
              className="nav-arrow-toggle-btn"
              style={{
                width: 22,
                height: 22,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-secondary)",
              }}
              title="Expand Metrics"
            >
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: "var(--text-muted)",
              }}
            >
              MORPHOLOGICAL METRICS
            </div>
          </div>
        ) : (
          <div
            style={{
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-secondary)",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border)",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                background: "var(--surface-1)",
                flexShrink: 0,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Morphological Metrics</span>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                title="Collapse Metrics"
                style={{
                  width: 22,
                  height: 22,
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-secondary)",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                  <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

          <div style={{ padding: "12px", flex: 1, overflowY: "auto" }}>
            {metrics.map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "5px 0",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "12px",
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>{k}</span>
                <span className="mono" style={{ color: "var(--text-primary)" }}>
                  {v}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              padding: "12px",
              background: "var(--surface-1)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                marginBottom: 8,
              }}
            >
              Pipeline Verification Stages
            </div>
            <ProcessingPipeline stages={stages} />
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
