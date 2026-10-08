import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchSpill, fetchEnvironment, fetchCurrentEnvironment, fetchCurrents, fetchWind, runHindcast, fetchAllTracks, fetchAttribution } from '../services/api';
import { useHindcast, useForecast } from '../hooks/useSpill';
import { useStore } from '../state/store';
import InvestigationMap from '../map/InvestigationMap';
import LayerControl from '../components/LayerControl';
import ProvenanceBadge from '../components/ProvenanceBadge';
import PageHeader from '../components/PageHeader';
import { LoadingState, UnavailableState } from '../components/StateComponents';

export default function DriftPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { triggerIncidentRefresh, dataMode, incidentRefreshTrigger } = useStore();
  const [spill, setSpill] = useState<any>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState(false);
  const [envFields, setEnvFields] = useState<any[]>([]);
  const [realWind, setRealWind] = useState<any>(null);
  const [realCurrents, setRealCurrents] = useState<any>(null);
  const { hindcast, loading: hLoading, refetch } = useHindcast(id || null);
  const { forecast } = useForecast(id || null);

  useEffect(() => {
    if (!id) return;
    fetchSpill(id).then(setSpill).catch(console.error);
    fetchEnvironment(id)
      .then((res) => setEnvFields(Array.isArray(res) ? res : res ? [res] : []))
      .catch((err) => {
        console.error(err);
        setEnvFields([]);
      });
    fetchAllTracks(id).then((t) => setTracks(t || [])).catch(console.error);
    fetchAttribution(id).then((res) => setVessels(res?.vessels || [])).catch(console.error);
  }, [id, incidentRefreshTrigger, dataMode]);

  useEffect(() => {
    if (dataMode === 'real') {
      fetchWind('real').then(setRealWind).catch(console.error);
      fetchCurrents('real').then(setRealCurrents).catch(console.error);
    } else {
      setRealWind(null);
      setRealCurrents(null);
    }
  }, [dataMode]);

  const handleRunHindcast = async () => {
    if (!id) return;
    setRunning(true);
    setRunError(null);
    setRunSuccess(false);
    try {
      await runHindcast(id, dataMode);
      await refetch();
      triggerIncidentRefresh();
      setRunSuccess(true);
    } catch (e: any) {
      console.error(e);
      setRunError(e?.message || 'Failed to complete reverse drift hindcast simulation.');
    } finally {
      setRunning(false);
    }
  };

  const currentField = (envFields || []).find((f) => f?.field_type === 'current');
  const windField = (envFields || []).find((f) => f?.field_type === 'wind');
  const currentPt = currentField?.field_data?.points?.[12];
  const windPt = windField?.field_data?.points?.[12];
  const currentSpeed = currentPt ? Math.sqrt(currentPt.current_u ** 2 + currentPt.current_v ** 2) : null;
  const windSpeed = windPt ? Math.sqrt(windPt.wind_u ** 2 + windPt.wind_v ** 2) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader
        title={`${id || 'INCIDENT'} — Drift Reconstruction (Hindcast)`}
        subtitle="Reverse Lagrangian Hydrodynamic Integration • Runge-Kutta 4th Order (RK4) • Multi-Particle Ensemble"
        provenance="reconstructed"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleRunHindcast} disabled={running}>
              {running ? 'Reconstructing (RK4)...' : hindcast ? 'Re-run Hindcast' : 'Run Drift Hindcast'}
            </button>
            {hindcast && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/incidents/${id}/vessels`)}
                style={{ fontWeight: 600 }}
              >
                Next: Vessel Attribution (05) →
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
          <span>✓ Reverse drift hindcast completed successfully. Origin envelope and dispersion trajectory calculated.</span>
          <button onClick={() => setRunSuccess(false)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${leftCollapsed ? '34px' : '270px'} 1fr ${rightCollapsed ? '34px' : '340px'}`,
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Left: Environment panel */}
        {leftCollapsed ? (
          <div
            onClick={() => setLeftCollapsed(false)}
            title="Expand Metocean Forcing"
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
              title="Expand Metocean"
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
              METOCEAN FORCING
            </div>
          </div>
        ) : (
          <div style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-secondary)', overflowY: 'auto' }}>
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Metocean Forcing Fields</span>
              <button
                type="button"
                onClick={() => setLeftCollapsed(true)}
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
                  <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

          <div style={{ padding: 12 }}>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                }}
              >
                Ocean Surface Currents
              </div>
              {dataMode === 'real' && realCurrents ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Velocity Magnitude (Mean)</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{realCurrents.current?.mean_speed} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Max Domain Velocity</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{realCurrents.current?.max_speed} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>U Component (East)</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{realCurrents.current?.mean_u} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>V Component (North)</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{realCurrents.current?.mean_v} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Environmental Source</span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--prov-observed)', fontWeight: 600 }}>{realCurrents.source}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Dataset</span>
                    <span className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{realCurrents.dataset}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Variables</span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>uo / vo</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Units</span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{realCurrents.units || 'm/s'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status</span>
                    <span className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{realCurrents.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mode</span>
                    <span className="mono" style={{ fontSize: '10px', color: 'var(--prov-observed)', fontWeight: 600 }}>REAL DATA</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Analysis Time</span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{realCurrents.timestamp?.replace('T', ' ').slice(0, 16)} UTC</span>
                  </div>
                </div>
              ) : currentField ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Velocity Magnitude</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{currentSpeed?.toFixed(3)} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>U Component (East)</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{currentPt?.current_u?.toFixed(4)} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>V Component (North)</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{currentPt?.current_v?.toFixed(4)} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Data Provider</span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--prov-synthetic)' }}>{currentField.source}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mode</span>
                    <span className="mono" style={{ fontSize: '10px', color: 'var(--prov-synthetic)' }}>SYNTHETIC HYDRODYNAMICS</span>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Unavailable</div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                }}
              >
                Atmospheric Wind (10m)
              </div>
              {dataMode === 'real' && realWind ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Wind Speed (Mean)</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{realWind.wind?.mean_speed} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Max Domain Velocity</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{realWind.wind?.max_speed} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>U10 Component (East)</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{realWind.wind?.mean_u} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>V10 Component (North)</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{realWind.wind?.mean_v} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Data Provider</span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--prov-observed)', fontWeight: 600 }}>{realWind.source}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Dataset</span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{realWind.dataset}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status</span>
                    <span className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{realWind.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Reanalysis Time</span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{realWind.timestamp?.replace('T', ' ').slice(0, 16)} UTC</span>
                  </div>
                </div>
              ) : windField ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Wind Speed (Center)</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{windSpeed?.toFixed(2)} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>U10 Component (East)</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{windPt?.wind_u?.toFixed(3)} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>V10 Component (North)</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{windPt?.wind_v?.toFixed(3)} m/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Data Provider</span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--prov-synthetic)' }}>{windField.source}</span>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Unavailable</div>
              )}
            </div>

            {dataMode === 'real' ? (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(95,158,122,0.1)',
                  border: '1px solid rgba(95,158,122,0.3)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                <strong style={{ color: 'var(--prov-observed)', fontFamily: 'var(--font-mono)' }}>[REAL DATA PROVIDER]</strong>
                <br />
                Atmospheric wind forcing is derived from Copernicus Climate Data Store ERA5 hourly reanalysis. Not operational live telemetry.
              </div>
            ) : envFields.length > 0 ? (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(200,164,93,0.08)',
                  border: '1px solid rgba(200,164,93,0.3)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                <strong style={{ color: 'var(--oil)', fontFamily: 'var(--font-mono)' }}>[DATA NOTICE]</strong>
                <br />
                {currentField?.field_data?.note || 'Environmental hydrodynamic fields are derived from reanalysis and synthetic models.'}
              </div>
            ) : null}
          </div>
        </div>
        )}

        {/* Center: Map */}
        {hLoading ? (
          <LoadingState message="Integrating reverse Lagrangian drift particles..." />
        ) : (
          <InvestigationMap
            spill={spill}
            hindcast={hindcast}
            forecast={forecast}
            tracks={tracks}
            attributions={vessels}
            contextPreset="hindcast"
          >
            <LayerControl />
            {!hindcast && !hLoading && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%,-50%)',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px 24px',
                  textAlign: 'center',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}
              >
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 12 }}>
                  No drift hindcast computed yet
                </div>
                <button className="btn btn-primary" onClick={handleRunHindcast} disabled={running}>
                  {running ? 'Reconstructing (RK4)...' : 'Run Drift Hindcast'}
                </button>
              </div>
            )}
          </InvestigationMap>
        )}

        {/* Right: Hindcast results & Uncertainty Analysis */}
        {rightCollapsed ? (
          <div
            onClick={() => setRightCollapsed(false)}
            title="Expand Estimated Origin Panel"
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
              title="Expand Origin"
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
              ESTIMATED ORIGIN
            </div>
          </div>
        ) : (
          <div style={{ borderLeft: '1px solid var(--border)', background: 'var(--bg-secondary)', overflowY: 'auto' }}>
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Estimated Origin Region</span>
                <ProvenanceBadge provenance="reconstructed" />
              </div>
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

          {hindcast ? (
            <div style={{ padding: 12 }}>
              {/* Uncertainty Envelope Summary Banner */}
              <div
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Spatiotemporal Uncertainty Envelope
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Spatial Uncertainty:</span>
                    <span className="mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--oil)' }}>
                      {hindcast.spatial_uncertainty_km?.toFixed(2)} km radius
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Temporal Window:</span>
                    <span className="mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--prov-reconstructed)' }}>
                      ±{hindcast.origin_time_uncertainty_h} hours
                    </span>
                  </div>
                </div>
              </div>

              {/* Parameter Table */}
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                }}
              >
                Reconstruction Parameters
              </div>

              {[
                ['Origin Lat (Centroid)', hindcast.origin_lat != null ? `${hindcast.origin_lat.toFixed(6)}°N` : '—'],
                ['Origin Lon (Centroid)', hindcast.origin_lon != null ? `${hindcast.origin_lon.toFixed(6)}°E` : '—'],
                ['Estimated Release Time', hindcast.origin_time_estimate ? `${hindcast.origin_time_estimate.slice(0, 19)} UTC` : '—'],
                ['Time Uncertainty (Δt)', `±${hindcast.origin_time_uncertainty_h} h`],
                ['Spatial Radius', `${hindcast.spatial_uncertainty_km?.toFixed(2)} km`],
                ['Ensemble Particle Count', hindcast.particle_count],
                ['Integration Method', hindcast.integration_method],
                ['Windage Leeway (α)', `${hindcast.windage_coefficient} (3%)`],
                ['Numerical Timestep', `${hindcast.timestep_min} min`],
                ['Hindcast Duration', `${hindcast.hindcast_hours || hindcast.integration_hours} hours`],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '5px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span className="mono" style={{ color: 'var(--text-primary)' }}>{v}</span>
                </div>
              ))}

              <div style={{ marginTop: 16 }}>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => navigate(`/incidents/${id}/vessels`)}
                >
                  Proceed to Vessel Attribution (05) →
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              <UnavailableState
                title="No Drift Hindcast"
                message="Click 'Run Drift Hindcast' to calculate the reverse trajectory and estimate the spatiotemporal release region."
              />
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
