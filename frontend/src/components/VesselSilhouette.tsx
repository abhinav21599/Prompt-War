import React from 'react';

interface VesselSilhouetteProps {
  vesselType?: string;
  vesselName?: string;
  lengthM?: number;
  grossTonnage?: number;
  flag?: string;
  mmsi?: string | number;
  rank?: number;
  style?: React.CSSProperties;
}

export function getVesselCategory(type?: string): 'tanker' | 'bulk' | 'container' | 'cargo' | 'fishing' | 'tug' | 'general' {
  const t = (type || '').toLowerCase();
  if (t.includes('tanker') || t.includes('crude') || t.includes('oil') || t.includes('chemical') || t.includes('lng') || t.includes('lpg')) {
    return 'tanker';
  }
  if (t.includes('bulk') || t.includes('ore')) {
    return 'bulk';
  }
  if (t.includes('container') || t.includes('box')) {
    return 'container';
  }
  if (t.includes('fishing') || t.includes('trawler')) {
    return 'fishing';
  }
  if (t.includes('tug') || t.includes('towing') || t.includes('supply') || t.includes('offshore')) {
    return 'tug';
  }
  if (t.includes('cargo') || t.includes('freight') || t.includes('carrier') || t.includes('general')) {
    return 'cargo';
  }
  return 'general';
}

