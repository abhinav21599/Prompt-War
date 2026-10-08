import { AnimatePresence } from "framer-motion";
import { lazy, Suspense } from "react";

import ScanTransitionOverlay from "@/components/ScanTransitionOverlay";
import { useGlobeScene } from "@/hooks/use-globe-scene";
import { useInvestigationTransition } from "@/hooks/use-investigation-transition";
import { useTheme } from "@/hooks/theme-context";

import Header from "./Header";
import Hero from "./Hero";
import IntelligenceHud from "./IntelligenceHud";
import StatsStrip from "./StatsStrip";

// The 3D stack is split out so the hero copy paints before Three.js arrives.
const GlobeScene = lazy(() => import("@/scenes/GlobeScene"));

/** OilTrace AI landing page: hero on the left, live 3D globe on the right. */
const Landing = () => {
  const { data: globe } = useGlobeScene();
  const { theme } = useTheme();
  const { scanState, isTransitioning, startInvestigation } =
    useInvestigationTransition();

  return (
    <div className="relative flex min-h-screen flex-col overflow-y-auto overflow-x-hidden">

      {/* Orbital light wash behind the globe, dark theme only. */}
      <div className="pointer-events-none absolute inset-0 hidden dark:block">
        <div className="absolute right-[8%] top-[18%] size-[40rem] max-w-[80vw] rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <div className="relative flex min-h-full flex-col">
        <Header />

        <main className="flex flex-1 flex-col gap-10 px-6 py-12 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14 lg:px-10 lg:py-14">
          <section className="flex flex-col gap-10">
            <Hero
              onStartInvestigation={startInvestigation}
              isTransitioning={isTransitioning}
            />
            <StatsStrip />
          </section>

          <section className="relative h-[340px] w-full sm:h-[440px] lg:h-[min(76vh,660px)]">
            <IntelligenceHud vesselsTracked={globe?.ships.length ?? 0} />

            <Suspense fallback={<GlobePlaceholder />}>
              <GlobeScene
                ships={globe?.ships}
                routes={globe?.routes}
                stations={globe?.stations}
                targetLocation={globe?.target}
                scanState={scanState}
                theme={theme}
              />
            </Suspense>
          </section>
        </main>

        <footer className="relative border-t border-border px-6 py-4 lg:px-10">
          <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
            <div className="h-px w-1/3 animate-sweep bg-gradient-signal" />
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-label">Sentinel-1 · AIS · HYCOM · ERA5</span>
            <span className="text-label">
              {globe ? `${globe.ships.length} vessels tracked` : "Acquiring feed"}
            </span>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {isTransitioning ? (
          <ScanTransitionOverlay label={globe?.target.label} />
        ) : null}
      </AnimatePresence>
    </div>
  );
};

/** Reserves the globe's footprint while the 3D chunk loads. */
const GlobePlaceholder = () => (
  <div className="flex h-full w-full items-center justify-center">
    <div className="aspect-square h-[76%] animate-pulse rounded-full border border-border bg-surface" />
  </div>
);

export default Landing;
