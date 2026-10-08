import type { Coordinates, VesselCandidate } from "@/types";

/** Region shown on the map: the Laccadive Sea, west of the Indian coast. */
const LON_MIN = 70;
const LON_MAX = 76.5;
const LAT_MIN = 7.6;
const LAT_MAX = 13.6;
const VIEW_W = 600;
const VIEW_H = 470;

/** Equirectangular projection onto the SVG viewBox. */
const project = (lon: number, lat: number) => ({
  x: ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * VIEW_W,
  y: ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * VIEW_H,
});

/** Coarse south-west coast of India, [lon, lat]; render geometry, not data. */
const INDIA_COAST: [number, number][] = [
  [72.6, 15.6],
  [73.1, 14.7],
  [73.5, 13.9],
  [73.9, 13.2],
  [74.2, 12.7],
  [74.5, 12.0],
  [74.7, 11.4],
  [74.8, 10.8],
  [74.9, 10.2],
  [75.1, 9.7],
  [75.4, 9.2],
  [75.8, 8.7],
  [76.3, 8.3],
];

const graticuleLons = [71, 72, 73, 74, 75, 76];
const graticuleLats = [8, 9, 10, 11, 12, 13];

const coastPath = `M ${INDIA_COAST.map(([lon, lat]) => {
  const { x, y } = project(lon, lat);
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" L ")} L ${VIEW_W},${VIEW_H} L ${VIEW_W},0 Z`;

interface InvestigationMapProps {
  vessels: VesselCandidate[];
  spillLocation: Coordinates;
  spillId: string;
}

/**
 * A lightweight SVG maritime map of the investigation region: blue ocean,
 * a subtle graticule, the Indian coast, vessel markers and the detection.
 */
const InvestigationMap = ({
  vessels,
  spillLocation,
  spillId,
}: InvestigationMapProps) => {
  const spill = project(spillLocation.lon, spillLocation.lat);

  return (
    <div className="relative h-full w-full overflow-hidden bg-card">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={`Maritime map of the ${spillId} investigation region`}
      >
        <defs>
          <linearGradient id="ocean-depth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eaf5fd" />
            <stop offset="100%" stopColor="#a7cde8" />
          </linearGradient>
        </defs>

        {/* Ocean */}
        <rect
          x="0"
          y="0"
          width={VIEW_W}
          height={VIEW_H}
          fill="url(#ocean-depth)"
        />

        {/* Graticule */}
        {graticuleLons.map((lon) => {
          const { x } = project(lon, 0);
          return (
            <g key={`lon-${lon}`}>
              <line
                x1={x}
                y1="0"
                x2={x}
                y2={VIEW_H}
                stroke="#ffffff"
                strokeOpacity="0.22"
                strokeWidth="0.75"
              />
              <text
                x={x}
                y="12"
                textAnchor="middle"
                fontSize="9"
                fontFamily="var(--font-mono, monospace)"
                fill="#ffffff"
                fillOpacity="0.55"
              >
                {lon}°E
              </text>
            </g>
          );
        })}
        {graticuleLats.map((lat) => {
          const { y } = project(0, lat);
          return (
            <g key={`lat-${lat}`}>
              <line
                x1="0"
                y1={y}
                x2={VIEW_W}
                y2={y}
                stroke="#ffffff"
                strokeOpacity="0.22"
                strokeWidth="0.75"
              />
              <text
                x="8"
                y={y - 4}
                fontSize="9"
                fontFamily="var(--font-mono, monospace)"
                fill="#ffffff"
                fillOpacity="0.55"
              >
                {lat}°N
              </text>
            </g>
          );
        })}

        {/* Coastal land mass */}
        <path
          d={coastPath}
          fill="#fdfefe"
          fillOpacity="0.95"
          stroke="#c3d7e6"
          strokeWidth="1.5"
        />

        {/* Vessel markers */}
        {vessels.map((vessel) => {
          const { x, y } = project(vessel.position.lon, vessel.position.lat);
          const label = y - 12;
          return (
            <g key={vessel.id}>
              <g transform={`translate(${x},${y}) rotate(${vessel.headingDeg})`}>
                <path
                  d="M 0,-4.5 L 9,0 L 0,4.5 Z"
                  fill="hsl(var(--navy))"
                />
                <circle cx="0" cy="0" r="2.1" fill="#ffffff" />
              </g>
              <text
                x={x}
                y={label}
                textAnchor="middle"
                fontSize="9.5"
                fontFamily="var(--font-mono, monospace)"
                fontWeight="500"
                fill="hsl(var(--navy))"
                style={{ paintOrder: "stroke", stroke: "#ffffff", strokeWidth: 3 }}
              >
                {vessel.name}
              </text>
            </g>
          );
        })}

        {/* Detection */}
        <g className="animate-pulse">
          <circle
            cx={spill.x}
            cy={spill.y}
            r="30"
            fill="none"
            stroke="hsl(var(--signal))"
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <circle
            cx={spill.x}
            cy={spill.y}
            r="8"
            fill="none"
            stroke="hsl(var(--signal))"
            strokeOpacity="0.5"
            strokeWidth="1.25"
          />
          <circle cx={spill.x} cy={spill.y} r="3.4" fill="hsl(var(--signal))" />
          <text
            x={spill.x}
            y={spill.y + 42}
            textAnchor="middle"
            fontSize="9.5"
            fontFamily="var(--font-mono, monospace)"
            fontWeight="600"
            fill="hsl(var(--signal))"
            style={{ paintOrder: "stroke", stroke: "#ffffff", strokeWidth: 3 }}
          >
            {spillId}
          </text>
        </g>
      </svg>

      {/* HUD overlays */}
      <div className="pointer-events-none absolute left-3 top-3">
        <span className="text-label">AIS · live overlay</span>
      </div>
      <div className="pointer-events-none absolute right-3 top-3 hidden sm:block">
        <span className="text-label">70.0°E–76.5°E · 7.6°N–13.6°N</span>
      </div>
    </div>
  );
};

export default InvestigationMap;
