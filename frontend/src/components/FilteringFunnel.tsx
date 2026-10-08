import React from 'react';

interface FunnelStage { label: string; count: number; removed?: number; config?: string; active?: boolean; }
export default function FilteringFunnel({ stages }: { stages: FunnelStage[] }) {
  return (
    <div className="funnel">
      {stages.map((s,i) => (
        <React.Fragment key={i}>
          <div className={'funnel-stage' + (s.active?' funnel-stage--active':'')}>
            <div>
              <div className="funnel-stage__label">{s.label}</div>
              {s.config && <div style={{fontSize:'10px',color:'var(--text-disabled)',fontFamily:'var(--font-mono)'}}>{s.config}</div>}
            </div>
            <div style={{textAlign:'right'}}>
              <div className="funnel-stage__count">{s.count.toLocaleString()}</div>
              {s.removed!=null && <div className="funnel-stage__removed">-{s.removed}</div>}
            </div>
          </div>
          {i<stages.length-1 && <div className="funnel-arrow">↓</div>}
        </React.Fragment>
      ))}
    </div>
  );
}
