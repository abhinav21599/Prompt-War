import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchSpill, runForecast, fetchAllTracks, fetchAttribution } from '../services/api';
import { useForecast, useHindcast } from '../hooks/useSpill';
import { useStore } from '../state/store';
import InvestigationMap from '../map/InvestigationMap';
import LayerControl from '../components/LayerControl';
import ProvenanceBadge from '../components/ProvenanceBadge';
import PageHeader from '../components/PageHeader';
import { LoadingState, UnavailableState } from '../components/StateComponents';

export default function ForecastPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { triggerIncidentRefresh, dataMode, incidentRefreshTrigger } = useStore();
  const [spill, setSpill] = useState<any>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState(false);
  const { forecast, loading, refetch } = useForecast(id || null);
  const { hindcast } = useHindcast(id || null);

  const horizons = Object.keys(forecast?.horizon_stats || {});
  const [selectedHorizon, setSelectedHorizon] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchSpill(id).then(setSpill).catch(console.error);
    fetchAllTracks(id).then((t) => setTracks(t || [])).catch(console.error);
    fetchAttribution(id).then((res) => setVessels(res?.vessels || [])).catch(console.error);
  }, [id, incidentRefreshTrigger, dataMode]);

  useEffect(() => {
    if (horizons.length > 0 && (!selectedHorizon || !horizons.includes(selectedHorizon))) {
      setSelectedHorizon(horizons[0]);
    }
  }, [forecast, horizons, selectedHorizon]);

  const handleRun = async () => {
    if (!id) return;
    setRunning(true);
    setRunError(null);
    setRunSuccess(false);
    try {
      await runForecast(id, dataMode);
      await refetch();
      triggerIncidentRefresh();
      setRunSuccess(true);
    } catch (e: any) {
      console.error(e);
      setRunError(e?.message || 'Failed to calculate drift forecast.');
    } finally {
      setRunning(false);
    }
  };

  const activeStat = selectedHorizon && forecast?.horizon_stats ? forecast.horizon_stats[selectedHorizon] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader
        title={`${id || 'INCIDENT'} — Drift Forecast`}
        subtitle="Forward Lagrangian Particle Integration • Runge-Kutta 4th Order (RK4) • +48h Ensemble Prediction"
        provenance="predicted"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {horizons.length > 0 && (
              <div className="horizon-selector">
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '4px' }}>WINDOW:</span>
                {horizons.map((h) => (
                  <button
                    key={h}
                    className={`horizon-btn ${selectedHorizon === h ? 'horizon-btn--active' : ''}`}
                    onClick={() => setSelectedHorizon(h)}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
            <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={running}>
              {running ? 'Integrating Particles...' : forecast ? 'Re-run Forecast' : 'Run Drift Forecast'}
            </button>
            {forecast && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/incidents/${id}/timeline`)}
                style={{ fontWeight: 600 }}
              >
                Next: Digital Twin 4D (07) →
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
          <span>✓ Forward Lagrangian drift forecast computed for +48 hour projection window.</span>
          <button onClick={() => setRunSuccess(false)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: rightCollapsed ? '1fr 34px' : '1fr 340px',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <LoadingState message="Calculating Lagrangian forward drift forecast..." />
        ) : (
          <InvestigationMap
            spill={spill}
            hindcast={hindcast}
            forecast={forecast}
            tracks={tracks}
            attributions={vessels}
            contextPreset="forecast"
          >
            <LayerControl />
            {!forecast && !loading && (
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
                  No drift forecast computed yet
                </div>
                <button className="btn btn-primary" onClick={handleRun} disabled={running}>
                  {running ? 'Integrating Particles...' : 'Run Drift Forecast'}
                </button>
              </div>
            )}
          </InvestigationMap>
        )}

        {/* Right: Horizons & Physical Dispersion Summary */}
        {rightCollapsed ? (
          <div
            onClick={() => setRightCollapsed(false)}
            title="Expand Ensemble Horizons"
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
              title="Expand Horizons"
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
              ENSEMBLE HORIZONS
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
                <span>Ensemble Horizons</span>
                {forecast && (
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {forecast.particle_count} PARTICLES
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setRightCollapsed(true)}
                title="Collapse Horizons"
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

          {forecast ? (
            <div style={{ padding: 12 }}>
              {/* Active Horizon Detail Card */}
              {activeStat && (
                <div
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 12,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--prov-predicted)' }}>
                      HORIZON: {selectedHorizon}
                    </span>
                    <ProvenanceBadge provenance="predicted" />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Projected Area:</span>
                      <span className="mono" style={{ color: 'var(--text-primary)' }}>
                        {activeStat.area_km2?.toFixed(2)} km²
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Particle Spread:</span>
                      <span className="mono" style={{ color: 'var(--oil)' }}>
                        ±{activeStat.spread_km?.toFixed(2)} km
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Centroid Location:</span>
                      <span className="mono" style={{ color: 'var(--text-primary)' }}>
                        {activeStat.centroid_lat?.toFixed(4)}°N, {activeStat.centroid_lon?.toFixed(4)}°E
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Horizon List Selection */}
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
                Select Horizon Window
              </div>

              {horizons.map((h) => {
                const st = forecast.horizon_stats[h];
                const isSelected = selectedHorizon === h;
                return (
                  <div
                    key={h}
                    onClick={() => setSelectedHorizon(h)}
                    style={{
                      background: isSelected ? 'var(--accent-dim)' : 'var(--surface-1)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      padding: 10,
                      marginBottom: 8,
                      cursor: 'pointer',
                      transition: 'border-color var(--transition-fast)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--prov-predicted)' }}>
                        {h}
                      </span>
                      <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        ±{st.spread_km?.toFixed(1)} km
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>Lat/Lon: {st.centroid_lat?.toFixed(3)}°, {st.centroid_lon?.toFixed(3)}°</span>
                      <span className="mono">{st.particle_count} pts</span>
                    </div>
                  </div>
                );
              })}

              {/* Numerical Integration Parameters */}
              <div
                style={{
                  marginTop: 14,
                  padding: '10px',
                  background: 'var(--surface-1)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  fontSize: '11px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Model Configuration
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Method</span>
                  <span className="mono" style={{ color: 'var(--text-primary)' }}>{forecast.integration_method}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Timestep (Δt)</span>
                  <span className="mono" style={{ color: 'var(--text-primary)' }}>{forecast.timestep_min} min</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Max Horizon</span>
                  <span className="mono" style={{ color: 'var(--text-primary)' }}>+48 hours</span>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => navigate(`/incidents/${id}/vessels`)}
                >
                  Proceed to Vessel Attribution (06) →
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              <UnavailableState
                title="No Drift Forecast"
                message="Click 'Run Drift Forecast' to project particle trajectories forward 48 hours."
              />
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
