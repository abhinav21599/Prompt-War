import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { GlobeScanState } from "@/types";

/** Time the globe focuses and the scan overlay plays before navigating. */
const NAVIGATE_DELAY_MS = 1900;

/**
 * Orchestrates the START INVESTIGATION transition: the globe focuses on the
 * detection, the scan overlay sweeps in, then the route changes.
 */
export function useInvestigationTransition(
  destination = import.meta.env.VITE_INVESTIGATION_URL || "/incidents"
) {
  const navigate = useNavigate();
  const [scanState, setScanState] = useState<GlobeScanState>("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  const startInvestigation = useCallback(() => {
    if (timer.current !== undefined) return;
    setScanState("focusing");
    timer.current = window.setTimeout(() => {
      const isExternal = destination.startsWith("http://") || destination.startsWith("https://");
      if (isExternal) {
        window.location.href = destination;
      } else {
        navigate(destination);
      }
    }, NAVIGATE_DELAY_MS);
  }, [destination, navigate]);

  return {
    scanState,
    isTransitioning: scanState === "focusing",
    startInvestigation,
  };
}
