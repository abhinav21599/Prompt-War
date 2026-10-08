import React from 'react';
import { motion } from 'framer-motion';
import type { BentoFeature } from './bentoData';
import { useStore } from '../../state/store';

interface BentoCardProps {
  card: BentoFeature;
  onClick: () => void;
  isCompact?: boolean;
}

export const BentoCard: React.FC<BentoCardProps> = ({ card, onClick, isCompact }) => {
  const { layers, setLayer, dataMode } = useStore();

  const isLayer = !!card.layerKey;
  const isLayerActive = card.layerKey ? !!layers[card.layerKey] : false;
  const isSim = dataMode === 'simulation';

  const handleToggleLayer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (card.layerKey) {
      setLayer(card.layerKey, !isLayerActive);
    }
  };

  // Render SVG radar icon based on iconType
  const renderIcon = () => {
    switch (card.iconType) {
      case 'satellite':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        );
      case 'current':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h20M17 7l5 5-5 5M7 17l-5-5 5-5" />
          </svg>
        );
      case 'wind':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
          </svg>
        );
      case 'particles':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="2" fill={card.color} />
            <circle cx="18" cy="6" r="2" fill={card.color} />
            <circle cx="12" cy="12" r="2.5" fill={card.color} />
            <circle cx="6" cy="18" r="2" fill={card.color} />
            <circle cx="18" cy="18" r="2" fill={card.color} />
          </svg>
        );
      case 'polygon':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 22 8.5 18 21 6 21 2 8.5" fill="rgba(255,122,0,0.2)" />
          </svg>
        );
      case 'vessel':
      case 'anchor':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 20h20M12 2v14M7 9a5 5 0 0 0 10 0" />
          </svg>
        );
      case 'compass':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill={card.color} />
          </svg>
        );
      case 'route':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="19" r="3" />
            <path d="M9 19h8.5a4.5 4.5 0 0 0 0-9H5a3 3 0 0 1 0-6h13" />
          </svg>
        );
      case 'depth':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6c3 0 3 2 6 2s3-2 6-2 3 2 6 2M2 12c3 0 3 2 6 2s3-2 6-2 3 2 6 2M2 18c3 0 3 2 6 2s3-2 6-2 3 2 6 2" />
          </svg>
        );
      case 'grid':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        );
      case 'cpu':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
          </svg>
        );
      default:
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        );
    }
  };

  return (
    <motion.div
      layoutId={`bento-card-${card.id}`}
      className={`bento-card ${isCompact ? '' : card.span} ${isLayerActive ? 'bento-card--active' : ''}`}
      onClick={onClick}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.99 }}
      transition={{
        layout: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1.0] },
      }}
    >
      {/* Subtle radial glow matching feature accent */}
      <div
        className="bento-card__glow"
        style={{ backgroundColor: card.color }}
      />

      {/* Card Header: Icon & Badges / Layer Switch */}
      <div className="bento-card__header">
        <motion.div
          layoutId={`bento-icon-${card.id}`}
          className="bento-card__icon-box"
          style={{ background: `${card.color}15`, borderColor: `${card.color}40` }}
        >
          {renderIcon()}
        </motion.div>

        <div className="bento-card__meta">
          <motion.span
            layoutId={`bento-badge-${card.id}`}
            className="bento-card__badge"
            style={{
              background: `${card.color}18`,
              color: card.color,
              border: `1px solid ${card.color}40`,
            }}
          >
            {card.id === 'env-data-mode'
              ? (isSim ? 'SIMULATION' : 'COPERNICUS REAL')
              : card.badge}
          </motion.span>

          {isLayer && (
            <div
              className={`bento-card__toggle-pill ${isLayerActive ? 'bento-card__toggle-pill--on' : ''}`}
              onClick={handleToggleLayer}
              title={isLayerActive ? 'Layer visible (click to hide)' : 'Layer hidden (click to show)'}
            >
              <div className="bento-card__toggle-dot" />
            </div>
          )}
        </div>
      </div>

      {/* Card Content: Title & Subtitle */}
      <div>
        <motion.h4 layoutId={`bento-title-${card.id}`} className="bento-card__title">
          {card.title}
        </motion.h4>
        <p className="bento-card__subtitle">{card.subtitle}</p>
      </div>

      {/* Micro-Telemetry Footer */}
      <div className="bento-card__footer">
        <div style={{ display: 'flex', gap: 14 }}>
          {card.telemetry.slice(0, 2).map((t, i) => (
            <div key={i} className="bento-card__telemetry-item">
              <span className="bento-card__telemetry-k">{t.label}</span>
              <span className="bento-card__telemetry-v">{t.value}</span>
            </div>
          ))}
        </div>

        <div className="bento-card__expand-hint">
          <span>Expand</span>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 9.5L9.5 2.5M9.5 2.5H4.5M9.5 2.5V7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </motion.div>
  );
};

