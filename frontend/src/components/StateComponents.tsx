export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="state-container">
      <div className="spinner" />
      <div className="state-desc mono" style={{ fontSize: '12px' }}>{message}</div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-container">
      <div className="mono badge" style={{ background: 'rgba(184,80,66,0.15)', color: 'var(--status-error)', border: '1px solid rgba(184,80,66,0.4)', fontSize: '11px', fontWeight: 700 }}>
        FAULT DETECTED
      </div>
      <div className="state-title">System Error</div>
      <div className="state-desc">{message}</div>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry} style={{ marginTop: 8 }}>
          Retry Request
        </button>
      )}
    </div>
  );
}

export function UnavailableState({ title, message }: { title: string; message: string }) {
  return (
    <div className="state-container">
      <div className="mono" style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>[DATA PENDING]</div>
      <div className="state-title">{title}</div>
      <div className="state-desc">{message}</div>
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="state-container">
      <div className="mono" style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>[NO RECORDS]</div>
      <div className="state-title">{title}</div>
      <div className="state-desc">{message}</div>
    </div>
  );
}
