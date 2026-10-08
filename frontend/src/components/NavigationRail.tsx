import { useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { fetchSpills, fetchHindcast, fetchForecast, fetchAttribution, fetchReport } from '../services/api';

interface NavRailProps {
  collapsed: boolean;
  onToggle: () => void;
}

// Fetch completion status for each workflow step
function useIncidentStatus(spillId: string | null) {
  const incidentRefreshTrigger = useStore((s) => s.incidentRefreshTrigger);
  const [status, setStatus] = useState({
    hindcast: false,
    forecast: false,
    attribution: false,
    report: false,
  });

  const refresh = useCallback(async () => {
    if (!spillId) return;
    try {
      const checks = await Promise.allSettled([
        fetchHindcast(spillId),
        fetchForecast(spillId),
        fetchAttribution(spillId),
        fetchReport(spillId),
      ]);
      setStatus({
        hindcast: checks[0].status === 'fulfilled' && !!checks[0].value,
        forecast: checks[1].status === 'fulfilled' && !!checks[1].value,
        attribution: checks[2].status === 'fulfilled' && !!checks[2].value,
        report: checks[3].status === 'fulfilled' && !!checks[3].value,
      });
    } catch {
      // ignore
    }
  }, [spillId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh, incidentRefreshTrigger]);

  return { status, refresh };
}

export default function NavigationRail({ collapsed, onToggle }: NavRailProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedSpillId = useStore((s) => s.selectedSpillId);
  const setSelectedSpillId = useStore((s) => s.setSelectedSpillId);
  const [defaultId, setDefaultId] = useState<string>('INC-001');

  // Extract incident ID from URL
  const match = location.pathname.match(/\/incidents\/([^/]+)/);
  const currentUrlId = match && match[1] !== 'new' ? match[1] : null;

  useEffect(() => {
    if (currentUrlId) {
      setSelectedSpillId(currentUrlId);
    } else if (!selectedSpillId) {
      fetchSpills()
        .then((spills: any[]) => {
          if (spills && spills.length > 0 && spills[0].id) {
            setDefaultId(spills[0].id);
            setSelectedSpillId(spills[0].id);
          }
        })
        .catch(() => {});
    }
  }, [currentUrlId, selectedSpillId, setSelectedSpillId]);

  const activeSpillId = currentUrlId || selectedSpillId || defaultId;
  const { status } = useIncidentStatus(activeSpillId);

  const generalItems = [
    {
      to: '/incidents',
      label: 'Command Center',
      step: '01',
      isActive: location.pathname === '/incidents' || location.pathname === '/command-center',
      done: true,
      tooltip: 'Maritime Operations & Incident Command Center',
    },
    {
      to: '/analyze',
      label: 'Data Pipeline',
      step: '02',
      isActive: location.pathname.startsWith('/analyze'),
      done: status.hindcast && status.forecast && status.attribution && status.report,
      tooltip: 'Automated 11-Stage Intelligence Pipeline',
    },
  ];

  const incidentItems = [
    {
      to: `/incidents/${activeSpillId}/detection`,
      label: 'SAR Detection',
      step: '03',
      isActive:
        location.pathname.includes('/detection') ||
        location.pathname === `/incidents/${activeSpillId}`,
      done: true, // Detection is primary input / verified
      tooltip: 'SAR Oil Spill Detection & Segmentation (Live Map & SAR Scene)',
    },
    {
      to: `/incidents/${activeSpillId}/drift`,
      label: 'Hindcast Drift',
      step: '04',
      isActive: location.pathname.includes('/drift'),
      done: status.hindcast,
      tooltip: 'Reverse Lagrangian Hydrodynamic Reconstruction',
    },
    {
      to: `/incidents/${activeSpillId}/forecast`,
      label: 'Drift Forecast',
      step: '05',
      isActive: location.pathname.includes('/forecast'),
      done: status.forecast,
      tooltip: 'Forward Lagrangian Drift Prediction (+48h)',
    },
    {
      to: `/incidents/${activeSpillId}/vessels`,
      label: 'Vessel Attribution',
      step: '06',
      isActive: location.pathname.includes('/vessels'),
      done: status.attribution,
      tooltip: 'AIS Multi-Factor Vessel Attribution & Correlation',
    },
    {
      to: `/incidents/${activeSpillId}/timeline`,
      label: 'Digital Twin 4D',
      step: '07',
      isActive: location.pathname.includes('/timeline'),
      done: status.hindcast && status.forecast,
      tooltip: '4D Spatiotemporal Interactive Replay',
    },
    {
      to: `/incidents/${activeSpillId}/report`,
      label: 'Evidence Report',
      step: '08',
      isActive: location.pathname.includes('/report'),
      done: status.report,
      tooltip: 'Forensic Evidence Dossier',
    },
  ];

  const completedCount = incidentItems.filter((i) => i.done).length;

  return (
    <nav className={`nav-rail app-nav${collapsed ? ' nav-rail--collapsed' : ''}`}>
      {/* Header bar with title and Toggle Arrow */}
      <div className="nav-header-row">
        {!collapsed && (
          <span className="nav-header-title">NAVIGATION</span>
        )}
        <button
          className="nav-arrow-toggle-btn"
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar (show details)' : 'Collapse sidebar (hide details)'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="nav-toggle-icon"
            style={{
              transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s ease',
            }}
          >
            <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Overview section */}
      <div className="nav-section-label">Overview</div>
      {generalItems.map((item) => (
        <NavLink
          key={item.label}
          to={item.to}
          className={'nav-item' + (item.isActive ? ' nav-item--active' : '')}
          title={collapsed ? item.label : undefined}
        >
          <span className="nav-item__step">{item.step}</span>
          <span className="nav-item__label">{item.label}</span>
          {item.done && !collapsed && (
            <span className="nav-item__done-dot" title="Completed" />
          )}
        </NavLink>
      ))}

      <div className="nav-divider" />

      {/* Active Incident section */}
      <div className="nav-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {!collapsed && (
          <>
            <span>Active Incident</span>
            <span
              className="mono"
              style={{
                fontSize: '9px',
                color: completedCount === incidentItems.length ? 'var(--status-success)' : 'var(--text-disabled)',
                background: completedCount === incidentItems.length ? 'rgba(95,158,122,0.15)' : 'var(--surface-3)',
                padding: '1px 5px',
                borderRadius: 2,
                fontWeight: 600,
              }}
            >
              {completedCount}/{incidentItems.length}
            </span>
          </>
        )}
      </div>

      {/* Incident ID badge */}
      {!collapsed && activeSpillId && (
        <div
          onClick={() => navigate(`/incidents/${activeSpillId}/detection`)}
          style={{
            margin: '0 8px 6px',
            padding: '5px 8px',
            background: 'var(--accent-dim)',
            border: '1px solid rgba(56,189,248,0.25)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
          title="Click to view incident detection"
        >
          <span className="mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>
            {activeSpillId}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>→</span>
        </div>
      )}

      {incidentItems.map((item) => (
        <NavLink
          key={item.label}
          to={item.to}
          className={'nav-item' + (item.isActive ? ' nav-item--active' : '')}
          title={collapsed ? `${item.step} · ${item.label}` : item.tooltip}
        >
          <span className="nav-item__step">{item.step}</span>
          <span className="nav-item__label">{item.label}</span>
          {/* Status indicator */}
          {item.done ? (
            <span
              className="nav-item__status nav-item__status--done"
              title="Completed / Available"
            />
          ) : (
            <span
              className="nav-item__status nav-item__status--pending"
              title="Pending execution"
            />
          )}
        </NavLink>
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Footer info */}
      {!collapsed && (
        <>
          <div className="nav-divider" />
          <div
            style={{
              padding: '6px 12px',
              fontSize: '10px',
              color: 'var(--text-disabled)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.4,
            }}
          >
            OILTRACE AI v1.0.0
            <br />
            ENTERPRISE EDITION
          </div>
        </>
      )}

      {/* Bottom Collapse / Expand toggle button */}
      <button
        className="nav-collapse-btn"
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          style={{
            transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s ease',
          }}
        >
          <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {!collapsed && <span style={{ fontSize: '10px', marginLeft: 4 }}>HIDE TOOLS</span>}
      </button>
    </nav>
  );
}
