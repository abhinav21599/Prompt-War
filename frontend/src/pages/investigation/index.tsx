import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Skeleton } from "@/components/ui/skeleton";
import { useInvestigationScenario } from "@/hooks/use-investigation-scenario";

import ActionToolbar, { ACTIONS, type ActionId } from "./ActionToolbar";
import AnalysisPanel from "./AnalysisPanel";
import InvestigationMap from "./InvestigationMap";
import VesselPanel from "./VesselPanel";

/**
 * The investigation workspace opened by START INVESTIGATION.
 * Demo scenario data flows in through the service layer; the action buttons
 * only drive frontend state for now.
 */
const Investigation = () => {
  const { data: scenario, isPending } = useInvestigationScenario();
  const [activeAction, setActiveAction] = useState<ActionId | null>(null);

  const activeLabel = ACTIONS.find((a) => a.id === activeAction)?.label;

  return (
    <div className="flex min-h-full flex-col bg-surface">
      {/* Page header */}
      <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 lg:px-6">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.75} />
            Overview
          </Link>

          <div className="h-5 w-px bg-border" />

          <div>
            <span className="text-label">Investigation workspace</span>
            {scenario ? (
              <h1 className="mt-0.5 font-mono text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
                {scenario.id} · {scenario.name}
              </h1>
            ) : (
              <Skeleton className="mt-1.5 h-3.5 w-56" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
          </span>
          <span className="text-label hidden sm:inline">Live simulation</span>
        </div>
      </header>

      {/* Action toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-4 py-3 lg:px-6">
        <ActionToolbar active={activeAction} onSelect={setActiveAction} />
        <span className="text-label">
          {activeLabel
            ? `${activeLabel} — queued · demo state`
            : "Awaiting command"}
        </span>
      </div>

      {/* Map + analysis */}
      <main className="grid flex-1 grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-6">
        <section className="relative min-h-[420px] overflow-hidden border border-border lg:min-h-0">
          {isPending || !scenario ? (
            <Skeleton className="h-full w-full rounded-none" />
          ) : (
            <InvestigationMap
              vessels={scenario.vessels}
              spillLocation={scenario.spill.location}
              spillId={scenario.id}
            />
          )}
        </section>

        <aside className="min-h-[300px] lg:min-h-0">
          {isPending || !scenario ? (
            <Skeleton className="h-full w-full rounded-none" />
          ) : (
            <AnalysisPanel scenario={scenario} />
          )}
        </aside>
      </main>

      {/* Potential vessels */}
      <section className="px-4 pb-4 lg:px-6">
        {isPending || !scenario ? (
          <Skeleton className="h-40 w-full rounded-none" />
        ) : (
          <VesselPanel vessels={scenario.vessels} />
        )}
      </section>
    </div>
  );
};

export default Investigation;
