import { useQuery } from "@tanstack/react-query";

import { api } from "@/services/api";
import type { PlatformStat } from "@/types";

/** Reads headline platform metrics through the service layer. */
export function usePlatformStats() {
  return useQuery<PlatformStat[]>({
    queryKey: ["platform-stats"],
    queryFn: () => api.getPlatformStats(),
    staleTime: 5 * 60 * 1000,
  });
}
