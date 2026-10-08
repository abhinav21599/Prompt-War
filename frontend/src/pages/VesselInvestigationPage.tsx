import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchSpill,
  runAttribution,
  fetchAttribution,
  fetchAllTracks,
  runHindcast,
  fetchLiveVessels,
} from '../services/api';
import InvestigationMap from '../map/InvestigationMap';
import LayerControl from '../components/LayerControl';
import EvidenceBar from '../components/EvidenceBar';
import FilteringFunnel from '../components/FilteringFunnel';
import PageHeader from '../components/PageHeader';
import {
  LoadingState,
  UnavailableState,
} from '../components/StateComponents';
import VesselSilhouette from '../components/VesselSilhouette';
import { useStore } from '../state/store';

export default function VesselInvestigationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { triggerIncidentRefresh, dataMode, incidentRefreshTrigger, selectedMmsi, setSelectedMmsi } = useStore();
  const [spill, setSpill] = useState<any>(null);
  const [attribution, setAttribution] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [liveVessels, setLiveVessels] = useState<any[]>([]);
  const [liveSource, setLiveSource] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [tab, setTab] = useState<'rank' | 'funnel' | 'evidence'>('rank');

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [sp, tr] = await Promise.all([fetchSpill(id), fetchAllTracks(id)]);
      setSpill(sp);
      setTracks(tr || []);
      try {
        const a = await fetchAttribution(id);
        setAttribution(a);
      } catch (e) {
        /* none yet */
      }
      // Fetch live AIS vessels in the background (non-blocking)
      fetchLiveVessels(id).then((live) => {
        if (live?.vessels?.length) {
          setLiveVessels(live.vessels);
          setLiveSource(live.source || 'live');
        }
      }).catch(() => { /* ignore live fetch errors */ });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData, incidentRefreshTrigger, dataMode]);

  const handleRunAttribution = async () => {
    if (!id) return;
    setRunning(true);
    setRunError(null);
    setRunSuccess(false);
    try {
      try {
        await runHindcast(id, dataMode);
      } catch (e) {
        /* might exist */
      }
      const f = await runAttribution(id, dataMode);
      setFunnel(f);
      await loadData();
      triggerIncidentRefresh();
      setRunSuccess(true);
    } catch (e: any) {
      console.error(e);
      setRunError(e?.message || 'Attribution correlation algorithm failed to execute.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <LoadingState message="Loading vessel investigation..." />;

  // Use attribution vessels if available; otherwise show live AIS candidates
  const vessels = attribution?.vessels?.length
    ? attribution.vessels
    : funnel?.vessels?.length
      ? funnel.vessels
      : liveVessels;
  const topVessel = vessels[activeIdx] || vessels[0];
  const funnelStages = funnel
    ? [
        { label: 'All AIS Observations', count: funnel.total_ais_observations || 0 },
        {
          label: 'Spatial Filter',
          count: funnel.spatial_filter?.output_count || 0,
          removed: funnel.spatial_filter?.removed_count,
          config: funnel.spatial_filter?.radius_km + 'km radius',
        },
        {
          label: 'Temporal Filter',
          count: funnel.temporal_filter?.output_count || 0,
          removed: funnel.temporal_filter?.removed_count,
          config: '±' + funnel.temporal_filter?.window_hours + 'h window',
        },
        {
          label: 'Trajectory Filter',
          count: funnel.trajectory_filter?.output_count || 0,
          removed: funnel.trajectory_filter?.removed_count,
          config: 'heading compatible',
          active: true,
        },
        { label: 'Behaviour Analysis', count: funnel.behaviour_analysis_count || 0 },
        { label: 'Ranked Candidates', count: funnel.ranked_candidates || 0 },
      ]
    : [];

  const getCorrelationLevel = (score: number) => {
    if (score >= 0.7) return { label: 'HIGH CORRELATION', cls: 'attr-score__corr--high' };
    if (score >= 0.4) return { label: 'MEDIUM CORRELATION', cls: 'attr-score__corr--med' };
    return { label: 'LOW CORRELATION', cls: 'attr-score__corr--low' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader
        title={`${id || 'INCIDENT'} — Vessel Attribution`}
        subtitle="AIS Trajectory Correlation • Multi-Factor Attribution Engine • Ranked Candidate Analysis"
        provenance="reconstructed"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {liveVessels.length > 0 && !attribution?.vessels?.length && (
              <span style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: liveSource === 'aisstream_live' ? 'var(--status-ok, #4ade80)' : 'var(--text-muted)',
                background: 'rgba(74,222,128,0.08)',
                border: `1px solid ${liveSource === 'aisstream_live' ? 'rgba(74,222,128,0.4)' : 'var(--border)'}`,
                borderRadius: 4,
                padding: '2px 8px',
              }}>
                {liveSource === 'aisstream_live' ? '● LIVE AIS' : '● SIM DATA'}
              </span>
            )}
            <button className="btn btn-primary btn-sm" onClick={handleRunAttribution} disabled={running}>
              {running ? 'Running Attribution Engine...' : vessels.length ? 'Re-run Attribution' : 'Run Attribution Engine'}
            </button>
            {vessels.length > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/incidents/${id}/forecast`)}
                style={{ fontWeight: 600 }}
              >
                Next: Drift Forecast (06) →
              </button>
            )}
          </div>
        }
      />

      {runError && (
        <div className="alert alert-error" style={{ margin: '8px 16px 0', padding: '8px 14px' }}>
          <span>{runError}</span>
          <button onClick={() => setRunError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      {runSuccess && (
        <div className="alert alert-success" style={{ margin: '8px 16px 0', padding: '8px 14px' }}>
          <span>✓ AIS multi-factor correlation complete. Candidate vessels ranked and scored.</span>
          <button onClick={() => setRunSuccess(false)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${leftCollapsed ? '34px' : '280px'} 1fr ${rightCollapsed ? '34px' : '390px'}`,
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Left: Vessel ranking table */}
        {leftCollapsed ? (
          <div
            onClick={() => setLeftCollapsed(false)}
            title="Expand Vessel Candidates"
            style={{
              borderRight: '1px solid var(--border)',
              background: 'var(--surface-1)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '12px 0',
              cursor: 'pointer',
              userSelect: 'none',
              gap: 14,
            }}
          >
            <button
              className="nav-arrow-toggle-btn"
              style={{
                width: 22,
                height: 22,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
              title="Expand Candidates"
            >
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div
              style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: 'var(--text-muted)',
              }}
            >
              CANDIDATES ({vessels.length})
            </div>
          </div>
        ) : (
          <div
            style={{
              borderRight: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flex: 1 }}>
                {(['rank', 'funnel', 'evidence'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      flex: 1,
                      padding: '10px 4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      background: tab === t ? 'var(--surface-3)' : 'transparent',
                      color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
                      borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                      borderTop: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setLeftCollapsed(true)}
                title="Collapse Sidebar"
                style={{
                  width: 22,
                  height: 22,
                  marginRight: 6,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tab === 'rank' &&
              (vessels.length > 0 ? (
                vessels.map((v: any, i: number) => {
                  const isSelected = selectedMmsi === v.mmsi || (!selectedMmsi && i === activeIdx);
                  return (
                    <div
                      key={v.mmsi}
                      onClick={() => {
                        setActiveIdx(i);
                        setSelectedMmsi(v.mmsi);
                      }}
                      className={'incident-row' + (isSelected ? ' incident-row--selected' : '')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          className="mono"
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: i === 0 ? 'var(--oil)' : 'var(--text-secondary)',
                          }}
                        >
                          #{v.rank} {i === 0 ? 'TOP CANDIDATE' : 'CANDIDATE'}
                        </span>
                        <span
                          className="mono"
                          style={{
                            fontSize: '14px',
                            fontWeight: 700,
                            color: i === 0 ? 'var(--oil)' : 'var(--text-primary)',
                          }}
                        >
                          {(v.final_score * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {v.vessel_name || `MMSI ${v.mmsi}`}
                      </div>

                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {v.vessel_type || 'Unknown'} &bull; MMSI {v.mmsi} &bull; {v.flag || '—'}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <span>EVIDENCE: {v.evidence_score?.toFixed(3)}</span>
                          <span>CONFIDENCE: {v.data_confidence?.toFixed(3)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 2, height: 4 }}>
                          <div style={{ flex: 1, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                background: 'var(--corr-high)',
                                width: `${Math.min(100, (v.evidence_score || 0) * 100)}%`,
                              }}
                            />
                          </div>
                          <div style={{ flex: 1, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                background: 'var(--corr-med-high)',
                                width: `${Math.min(100, (v.data_confidence || 0) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <UnavailableState title="No attribution" message="Run attribution to calculate vessel rankings" />
              ))}

            {tab === 'funnel' &&
              (funnelStages.length > 0 ? (
                <FilteringFunnel stages={funnelStages} />
              ) : (
                <UnavailableState title="No funnel data" message="Run attribution to populate filtering funnel" />
              ))}

            {tab === 'evidence' &&
              (topVessel ? (
                <div style={{ padding: 12 }}>
                  <div style={{ marginBottom: 12, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Attribution Factors: {topVessel.vessel_name || topVessel.mmsi}
                  </div>
                  {(topVessel.factors || []).map((f: any) => (
                    <EvidenceBar
                      key={f.factor}
                      label={f.label}
                      rawValue={f.raw_value}
                      rawUnit={f.raw_unit}
                      normalized={f.normalized}
                      weight={f.weight}
                      contribution={f.contribution}
                    />
                  ))}
                </div>
              ) : (
                <UnavailableState title="Select a candidate" message="Select a vessel to inspect evidence factors" />
              ))}
          </div>
        </div>
        )}

        {/* Center: Map */}
        <InvestigationMap
          spill={spill}
          tracks={tracks}
          attributions={vessels}
          selectedMmsi={selectedMmsi}
          contextPreset="attribution"
          onVesselClick={(mmsi) => {
            setSelectedMmsi(mmsi);
            const idx = vessels.findIndex((v: any) => v.mmsi === mmsi);
            if (idx >= 0) setActiveIdx(idx);
          }}
        >
          <LayerControl />
        </InvestigationMap>

        {/* Right: Candidate Vessel Dossier Panel */}
        {rightCollapsed ? (
          <div
            onClick={() => setRightCollapsed(false)}
            title="Expand Vessel Dossier Panel"
            style={{
              borderLeft: '1px solid var(--border)',
              background: 'var(--surface-1)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '12px 0',
              cursor: 'pointer',
              userSelect: 'none',
              gap: 14,
            }}
          >
            <button
              className="nav-arrow-toggle-btn"
              style={{
                width: 22,
                height: 22,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
              title="Expand Dossier"
            >
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div
              style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: 'var(--text-muted)',
              }}
            >
              VESSEL DOSSIER
            </div>
          </div>
        ) : (
          <div style={{ borderLeft: '1px solid var(--border)', background: 'var(--bg-secondary)', overflowY: 'auto' }}>
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--surface-1)',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                Candidate Vessel Dossier
              </span>
              <button
                type="button"
                onClick={() => setRightCollapsed(true)}
                title="Collapse Panel"
                style={{
                  width: 22,
                  height: 22,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                  <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          {topVessel ? (
            <div>
              {/* Flat Operational Attribution Score Panel */}
              <div className="attr-score-panel">
                <div className="attr-score__top">
                  <span className={`attr-score__rank ${topVessel.rank === 1 ? 'attr-score__rank--top' : ''}`}>
                    #{topVessel.rank} CANDIDATE
                  </span>
                  <span className={`attr-score__corr ${getCorrelationLevel(topVessel.final_score || 0).cls}`}>
                    {getCorrelationLevel(topVessel.final_score || 0).label}
                  </span>
                </div>

                <div className="attr-score__center">
                  <span className="attr-score__label">ATTRIBUTION SCORE</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="attr-score__value mono">{(topVessel.final_score || 0).toFixed(4)}</span>
                    <span className="mono" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      ({((topVessel.final_score || 0) * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>

                <div className="attr-score__bars">
                  <div className="attr-score__bar-row">
                    <div className="attr-score__bar-header">
                      <span className="attr-score__bar-name">Evidence Score (Physical/AIS correlation)</span>
                      <span className="attr-score__bar-val mono">{topVessel.evidence_score?.toFixed(4) || '—'}</span>
                    </div>
                    <div className="attr-score__bar-track">
                      <div
                        className="attr-score__bar-fill attr-score__bar-fill--evidence"
                        style={{ width: `${Math.min(100, (topVessel.evidence_score || 0) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="attr-score__bar-row">
                    <div className="attr-score__bar-header">
                      <span className="attr-score__bar-name">Data Confidence (Coverage/Continuity)</span>
                      <span className="attr-score__bar-val mono">{topVessel.data_confidence?.toFixed(4) || '—'}</span>
                    </div>
                    <div className="attr-score__bar-track">
                      <div
                        className="attr-score__bar-fill attr-score__bar-fill--conf"
                        style={{ width: `${Math.min(100, (topVessel.data_confidence || 0) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Operational Disclaimers and Candidate Details */}
              <div style={{ padding: 12 }}>
                {/* Vessel Silhouette & Visual Blueprint Banner */}
                <div style={{ marginBottom: 12 }}>
                  <VesselSilhouette
                    vesselType={topVessel.vessel_type}
                    vesselName={topVessel.vessel_name}
                    lengthM={topVessel.length_m}
                    grossTonnage={topVessel.gross_tonnage}
                    flag={topVessel.flag}
                    mmsi={topVessel.mmsi}
                    rank={topVessel.rank}
                  />
                </div>

                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(200,164,93,0.08)',
                    border: '1px solid rgba(200,164,93,0.3)',
                    marginBottom: 12,
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.4,
                  }}
                >
                  <strong style={{ color: 'var(--oil)', fontFamily: 'var(--font-mono)' }}>[INVESTIGATIVE NOTICE]</strong>
                  <br />
                  Attribution scores quantify spatiotemporal correlation between vessel trajectory and hindcast drift origin. Scores do not constitute judicial proof of discharge.
                </div>

                {/* Candidate Specifications */}
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-muted)',
                      marginBottom: 6,
                    }}
                  >
                    Vessel Specifications
                  </div>
                  {[
                    ['Vessel Name', topVessel.vessel_name || '—'],
                    ['MMSI', topVessel.mmsi],
                    ['IMO Number', topVessel.imo || '—'],
                    ['Vessel Type', topVessel.vessel_type || '—'],
                    ['Flag State', topVessel.flag || '—'],
                    ['Length Overall', topVessel.length_m ? `${topVessel.length_m} m` : '—'],
                    ['Gross Tonnage', topVessel.gross_tonnage ? `${topVessel.gross_tonnage.toLocaleString()} GT` : '—'],
                    ['Candidate Rank', `#${topVessel.rank}`],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 0',
                        borderBottom: '1px solid var(--border)',
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Spatiotemporal Correlation Metrics */}
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-muted)',
                      marginBottom: 6,
                    }}
                  >
                    Spatiotemporal Correlation
                  </div>
                  {[
                    ['Distance to Hindcast Origin', topVessel.distance_km != null ? `${topVessel.distance_km.toFixed(2)} km` : '—'],
                    ['Temporal Delta (Δt)', topVessel.time_delta_h != null ? `${topVessel.time_delta_h.toFixed(2)} h` : '—'],
                    ['AIS Coverage in Window', topVessel.ais_coverage_pct != null ? `${topVessel.ais_coverage_pct.toFixed(1)}%` : '—'],
                    ['AIS Transmission Gap', topVessel.ais_gap_detected ? 'DETECTED' : 'None'],
                    ['Speed Drop Observed', topVessel.slowdown_observed ? 'YES' : 'No'],
                    ['Course Alteration Observed', topVessel.course_change_observed ? 'YES' : 'No'],
                  ].map(([k, v]) => {
                    const isFlagged = v === 'DETECTED' || v === 'YES';
                    return (
                      <div
                        key={k}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '4px 0',
                          borderBottom: '1px solid var(--border)',
                          fontSize: '12px',
                        }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: isFlagged ? 'var(--status-warning)' : 'var(--text-primary)',
                            fontWeight: isFlagged ? 600 : 400,
                          }}
                        >
                          {v}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Behavioral Observations (Real API data) */}
                {topVessel.behaviour_observations && topVessel.behaviour_observations.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--text-muted)',
                        marginBottom: 6,
                      }}
                    >
                      Behavioral Observations
                    </div>
                    {(topVessel.behaviour_observations || []).map((obs: string, i: number) => (
                      <div
                        key={i}
                        style={{
                          fontSize: '12px',
                          color: 'var(--status-warning)',
                          padding: '4px 0',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex',
                          gap: 6,
                          alignItems: 'baseline',
                        }}
                      >
                        <span style={{ color: 'var(--oil)' }}>&bull;</span>
                        <span>{obs}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <UnavailableState title="Select a vessel" message="Click a candidate from the ranking table or map" />
          )}
        </div>
        )}
      </div>
    </div>
  );
}
