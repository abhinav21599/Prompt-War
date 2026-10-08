import { useState, useRef, useEffect } from 'react';
import { useStore } from '../state/store';
import type { LayerKey } from '../state/store';

interface LayerItem {
  key: LayerKey;
  label: string;
}

interface LayerSection {
  title: string;
  items: LayerItem[];
}

const LAYER_SECTIONS: LayerSection[] = [
  {
    title: 'Observation',
    items: [
      { key: 'satellite', label: 'SAR Satellite Scene' },
      { key: 'slickGeometry', label: 'Slick Polygon' },
      { key: 'detectionMask', label: 'SAR Detections' },
    ],
  },
  {
    title: 'Metocean & Environment',
    items: [
      { key: 'currentVectors', label: 'Ocean Currents' },
      { key: 'windVectors', label: 'Wind Vectors' },
      { key: 'flowAnimation', label: 'Flow Animation' },
    ],
  },
  {
    title: 'Drift & Forensics',
    items: [
      { key: 'originRegion', label: 'Discharge Origin' },
      { key: 'hindcast', label: 'Hindcast Trajectory' },
      { key: 'forecast', label: 'Forecast Dispersion' },
    ],
  },
  {
    title: 'Vessel Intelligence',
    items: [
      { key: 'aisVessels', label: 'AIS Positions' },
      { key: 'vessels3D', label: '3D Vessel Models' },
      { key: 'vesselTracks', label: 'Vessel Tracks' },
      { key: 'vesselLabels', label: 'Tactical Labels' },
      { key: 'vesselHeadings', label: 'Heading Vectors' },
      { key: 'candidateVessel', label: 'Top Candidate Focus' },
    ],
  },
  {
    title: 'Maritime & Chart',
    items: [
      { key: 'shippingLanes', label: 'Shipping Lanes' },
      { key: 'bathymetry', label: 'Bathymetry Contours' },
      { key: 'coordGrid', label: 'Coordinate Grid' },
    ],
  },
];

export default function LayerControl() {
  const { layers, setLayer } = useStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', position: 'relative' }}
    >
      {/* Toggle Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`map-btn ${open ? 'map-btn--active' : ''}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          fontSize: '11px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          background: open ? 'var(--accent-dim)' : 'var(--hud-bg)',
          borderColor: open ? 'var(--accent)' : 'var(--hud-border)',
          color: open ? 'var(--accent)' : 'var(--hud-text-muted)',
          borderRadius: '5px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          cursor: 'pointer',
          transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
        }}
        title={open ? 'Close Layers Menu' : 'Open Layers Menu'}
      >
        <span>🗺️</span>
        <span>Layers</span>
        <span style={{ fontSize: '9px', opacity: 0.8 }}>{open ? '▴' : '▾'}</span>
      </button>

      {/* Floating Layers Dropdown Card */}
      {open && (
        <div
          style={{
            marginTop: 6,
            width: '210px',
            maxHeight: 'min(480px, calc(100vh - 130px))',
            overflowY: 'auto',
            background: 'var(--hud-bg)',
            border: '1px solid var(--hud-border)',
            borderRadius: '6px',
            padding: '10px 12px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(10px)',
            zIndex: 30,
            userSelect: 'none',
            transition: 'background 0.2s ease, border-color 0.2s ease',
          }}
        >
          {/* Title */}
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--hud-text)',
              letterSpacing: '0.04em',
              marginBottom: 8,
            }}
          >
            Map Layers
          </div>

          {LAYER_SECTIONS.map((section, idx) => (
            <div key={section.title} style={{ marginBottom: idx === LAYER_SECTIONS.length - 1 ? 0 : 10 }}>
              <div
                style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                  borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                  paddingTop: idx > 0 ? 8 : 0,
                }}
              >
                {section.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {section.items.map((item) => {
                  const checked = !!layers[item.key];
                  return (
                    <label
                      key={item.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        fontSize: '11px',
                        color: checked ? 'var(--hud-text)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        lineHeight: 1.2,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setLayer(item.key, e.target.checked)}
                        style={{
                          accentColor: 'var(--accent)',
                          width: '13px',
                          height: '13px',
                          cursor: 'pointer',
                        }}
                      />
                      <span>{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
