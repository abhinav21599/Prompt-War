import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/live-engagement.css';

export type TelemetryStreamType = 'AIS' | 'SAR' | 'DRIFT';

interface TelemetryPoint {
  timestamp: string;
  value: number;
}

interface StreamConfig {
  label: string;
  unit: string;
  baseVal: number;
  minJitter: number;
  maxJitter: number;
  color: string;
  gradientId: string;
  desc: string;
}

const STREAM_CONFIGS: Record<TelemetryStreamType, StreamConfig> = {
  AIS: {
    label: 'AIS FLEET',
    unit: 'epm',
    baseVal: 148,
    minJitter: -6,
    maxJitter: 9,
    color: '#00D9E8',
    gradientId: 'spark-grad-ais',
    desc: 'Live AIS Class-A/B vessel transponder messages',
  },
  SAR: {
    label: 'SAR SATELLITE',
    unit: 'epm',
    baseVal: 42,
    minJitter: -3,
    maxJitter: 5,
    color: '#38BDF8',
    gradientId: 'spark-grad-sar',
    desc: 'Sentinel-1 Level-1 GRD anomaly segment telemetry',
  },
  DRIFT: {
    label: 'PARTICLE DRIFT',
    unit: 'p/sec',
    baseVal: 320,
    minJitter: -18,
    maxJitter: 24,
    color: '#10B981',
    gradientId: 'spark-grad-drift',
    desc: 'Lagrangian 4th-Order Runge-Kutta particle integration',
  },
};

// Seed initial history
function generateInitialHistory(baseVal: number, count: number = 24): TelemetryPoint[] {
  const points: TelemetryPoint[] = [];
  const now = Date.now();
  let current = baseVal;
  for (let i = count - 1; i >= 0; i--) {
    const time = new Date(now - i * 3000);
    const timeStr = time.toTimeString().slice(0, 8);
    current = Math.max(10, current + Math.floor((Math.random() - 0.48) * 12));
    points.push({ timestamp: timeStr, value: current });
  }
  return points;
}

interface LiveEngagementPanelProps {
  isCollapsed?: boolean;
}

