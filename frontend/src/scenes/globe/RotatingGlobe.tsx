import { useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Coordinates, GlobeScanState } from "@/types";

import { focusRotation, shortestAngle } from "./geo";

const AUTO_SPIN = 0.035;
const FOCUS_SPIN = 0.006;
const POINTER_TILT = 0.13;
const POINTER_YAW = 0.16;
/** Opening view: the Atlantic, Europe and Africa, where the demo slick sits. */
const INITIAL_YAW = -1.75;

interface RotatingGlobeProps {
  scanState: GlobeScanState;
  focusOn?: Coordinates | null;
  children: ReactNode;
}

/**
 * Owns the globe's motion: a calm automatic spin, a subtle pointer parallax,
 * and a damped rotation toward the investigation target when focusing.
 */
const RotatingGlobe = ({
  scanState,
  focusOn,
  children,
}: RotatingGlobeProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const pointer = useThree((state) => state.pointer);

  const focus = useMemo(
    () => (focusOn ? focusRotation(focusOn) : null),
    [focusOn],
  );

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const step = Math.min(delta, 0.05);

    if (scanState === "focusing" && focus) {
      group.rotation.y += shortestAngle(group.rotation.y, focus.y) * (1 - Math.exp(-2.4 * step));
      group.rotation.x = THREE.MathUtils.damp(
        group.rotation.x,
        focus.x,
        2.4,
        step,
      );
      return;
    }

    group.rotation.y += step * (scanState === "focusing" ? FOCUS_SPIN : AUTO_SPIN);
    group.rotation.y += shortestAngle(0, pointer.x * POINTER_YAW) * 0.02;
    group.rotation.x = THREE.MathUtils.damp(
      group.rotation.x,
      pointer.y * POINTER_TILT,
      1.6,
      step,
    );
  });

  // The outer tilt reads as the Earth's axial inclination.
  return (
    <group rotation={[0, 0, -0.24]}>
      <group ref={groupRef} rotation={[0, INITIAL_YAW, 0]}>
        {children}
      </group>
    </group>
  );
};

export default RotatingGlobe;
