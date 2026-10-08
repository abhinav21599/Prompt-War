import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchSpill, fetchAllTracks, fetchAttribution } from '../services/api';
import { useHindcast, useForecast } from '../hooks/useSpill';
import InvestigationMap from '../map/InvestigationMap';
import LayerControl from '../components/LayerControl';
import PageHeader from '../components/PageHeader';
import { useStore } from '../state/store';
import { LoadingState } from '../components/StateComponents';

export default function DigitalTwinPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const selectedSpillId = useStore((s) => s.selectedSpillId);
  const activeId = id || selectedSpillId || 'INC-001';

  const [spill, setSpill] = useState<any>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const { hindcast } = useHindcast(activeId);
  const { forecast } = useForecast(activeId);

  const {
    timelinePosition,
    setTimelinePosition,
    timelinePlaying,
    setTimelinePlaying,
    timelineSpeed,
    setTimelineSpeed,
  } = useStore();

  const animRef = useRef<number | null>(null);
  const prevTimeRef = useRef<number | null>(null);
  const posRef = useRef(timelinePosition);

  useEffect(() => {
    posRef.current = timelinePosition;
  }, [timelinePosition]);

  useEffect(() => {
    setLoading(true);
    setDataError(null);
    Promise.all([
      fetchSpill(activeId).catch((e) => {
        console.warn('Failed to fetch spill', e);
        return null;
      }),
      fetchAllTracks(activeId).catch((e) => {
        console.warn('Failed to fetch tracks', e);
        return [];
      }),
      fetchAttribution(activeId).catch((e) => {
        console.warn('Failed to fetch attribution', e);
        return null;
      }),
    ])
      .then(([sp, tr, attr]) => {
        setSpill(sp);
        setTracks(Array.isArray(tr) ? tr : []);
        setVessels(attr?.vessels || []);
        if (!sp) setDataError(`Spill telemetry for ${activeId} is pending. Run Drift Hindcast first.`);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeId]);

  const animate = useCallback(
    (ts: number) => {
      if (prevTimeRef.current !== null) {
        const dt = (ts - prevTimeRef.current) / 1000;
        const currentPos = posRef.current;
        const next = currentPos + dt * timelineSpeed * 0.005;
        if (next >= 1) {
          setTimelinePlaying(false);
          setTimelinePosition(1);
          return;
        }
        setTimelinePosition(next);
      }
      prevTimeRef.current = ts;
      animRef.current = requestAnimationFrame(animate);
    },
    [timelineSpeed, setTimelinePosition, setTimelinePlaying]
  );

  useEffect(() => {
    if (timelinePlaying) {
      prevTimeRef.current = null;
      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [timelinePlaying, animate]);

  if (loading) return <LoadingState message="Initializing 4D Spatiotemporal Digital Twin..." />;

  const hindcastHours = hindcast?.hindcast_hours || hindcast?.integration_hours || 18;
  const forecastHours = forecast?.forecast_hours || forecast?.integration_hours || 48;
  const totalHours = Math.max(1, hindcastHours + forecastHours);
  const t0Ratio = hindcastHours / totalHours;

  let formattedTime = '—';
  try {
    const rawT0 = spill?.satellite_acquisition_time;
    const t0 = rawT0 ? new Date(rawT0).getTime() : Date.now();
    const safeT0 = isNaN(t0) ? Date.now() : t0;
    const safePos = typeof timelinePosition === 'number' && !isNaN(timelinePosition) ? timelinePosition : 0;
    const currentOffsetH = (safePos - t0Ratio) * totalHours;
    const currentTime = new Date(safeT0 + currentOffsetH * 3600 * 1000);
    if (!isNaN(currentTime.getTime())) {
      formattedTime = `${currentTime.toISOString().slice(0, 16)} UTC`;
    }
  } catch (e) {
    // Keep fallback
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <PageHeader
        title={`${activeId} — 4D Digital Twin Replay`}
        subtitle="Hindcast Drift Reconstruction • Sentinel-1 T0 Observation • Forward Lagrangian Dispersion"
        provenance={spill?.provenance || 'observed'}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className="mono badge"
              style={{
                fontSize: '12px',
                padding: '4px 8px',
                background: 'var(--surface-3)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-strong)',
              }}
            >
              CLOCK: {formattedTime}
            </span>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate(`/incidents/${activeId}/report`)}
              style={{ fontWeight: 600 }}
            >
              Next: Evidence Dossier (08) →
            </button>
          </div>
        }
      />

      {/* Inline data notice if spill not loaded */}
      {dataError && (
        <div
          style={{
            padding: '6px 16px',
            background: 'rgba(200,164,93,0.08)',
            borderBottom: '1px solid rgba(200,164,93,0.3)',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: 'var(--oil)' }}>⚠</span>
          <span>{dataError}</span>
        </div>
      )}

      {/* Main viewport with InvestigationMap */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <InvestigationMap
          spill={spill}
          hindcast={hindcast}
          forecast={forecast}
          tracks={tracks}
          attributions={vessels}
          timelineStep={timelinePosition}
        >
          <LayerControl />
        </InvestigationMap>
      </div>

      {/* Playback timeline footer controls */}
      <div
        className="digital-twin-controls"
        style={{
          background: 'var(--surface-1)',
          borderTop: '1px solid var(--border)',
          padding: '10px 16px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setTimelinePosition(0)}
            title="Jump to Origin (Start)"
          >
            |&lt;
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setTimelinePosition(Math.max(0, timelinePosition - 0.05))}
            title="Step backward"
          >
            &lt;
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setTimelinePlaying(!timelinePlaying)}
            style={{ minWidth: 76 }}
          >
            {timelinePlaying ? 'PAUSE' : 'PLAY'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setTimelinePosition(Math.min(1, timelinePosition + 0.05))}
            title="Step forward"
          >
            &gt;
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setTimelinePosition(1)} title="Jump to end">
            &gt;|
          </button>

          {/* Quick jump bookmarks */}
          <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
            <button
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '10px', padding: '2px 6px' }}
              onClick={() => setTimelinePosition(0)}
            >
              Origin (-{hindcastHours}h)
            </button>
            <button
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '10px', padding: '2px 6px' }}
              onClick={() => setTimelinePosition(t0Ratio)}
            >
              T0 (Detection)
            </button>
            <button
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '10px', padding: '2px 6px' }}
              onClick={() => setTimelinePosition(Math.min(1, t0Ratio + (24 / totalHours)))}
            >
              +24h Horizon
            </button>
          </div>

          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={timelinePosition}
            onChange={(e) => setTimelinePosition(parseFloat(e.target.value))}
            className="timeline-scrubber"
            style={{ flex: 1, margin: '0 8px' }}
          />

          <span className="timeline-current-time mono" style={{ minWidth: 150, textAlign: 'right', fontSize: '12px' }}>
            {formattedTime}
          </span>

          {/* Speed multiplier selector */}
          <div style={{ display: 'flex', gap: 2 }}>
            {[1, 2, 5, 10].map((s) => (
              <button
                key={s}
                className={`btn btn-sm ${timelineSpeed === s ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '10px', padding: '2px 6px', minWidth: 28 }}
                onClick={() => setTimelineSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        <div
          className="timeline-markers"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 4,
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
          }}
        >
          <span>T-{hindcastHours}h (Hindcast Origin)</span>
          <span style={{ color: 'var(--oil)' }}>▲ T0 (Sentinel-1 SAR Acquisition)</span>
          <span>T+{forecastHours}h (Forecast Horizon)</span>
        </div>

        <div className="provenance-strip" style={{ marginTop: 6, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <span style={{ color: 'var(--prov-reconstructed)' }}>&bull; RECONSTRUCTED PARTICLES</span>
            <span style={{ color: 'var(--oil)' }}>&bull; SAR OBSERVATION (T0)</span>
            <span style={{ color: 'var(--prov-predicted)' }}>&bull; PREDICTED DISPERSION</span>
            <span style={{ color: 'var(--accent)' }}>&bull; AIS TRACKS</span>
          </div>
          <div style={{ color: 'var(--text-disabled)', fontFamily: 'var(--font-mono)' }}>
            DIGITAL TWIN 4D REPLAY &bull; MARITIME SURVEILLANCE
          </div>
        </div>
      </div>
    </div>
  );
}
