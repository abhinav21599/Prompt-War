import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { BentoMatrixModal } from './bento/BentoMatrixModal';
import AlertCenterModal from './AlertCenterModal';

export default function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedSpillId = useStore((s) => s.selectedSpillId);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const isBentoMatrixOpen = useStore((s) => s.isBentoMatrixOpen);
  const toggleBentoMatrix = useStore((s) => s.toggleBentoMatrix);
  const setBentoMatrixOpen = useStore((s) => s.setBentoMatrixOpen);
  const activeId = selectedSpillId || 'INC-2024-001';
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [activeAlertCount, setActiveAlertCount] = useState(0);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setAlertsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navTabs = [
    {
      id: 'command_center',
      label: 'Command Center',
      path: '/incidents',
      isActive: location.pathname === '/incidents' || location.pathname === '/command-center',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" />
          <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" />
          <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" />
          <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" />
        </svg>
      ),
    },
    {
      id: 'data_pipeline',
      label: 'Data Pipeline',
      path: '/analyze',
      isActive: location.pathname.startsWith('/analyze'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="3.5" cy="5" r="2" />
          <circle cx="12.5" cy="5" r="2" />
          <circle cx="8" cy="12" r="2" />
          <path d="M5.5 5h5M4.5 7l2.5 3M11.5 7l-2.5 3" />
        </svg>
      ),
    },
    {
      id: 'sar_detection',
      label: 'SAR Detection',
      path: `/incidents/${activeId}/detection`,
      isActive: location.pathname.includes('/detection') || location.pathname === `/incidents/${activeId}`,
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="8" cy="8" r="6.5" />
          <circle cx="8" cy="8" r="3.2" />
          <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
        </svg>
      ),
    },
    {
      id: 'hindcast_drift',
      label: 'Hindcast Drift',
      path: `/incidents/${activeId}/drift`,
      isActive: location.pathname.includes('/drift'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M8 2v12M2.5 5l11 6M2.5 11l11-6" />
        </svg>
      ),
    },
    {
      id: 'vessel_attribution',
      label: 'Vessel Attribution',
      path: `/incidents/${activeId}/vessels`,
      isActive: location.pathname.includes('/vessels'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 11.5L4 14h8l1.5-2.5L14 7H2l.5 4.5z" />
          <path d="M8 2v5M5.5 4h5" />
        </svg>
      ),
    },
    {
      id: 'drift_forecast',
      label: 'Drift Forecast',
      path: `/incidents/${activeId}/forecast`,
      isActive: location.pathname.includes('/forecast'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 4.5v3.8l2.6 1.6M12 2l2 2-2 2" />
        </svg>
      ),
    },
    {
      id: 'digital_twin_4d',
      label: 'Digital Twin 4D',
      path: `/incidents/${activeId}/timeline`,
      isActive: location.pathname.includes('/timeline'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 1.5l5.5 3.2v6.6L8 14.5l-5.5-3.2V4.7L8 1.5z" />
          <path d="M8 1.5v13M2.5 4.7L8 8l5.5-3.3" />
        </svg>
      ),
    },
    {
      id: 'evidence_report',
      label: 'Evidence Report',
      path: `/incidents/${activeId}/report`,
      isActive: location.pathname.includes('/report'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 2.5h5.5l3.5 3.5V13.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-10a1 1 0 011-1z" />
          <path d="M9 2.5v4h4M6 9h4M6 11.5h2.5" />
        </svg>
      ),
    },
  ];

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '52px',
        padding: '0 16px',
        background: 'var(--topbar-bg)',
        borderBottom: '1px solid var(--topbar-border)',
        zIndex: 100,
        userSelect: 'none',
        flexShrink: 0,
        transition: 'background 0.2s ease, border-color 0.2s ease',
      }}
    >
      {/* ── Left: Glowing Wave Emblem & Brand ── */}
      <div
        onClick={() => navigate('/incidents')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          style={{ filter: 'drop-shadow(0 0 10px rgba(0, 229, 255, 0.95))' }}
        >
          <path
            d="M4 11C8 7.5 12 7.5 16 11C20 14.5 24 14.5 28 11"
            stroke="#00E5FF"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M4 16.5C8 13 12 13 16 16.5C20 20 24 20 28 16.5"
            stroke="#38BDF8"
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity="0.95"
          />
          <path
            d="M4 22C8 18.5 12 18.5 16 22C20 25.5 24 25.5 28 22"
            stroke="#7DD3FC"
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity="0.85"
          />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span
            style={{
              fontSize: '15px',
              fontWeight: 900,
              letterSpacing: '0.06em',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
            }}
          >
            OILTRACE <span style={{ color: 'var(--accent)' }}>AI</span>
          </span>
          <span
            style={{
              fontSize: '8.5px',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 800,
              letterSpacing: '0.18em',
              color: 'var(--accent-hover)',
              whiteSpace: 'nowrap',
            }}
          >
            MARITIME SURVEILLANCE
          </span>
        </div>
      </div>

      {/* ── Center: Horizontal Navigation Tabs + Responsive Overflow Dropdown ── */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          margin: '0 8px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          flexShrink: 1,
        }}
      >
        {navTabs.map((tab) => {
          const active = tab.isActive;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.path)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 8px',
                fontSize: '11px',
                fontWeight: active ? 800 : 600,
                color: active ? '#00E5FF' : 'var(--text-primary)',
                background: active ? 'rgba(0, 229, 255, 0.16)' : 'transparent',
                border: active ? '1px solid rgba(0, 229, 255, 0.45)' : '1px solid transparent',
                borderRadius: '6px',
                boxShadow: active ? '0 0 12px rgba(0, 229, 255, 0.25)' : 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.color = '#00E5FF';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', color: active ? '#00E5FF' : '#CBD5E1' }}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}

        {/* Quick Module Jump Select */}
        <select
          onChange={(e) => {
            if (e.target.value) navigate(e.target.value);
          }}
          value={navTabs.find((t) => t.isActive)?.path || ''}
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-primary)',
            fontSize: '11px',
            fontWeight: 700,
            padding: '4px 8px',
            borderRadius: '6px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          title="Jump directly to any investigation module"
        >
          <option value="" disabled>
            Modules ▾
          </option>
          <option value="/" style={{ background: '#0B0E15', color: '#FFFFFF' }}>
            3D Earth Globe (Landing)
          </option>
          {navTabs.map((tab) => (
            <option key={tab.id} value={tab.path} style={{ background: '#0B0E15', color: '#FFFFFF' }}>
              {tab.label} {tab.isActive ? '✓' : ''}
            </option>
          ))}
        </select>
      </nav>

      {/* ── Right: Header Actions (Telemetry Matrix, Theme Toggle, Search, Notifications) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* Telemetry Matrix Option Button */}
        <button
          type="button"
          onClick={toggleBentoMatrix}
          title="Investigation Environment & Telemetry Layer Matrix"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 32,
            padding: '0 10px',
            borderRadius: '6px',
            background: isBentoMatrixOpen ? 'var(--accent-dim)' : 'var(--card-bg)',
            border: isBentoMatrixOpen ? '1px solid var(--accent)' : '1px solid var(--border)',
            color: isBentoMatrixOpen ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontFamily: 'var(--font-sans)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            if (!isBentoMatrixOpen) {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }
          }}
        >
          {/* Signature Matrix Icon */}
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="2" width="6" height="5" rx="1.2" />
            <rect x="10" y="2" width="4" height="5" rx="1.2" />
            <rect x="2" y="9" width="4" height="5" rx="1.2" />
            <rect x="8" y="9" width="6" height="5" rx="1.2" />
          </svg>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em' }}>
            Telemetry Matrix
          </span>
        </button>

        {/* Light / Dark Mode Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'color 0.15s ease, border-color 0.15s ease, background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          {theme === 'dark' ? (
            /* Sun Icon */
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="8" cy="8" r="3.2" />
              <path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
            </svg>
          ) : (
            /* Moon Icon */
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13.5 9.2A6 6 0 116.8 2.5a4.8 4.8 0 006.7 6.7z" />
            </svg>
          )}
        </button>

        {/* Telemetry Search Button (Opens Fast Search Command Palette) */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          title="Search Telemetry, Incidents & Vessels"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'color 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
        </button>

        {/* Notifications Bell with Glowing Dot */}
        <button
          type="button"
          onClick={() => setAlertsOpen(true)}
          title={`Incident Alerts & System Telemetry (${activeAlertCount} Active)`}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'color 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5.5a4 4 0 00-8 0c0 4.5-2 6-2 6h12s-2-1.5-2-6" />
            <path d="M6.8 13.5a1.5 1.5 0 002.4 0" />
          </svg>
          {activeAlertCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--accent)',
                boxShadow: '0 0 6px var(--accent)',
              }}
            />
          )}
        </button>
      </div>

      {/* Bento Grid Matrix Modal */}
      <BentoMatrixModal
        isOpen={isBentoMatrixOpen}
        onClose={() => setBentoMatrixOpen(false)}
      />

      {/* Incident Alert Center Modal */}
      <AlertCenterModal
        isOpen={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        onAlertCountChange={setActiveAlertCount}
      />

      {/* Quick Search Command Palette Modal */}
      {searchOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(3, 7, 14, 0.88)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '80px',
          }}
          onClick={() => setSearchOpen(false)}
        >
          <div
            style={{
              width: '860px',
              maxWidth: '94vw',
              background: '#0B0E15',
              border: '1.5px solid var(--accent)',
              borderRadius: '12px',
              boxShadow: '0 24px 80px rgba(0,0,0,0.95)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '16px 22px',
                borderBottom: '1px solid var(--border-strong)',
                background: 'var(--surface-2)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="2.2">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M10.5 10.5L14 14" />
              </svg>
              <input
                type="text"
                autoFocus
                placeholder="Search incidents, candidate vessels, MMSI, SAR datasets, forecast models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '15px',
                  color: '#FFFFFF',
                  fontWeight: 700,
                }}
              />
              <button
                onClick={() => setSearchOpen(false)}
                style={{
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border-strong)',
                  color: '#FFFFFF',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                ESC
              </button>
            </div>

            {/* Quick Result Items (Wider layout with smooth scrollbar) */}
            <div
              style={{
                padding: '14px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: '400px',
                overflowY: 'auto',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 900, color: 'var(--accent)', letterSpacing: '0.1em', padding: '4px 10px' }}>
                PRIMARY INCIDENTS & EVIDENCE DOSSIERS
              </div>
              {[
                { title: 'INC-2024-001 (Arabian Sea Crude Spill - 174.2 km²)', desc: 'Attributed Lead: MT GULF PETROLEUM • 88% Evidence Score', path: '/incidents/INC-2024-001/report' },
                { title: 'INC-2024-002 (Goa Coastal Bunker Discharge - 42.6 km²)', desc: 'Active Hindcast Tracking • 3 Screened AIS Tracks', path: '/incidents/INC-2024-002/detection' },
                { title: 'INC-2024-003 (Mumbai High Sector Release - 89.4 km²)', desc: 'Verified 48h Forecast Plume • Dispersion Modeled', path: '/incidents/INC-2024-003/timeline' },
              ]
                .filter((item) => item.title.toLowerCase().includes(searchQuery.toLowerCase()) || item.desc.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      navigate(item.path);
                      setSearchOpen(false);
                    }}
                    style={{
                      padding: '12px 16px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.background = 'var(--surface-3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-strong)';
                      e.currentTarget.style.background = 'var(--surface-2)';
                    }}
                  >
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#FFFFFF' }}>{item.title}</span>
                    <span style={{ fontSize: '11.5px', color: '#E2E8F0', fontWeight: 500 }}>{item.desc}</span>
                  </div>
                ))}

              <div style={{ fontSize: '11px', fontWeight: 900, color: 'var(--accent)', letterSpacing: '0.1em', padding: '10px 10px 4px' }}>
                INVESTIGATION MODULES & TOOLS
              </div>
              {navTabs
                .filter((t) => t.label.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((tab) => (
                  <div
                    key={tab.id}
                    onClick={() => {
                      navigate(tab.path);
                      setSearchOpen(false);
                    }}
                    style={{
                      padding: '10px 16px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.background = 'var(--surface-3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-strong)';
                      e.currentTarget.style.background = 'var(--surface-2)';
                    }}
                  >
                    <span style={{ color: 'var(--accent)', display: 'flex' }}>{tab.icon}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF' }}>{tab.label}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
