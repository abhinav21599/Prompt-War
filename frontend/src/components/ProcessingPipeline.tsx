

type Stage = { label: string; status: 'complete'|'processing'|'waiting'|'error'; detail?: string; };
export default function ProcessingPipeline({ stages }: { stages: Stage[] }) {
  const icons = { complete: '✓', processing: '●', waiting: '○', error: '✗' };
  return (
    <div className="pipeline">
      {stages.map((s,i) => (
        <div key={i} className={'pipeline-stage pipeline-stage--'+s.status}>
          <div className="pipeline-stage__icon">{icons[s.status]}</div>
          <span className="pipeline-stage__label">{s.label}</span>
          {s.detail && <span style={{fontSize:'11px',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{s.detail}</span>}
        </div>
      ))}
    </div>
  );
}