export default function LiveEngagementPanel({ isCollapsed = false }: LiveEngagementPanelProps) {
  const [stream, setStream] = useState<TelemetryStreamType>('AIS');
  const config = STREAM_CONFIGS[stream];

  // History buffer
  const [history, setHistory] = useState<TelemetryPoint[]>(() =>
    generateInitialHistory(config.baseVal)
  );

  // Peak and total stats
  const [peak, setPeak] = useState<number>(() => config.baseVal + 35);
  const [totalCount, setTotalCount] = useState<number>(18420);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; point: TelemetryPoint } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Reset history when switching streams
  useEffect(() => {
    const newHist = generateInitialHistory(config.baseVal);
    setHistory(newHist);
    const maxVal = Math.max(...newHist.map((p) => p.value));
    setPeak(maxVal + 20);
  }, [stream]);

  // Telemetry ticking interval
  useEffect(() => {
    const timer = setInterval(() => {
      const nowStr = new Date().toTimeString().slice(0, 8);
      const delta =
        Math.floor(Math.random() * (config.maxJitter - config.minJitter + 1)) +
        config.minJitter;

      setHistory((prev) => {
        const lastVal = prev.length > 0 ? prev[prev.length - 1].value : config.baseVal;
        const nextVal = Math.max(15, lastVal + delta);
        const nextHist = [...prev.slice(1), { timestamp: nowStr, value: nextVal }];

        if (nextVal > peak) {
          setPeak(nextVal);
        }
        return nextHist;
      });

      setTotalCount((c) => c + Math.max(1, Math.floor(Math.abs(delta) / 2) + 3));
    }, 2200);

    return () => clearInterval(timer);
  }, [config, peak]);

  // Current value and trend calculation
  const currentVal = history.length > 0 ? history[history.length - 1].value : config.baseVal;

  const trendDelta = useMemo(() => {
    if (history.length < 8) return 0;
    const recent = history.slice(-6);
    const prior = history.slice(-12, -6);
    const recentAvg = recent.reduce((sum, p) => sum + p.value, 0) / recent.length;
    const priorAvg = prior.reduce((sum, p) => sum + p.value, 0) / prior.length;
    if (priorAvg === 0) return 0;
    const pct = ((recentAvg - priorAvg) / priorAvg) * 100;
    return Number(pct.toFixed(1));
  }, [history]);

  // Generate SVG Sparkline coordinates
  const svgWidth = 210;
  const svgHeight = 44;
  const paddingX = 4;
  const paddingY = 6;

  const { pathD, areaD, pointCoords, lastPt } = useMemo(() => {
    if (history.length === 0) {
      return { pathD: '', areaD: '', pointCoords: [], lastPt: { x: 0, y: 0 } };
    }

    const vals = history.map((p) => p.value);
    const minVal = Math.min(...vals) - 4;
    const maxVal = Math.max(...vals) + 4;
    const range = maxVal - minVal || 1;

    const coords = history.map((pt, i) => {
      const x = paddingX + (i / (history.length - 1)) * (svgWidth - 2 * paddingX);
      const y =
        svgHeight -
        paddingY -
        ((pt.value - minVal) / range) * (svgHeight - 2 * paddingY);
      return { x, y, point: pt };
    });

    // Smooth cardinal / cubic bezier curve
    let line = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i === 0 ? 0 : i - 1];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      line += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    const last = coords[coords.length - 1];
    const first = coords[0];
    const area = `${line} L ${last.x.toFixed(1)} ${svgHeight} L ${first.x.toFixed(1)} ${svgHeight} Z`;

    return {
      pathD: line,
      areaD: area,
      pointCoords: coords,
      lastPt: last,
    };
  }, [history, svgWidth, svgHeight]);

  // Handle hover scrub over sparkline
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || pointCoords.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const scaleX = svgWidth / rect.width;
    const normalizedX = mouseX * scaleX;

    // Find nearest point
    let closest = pointCoords[0];
    let minDist = Infinity;
    for (const pt of pointCoords) {
      const dist = Math.abs(pt.x - normalizedX);
      if (dist < minDist) {
        minDist = dist;
        closest = pt;
      }
    }
    setHoverPoint(closest);
  };

  const handleMouseLeave = () => {
    setHoverPoint(null);
  };

  // ── COLLAPSED MICRO-BADGE VIEW ──
  if (isCollapsed) {
    return (
      <div
        className="live-micro-pill"
        title={`Live Telemetry: ${currentVal} ${config.unit} (${trendDelta >= 0 ? '+' : ''}${trendDelta}% vs 1h baseline) · ${config.desc}`}
      >
        <motion.span
          className="live-pulse-dot"
          style={{ background: config.color, boxShadow: `0 0 8px ${config.color}` }}
          animate={{ scale: [1, 1.45, 1], opacity: [0.75, 1, 0.75] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
        />
        <span className="live-micro-num">{currentVal}</span>
        <span className="live-micro-label">{config.unit}</span>

        {/* Micro-sparkline in collapsed state */}
        <svg width="34" height="14" viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ overflow: 'visible' }}>
          <path
            d={pathD}
            fill="none"
            stroke={config.color}
            strokeWidth="3.2"
            strokeLinecap="round"
            opacity="0.85"
          />
        </svg>
      </div>
    );
  }

  // ── EXPANDED FULL TELEMETRY CARD ──
  return (
    <div className="live-engagement-card">
      {/* Header with live streaming badge */}
      <div className="live-engagement-header">
        <div className="live-badge-stream">
          <motion.span
            className="live-pulse-dot"
            style={{ background: config.color, boxShadow: `0 0 8px ${config.color}` }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          />
          <span>LIVE INGESTION</span>
        </div>
        <span
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-disabled)',
            letterSpacing: '0.04em',
          }}
        >
          42ms LATENCY
        </span>
      </div>

      {/* Stream Selector Buttons */}
      <div className="live-stream-selector">
        {(Object.keys(STREAM_CONFIGS) as TelemetryStreamType[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`live-stream-btn ${stream === key ? 'live-stream-btn--active' : ''}`}
            onClick={() => setStream(key)}
            title={STREAM_CONFIGS[key].desc}
          >
            {STREAM_CONFIGS[key].label}
          </button>
        ))}
      </div>

      {/* Metric Readout & Trend Delta */}
      <div className="live-metric-row">
        <div className="live-counter-wrap">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={currentVal}
              className="live-counter-num"
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 6, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {currentVal}
            </motion.span>
          </AnimatePresence>
          <span className="live-counter-unit">{config.unit}</span>
        </div>

        {/* Trend Delta Badge */}
        <div
          className={`live-trend-pill ${trendDelta >= 0 ? 'live-trend-pill--up' : 'live-trend-pill--down'}`}
          title={`${trendDelta >= 0 ? 'Surge' : 'Decrease'} of ${trendDelta}% compared to rolling 1-hour baseline`}
        >
          <span>{trendDelta >= 0 ? '▲' : '▼'}</span>
          <span>{trendDelta >= 0 ? `+${trendDelta}%` : `${trendDelta}%`}</span>
        </div>
      </div>

      {/* Motion for React Path-Drawn Animated Sparkline */}
      <div className="live-sparkline-container">
        <svg
          ref={svgRef}
          className="live-sparkline-svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id={config.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={config.color} stopOpacity="0.45" />
              <stop offset="100%" stopColor={config.color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area under curve */}
          {areaD && (
            <motion.path
              d={areaD}
              fill={`url(#${config.gradientId})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.35 }}
              transition={{ duration: 1.2, delay: 0.2 }}
            />
          )}

          {/* Animated Path-Drawn Stroke */}
          {pathD && (
            <motion.path
              d={pathD}
              fill="none"
              stroke={config.color}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, ease: 'easeInOut' }}
            />
          )}

          {/* Latest Point Pulsing Beacon */}
          {lastPt && (
            <g>
              <circle cx={lastPt.x} cy={lastPt.y} r="3" fill={config.color} />
              <motion.circle
                cx={lastPt.x}
                cy={lastPt.y}
                r="7"
                stroke={config.color}
                strokeWidth="1.5"
                fill="none"
                animate={{ scale: [0.8, 2.4], opacity: [0.9, 0] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeOut' }}
              />
            </g>
          )}

          {/* Interactive Hover Scrub Guide */}
          {hoverPoint && (
            <g>
              <line
                x1={hoverPoint.x}
                y1={0}
                x2={hoverPoint.x}
                y2={svgHeight}
                stroke="rgba(255, 255, 255, 0.35)"
                strokeDasharray="2,2"
                strokeWidth="1"
              />
              <circle
                cx={hoverPoint.x}
                cy={hoverPoint.y}
                r="4"
                fill="#ffffff"
                stroke={config.color}
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Floating Tooltip */}
        {hoverPoint && (
          <div
            className="live-sparkline-tooltip"
            style={{
              left: `${(hoverPoint.x / svgWidth) * 100}%`,
              top: `${(hoverPoint.y / svgHeight) * 100}%`,
            }}
          >
            <div>{hoverPoint.point.timestamp} UTC</div>
            <div style={{ color: config.color, fontWeight: 700 }}>
              {hoverPoint.point.value} {config.unit}
            </div>
          </div>
        )}
      </div>

      {/* Sub-grid with Peak and Total Telemetry */}
      <div className="live-stats-subgrid">
        <div className="live-substat">
          <span className="live-substat-label">1h Peak</span>
          <span className="live-substat-val">{peak} {config.unit}</span>
        </div>
        <div className="live-substat" style={{ textAlign: 'right' }}>
          <span className="live-substat-label">24h Volume</span>
          <span className="live-substat-val">{(totalCount / 1000).toFixed(1)}k msgs</span>
        </div>
      </div>
    </div>
  );
}

