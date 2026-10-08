import React from 'react';
import { useStore } from '../state/store';
import { setSpillsMode } from '../services/api';

interface KpiStripProps {
  activeIncidents: number;
  analyzedScenes: number;
  analyzedVessels: number;
  highPriority: number;
}

export default function KpiStrip({
  activeIncidents,
  analyzedScenes,
  analyzedVessels,
  highPriority,
}: KpiStripProps) {
  const {
    dataMode,
    setDataMode,
    triggerIncidentRefresh,
  } = useStore();

  const handleToggleMode = async () => {
    const nextMode = dataMode === 'simulation' ? 'real' : 'simulation';
    setDataMode(nextMode);
    try {
      await setSpillsMode(nextMode);
      triggerIncidentRefresh();
    } catch (e) {
      console.error('Failed to sync data mode with backend:', e);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '52px',
        padding: '0 16px',
        background: 'var(--kpi-bg)',
        borderBottom: '1px solid var(--kpi-border)',
        zIndex: 50,
        flexShrink: 0,
        userSelect: 'none',
        transition: 'background 0.2s ease, border-color 0.2s ease',
      }}
    >
      {/* ── Left: Workstation Title & Operational Subtitle ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div
          style={{
            fontSize: '12.5px',
            fontWeight: 800,
            letterSpacing: '0.04em',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
          }}
        >
          MARITIME INCIDENT INVESTIGATION WORKSTATION
        </div>
        <div
          style={{
            fontSize: '9.5px',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 600,
            letterSpacing: '0.12em',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          DETECT &bull; RECONSTRUCT &bull; ATTRIBUTE &bull; EXPLAIN
        </div>
      </div>

      {/* ── Center: 4 Metric Cards with Color-Coded Icons ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Metric 1: Active Incidents */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '5px 12px',
            background: 'var(--kpi-card-bg)',
            border: '1px solid var(--kpi-card-border)',
            borderRadius: '6px',
            transition: 'background 0.2s ease, border-color 0.2s ease',
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EF4444',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="8" cy="8" r="6.5" />
              <circle cx="8" cy="8" r="3" />
              <circle cx="8" cy="8" r="0.8" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {activeIncidents}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              Active Incidents
            </div>
          </div>
        </div>

        {/* Metric 2: Analyzed Scenes */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '5px 12px',
            background: 'var(--kpi-card-bg)',
            border: '1px solid var(--kpi-card-border)',
            borderRadius: '6px',
            transition: 'background 0.2s ease, border-color 0.2s ease',
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '4px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10B981',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <circle cx="5.5" cy="5.5" r="1.2" fill="currentColor" />
              <path d="M14 10l-4-4-6 6" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {analyzedScenes}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              Analyzed Scenes
            </div>
          </div>
        </div>

        {/* Metric 3: Analyzed Vessels */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '5px 12px',
            background: 'var(--kpi-card-bg)',
            border: '1px solid var(--kpi-card-border)',
            borderRadius: '6px',
            transition: 'background 0.2s ease, border-color 0.2s ease',
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '4px',
              background: 'rgba(14, 165, 233, 0.15)',
              border: '1px solid rgba(14, 165, 233, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38BDF8',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 11.5L4 14h8l1.5-2.5L14 7H2l.5 4.5z" />
              <path d="M8 2v5M5.5 4h5" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {analyzedVessels}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              Analyzed Vessels
            </div>
          </div>
        </div>

        {/* Metric 4: High Priority Case */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '5px 12px',
            background: 'var(--kpi-card-bg)',
            border: '1px solid var(--kpi-card-border)',
            borderRadius: '6px',
            transition: 'background 0.2s ease, border-color 0.2s ease',
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '4px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F59E0B',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2l6.5 11.5H1.5L8 2z" />
              <path d="M8 6.5v3M8 11.5h.01" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {highPriority}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              High Priority Case
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Operational Mode Pill ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Mode Pill */}
        <div
          onClick={handleToggleMode}
          title={`Active Mode: ${dataMode === 'simulation' ? 'Simulation (Synthetic / Benchmark)' : 'Live Data (Copernicus / Marine)'}. Click to toggle.`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '4px 14px',
            background: 'var(--kpi-card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: dataMode === 'simulation' ? '#10B981' : 'var(--accent)',
              boxShadow: `0 0 8px ${dataMode === 'simulation' ? '#10B981' : 'var(--accent)'}`,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: dataMode === 'simulation' ? '#10B981' : 'var(--accent)',
              }}
            >
              {dataMode === 'simulation' ? 'Simulation Mode' : 'Live Data Mode'}
            </span>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--text-muted)',
              }}
            >
              {dataMode === 'simulation' ? 'Synthetic Models' : 'Copernicus / Marine'}
            </span>
          </div>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 2 }}>›</span>
        </div>
      </div>
    </div>
  );
}
