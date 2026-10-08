import { useQuery } from "@tanstack/react-query";

import { api } from "@/services/api";
import type { InvestigationScenario } from "@/types";

/**
 * Reads the investigation scenario (detection + candidate vessels) through the
 * service layer, never from fixtures directly.
 */
export function useInvestigationScenario() {
  return useQuery<InvestigationScenario>({
    queryKey: ["investigation-scenario"],
    queryFn: () => api.getInvestigationScenario(),
    staleTime: 5 * 60 * 1000,
  });
}
