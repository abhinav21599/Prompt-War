import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { MaritimeRoute } from "@/types";

import { sampleGreatCirclePath } from "./geo";
import type { GlobePalette } from "./theme";

interface ShipRouteProps {
  route: MaritimeRoute;
  palette: GlobePalette;
  /** Raised for corridors relevant to the active investigation. */
  active?: boolean;
  /** Lifted slightly so corridors never z-fight with the surface. */
  altitude?: number;
}

/**
 * A single maritime corridor drawn as a thin, low-opacity great-circle line.
 * Geometry is built once per route; only the material reacts to theme changes.
 */
const ShipRoute = ({
  route,
  palette,
  active = false,
  altitude = 0.006,
}: ShipRouteProps) => {
  const line = useMemo(() => {
    const points = sampleGreatCirclePath(route.waypoints, altitude);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      transparent: true,
      depthWrite: false,
    });
    return new THREE.Line(geometry, material);
  }, [route.waypoints, altitude]);

  useEffect(() => {
    const material = line.material as THREE.LineBasicMaterial;
    material.color.set(active ? palette.routeActive : palette.route);
    material.opacity = active ? 0.7 : 0.4;
  }, [line, palette, active]);

  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );

  return <primitive object={line} />;
};

export default ShipRoute;
