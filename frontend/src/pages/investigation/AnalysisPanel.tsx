import { Droplets } from "lucide-react";

import type { InvestigationScenario } from "@/types";

interface AnalysisPanelProps {
  scenario: InvestigationScenario;
}

const formatCoordinate = (value: number, north: boolean) =>
  `${Math.abs(value).toFixed(2)}°${north ? "N" : "E"}`;

/** OIL SPILL ANALYSIS panel: the detection summary on the right. */
const AnalysisPanel = ({ scenario }: AnalysisPanelProps) => {
  const { spill, id, satellite } = scenario;
  const [ageMin, ageMax] = spill.estimatedAgeHours;

  const rows = [
    { label: "Area", value: `${spill.areaKm2} km²` },
    { label: "Confidence", value: `${(spill.confidence * 100).toFixed(1)}%` },
    { label: "Estimated age", value: `${ageMin}–${ageMax} hours` },
    {
      label: "Location",
      value: `${formatCoordinate(spill.location.lat, true)}, ${formatCoordinate(
        spill.location.lon,
        false,
      )}`,
    },
  ];

  return (
    <div className="flex h-full flex-col border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Droplets className="size-4 text-primary" strokeWidth={1.75} />
        <span className="text-label">Oil spill analysis</span>
      </div>

      <dl className="flex-1 px-4 py-3">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-1 py-2">
            <dt className="text-label">{row.label}</dt>
            <dd className="font-mono text-sm font-medium text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-border px-4 py-2.5">
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.22em] text-muted-foreground">
          {id} · {satellite}
        </p>
      </div>
    </div>
  );
};

export default AnalysisPanel;
