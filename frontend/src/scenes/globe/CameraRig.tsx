import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { GlobeScanState } from "@/types";

const IDLE_DISTANCE = 4.2;
const FOCUS_DISTANCE = 3.05;

interface CameraRigProps {
  scanState: GlobeScanState;
}

/**
 * Smooth, restrained camera movement: a gentle pointer drift while idle and a
 * damped push-in toward the target during the investigation transition.
 */
const CameraRig = ({ scanState }: CameraRigProps) => {
  const camera = useThree((state) => state.camera);
  const pointer = useThree((state) => state.pointer);

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.05);
    const focusing = scanState === "focusing";

    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      focusing ? 0 : pointer.x * 0.12,
      1.8,
      step,
    );
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      focusing ? 0 : pointer.y * 0.08,
      1.8,
      step,
    );
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      focusing ? FOCUS_DISTANCE : IDLE_DISTANCE,
      focusing ? 1.6 : 2.4,
      step,
    );
    camera.lookAt(0, 0, 0);
  });

  return null;
};

export default CameraRig;
