import { useQuery } from "@tanstack/react-query";

import { api } from "@/services/api";
import type { GlobeSceneData } from "@/types";

/**
 * Reads the globe payload (ships, routes, target) through the service layer.
 * The globe components stay data-driven and never import fixtures directly.
 */
export function useGlobeScene() {
  return useQuery<GlobeSceneData>({
    queryKey: ["globe-scene"],
    queryFn: () => api.getGlobeScene(),
    staleTime: 5 * 60 * 1000,
  });
}
