import { Ship } from "lucide-react";

import type { VesselCandidate } from "@/types";

interface VesselPanelProps {
  vessels: VesselCandidate[];
}

/** POTENTIAL VESSELS panel: candidate sources ranked by correlation score. */
const VesselPanel = ({ vessels }: VesselPanelProps) => {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Ship className="size-4 text-primary" strokeWidth={1.75} />
        <span className="text-label">Potential vessels</span>
        <span className="ml-auto font-mono text-[0.625rem] uppercase tracking-[0.22em] text-muted-foreground">
          Ranked by correlation
        </span>
      </div>

      {vessels.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          No candidate vessels available.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
          {vessels.map((vessel, index) => {
            const score = Math.round(vessel.correlationScore * 100);
            return (
              <li key={vessel.id} className="flex flex-col gap-2.5 bg-card px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[0.625rem] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-mono text-2xl font-semibold text-foreground">
                    {score}
                  </span>
                </div>

                <div>
                  <p className="text-sm font-medium text-foreground">
                    {vessel.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {vessel.type} · {vessel.flag} · {vessel.speedKn.toFixed(1)} kn
                  </p>
                </div>

                <div className="h-1 w-full overflow-hidden bg-secondary">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${score}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default VesselPanel;
