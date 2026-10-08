import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import InvestigationBentoGrid from './InvestigationBentoGrid';
import type { BentoCategory } from './bentoData';

interface BentoMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: BentoCategory;
}

export const BentoMatrixModal: React.FC<BentoMatrixModalProps> = ({
  isOpen,
  onClose,
  defaultCategory = 'ALL',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9990,
          background: 'rgba(3, 9, 18, 0.88)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '1280px',
            height: '92vh',
            background: 'var(--surface-1)',
            border: '1px solid var(--border-strong)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0, 217, 232, 0.1)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 6,
                  background: 'rgba(0, 217, 232, 0.12)',
                  border: '1px solid rgba(0, 217, 232, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  INVESTIGATION ENVIRONMENT & MAP LAYERS MATRIX
                </h3>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Interactive feature telemetry, fluid dynamic modeling parameters, and tactical GIS layer controls.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="bento-modal__close-btn"
              title="Close Matrix (Esc)"
            >
              ✕
            </button>
          </div>

          {/* Scrollable Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <InvestigationBentoGrid defaultCategory={defaultCategory} />
          </div>

          {/* Footer status */}
          <div
            style={{
              padding: '10px 24px',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface-2)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>Click any feature card to expand into shared-element detail controls.</span>
            <span>PRESS ESC TO CLOSE</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default BentoMatrixModal;