export default function VesselSilhouette({
  vesselType,
  vesselName,
  lengthM,
  grossTonnage,
  flag,
  mmsi,
  rank,
  style,
}: VesselSilhouetteProps) {
  const category = getVesselCategory(vesselType);

  return (
    <div
      style={{
        position: 'relative',
        background: 'linear-gradient(180deg, rgba(16, 29, 48, 0.95) 0%, rgba(7, 17, 31, 0.98) 100%)',
        border: '1px solid var(--border-strong, #2C415A)',
        borderRadius: 'var(--radius-sm, 4px)',
        padding: '10px 14px',
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        ...style,
      }}
    >
      {/* Top Header Badge Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--accent, #00E5FF)',
              background: 'rgba(0, 229, 255, 0.1)',
              padding: '2px 6px',
              borderRadius: 3,
              border: '1px solid rgba(0, 229, 255, 0.3)',
            }}
          >
            {category.toUpperCase()} SILHOUETTE
          </span>
          {flag && (
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary, #94A3B8)',
              }}
            >
              🚩 {flag}
            </span>
          )}
        </div>
        {rank !== undefined && (
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: rank === 1 ? 'var(--oil, #F59E0B)' : 'var(--text-muted, #64748B)',
            }}
          >
            #{rank} TARGET
          </span>
        )}
      </div>

      {/* Vessel Vector Profile Drawing */}
      <div
        style={{
          height: '68px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <svg
          viewBox="0 0 320 80"
          style={{ width: '100%', height: '100%', overflow: 'visible' }}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="vesselHullGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0284C7" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="waterLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="30%" stopColor="#00E5FF" stopOpacity="0.8" />
              <stop offset="70%" stopColor="#00E5FF" stopOpacity="0.8" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>

          {/* Waterline */}
          <line x1="10" y1="58" x2="310" y2="58" stroke="url(#waterLineGrad)" strokeWidth="1.5" strokeDasharray="6 3" />

          {category === 'tanker' && (
            <g>
              {/* Tanker Hull */}
              <path
                d="M 25 58 L 35 44 L 275 44 L 295 58 Z"
                fill="url(#vesselHullGrad)"
                stroke="#38BDF8"
                strokeWidth="1.5"
              />
              {/* Deck Piping / Manifolds */}
              <line x1="50" y1="42" x2="215" y2="42" stroke="#00E5FF" strokeWidth="2" />
              <line x1="85" y1="36" x2="85" y2="42" stroke="#00E5FF" strokeWidth="1.5" />
              <line x1="135" y1="36" x2="135" y2="42" stroke="#00E5FF" strokeWidth="1.5" />
              <line x1="185" y1="36" x2="185" y2="42" stroke="#00E5FF" strokeWidth="1.5" />
              {/* Center Manifold Tower */}
              <rect x="130" y="32" width="10" height="10" fill="#0369A1" stroke="#38BDF8" strokeWidth="1" />
              {/* Aft Superstructure / Bridge */}
              <rect x="220" y="24" width="38" height="20" rx="1" fill="#0C4A6E" stroke="#38BDF8" strokeWidth="1.5" />
              <rect x="226" y="16" width="26" height="8" fill="#075985" stroke="#38BDF8" strokeWidth="1" />
              {/* Bridge Windows */}
              <line x1="228" y1="20" x2="250" y2="20" stroke="#00E5FF" strokeWidth="1.5" />
              {/* Funnel */}
              <rect x="245" y="10" width="8" height="10" fill="#F59E0B" stroke="#B45309" strokeWidth="1" />
              {/* Fore Mast */}
              <line x1="42" y1="28" x2="42" y2="44" stroke="#94A3B8" strokeWidth="1.5" />
              <line x1="38" y1="32" x2="46" y2="32" stroke="#94A3B8" strokeWidth="1" />
            </g>
          )}

          {category === 'container' && (
            <g>
              {/* Container Hull */}
              <path
                d="M 20 58 L 38 42 L 278 42 L 298 58 Z"
                fill="url(#vesselHullGrad)"
                stroke="#38BDF8"
                strokeWidth="1.5"
              />
              {/* Stacked Container Blocks */}
              <rect x="42" y="22" width="40" height="20" fill="#0284C7" stroke="#38BDF8" strokeWidth="1" />
              <rect x="86" y="18" width="45" height="24" fill="#0369A1" stroke="#38BDF8" strokeWidth="1" />
              <rect x="135" y="18" width="45" height="24" fill="#0284C7" stroke="#38BDF8" strokeWidth="1" />
              <rect x="184" y="20" width="36" height="22" fill="#0369A1" stroke="#38BDF8" strokeWidth="1" />
              {/* Mid-Aft Bridge */}
              <rect x="224" y="14" width="32" height="28" fill="#0C4A6E" stroke="#00E5FF" strokeWidth="1.5" />
              <line x1="228" y1="20" x2="252" y2="20" stroke="#00E5FF" strokeWidth="1.5" />
              {/* Funnel */}
              <rect x="260" y="22" width="10" height="20" fill="#F59E0B" stroke="#B45309" strokeWidth="1" />
            </g>
          )}

          {category === 'bulk' && (
            <g>
              {/* Bulk Carrier Hull */}
              <path
                d="M 22 58 L 34 44 L 275 44 L 295 58 Z"
                fill="url(#vesselHullGrad)"
                stroke="#38BDF8"
                strokeWidth="1.5"
              />
              {/* Hatches */}
              <rect x="48" y="38" width="32" height="6" fill="#075985" stroke="#38BDF8" strokeWidth="1" />
              <rect x="92" y="38" width="32" height="6" fill="#075985" stroke="#38BDF8" strokeWidth="1" />
              <rect x="136" y="38" width="32" height="6" fill="#075985" stroke="#38BDF8" strokeWidth="1" />
              <rect x="180" y="38" width="32" height="6" fill="#075985" stroke="#38BDF8" strokeWidth="1" />
              {/* Deck Cranes */}
              <line x1="84" y1="24" x2="84" y2="44" stroke="#F59E0B" strokeWidth="1.5" />
              <line x1="84" y1="24" x2="70" y2="34" stroke="#F59E0B" strokeWidth="1" />
              <line x1="128" y1="24" x2="128" y2="44" stroke="#F59E0B" strokeWidth="1.5" />
              <line x1="128" y1="24" x2="114" y2="34" stroke="#F59E0B" strokeWidth="1" />
              <line x1="172" y1="24" x2="172" y2="44" stroke="#F59E0B" strokeWidth="1.5" />
              <line x1="172" y1="24" x2="158" y2="34" stroke="#F59E0B" strokeWidth="1" />
              {/* Aft Bridge */}
              <rect x="224" y="20" width="34" height="24" fill="#0C4A6E" stroke="#38BDF8" strokeWidth="1.5" />
              <rect x="230" y="12" width="22" height="8" fill="#075985" stroke="#38BDF8" strokeWidth="1" />
              <rect x="250" y="8" width="8" height="10" fill="#F59E0B" stroke="#B45309" strokeWidth="1" />
            </g>
          )}

          {(category === 'cargo' || category === 'general') && (
            <g>
              {/* General Cargo Hull */}
              <path
                d="M 28 58 L 40 44 L 270 44 L 290 58 Z"
                fill="url(#vesselHullGrad)"
                stroke="#38BDF8"
                strokeWidth="1.5"
              />
              {/* Cargo Holds */}
              <rect x="54" y="36" width="60" height="8" fill="#075985" stroke="#38BDF8" strokeWidth="1" />
              <rect x="130" y="36" width="60" height="8" fill="#075985" stroke="#38BDF8" strokeWidth="1" />
              {/* Forward & Mid Mast */}
              <line x1="48" y1="22" x2="48" y2="44" stroke="#94A3B8" strokeWidth="1.5" />
              <line x1="122" y1="20" x2="122" y2="44" stroke="#94A3B8" strokeWidth="1.5" />
              {/* Aft Bridge */}
              <rect x="204" y="22" width="40" height="22" fill="#0C4A6E" stroke="#38BDF8" strokeWidth="1.5" />
              <rect x="212" y="14" width="24" height="8" fill="#075985" stroke="#38BDF8" strokeWidth="1" />
              <rect x="238" y="10" width="8" height="10" fill="#F59E0B" stroke="#B45309" strokeWidth="1" />
            </g>
          )}

          {category === 'fishing' && (
            <g>
              {/* Fishing Boat Hull */}
              <path
                d="M 60 58 L 74 44 L 240 44 L 255 58 Z"
                fill="url(#vesselHullGrad)"
                stroke="#38BDF8"
                strokeWidth="1.5"
              />
              {/* Forward Wheelhouse */}
              <rect x="86" y="24" width="36" height="20" fill="#0C4A6E" stroke="#38BDF8" strokeWidth="1.5" />
              <rect x="92" y="16" width="24" height="8" fill="#075985" stroke="#38BDF8" strokeWidth="1" />
              {/* Trawl Gantry / Aft Frame */}
              <line x1="215" y1="18" x2="215" y2="44" stroke="#F59E0B" strokeWidth="2" />
              <line x1="175" y1="18" x2="225" y2="18" stroke="#F59E0B" strokeWidth="1.5" />
              <line x1="175" y1="18" x2="175" y2="44" stroke="#F59E0B" strokeWidth="1.5" />
            </g>
          )}

          {category === 'tug' && (
            <g>
              {/* Compact High-Bow Tug Hull */}
              <path
                d="M 70 58 L 84 40 L 235 44 L 245 58 Z"
                fill="url(#vesselHullGrad)"
                stroke="#38BDF8"
                strokeWidth="1.5"
              />
              {/* High Wheelhouse */}
              <rect x="110" y="18" width="42" height="24" fill="#0C4A6E" stroke="#00E5FF" strokeWidth="1.5" />
              <rect x="118" y="10" width="26" height="8" fill="#075985" stroke="#00E5FF" strokeWidth="1" />
              <line x1="120" y1="14" x2="142" y2="14" stroke="#00E5FF" strokeWidth="1.5" />
              {/* Towing Winch */}
              <rect x="180" y="36" width="18" height="8" fill="#F59E0B" stroke="#B45309" strokeWidth="1" />
            </g>
          )}
        </svg>
      </div>

      {/* Footer Metrics */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 6,
          paddingTop: 6,
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '10.5px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary, #94A3B8)',
        }}
      >
        <span>{vesselName || `MMSI ${mmsi || 'UNKNOWN'}`}</span>
        <span>
          {lengthM ? `${lengthM}m LOA` : ''}{' '}
          {grossTonnage ? `• ${grossTonnage.toLocaleString()} GT` : ''}
        </span>
      </div>
    </div>
  );
}
