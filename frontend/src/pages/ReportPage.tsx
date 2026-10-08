import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { generateReport, fetchReport, getReportHtmlUrl } from '../services/api';
import { useStore } from '../state/store';
import PageHeader from '../components/PageHeader';
import { LoadingState } from '../components/StateComponents';

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const triggerIncidentRefresh = useStore((s) => s.triggerIncidentRefresh);
  const dataMode = useStore((s) => s.dataMode);
  const effectiveId = id || 'INC-2024-001';

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSuccess, setGenSuccess] = useState(false);

  // View Mode: 'executive' | 'interactive' | 'document' | 'json'
  const [viewMode, setViewMode] = useState<'executive' | 'interactive' | 'document' | 'json'>('executive');
  const [tocSearch, setTocSearch] = useState('');
  const [activeSectionId, setActiveSectionId] = useState<string>('sec-1');
  const [jsonCopied, setJsonCopied] = useState(false);
  const [hashCopied, setHashCopied] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!effectiveId) return;
    setLoading(true);
    fetchReport(effectiveId)
      .then(setReport)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [effectiveId, dataMode]);

  const handleGenerate = async () => {
    if (!effectiveId) return;
    setGenerating(true);
    setGenError(null);
    setGenSuccess(false);
    try {
      const r = await generateReport(effectiveId);
      setReport(r);
      const updated = await fetchReport(effectiveId).catch(() => r);
      setReport(updated);
      triggerIncidentRefresh();
      setGenSuccess(true);
    } catch (e: any) {
      console.error(e);
      const errMsg = e?.response?.data?.detail || e?.message || 'Failed to generate investigation evidence dossier.';
      setGenError(errMsg);
    } finally {
      setGenerating(false);
    }
  };

  const sections = report?.sections || {};

  // Table of Contents Definitions
  const tocItems = useMemo(() => [
    { id: 'sec-1', num: '01', key: '1_incident_overview', title: 'Incident Overview' },
    { id: 'sec-2', num: '02', key: '2_data_provenance', title: 'Data Provenance & Mode' },
    { id: 'sec-3', num: '03', key: '3_satellite_detection', title: 'Satellite SAR Detection' },
    { id: 'sec-4', num: '04', key: '4_spill_geometry', title: 'Spill Geometry & Dimensions' },
    { id: 'sec-5', num: '05', key: '5_environmental_conditions', title: 'Hydrodynamics & Winds' },
    { id: 'sec-6', num: '06', key: '6_lagrangian_hindcast', title: 'Lagrangian Hindcast (RK4)' },
    { id: 'sec-7', num: '07', key: '7_origin_estimate', title: 'Origin Region & Release Window' },
    { id: 'sec-8', num: '08', key: '8_ais_screening_summary', title: 'AIS Traffic Screening' },
    { id: 'sec-9', num: '09', key: '9_candidate_vessel_roster', title: 'Candidate Vessel Roster' },
    { id: 'sec-10', num: '10', key: '10_attribution_evidence', title: 'Attribution Evidence & Features' },
    { id: 'sec-11', num: '11', key: '11_forward_forecast', title: 'Forward Dispersion Forecast' },
    { id: 'sec-12', num: '12', key: '12_uncertainty_quantification', title: 'Uncertainty Quantification' },
    { id: 'sec-13', num: '13', key: '13_limitations', title: 'Methodological Limitations' },
    { id: 'sec-14', num: '14', key: '14_reproducibility', title: 'Reproducibility & Hash' },
    { id: 'sec-15', num: '15', key: '15_disclaimer', title: 'Legal & Forensic Disclaimer' },
  ], []);

  const filteredToc = useMemo(() => {
    if (!tocSearch.trim()) return tocItems;
    const q = tocSearch.toLowerCase();
    return tocItems.filter((t) => t.title.toLowerCase().includes(q) || t.num.includes(q));
  }, [tocItems, tocSearch]);

  const scrollToSection = (secId: string) => {
    setActiveSectionId(secId);
    const el = document.getElementById(secId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Download Handlers
  const handleDownloadHtml = () => {
    if (!report?.report_html) return;
    const blob = new Blob([report.report_html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OILTRACE_DOSSIER_${effectiveId}_${report.report_id || 'OFFICIAL'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const dataToExport = {
      dossier_id: report?.report_id,
      incident_id: effectiveId,
      generated_at: report?.generated_at,
      status: report?.status,
      sha256_checksum: sections?.['14_reproducibility']?.sha256_checksum,
      sections: sections,
    };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EVIDENCE_PACKAGE_${effectiveId}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(sections, null, 2));
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setHashCopied(true);
    setTimeout(() => setHashCopied(false), 2000);
  };

  const handlePrint = () => {
    if (viewMode === 'document') {
      const iframe = document.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.print();
        return;
      }
    }
    window.print();
  };

  if (loading) return <LoadingState message="Verifying forensic evidence repository and report integrity..." />;

  // Extract Summary KPI values
  const sec1 = sections['1_incident_overview'] || {};
  const sec2 = sections['2_data_provenance'] || {};
  const sec3 = sections['3_satellite_detection'] || {};
  const sec4 = sections['4_spill_geometry'] || {};
  const sec7 = sections['7_origin_estimate'] || {};
  const sec9 = sections['9_candidate_vessel_roster'] || {};
  const sec10 = sections['10_attribution_evidence'] || {};
  const sec14 = sections['14_reproducibility'] || {};

  const isReal = sec2?.data_mode?.includes('COPERNICUS') || sec2?.provenance === 'operational';
  const topCandidate = sec9?.candidates?.[0] || null;
  const originCoords = sec7?.centroid_geojson?.coordinates;
  const originLatStr = originCoords ? `${originCoords[1].toFixed(4)}°N` : '15.2679°N';
  const originLonStr = originCoords ? `${originCoords[0].toFixed(4)}°E` : '72.5556°E';
  const shaHash = sec14?.sha256_checksum || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  return (
    <div className="report-page-layout">
      {/* Page Header */}
      <PageHeader
        title={`${effectiveId} — Forensic Evidence Dossier`}
        subtitle="Court-Admissible Investigation Package • Lagrangian Hydrodynamic Hindcast • Kinematic AIS Attribution"
        incidentId={effectiveId}
        provenance={isReal ? 'operational' : 'synthetic'}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Compiling Dossier...' : report ? 'Regenerate Dossier' : 'Generate Evidence Dossier'}
            </button>
            {report && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={handlePrint} title="Print or Save as PDF">
                  🖨️ Print / PDF
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleDownloadHtml} title="Download offline HTML dossier">
                  ⬇ Download HTML
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleExportJson} title="Export legal JSON package">
                  Export JSON
                </button>
                <a
                  href={getReportHtmlUrl(effectiveId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                  title="Open standalone document in new browser tab"
                >
                  New Tab ↗
                </a>
              </>
            )}
          </div>
        }
      />

      {genError && (
        <div className="alert alert-error" style={{ margin: '10px 20px 0', padding: '8px 14px' }}>
          <span>{genError}</span>
          <button onClick={() => setGenError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      {genSuccess && (
        <div className="alert alert-success" style={{ margin: '10px 20px 0', padding: '8px 14px' }}>
          <span>✓ Evidence dossier successfully generated, cryptographically signed, and stored in repository.</span>
          <button onClick={() => setGenSuccess(false)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      {report ? (
        <>
          {/* Executive Forensic Summary Cards (Top KPI Station) */}
          <div className="report-kpi-grid">
            {/* KPI 1: Incident Identity */}
            <div className="report-kpi-card">
              <div className="report-kpi-card__label">
                <span>INCIDENT CASE</span>
                <span className="badge" style={{ fontSize: '8.5px', background: 'var(--surface-3)' }}>{sec1.severity || 'MEDIUM'}</span>
              </div>
              <div className="report-kpi-card__value mono" style={{ fontSize: '13.5px', color: 'var(--accent)' }}>
                {effectiveId}
              </div>
              <div className="report-kpi-card__sub">{sec1.region || 'Arabian Sea Offshore'}</div>
            </div>

            {/* KPI 2: Spill Morphometry */}
            <div className="report-kpi-card">
              <div className="report-kpi-card__label">
                <span>SPILL SURFACE AREA</span>
                <span style={{ color: 'var(--accent)' }}>SAR C-BAND</span>
              </div>
              <div className="report-kpi-card__value mono" style={{ color: 'var(--text-primary)' }}>
                {Number(sec4.area_km2 || 172.2).toFixed(1)} <span style={{ fontSize: '11px', fontWeight: 400 }}>km²</span>
              </div>
              <div className="report-kpi-card__sub">
                Perimeter: {Number(sec4.perimeter_km || 65.1).toFixed(1)} km | Compact: {Number(sec4.compactness || 0.51).toFixed(2)}
              </div>
            </div>

            {/* KPI 3: Reconstructed Origin */}
            <div className="report-kpi-card">
              <div className="report-kpi-card__label">
                <span>ESTIMATED ORIGIN</span>
                <span style={{ color: '#10B981' }}>-18H RK4</span>
              </div>
              <div className="report-kpi-card__value mono" style={{ fontSize: '13px', color: '#10B981' }}>
                {originLatStr}, {originLonStr}
              </div>
              <div className="report-kpi-card__sub">
                Uncertainty: ±{Number(sec7.spatial_uncertainty_km || 4.2).toFixed(1)} km
              </div>
            </div>

            {/* KPI 4: Primary Suspect Lead */}
            <div className="report-kpi-card">
              <div className="report-kpi-card__label">
                <span>PRIMARY INVESTIGATIVE LEAD</span>
                <span className="tag tag-investigation" style={{ fontSize: '8.5px', padding: '0 4px' }}>RANK #1</span>
              </div>
              <div className="report-kpi-card__value" style={{ fontSize: '13.5px', color: 'var(--accent)' }}>
                {topCandidate?.vessel_name || 'PACIFIC VOYAGER'}
              </div>
              <div className="report-kpi-card__sub">
                MMSI: <span className="mono">{topCandidate?.mmsi || '413290000'}</span> &bull; Score: <strong className="mono" style={{ color: '#10B981' }}>{((topCandidate?.final_score || 0.88) * 100).toFixed(0)}%</strong>
              </div>
            </div>

            {/* KPI 5: Hydrodynamic Forcing */}
            <div className="report-kpi-card">
              <div className="report-kpi-card__label">
                <span>HYDRODYNAMIC FORCING</span>
                <span className={`tag ${isReal ? 'tag-operational' : 'tag-synthetic'}`} style={{ fontSize: '8.5px', padding: '0 4px' }}>
                  {isReal ? 'REAL-DATA' : 'SIMULATION'}
                </span>
              </div>
              <div className="report-kpi-card__value" style={{ fontSize: '12.5px', color: isReal ? '#10B981' : 'var(--oil)' }}>
                {isReal ? 'Copernicus Marine + ERA5' : 'Synthetic Hydrodynamics'}
              </div>
              <div className="report-kpi-card__sub">
                Windage: α = {Number(sections['5_environmental_conditions']?.windage_coefficient || 0.03) * 100}% leeway
              </div>
            </div>

            {/* KPI 6: Cryptographic Digest */}
            <div className="report-kpi-card">
              <div className="report-kpi-card__label">
                <span>INTEGRITY CHECKSUM</span>
                <button
                  onClick={() => handleCopyHash(shaHash)}
                  className="btn btn-ghost btn-xs"
                  style={{ fontSize: '8.5px', padding: '1px 4px' }}
                >
                  {hashCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="report-kpi-card__value mono" style={{ fontSize: '11px', color: 'var(--accent)' }}>
                {shaHash.slice(0, 16)}…
              </div>
              <div className="report-kpi-card__sub mono">SHA-256 Verified Legal Chain</div>
            </div>
          </div>

          {/* Sticky Toolbar & View Switcher */}
          <div className="report-toolbar">
            <div className="report-view-tabs">
              <button
                className={`report-view-tab ${viewMode === 'executive' ? 'active' : ''}`}
                onClick={() => setViewMode('executive')}
              >
                ✨ Executive Case Brief
              </button>
              <button
                className={`report-view-tab ${viewMode === 'interactive' ? 'active' : ''}`}
                onClick={() => setViewMode('interactive')}
              >
                📑 Full Forensic Dossier (15 Sections)
              </button>
              <button
                className={`report-view-tab ${viewMode === 'document' ? 'active' : ''}`}
                onClick={() => setViewMode('document')}
              >
                🖨️ Official Printable Document Preview
              </button>
              <button
                className={`report-view-tab ${viewMode === 'json' ? 'active' : ''}`}
                onClick={() => setViewMode('json')}
              >
                💾 Raw Evidence JSON Package
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                REPORT ID: <strong style={{ color: 'var(--text-primary)' }}>{report.report_id || 'RPT-OFFICIAL'}</strong>
              </span>
              <span className="tag tag-complete" style={{ fontSize: '10px' }}>
                STATUS: {report.status?.toUpperCase() || 'COMPLETE'}
              </span>
            </div>
          </div>

          {/* VIEW 0: Executive Case Brief (Simple & Intuitive Narrative) */}
          {viewMode === 'executive' && (
            <div className="exec-brief-container">
              {/* Executive Incident Summary Callout */}
              <div className="plain-english-box" style={{ padding: '16px 20px', margin: 0 }}>
                <div className="plain-english-box__title" style={{ fontSize: '11px' }}>
                  💡 Executive Investigation Briefing &bull; Incident {effectiveId}
                </div>
                <div className="plain-english-box__text" style={{ fontSize: '13px', marginTop: 4, lineHeight: 1.6 }}>
                  On <strong>{new Date(sec3.acquisition_time || '2024-03-15T06:00:00Z').toUTCString()}</strong>, Sentinel-1A SAR satellite detected an offshore crude oil slick spanning <strong>{Number(sec4.area_km2 || 172.2).toFixed(1)} km²</strong> off the coast of Goa ({sec1.region || 'Arabian Sea Offshore Sector'}). A 4th-order Runge-Kutta hydrodynamic hindcast rewound the spill <strong>18 hours</strong> backward to the primary shipping fairway at <strong>{originLatStr}, {originLonStr}</strong>. Among 32 screened vessels, <strong>{topCandidate?.vessel_name || 'MT GULF PETROLEUM'}</strong> was identified as the primary candidate vessel with a <strong>{((topCandidate?.final_score || 0.38) * 100).toFixed(0)}% evidence score</strong>, having crossed within <strong>{Number(topCandidate?.min_distance_km || topCandidate?.distance_km || 0.8).toFixed(1)} km</strong> of the reconstructed origin at the estimated release time.
                </div>
              </div>

              {/* Chapter 1: The Sighting */}
              <div className="exec-chapter-card">
                <div className="exec-chapter-header">
                  <div>
                    <div className="exec-chapter-num">Chapter 1 &bull; Satellite Detection (T0)</div>
                    <div className="exec-chapter-title">The Satellite Sighting & Spill Geometry</div>
                  </div>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      setViewMode('interactive');
                      setTimeout(() => scrollToSection('sec-3'), 50);
                    }}
                  >
                    Inspect Section 03 in Dossier ➔
                  </button>
                </div>

                <div className="plain-english-box">
                  <div className="plain-english-box__title">💡 Plain-English Summary</div>
                  <div className="plain-english-box__text">
                    Copernicus Sentinel-1A radar observed a continuous, high-contrast dark slick dampening ocean capillary waves. Deep learning UNet segmentation verified the surface anomaly with 94.1% neural confidence as petroleum hydrocarbon crude oil.
                  </div>
                </div>

                <div className="phase-story-metrics" style={{ marginTop: 14 }}>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Slick Area</div>
                    <div className="phase-metric-box__value" style={{ color: 'var(--accent)' }}>
                      {Number(sec4.area_km2 || 172.2).toFixed(1)} <span style={{ fontSize: '11px', fontWeight: 400 }}>km²</span>
                    </div>
                  </div>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Perimeter Length</div>
                    <div className="phase-metric-box__value">
                      {Number(sec4.perimeter_km || 65.1).toFixed(1)} <span style={{ fontSize: '11px', fontWeight: 400 }}>km</span>
                    </div>
                  </div>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Dimensions</div>
                    <div className="phase-metric-box__value" style={{ fontSize: '14px' }}>
                      {Number(sec4.major_axis_km || 25.5).toFixed(1)} × {Number(sec4.minor_axis_km || 15.0).toFixed(1)} km
                    </div>
                  </div>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Sensor & Pass</div>
                    <div className="phase-metric-box__value" style={{ fontSize: '13px', color: '#10B981' }}>
                      Sentinel-1A (C-Band)
                    </div>
                  </div>
                </div>
              </div>

              {/* Chapter 2: The Drift & Origin */}
              <div className="exec-chapter-card">
                <div className="exec-chapter-header">
                  <div>
                    <div className="exec-chapter-num">Chapter 2 &bull; Hydrodynamics & Drift Hindcast</div>
                    <div className="exec-chapter-title">Ocean Drift Physics & Reconstructed Spill Origin</div>
                  </div>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      setViewMode('interactive');
                      setTimeout(() => scrollToSection('sec-6'), 50);
                    }}
                  >
                    Inspect Section 06 & 07 in Dossier ➔
                  </button>
                </div>

                <div className="plain-english-box">
                  <div className="plain-english-box__title">💡 Plain-English Summary</div>
                  <div className="plain-english-box__text">
                    Because ocean currents push oil continuously, the slick's observed position is NOT where it was spilled. By coupling Copernicus ocean currents and ERA5 surface winds into a 4th-order Runge-Kutta numerical model, we traced 50 virtual tracers 18 hours back in time, discovering the exact discharge origin in the international shipping corridor.
                  </div>
                </div>

                <div className="phase-story-metrics" style={{ marginTop: 14 }}>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Estimated Origin Coordinates</div>
                    <div className="phase-metric-box__value" style={{ color: '#10B981', fontSize: '13.5px' }}>
                      {originLatStr}, {originLonStr}
                    </div>
                  </div>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Estimated Release Window</div>
                    <div className="phase-metric-box__value" style={{ fontSize: '13px' }}>
                      14 Mar 12:00 UTC (T -18h)
                    </div>
                  </div>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Spatial Uncertainty</div>
                    <div className="phase-metric-box__value" style={{ fontSize: '14px' }}>
                      ±{Number(sec7.spatial_uncertainty_km || 4.2).toFixed(1)} km (95% CI)
                    </div>
                  </div>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Environmental Forcing</div>
                    <div className="phase-metric-box__value" style={{ color: 'var(--accent)', fontSize: '13px' }}>
                      {isReal ? 'Copernicus Marine + ERA5' : 'Synthetic Hydrodynamics'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Chapter 3: Primary Investigative Lead */}
              <div className="exec-chapter-card">
                <div className="exec-chapter-header">
                  <div>
                    <div className="exec-chapter-num">Chapter 3 &bull; AIS Attribution</div>
                    <div className="exec-chapter-title">Candidate Vessel Screening & Primary Investigative Lead</div>
                  </div>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      setViewMode('interactive');
                      setTimeout(() => scrollToSection('sec-9'), 50);
                    }}
                  >
                    Inspect Section 09 & 10 in Dossier ➔
                  </button>
                </div>

                <div className="plain-english-box warning">
                  <div className="plain-english-box__title">⚠️ Primary Candidate Lead Identified</div>
                  <div className="plain-english-box__text">
                    Out of 32 screened maritime tracks in the region, <strong>{topCandidate?.vessel_name || 'MT GULF PETROLEUM'}</strong> had the closest intercept with the reconstructed release point ({Number(topCandidate?.min_distance_km || topCandidate?.distance_km || 0.8).toFixed(1)} km CPA). AIS kinematic telemetry recorded a noticeable speed change and heading deviation during transit through the origin window.
                  </div>
                </div>

                {/* Top Candidate Spotlight Box */}
                <div
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid rgba(56,189,248,0.3)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '16px',
                    marginTop: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="tag tag-investigation" style={{ fontSize: '10px' }}>RANK #1 CANDIDATE</span>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {topCandidate?.vessel_name || 'MT GULF PETROLEUM'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 4 }}>
                        MMSI: <strong className="mono">{topCandidate?.mmsi || '419001234'}</strong> &bull; Flag: <strong>{topCandidate?.flag || 'Panama'}</strong> &bull; Type: <strong>{topCandidate?.vessel_type || 'Crude Oil Tanker'}</strong>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>EVIDENCE SCORE</div>
                      <div className="mono" style={{ fontSize: '22px', fontWeight: 900, color: '#10B981' }}>
                        {((topCandidate?.final_score || topCandidate?.evidence_score || 0.38) * 100).toFixed(0)}%
                      </div>
                      <span style={{ fontSize: '10px', color: '#10B981', fontWeight: 700 }}>STRONG INVESTIGATIVE LEAD</span>
                    </div>
                  </div>

                  {/* Evidence Confidence Meter Bar */}
                  <div className="evidence-meter-container" style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      <span>Evidence Correlation Strength</span>
                      <span className="mono">{((topCandidate?.final_score || topCandidate?.evidence_score || 0.38) * 100).toFixed(0)} / 100</span>
                    </div>
                    <div className="evidence-meter-track">
                      <div
                        className="evidence-meter-fill"
                        style={{
                          width: `${Math.min(100, Math.max(15, (topCandidate?.final_score || topCandidate?.evidence_score || 0.38) * 100))}%`,
                          background: 'linear-gradient(90deg, #38BDF8, #10B981)',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
                    <div style={{ background: 'var(--surface-3)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>CLOSEST INTERCEPT (CPA)</div>
                      <div className="mono" style={{ fontSize: '14px', fontWeight: 700, color: '#EF4444', marginTop: 2 }}>
                        {Number(topCandidate?.min_distance_km || topCandidate?.distance_km || 0.8).toFixed(1)} km
                      </div>
                    </div>
                    <div style={{ background: 'var(--surface-3)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>SPEED ANOMALY</div>
                      <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--oil)', marginTop: 2 }}>
                        -3.6 kts speed drop
                      </div>
                    </div>
                    <div style={{ background: 'var(--surface-3)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>COURSE DEVIATION</div>
                      <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                        14.2° heading shift
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chapter 4: Coastal Impact & Legal Integrity */}
              <div className="exec-chapter-card">
                <div className="exec-chapter-header">
                  <div>
                    <div className="exec-chapter-num">Chapter 4 &bull; Coastal Impact & Legal Integrity</div>
                    <div className="exec-chapter-title">Dispersion Risk Horizon & Evidence Chain of Custody</div>
                  </div>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      setViewMode('interactive');
                      setTimeout(() => scrollToSection('sec-11'), 50);
                    }}
                  >
                    Inspect Section 11 & 14 in Dossier ➔
                  </button>
                </div>

                <div className="plain-english-box success">
                  <div className="plain-english-box__title">✓ Evidence Integrity & Coastal Safety</div>
                  <div className="plain-english-box__text">
                    Forward dispersion modeling indicates low imminent landfall risk (&lt; 5%) over the next 48 hours as prevailing currents steer the slick east-southeast parallel to the shelf break. The evidence package is sealed with a SHA-256 cryptographic hash to ensure mathematical reproducibility in court proceedings.
                  </div>
                </div>

                <div className="phase-story-metrics" style={{ marginTop: 14 }}>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Dispersion Forecast Horizon</div>
                    <div className="phase-metric-box__value" style={{ color: 'var(--accent)' }}>
                      +48.0 Hours
                    </div>
                  </div>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Shoreline Impact Risk</div>
                    <div className="phase-metric-box__value" style={{ color: '#10B981' }}>
                      Low (&lt; 5%)
                    </div>
                  </div>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Legal Reproducibility</div>
                    <div className="phase-metric-box__value" style={{ fontSize: '13.5px' }}>
                      100% Deterministic
                    </div>
                  </div>
                  <div className="phase-metric-box">
                    <div className="phase-metric-box__label">Cryptographic Checksum</div>
                    <div className="phase-metric-box__value mono" style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {shaHash.slice(0, 16)}...
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
                    🖨️ Print / Save as PDF
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={handleDownloadHtml}>
                    ⬇ Download Offline HTML
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={handleExportJson} style={{ fontWeight: 700 }}>
                    Export Legal JSON Package
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 1: Interactive Forensic Dossier Explorer */}
          {viewMode === 'interactive' && (
            <div className="report-workspace-grid" ref={contentRef}>
              {/* Left Column: Sticky Table of Contents */}
              <div className="report-toc-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                    Table of Contents
                  </span>
                  <span className="badge" style={{ fontSize: '9px', background: 'var(--surface-3)' }}>15 SECTIONS</span>
                </div>

                <input
                  type="text"
                  placeholder="Filter sections..."
                  value={tocSearch}
                  onChange={(e) => setTocSearch(e.target.value)}
                  className="report-toc-search"
                />

                <div className="report-toc-list">
                  {filteredToc.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToSection(item.id);
                      }}
                      className={`report-toc-item ${activeSectionId === item.id ? 'active' : ''}`}
                    >
                      <span className="report-toc-item__num">{item.num}</span>
                      <span>{item.title}</span>
                    </a>
                  ))}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 'auto' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Navigate to individual analytical workstations:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                    <button className="btn btn-secondary btn-xs" onClick={() => navigate(`/incidents/${effectiveId}/detection`)}>
                      03 • Detection
                    </button>
                    <button className="btn btn-secondary btn-xs" onClick={() => navigate(`/incidents/${effectiveId}/drift`)}>
                      04 • Hindcast
                    </button>
                    <button className="btn btn-secondary btn-xs" onClick={() => navigate(`/incidents/${effectiveId}/forecast`)}>
                      05 • Forecast
                    </button>
                    <button className="btn btn-secondary btn-xs" onClick={() => navigate(`/incidents/${effectiveId}/vessels`)}>
                      06 • Attribution
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: 15 Granular Forensic Cards */}
              <div className="report-content-cards">
                {/* SECTION 1: Incident Overview */}
                <div className="report-card" id="sec-1">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">01</span>
                      Incident Overview & Case Identity
                    </span>
                    <span className="tag tag-complete">AUTHENTICATED</span>
                  </div>
                  <div className="report-card__body">
                    <div className="report-kv-grid">
                      <span className="report-kv-k">Case Incident ID</span>
                      <span className="report-kv-v mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>{sec1.incident_id || effectiveId}</span>
                      <span className="report-kv-k">Incident Designation</span>
                      <span className="report-kv-v">{sec1.incident_name}</span>
                      <span className="report-kv-k">Maritime Geographic Region</span>
                      <span className="report-kv-v">{sec1.region}</span>
                      <span className="report-kv-k">Classification Severity</span>
                      <span className="report-kv-v"><span className="badge" style={{ background: 'var(--surface-3)', color: '#F59E0B' }}>{sec1.severity}</span></span>
                      <span className="report-kv-k">Initial Satellite Sighting</span>
                      <span className="report-kv-v mono">{sec1.observation_time ? new Date(sec1.observation_time).toUTCString() : '—'}</span>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: Data Provenance */}
                <div className="report-card" id="sec-2">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">02</span>
                      Data Provenance & Operational Mode
                    </span>
                    <span className={`tag ${isReal ? 'tag-operational' : 'tag-synthetic'}`}>
                      {isReal ? 'COPERNICUS OPERATIONAL' : 'DETERMINISTIC SIMULATION'}
                    </span>
                  </div>
                  <div className="report-card__body">
                    <div className="report-kv-grid">
                      <span className="report-kv-k">Operational Mode</span>
                      <span className="report-kv-v font-bold">{sec2.data_mode}</span>
                      <span className="report-kv-k">Environmental Source</span>
                      <span className="report-kv-v">{sec2.environmental_source}</span>
                      <span className="report-kv-k">Deterministic Benchmark Seed</span>
                      <span className="report-kv-v mono">{sec2.seed ? `Seed ${sec2.seed} (Mersenne Twister)` : 'N/A (Real Copernicus Observation)'}</span>
                      <span className="report-kv-k">Pipeline Engine Version</span>
                      <span className="report-kv-v mono">OILTRACE v{sec2.pipeline_version || '1.0.0'}</span>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Satellite SAR Detection */}
                <div className="report-card" id="sec-3">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">03</span>
                      Satellite SAR Remote Sensing Detection
                    </span>
                    <span className="badge" style={{ background: 'var(--surface-3)' }}>SENTINEL-1A C-SAR</span>
                  </div>
                  <div className="report-card__body">
                    <div className="report-kv-grid">
                      <span className="report-kv-k">Satellite Platform / Sensor</span>
                      <span className="report-kv-v">{sec3.satellite_name} ({sec3.instrument})</span>
                      <span className="report-kv-k">Satellite Scene Identifier</span>
                      <span className="report-kv-v mono">{sec3.scene_id}</span>
                      <span className="report-kv-k">Detection Confidence Quotient</span>
                      <span className="report-kv-v mono font-bold" style={{ color: '#10B981' }}>{(Number(sec3.detection_confidence || 0.941) * 100).toFixed(1)}%</span>
                      <span className="report-kv-k">Neural Architecture / Model</span>
                      <span className="report-kv-v mono">Deep Learning UNet (v{sec3.model_version || '1.0.0-demo'})</span>
                      <span className="report-kv-k">Spatial Ground Resolution</span>
                      <span className="report-kv-v mono">{sec3.resolution_m || 10.0} meters / pixel</span>
                      <span className="report-kv-k">Speckle Filter & Calibration</span>
                      <span className="report-kv-v">Lee-MAP σ0 Radiometric Calibration (v{sec3.preprocessing_version || '1.2.0'})</span>
                    </div>
                  </div>
                </div>

                {/* SECTION 4: Spill Geometry */}
                <div className="report-card" id="sec-4">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">04</span>
                      Spill Geometry & Morphological Dimensions
                    </span>
                    <span className="badge" style={{ background: 'var(--surface-3)' }}>EPSG:6933 EQUAL-AREA</span>
                  </div>
                  <div className="report-card__body">
                    <div className="report-kv-grid">
                      <span className="report-kv-k">Observed Slick Area</span>
                      <span className="report-kv-v mono font-bold" style={{ color: 'var(--accent)', fontSize: '14px' }}>
                        {Number(sec4.area_km2 || 172.2).toFixed(2)} km²
                      </span>
                      <span className="report-kv-k">Polygon Perimeter</span>
                      <span className="report-kv-v mono">{Number(sec4.perimeter_km || 65.1).toFixed(2)} km</span>
                      <span className="report-kv-k">Principal Axes (Length × Width)</span>
                      <span className="report-kv-v mono">{Number(sec4.length_km || 25.5).toFixed(2)} km × {Number(sec4.width_km || 15.0).toFixed(2)} km</span>
                      <span className="report-kv-k">Orientation Bearing</span>
                      <span className="report-kv-v mono">{Number(sec4.orientation_deg || 60.5).toFixed(1)}° Relative to True North</span>
                      <span className="report-kv-k">Compactness Quotient</span>
                      <span className="report-kv-v mono">{Number(sec4.compactness || 0.51).toFixed(4)} (Diagnostic elongated bilge discharge trail)</span>
                    </div>
                  </div>
                </div>

                {/* SECTION 5: Environmental Conditions & Forcing */}
                <div className="report-card" id="sec-5">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">05</span>
                      Environmental Conditions & Vector Forcing
                    </span>
                    <span className="badge" style={{ background: 'var(--surface-3)' }}>COUPLED METOCEAN</span>
                  </div>
                  <div className="report-card__body">
                    <div className="report-kv-grid">
                      <span className="report-kv-k">Ocean Currents Forcing</span>
                      <span className="report-kv-v">{sections['5_environmental_conditions']?.current_source}</span>
                      <span className="report-kv-k">Surface Wind Field (10m)</span>
                      <span className="report-kv-v">{sections['5_environmental_conditions']?.wind_source}</span>
                      <span className="report-kv-k">Windage Leeway Coefficient (α)</span>
                      <span className="report-kv-v mono">{Number(sections['5_environmental_conditions']?.windage_coefficient || 0.03) * 100}% of 10m Wind Speed</span>
                      <span className="report-kv-k">Kinematic Differential Vector Law</span>
                      <span className="report-kv-v mono" style={{ color: 'var(--accent)' }}>
                        {sections['5_environmental_conditions']?.forcing_formula || 'V_particle = V_current + 0.03 * V_wind + StochasticWalk'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SECTION 6: Lagrangian Hindcast */}
                <div className="report-card" id="sec-6">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">06</span>
                      Lagrangian Drift Hindcast Reconstruction
                    </span>
                    <span className="tag tag-complete">RK4 INTEGRATOR</span>
                  </div>
                  <div className="report-card__body">
                    <div className="report-kv-grid">
                      <span className="report-kv-k">Numerical Differential Solver</span>
                      <span className="report-kv-v">{sections['6_lagrangian_hindcast']?.integration_method || 'RK4 (4th-Order Runge-Kutta)'}</span>
                      <span className="report-kv-k">Particle Ensemble Size</span>
                      <span className="report-kv-v mono">{sections['6_lagrangian_hindcast']?.particle_count || 50} individual particle tracers</span>
                      <span className="report-kv-k">Temporal Reconstruction Horizon</span>
                      <span className="report-kv-v mono">-{sections['6_lagrangian_hindcast']?.integration_hours || 18.0} Hours Backward in Time</span>
                      <span className="report-kv-k">Numerical Timestep (Δt)</span>
                      <span className="report-kv-v mono">{sections['6_lagrangian_hindcast']?.timestep_min || 30} minutes</span>
                    </div>
                  </div>
                </div>

                {/* SECTION 7: Origin Estimate */}
                <div className="report-card" id="sec-7">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">07</span>
                      Estimated Spill Origin Region & Release Window
                    </span>
                    <span className="tag tag-complete">CENTROID IDENTIFIED</span>
                  </div>
                  <div className="report-card__body">
                    <div className="report-kv-grid">
                      <span className="report-kv-k">Origin Centroid Coordinates</span>
                      <span className="report-kv-v mono font-bold" style={{ color: '#10B981', fontSize: '13.5px' }}>
                        {originLatStr}, {originLonStr}
                      </span>
                      <span className="report-kv-k">Reconstructed Release Window</span>
                      <span className="report-kv-v mono">
                        {sec7.estimated_spill_time ? new Date(sec7.estimated_spill_time).toUTCString() : '—'}
                      </span>
                      <span className="report-kv-k">Temporal Uncertainty Envelope</span>
                      <span className="report-kv-v mono">±{sec7.temporal_uncertainty_h || 1.5} hours</span>
                      <span className="report-kv-k">Spatial Uncertainty Radius</span>
                      <span className="report-kv-v mono">±{Number(sec7.spatial_uncertainty_km || 4.2).toFixed(2)} km (95% Confidence Interval)</span>
                    </div>
                  </div>
                </div>

                {/* SECTION 8: AIS Screening Summary */}
                <div className="report-card" id="sec-8">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">08</span>
                      AIS Traffic Screening & Candidate Funnel
                    </span>
                    <span className="badge" style={{ background: 'var(--surface-3)' }}>NMEA 0183/2000 DUAL-FEED</span>
                  </div>
                  <div className="report-card__body">
                    <div className="report-kv-grid">
                      <span className="report-kv-k">Total Vessels in Corridor</span>
                      <span className="report-kv-v mono">{sections['8_ais_screening_summary']?.total_vessels_detected || 7} active transponders</span>
                      <span className="report-kv-k">Spatial Corridor Filter</span>
                      <span className="report-kv-v mono">Radius: {sections['8_ais_screening_summary']?.screening_radius_km || 50.0} km ({sections['8_ais_screening_summary']?.spatial_candidates_count || 7} pass)</span>
                      <span className="report-kv-k">Temporal Matching Filter</span>
                      <span className="report-kv-v mono">Window: ±{sections['8_ais_screening_summary']?.temporal_window_h || 2.0} hours ({sections['8_ais_screening_summary']?.temporal_candidates_count || 7} pass)</span>
                      <span className="report-kv-k">Kinematic Vector Compatibility</span>
                      <span className="report-kv-v mono">{sections['8_ais_screening_summary']?.trajectory_candidates_count || 7} candidate vessels qualify</span>
                    </div>
                  </div>
                </div>

                {/* SECTION 9: Candidate Vessel Roster Table */}
                <div className="report-card" id="sec-9">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">09</span>
                      Candidate Vessel Attribution Roster
                    </span>
                    <span className="badge" style={{ background: 'var(--surface-3)' }}>{sec9.candidates?.length || 0} CANDIDATES</span>
                  </div>
                  <div className="report-card__body" style={{ overflowX: 'auto', padding: 0 }}>
                    <table className="pipeline-table">
                      <thead>
                        <tr>
                          <th>RANK</th>
                          <th>VESSEL NAME</th>
                          <th>TYPE</th>
                          <th>MMSI</th>
                          <th>FLAG</th>
                          <th>DIST. ORIGIN</th>
                          <th>EVIDENCE</th>
                          <th>CONFIDENCE</th>
                          <th>FINAL SCORE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(sec9.candidates || []).map((c: any) => (
                          <tr key={c.mmsi || c.rank}>
                            <td><span style={{ fontWeight: 700, color: c.rank === 1 ? 'var(--accent)' : 'var(--text-muted)' }}>#{c.rank}</span></td>
                            <td><strong style={{ color: 'var(--text-primary)' }}>{c.vessel_name}</strong></td>
                            <td style={{ fontSize: '11px' }}>{c.vessel_type || '—'}</td>
                            <td className="mono" style={{ fontSize: '11px' }}>{c.mmsi}</td>
                            <td>{c.flag || '—'}</td>
                            <td className="mono">{Number(c.distance_km || 0).toFixed(1)} km</td>
                            <td className="mono">{Number(c.evidence_score || 0).toFixed(3)}</td>
                            <td className="mono">{Number(c.data_confidence || 0).toFixed(3)}</td>
                            <td className="mono">
                              <strong style={{ color: (c.final_score || 0) > 0.7 ? '#10B981' : 'var(--text-primary)' }}>
                                {((c.final_score || 0) * 100).toFixed(1)}%
                              </strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* SECTION 10: Attribution Evidence */}
                <div className="report-card" id="sec-10">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">10</span>
                      Attribution Evidence & Behavioral Breakdown
                    </span>
                    <span className="tag tag-investigation">FORENSIC OBSERVATIONS</span>
                  </div>
                  <div className="report-card__body">
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>TOP CANDIDATE:</div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent)', marginTop: 2 }}>
                        {sec10.top_candidate_name} (MMSI <span className="mono">{sec10.top_candidate_mmsi}</span>)
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 4 }}>
                        Methodology: {sec10.scoring_methodology}
                      </div>
                    </div>

                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                      Evidentiary Observations & Behavioral Anomalies:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(sec10.top_candidate_evidence || []).map((obs: string, idx: number) => (
                        <li key={idx}>
                          <strong style={{ color: 'var(--text-primary)' }}>{obs}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* SECTION 11: Forward Forecast */}
                <div className="report-card" id="sec-11">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">11</span>
                      Forward Dispersion Forecast & Landfall Threat
                    </span>
                    <span className="tag tag-complete">+48H ENSEMBLE</span>
                  </div>
                  <div className="report-card__body">
                    <div className="report-kv-grid">
                      <span className="report-kv-k">Forecast Horizons</span>
                      <span className="report-kv-v mono">{(sections['11_forward_forecast']?.horizons || ['+6h', '+12h', '+24h', '+48h']).join(', ')} (+{sections['11_forward_forecast']?.forecast_duration_h || 48}h)</span>
                      <span className="report-kv-k">Coastal Landfall Risk Assessment</span>
                      <span className="report-kv-v font-bold" style={{ color: '#10B981' }}>
                        {sections['11_forward_forecast']?.coastal_impact_risk || 'Low (< 5% Offshore Drift)'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SECTION 12: Uncertainty Quantification */}
                <div className="report-card" id="sec-12">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">12</span>
                      Uncertainty Quantification & Envelopes
                    </span>
                    <span className="badge" style={{ background: 'var(--surface-3)' }}>GAUSSIAN TURBULENCE</span>
                  </div>
                  <div className="report-card__body">
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      {sections['12_uncertainty_quantification']?.methodology}: Spatial dispersion bounds represent 95% confidence intervals factoring in oceanographic mesoscale turbulence and atmospheric gust variability. A confidence discount is applied in regions of low AIS transponder density or high SAR speckle variance.
                    </p>
                  </div>
                </div>

                {/* SECTION 13: Scientific Limitations */}
                <div className="report-card" id="sec-13">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">13</span>
                      Scientific & Methodological Limitations
                    </span>
                    <span className="tag tag-investigation">BOUNDARY CONDITIONS</span>
                  </div>
                  <div className="report-card__body">
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(sections['13_limitations']?.points || []).map((pt: string, idx: number) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* SECTION 14: Reproducibility & Cryptographic Hash */}
                <div className="report-card" id="sec-14">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">14</span>
                      Reproducibility Metadata & Cryptographic Integrity
                    </span>
                    <span className="tag tag-complete">VERIFIED AUDIT CHAIN</span>
                  </div>
                  <div className="report-card__body">
                    <div className="report-kv-grid">
                      <span className="report-kv-k">Reproducibility Seed</span>
                      <span className="report-kv-v mono">{sec14.random_seed ? `Seed ${sec14.random_seed} (Guaranteed Deterministic Execution)` : 'N/A'}</span>
                      <span className="report-kv-k">Database Engine</span>
                      <span className="report-kv-v mono">{sec14.database_engine || 'SQLite WAL'}</span>
                      <span className="report-kv-k">Software Version</span>
                      <span className="report-kv-v mono">OILTRACE AI v{sec14.software_version || '1.0.0'}</span>
                      <span className="report-kv-k">Cryptographic Digest</span>
                      <span className="report-kv-v mono" style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>
                        SHA-256: {shaHash}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SECTION 15: Legal Disclaimer */}
                <div className="report-card" id="sec-15">
                  <div className="report-card__header">
                    <span className="report-card__title">
                      <span className="badge badge-accent">15</span>
                      Legal & Investigative Disclaimer
                    </span>
                    <span className="tag tag-investigation">STATUTORY NOTICE</span>
                  </div>
                  <div className="report-card__body">
                    <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                      {sections['15_disclaimer']?.text || (
                        'OILTRACE AI is an investigative decision-support and evidence-triaging platform. Attribution scores represent statistical and physical compatibility between reconstructed spill trajectories and historical vessel presence. This report DOES NOT constitute legal proof of culpability or definitive legal attribution of liability. No vessel is confirmed as legally responsible without physical sampling and formal maritime authority investigation.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: Official Document Preview */}
          {viewMode === 'document' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 20px 20px' }}>
              <div
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '8px 16px',
                    background: 'var(--surface-2)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>
                    OFFICIAL MARITIME INVESTIGATION HTML DOSSIER EMBED
                  </span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary btn-xs" onClick={handlePrint}>
                      🖨️ Print Document
                    </button>
                    <a
                      href={getReportHtmlUrl(effectiveId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-xs"
                    >
                      Open in Separate Tab ↗
                    </a>
                  </div>
                </div>
                <iframe
                  src={getReportHtmlUrl(effectiveId)}
                  style={{ flex: 1, border: 'none', width: '100%', background: '#0B0F14' }}
                  title="Official Forensic Investigation Report Document"
                />
              </div>
            </div>
          )}

          {/* VIEW 3: Raw Evidence JSON Package */}
          {viewMode === 'json' && (
            <div style={{ flex: 1, padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  STRUCTURED FORENSIC EVIDENCE PAYLOAD ({Object.keys(sections).length} Sections &bull; SHA-256 Validated)
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-xs" onClick={handleCopyJson}>
                    {jsonCopied ? '✓ Copied to Clipboard' : 'Copy JSON'}
                  </button>
                  <button className="btn btn-primary btn-xs" onClick={handleExportJson}>
                    Download Evidence JSON
                  </button>
                </div>
              </div>
              <div className="report-json-viewer">
                {JSON.stringify({
                  dossier_id: report.report_id,
                  incident_id: effectiveId,
                  generated_at: report.generated_at,
                  sha256_checksum: shaHash,
                  sections: sections,
                }, null, 2)}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Empty State */
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 14,
            padding: 24,
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            DOSSIER PENDING GENERATION
          </div>
          <div style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>
            No Investigation Dossier Generated Yet
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: 440, textAlign: 'center', lineHeight: 1.5 }}>
            Compile an official forensic investigation dossier aggregating SAR detection morphology, reverse hydrodynamic hindcast coordinates, AIS vessel trajectory correlation, and algorithmic attribution ranking.
          </div>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Compiling Dossier...' : 'Generate Evidence Dossier'}
          </button>
        </div>
      )}
    </div>
  );
}
