import { useFrame } from "@react-three/fiber";
import { useRef, type MutableRefObject } from "react";
import * as THREE from "three";

import type { Theme } from "@/hooks/theme-context";

/**
 * A 0–1 value damped toward the active theme (0 = light, 1 = dark).
 *
 * Theme changes are discrete React state, but the globe must cross-fade its
 * lighting, textures and accents. Each consumer animates its own copy inside
 * the render loop so switching never re-creates GPU resources.
 */
export function useThemeMix(theme: Theme): MutableRefObject<number> {
  const mix = useRef(theme === "dark" ? 1 : 0);

  useFrame((_, delta) => {
    mix.current = THREE.MathUtils.damp(
      mix.current,
      theme === "dark" ? 1 : 0,
      2.6,
      Math.min(delta, 0.05),
    );
  });

  return mix;
}
