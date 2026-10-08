import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { BentoFeature } from './bentoData';
import { useStore } from '../../state/store';
import { setSpillsMode } from '../../services/api';

interface BentoDetailDialogProps {
  card: BentoFeature;
  onClose: () => void;
}

export const BentoDetailDialog: React.FC<BentoDetailDialogProps> = ({ card, onClose }) => {
  const { layers, setLayer, dataMode, setDataMode, triggerIncidentRefresh } = useStore();

  const isLayer = !!card.layerKey;
  const isLayerActive = card.layerKey ? !!layers[card.layerKey] : false;
  const isSim = dataMode === 'simulation';

  // Listen for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleToggleLayer = () => {
    if (card.layerKey) {
      setLayer(card.layerKey, !isLayerActive);
    }
  };

  const handleSwitchMode = async (newMode: 'simulation' | 'real') => {
    setDataMode(newMode);
    try {
      await setSpillsMode(newMode);
      triggerIncidentRefresh();
    } catch (e) {
      console.error('Failed to toggle data mode:', e);
    }
  };

  // Render SVG radar icon based on iconType
  const renderIcon = () => {
    switch (card.iconType) {
      case 'satellite':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        );
      case 'current':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h20M17 7l5 5-5 5M7 17l-5-5 5-5" />
          </svg>
        );
      case 'wind':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
          </svg>
        );
      case 'particles':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="2" fill={card.color} />
            <circle cx="18" cy="6" r="2" fill={card.color} />
            <circle cx="12" cy="12" r="2.5" fill={card.color} />
            <circle cx="6" cy="18" r="2" fill={card.color} />
            <circle cx="18" cy="18" r="2" fill={card.color} />
          </svg>
        );
      case 'polygon':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 22 8.5 18 21 6 21 2 8.5" fill="rgba(255,122,0,0.25)" />
          </svg>
        );
      case 'vessel':
      case 'anchor':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 20h20M12 2v14M7 9a5 5 0 0 0 10 0" />
          </svg>
        );
      case 'compass':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill={card.color} />
          </svg>
        );
      case 'route':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="19" r="3" />
            <path d="M9 19h8.5a4.5 4.5 0 0 0 0-9H5a3 3 0 0 1 0-6h13" />
          </svg>
        );
      case 'depth':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6c3 0 3 2 6 2s3-2 6-2 3 2 6 2M2 12c3 0 3 2 6 2s3-2 6-2 3 2 6 2M2 18c3 0 3 2 6 2s3-2 6-2 3 2 6 2" />
          </svg>
        );
      case 'grid':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        );
      case 'cpu':
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
          </svg>
        );
      default:
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
          </svg>
        );
    }
  };

  return (
    <div className="bento-modal-overlay" onClick={onClose}>
      <motion.div
        layoutId={`bento-card-${card.id}`}
        className="bento-modal-dialog"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        transition={{
          layout: { duration: 0.38, ease: [0.25, 0.1, 0.25, 1.0] },
        }}
      >
        {/* Modal Header */}
        <div className="bento-modal__header">
          <div className="bento-modal__title-group">
            <motion.div
              layoutId={`bento-icon-${card.id}`}
              className="bento-modal__icon-box"
              style={{ background: `${card.color}20`, borderColor: `${card.color}50` }}
            >
              {renderIcon()}
            </motion.div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <motion.h4
                  layoutId={`bento-title-${card.id}`}
                  style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}
                >
                  {card.title}
                </motion.h4>

                <motion.span
                  layoutId={`bento-badge-${card.id}`}
                  className="bento-card__badge"
                  style={{
                    background: `${card.color}22`,
                    color: card.color,
                    border: `1px solid ${card.color}50`,
                  }}
                >
                  {card.id === 'env-data-mode'
                    ? (isSim ? 'SIMULATION MODE' : 'COPERNICUS REAL')
                    : card.badge}
                </motion.span>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {card.subtitle}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="bento-modal__close-btn"
            onClick={onClose}
            title="Close detail view (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="bento-modal__body">
          {/* Interactive State & Control Bar */}
          {isLayer && (
            <div className="bento-modal__switch-bar">
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Tactical Map Layer Visibility
                </div>
                <div style={{ fontSize: '11px', color: isLayerActive ? 'var(--status-success)' : 'var(--text-muted)' }}>
                  {isLayerActive ? '● LAYER ACTIVE ON MAP CANVAS' : '○ LAYER CURRENTLY HIDDEN'}
                </div>
              </div>

              <button
                type="button"
                className={`btn btn-sm ${isLayerActive ? 'btn-primary' : 'btn-secondary'}`}
                onClick={handleToggleLayer}
                style={{
                  padding: '6px 14px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: isLayerActive ? card.color : undefined,
                  color: isLayerActive ? '#050D18' : undefined,
                }}
              >
                {isLayerActive ? '✓ VISIBLE (CLICK TO HIDE)' : '+ SHOW ON MAP'}
              </button>
            </div>
          )}

          {card.id === 'env-data-mode' && (
            <div className="bento-modal__switch-bar">
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Switch Operational Environment
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Toggles between synthetic seed synchronization and real Copernicus Marine currents.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${isSim ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleSwitchMode('simulation')}
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    borderColor: isSim ? 'var(--oil)' : undefined,
                    background: isSim ? 'rgba(200,164,93,0.25)' : undefined,
                    color: isSim ? 'var(--oil)' : undefined,
                  }}
                >
                  SIMULATION MODE
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${!isSim ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleSwitchMode('real')}
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    borderColor: !isSim ? '#38BDF8' : undefined,
                    background: !isSim ? 'rgba(56,189,248,0.25)' : undefined,
                    color: !isSim ? '#38BDF8' : undefined,
                  }}
                >
                  COPERNICUS REAL
                </button>
              </div>
            </div>
          )}

          {/* Scientific Formula Box (if applicable) */}
          {card.formula && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                Mathematical Formulation & Physical Law
              </div>
              <div className="bento-modal__formula-box" style={{ borderLeftColor: card.color }}>
                <code>{card.formula}</code>
              </div>
            </div>
          )}

          {/* Description & Investigative Rationale */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              Investigative Context & Methodology
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              {card.description}
            </p>
          </div>

          {/* Telemetry & Specifications Grid */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
              Technical Specifications & Calibration
            </div>
            <div className="bento-modal__telemetry-grid">
              {card.specs.map((spec, i) => (
                <div key={i} className="bento-modal__telemetry-cell">
                  <span className="bento-modal__telemetry-cell-k">{spec.k}</span>
                  <span className="bento-modal__telemetry-cell-v">{spec.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Operational Note */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: card.color }}>Forensic Notice: </strong>
            {card.operationalNote}
          </div>

          {/* Dataset Source */}
          {card.datasetSource && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: 'var(--text-disabled)' }}>
              <span>Data Provenance:</span>
              <span className="mono" style={{ color: 'var(--text-secondary)' }}>{card.datasetSource}</span>
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="bento-modal__footer">
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            OILTRACE AI &bull; MARITIME OPS ENVIRONMENT
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {isLayer && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleToggleLayer}
              >
                {isLayerActive ? 'Hide Layer' : 'Show Layer'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onClose}
              style={{ background: card.color, color: '#050D18', fontWeight: 700 }}
            >
              Done (Return to Bento)
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

