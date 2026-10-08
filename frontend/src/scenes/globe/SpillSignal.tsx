import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { GlobeTarget } from "@/types";

import { latLonToVector3 } from "./geo";
import { EARTH_RADIUS, type GlobePalette } from "./theme";

interface SpillSignalProps {
  target: GlobeTarget;
  palette: GlobePalette;
  /** Raises the marker's presence during the investigation transition. */
  highlighted?: boolean;
}

/**
 * The demonstration detection: a small slick footprint with a quiet pulse and
 * a compact intelligence label. It stays understated until the CTA focuses on
 * it, at which point the whole marker lifts.
 */
const SpillSignal = ({
  target,
  palette,
  highlighted = false,
}: SpillSignalProps) => {
  const ringRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const slickRef = useRef<THREE.Mesh>(null);
  const intensity = useRef(0);
  const camera = useThree((state) => state.camera);
  const [facing, setFacing] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  const transform = useMemo(() => {
    const normal = latLonToVector3(
      target.position.lat,
      target.position.lon,
      EARTH_RADIUS,
    ).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    );
    return {
      position: normal.clone().multiplyScalar(EARTH_RADIUS + 0.004),
      quaternion,
    };
  }, [target.position.lat, target.position.lon]);

  const scratch = useMemo(
    () => ({ world: new THREE.Vector3(), toCamera: new THREE.Vector3() }),
    [],
  );

  useFrame((state, delta) => {
    const step = Math.min(delta, 0.05);
    intensity.current = THREE.MathUtils.damp(
      intensity.current,
      highlighted ? 1 : 0,
      3,
      step,
    );

    const pulse = (state.clock.elapsedTime % 2.8) / 2.8;
    const boost = intensity.current;

    if (ringRef.current) {
      ringRef.current.scale.setScalar(1 + pulse * (1.7 + boost * 1.3));
      const material = ringRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (1 - pulse) * (0.32 + boost * 0.45);
    }

    if (coreRef.current) {
      const material = coreRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.6 + boost * 0.4;
    }

    if (slickRef.current) {
      const material = slickRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.16 + boost * 0.3;
      slickRef.current.scale.setScalar(1 + boost * 0.45);
    }

    // Hide the label when the detection rotates to the far side.
    if (groupRef.current) {
      const { world, toCamera } = scratch;
      groupRef.current.getWorldPosition(world);
      toCamera.copy(camera.position).sub(world).normalize();
      world.normalize();
      const isFacing = world.dot(toCamera) > 0.2;
      if (isFacing !== facing) setFacing(isFacing);
    }
  });

  return (
    <group
      ref={groupRef}
      position={transform.position}
      quaternion={transform.quaternion}
    >
      {/* Irregular slick footprint */}
      <mesh ref={slickRef} scale={[1.35, 0.78, 1]} rotation={[0, 0, 0.6]}>
        <circleGeometry args={[0.032, 28]} />
        <meshBasicMaterial
          color={palette.signal}
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={ringRef}>
        <ringGeometry args={[0.015, 0.02, 40]} />
        <meshBasicMaterial
          color={palette.signal}
          transparent
          opacity={0.32}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh ref={coreRef}>
        <circleGeometry args={[0.008, 20]} />
        <meshBasicMaterial
          color={palette.signal}
          transparent
          opacity={0.6}
          depthWrite={false}
        />
      </mesh>

      {facing ? (
        <Html
          position={[0.02, 0.02, 0.02]}
          zIndexRange={[15, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="w-max border-l-2 border-signal bg-card/90 py-1 pl-2 pr-2.5 shadow-panel backdrop-blur-sm">
            <p className="flex items-center gap-1.5 font-mono text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-signal">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-signal" />
              </span>
              Oil slick detected
            </p>
            <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">
              {(target.confidence * 100).toFixed(1)}% confidence
            </p>
          </div>
        </Html>
      ) : null}
    </group>
  );
};

export default SpillSignal;
