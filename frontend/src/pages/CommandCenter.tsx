import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDashboardStats, triggerAnalysisPipeline, setSpillsMode } from '../services/api';
import { useStore } from '../state/store';
import KpiStrip from '../components/KpiStrip';
import InvestigationMap from '../map/InvestigationMap';
import LayerControl from '../components/LayerControl';
import { LoadingState, ErrorState } from '../components/StateComponents';
import heroImg from '../assets/hero.png';

export default function CommandCenter() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // 1-Click Pipeline Execution State
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<string | null>(null);
  const [pipelineSuccess, setPipelineSuccess] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const {
    selectedSpillId,
    setSelectedSpillId,
    triggerIncidentRefresh,
    incidentRefreshTrigger,
    dataMode,
    setDataMode,
  } = useStore();
  const navigate = useNavigate();

  const handleSetMode = async (m: string) => {
    setDataMode(m);
    try {
      await setSpillsMode(m);
      triggerIncidentRefresh();
    } catch (e) {
      console.error('Failed to sync data mode with backend:', e);
    }
  };

  const loadData = () => {
    setLoading(true);
    setError(null);
    fetchDashboardStats()
      .then((s) => {
        setStats(s);
        if (s?.incidents?.length > 0 && !selectedSpillId) {
          setSelectedSpillId(s.incidents[0].id);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [incidentRefreshTrigger, dataMode]);

  const incidents = useMemo(() => stats?.incidents || [], [stats]);

  const activeIncident = useMemo(() => {
    return incidents.find((i: any) => i.id === selectedSpillId) || incidents[0] || {
      id: 'INC-2024-001',
      incident_name: 'Arabian Sea Oil Spill',
      region_name: 'Goa Sector',
      area_km2: 174.23,
    };
  }, [incidents, selectedSpillId]);

  const handleRunPipeline = async (spillId: string) => {
    setPipelineRunning(true);
    setPipelineStage('INITIATING PIPELINE');
    setPipelineError(null);
    setPipelineSuccess(null);

    try {
      setPipelineStage('RECONSTRUCTING HINDCAST & ATTRIBUTION...');
      const res = await triggerAnalysisPipeline(spillId, dataMode);
      setPipelineStage('FINALIZING DOSSIER & 4D TWIN...');
      setPipelineSuccess(`Pipeline completed for ${spillId} (${res.stages_completed?.length || 11} stages synchronized).`);
      triggerIncidentRefresh();
      loadData();
    } catch (e: any) {
      setPipelineError(e?.message || 'Pipeline execution encountered an error.');
    } finally {
      setPipelineRunning(false);
      setPipelineStage(null);
    }
  };

  if (loading) return <LoadingState message="Loading maritime command center telemetry..." />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  const gridColumns = `${leftCollapsed ? '42px' : '265px'} 1fr ${rightCollapsed ? '42px' : '315px'}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <KpiStrip
        activeIncidents={stats?.active_incidents || 1}
        analyzedScenes={stats?.analyzed_scenes || 1}
        analyzedVessels={stats?.analyzed_vessels || 7}
        highPriority={stats?.high_priority_cases || 1}
      />
      {/* ── Standard 3-Panel Workstation Layout ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridColumns,
            flex: 1,
            overflow: 'hidden',
            transition: 'grid-template-columns 0.25s ease',
          }}
        >
        {/* ── Left: Active Incidents Operations Panel ── */}
        {leftCollapsed ? (
          <div
            onClick={() => setLeftCollapsed(false)}
            title="Expand Active Incidents Panel"
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
              style={{ width: 26, height: 26, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              title="Expand Active Incidents"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: 'var(--text-muted)',
              }}
            >
              ACTIVE INCIDENTS (6/6)
            </div>
          </div>
        ) : (
          <div
            style={{
              borderRight: '1px solid var(--border)',
              background: 'var(--panel-bg)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transition: 'background 0.2s ease',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--panel-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  ACTIVE INCIDENTS
                </span>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                  6/6
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLeftCollapsed(true)}
                title="Collapse Sidebar"
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
                  <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Selected Active Incident Card */}
            <div
              style={{
                margin: '12px 14px 10px',
                padding: '10px 12px',
                background: 'var(--card-bg)',
                border: '1px solid var(--accent-pill-border)',
                borderLeft: '4px solid var(--accent)',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    background: 'var(--accent-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent)',
                    fontSize: '11px',
                  }}
                >
                  ⬡
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                    {activeIncident?.id || 'INC-2024-001'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    Arabian Sea Oil Spill
                  </div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Goa Sector
                  </div>
                </div>
              </div>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
            </div>

            {/* Forensic Pipeline Steps List */}
            <div style={{ padding: '6px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[
                { num: '03', label: 'SAR Detection', path: `/incidents/${activeIncident?.id || 'INC-2024-001'}/detection` },
                { num: '04', label: 'Hindcast Drift', path: `/incidents/${activeIncident?.id || 'INC-2024-001'}/drift` },
                { num: '05', label: 'Drift Forecast', path: `/incidents/${activeIncident?.id || 'INC-2024-001'}/forecast` },
                { num: '06', label: 'Vessel Attribution', path: `/incidents/${activeIncident?.id || 'INC-2024-001'}/vessels` },
                { num: '07', label: 'Digital Twin 4D', path: `/incidents/${activeIncident?.id || 'INC-2024-001'}/timeline` },
                { num: '08', label: 'Evidence Report', path: `/incidents/${activeIncident?.id || 'INC-2024-001'}/report` },
              ].map((step) => (
                <div
                  key={step.num}
                  onClick={() => navigate(step.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    color: 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e: any) => (e.currentTarget.style.background = 'var(--card-hover-bg)')}
                  onMouseLeave={(e: any) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{step.num}</span>
                  <span style={{ fontSize: '11.5px', fontWeight: 500, color: 'var(--text-primary)' }}>{step.label}</span>
                </div>
              ))}
            </div>

            {/* Bottom Graphic with Vessel & Typography */}
            <div
              style={{
                marginTop: 'auto',
                padding: '16px 14px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                background: 'linear-gradient(180deg, transparent 0%, rgba(5, 11, 20, 0.95) 100%)',
              }}
            >
              <img
                src={heroImg}
                alt="Cleaner Oceans"
                style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px', opacity: 0.85 }}
                onError={(e: any) => {
                  e.target.style.display = 'none';
                }}
              />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--text-secondary)' }}>
                  CLEANER OCEANS
                </div>
                <div style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
                  SAFER TOMORROW
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Center: Interactive Tactical Overview Map ── */}
        <InvestigationMap spill={activeIncident} contextPreset="command_center">
          <LayerControl />
        </InvestigationMap>

        {/* ── Right: Investigation Environment Panel ── */}
        {rightCollapsed ? (
          <div
            onClick={() => setRightCollapsed(false)}
            title="Expand Investigation Tools Panel"
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
              style={{ width: 26, height: 26, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              title="Expand Investigation Tools"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: 'var(--text-muted)',
              }}
            >
              INVESTIGATION ENVIRONMENT
            </div>
          </div>
        ) : (
          <div
            style={{
              borderLeft: '1px solid var(--border)',
              background: 'var(--panel-bg)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transition: 'background 0.2s ease',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--panel-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                INVESTIGATION ENVIRONMENT
              </span>
              <button
                type="button"
                onClick={() => setRightCollapsed(true)}
                title="Collapse Sidebar"
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

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
              {/* Mode Switcher: Simulation vs Live Data */}
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border)',
                  padding: '3px',
                  borderRadius: '6px',
                  marginBottom: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() => handleSetMode('simulation')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '6px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: 'none',
                    background: dataMode === 'simulation' ? 'var(--accent-dim)' : 'transparent',
                    color: dataMode === 'simulation' ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <span>💻</span>
                  <span>Simulation</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetMode('real')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '6px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: 'none',
                    background: dataMode === 'real' ? 'var(--accent-dim)' : 'transparent',
                    color: dataMode === 'real' ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                    <span>Live Data</span>
                </button>
              </div>

              {/* Data Mode Description Box */}
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: dataMode === 'real' ? 'rgba(0, 229, 255, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                  border: dataMode === 'real' ? '1px solid rgba(0, 229, 255, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)',
                  marginBottom: 14,
                  display: 'flex',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    background: dataMode === 'real' ? 'rgba(0, 229, 255, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: dataMode === 'real' ? 'var(--accent)' : '#F59E0B',
                    fontSize: '12px',
                    flexShrink: 0,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M8 1a7 7 0 000 14M1 8h14" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: dataMode === 'real' ? 'var(--accent)' : '#F59E0B' }}>
                    {dataMode === 'real' ? 'Operational Real Data Mode' : 'Simulation Mode'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                    {dataMode === 'real' ? 'Source: Copernicus Marine + CDS ERA5' : 'Source: Synthetic Hydrodynamic Model'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', lineHeight: 1.4 }}>
                    {dataMode === 'real'
                      ? 'Live hydrodynamic current fields from Copernicus Marine and ERA5 hourly atmospheric wind forcing.'
                      : 'High-fidelity demonstration of oil spill trajectories with synthetic SAR, AIS and ocean hydrodynamic models.'}
                  </div>
                </div>
              </div>

              {/* Large Orange 1-Click Pipeline Action Button */}
              <button
                type="button"
                onClick={() => handleRunPipeline(activeIncident?.id || 'INC-2024-001')}
                disabled={pipelineRunning}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: '#F97316',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 16,
                  transition: 'background 0.15s ease',
                }}
              >
                <span style={{ fontSize: '14px' }}>▶</span>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>
                    {pipelineRunning ? (pipelineStage || 'Running Pipeline...') : 'Run 1-Click Pipeline'}
                  </div>
                  <div style={{ fontSize: '10px', opacity: 0.9, fontFamily: 'var(--font-mono)' }}>
                    ({activeIncident?.id || 'INC-2024-001'})
                  </div>
                </div>
              </button>

              {pipelineSuccess && (
                <div style={{ padding: '6px 10px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10B981', color: '#10B981', fontSize: '10.5px', marginBottom: 12 }}>
                  ✓ {pipelineSuccess}
                </div>
              )}

              {/* Pipeline Telemetry Table */}
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                }}
              >
                PIPELINE TELEMETRY
              </div>

              {[
                ['Incident Case', activeIncident?.id || 'INC-2024-001'],
                ['Workstation', 'National Maritime Lab'],
                ['Hydrodynamic Model', 'Lagrangian Drift'],
                ['Attribution Engine', 'Multi-Factor Scoring'],
                ['Telemetry Source', 'Copernicus / AIS / ECMWF'],
                ['Environment', 'Synthetic (Simulation)'],
                ['Mode', 'Simulation'],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '11px',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: k === 'Incident Case' ? 700 : 500 }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>

            {/* Bottom Footer Brand */}
            <div
              style={{
                padding: '12px 14px',
                borderTop: '1px solid var(--panel-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M2 12C5 9 7 15 10 12C13 9 15 15 18 12C21 9 23 15 26 12" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
                <path d="M2 17C5 14 7 20 10 17C13 14 15 20 18 17C21 14 23 20 26 17" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
              </svg>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
                FROM DATA TO CLEANER SEAS
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
