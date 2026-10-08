import type { ReactNode } from 'react';
import ProvenanceBadge from './ProvenanceBadge';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  incidentId?: string;
  provenance?: string;
  actions?: ReactNode;
  statusBadge?: ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  incidentId,
  provenance,
  actions,
  statusBadge,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header__main">
        <span className="page-header__title">{title}</span>
        {subtitle && <span className="page-header__subtitle">{subtitle}</span>}
        {incidentId && (
          <span className="badge mono" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
            INCIDENT: {incidentId}
          </span>
        )}
        {provenance && <ProvenanceBadge provenance={provenance} />}
        {statusBadge}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}
