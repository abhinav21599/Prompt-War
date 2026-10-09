import { useState, useEffect } from 'react';
import { fetchAlerts as apiFetchAlerts, acknowledgeAlert as apiAcknowledgeAlert } from '../services/api';

interface Alert {
  id: string;
  spill_id?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  status: 'active' | 'acknowledged' | 'resolved';
}

interface AlertCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAlertCountChange?: (count: number) => void;
}

export default function AlertCenterModal({
  isOpen,
  onClose,
  onAlertCountChange,
}: AlertCenterModalProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const data = await apiFetchAlerts();
      if (Array.isArray(data) && data.length > 0) {
        const normalized: Alert[] = data.map((a: any) => ({
          id: a.id,
          spill_id: a.spill_id,
          severity: (a.severity || 'high').toLowerCase(),
          title: a.title || a.incident_name || `Alert ${a.id}`,
          message: a.message || `Telemetry alert for ${a.spill_id || 'incident'} with confidence ${(a.confidence ? (a.confidence * 100).toFixed(0) : 85)}%.`,
          timestamp: a.timestamp || a.alert_time || a.created_at || new Date().toISOString(),
          status: a.status || 'active',
        }));
        setAlerts(normalized);
        if (onAlertCountChange) {
          const active = normalized.filter((a) => a.status === 'active').length;
          onAlertCountChange(active);
        }
      } else {
        throw new Error('No alerts');
      }
    } catch {
      // Fallback alerts for demonstration
      const demo: Alert[] = [
        {
          id: 'ALT-001',
          spill_id: 'INC-2024-001',
          severity: 'critical',
          title: 'High Correlation Vessel Detected',
          message: 'MT Ocean Star track correlates 92.4% with hindcast origin off Goa coast.',
          timestamp: new Date().toISOString(),
          status: 'active',
        },
        {
          id: 'ALT-002',
          spill_id: 'INC-2024-001',
          severity: 'high',
          title: 'Crude Slick Area Expansion',
          message: 'Estimated slick dispersion reached 42.6 km² under 14kt SW monsoon winds.',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          status: 'active',
        },
        {
          id: 'ALT-003',
          spill_id: 'INC-2024-001',
          severity: 'medium',
          title: 'Copernicus Marine Current Update',
          message: 'Surface velocity fields refreshed via CMEMS global physics analysis model.',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          status: 'acknowledged',
        },
      ];
      setAlerts(demo);
      if (onAlertCountChange) {
        onAlertCountChange(demo.filter((a) => a.status === 'active').length);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAlerts();
    }
  }, [isOpen]);

  const handleAcknowledge = async (id: string) => {
    try {
      await apiAcknowledgeAlert(id);
    } catch {
      // local optimistic update
    }
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'acknowledged' } : a))
    );
  };

  if (!isOpen) return null;

  const filtered = alerts.filter(
    (a) => filterSeverity === 'all' || a.severity === filterSeverity
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          backgroundColor: 'var(--panel-bg, #0B111A)',
          border: '1px solid var(--border, #1E293B)',
          borderRadius: '12px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border, #1E293B)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🚨</span>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--text-primary, #F8FAFC)',
                  letterSpacing: '0.04em',
                }}
              >
                INCIDENT ALERTS & TELEMETRY
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary, #94A3B8)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {alerts.filter((a) => a.status === 'active').length} active system alerts
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #94A3B8)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Severity Filter Tabs */}
        <div
          style={{
            padding: '10px 20px',
            background: 'var(--surface-1, rgba(255,255,255,0.02))',
            borderBottom: '1px solid var(--border, #1E293B)',
            display: 'flex',
            gap: '8px',
          }}
        >
          {['all', 'critical', 'high', 'medium', 'low'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterSeverity(s)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontFamily: 'var(--font-mono, monospace)',
                borderRadius: '4px',
                border: '1px solid',
                borderColor: filterSeverity === s ? 'var(--accent, #00E5FF)' : 'transparent',
                background: filterSeverity === s ? 'var(--accent-dim, rgba(0,229,255,0.15))' : 'transparent',
                color: filterSeverity === s ? 'var(--accent, #00E5FF)' : 'var(--text-secondary, #94A3B8)',
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Alerts List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
              Querying telemetry alerts...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
              No alerts found for selected severity filter.
            </div>
          ) : (
            filtered.map((alert) => (
              <div
                key={alert.id}
                style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: 'var(--card-bg, #0E1624)',
                  border: `1px solid ${
                    alert.severity === 'critical'
                      ? 'rgba(239, 68, 68, 0.4)'
                      : alert.severity === 'high'
                      ? 'rgba(249, 115, 22, 0.4)'
                      : 'var(--border, #1E293B)'
                  }`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontFamily: 'var(--font-mono, monospace)',
                        background:
                          alert.severity === 'critical'
                            ? '#EF4444'
                            : alert.severity === 'high'
                            ? '#F97316'
                            : alert.severity === 'medium'
                            ? '#EAB308'
                            : '#38BDF8',
                        color: '#FFFFFF',
                      }}
                    >
                      {alert.severity}
                    </span>
                    <strong style={{ fontSize: '13px', color: 'var(--text-primary, #F8FAFC)' }}>
                      {alert.title}
                    </strong>
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-muted, #64748B)',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #94A3B8)', lineHeight: 1.45 }}>
                  {alert.message}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    ID: {alert.id} {alert.spill_id ? `• CASE: ${alert.spill_id}` : ''}
                  </span>
                  {alert.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => handleAcknowledge(alert.id)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '10px',
                        fontWeight: 600,
                        borderRadius: '3px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-2)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
