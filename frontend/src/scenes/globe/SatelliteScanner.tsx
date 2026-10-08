import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { GlobeScanState } from "@/types";

import type { GlobePalette } from "./theme";

const ORBIT_RADIUS = 1.42;
const BEAM_LENGTH = 0.34;
/** Seconds between passive observation sweeps while idle. */
const SWEEP_PERIOD = 11;
const SWEEP_DURATION = 3.2;

interface SatelliteScannerProps {
  scanState: GlobeScanState;
  palette: GlobePalette;
}

/**
 * A small observation satellite on an inclined orbit. It emits a thin footprint
 * beam in periodic sweeps rather than continuously, so the effect reads as
 * Earth observation instead of a permanent spotlight.
 */
const SatelliteScanner = ({ scanState, palette }: SatelliteScannerProps) => {
  const orbitRef = useRef<THREE.Group>(null);
  const satelliteRef = useRef<THREE.Group>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const footprintRef = useRef<THREE.Mesh>(null);
  const beamStrength = useRef(0);

  const orbitLine = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i += 1) {
      const angle = (i / 96) * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          Math.cos(angle) * ORBIT_RADIUS,
          0,
          Math.sin(angle) * ORBIT_RADIUS,
        ),
      );
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    return new THREE.Line(geometry, material);
  }, []);

  useEffect(() => {
    (orbitLine.material as THREE.LineBasicMaterial).color.set(palette.beam);
  }, [orbitLine, palette]);

  useEffect(
    () => () => {
      orbitLine.geometry.dispose();
      (orbitLine.material as THREE.Material).dispose();
    },
    [orbitLine],
  );

  useFrame((state, delta) => {
    const step = Math.min(delta, 0.05);
    const focusing = scanState === "focusing";

    if (orbitRef.current) {
      orbitRef.current.rotation.y += step * (focusing ? 0.22 : 0.1);
    }

    // Keep the satellite (and its beam) pointed at the Earth's centre.
    satelliteRef.current?.lookAt(0, 0, 0);

    // Idle: a slow periodic sweep. Focusing: the beam stays on.
    const phase = state.clock.elapsedTime % SWEEP_PERIOD;
    const sweeping = phase < SWEEP_DURATION;
    const envelope = sweeping
      ? Math.sin((phase / SWEEP_DURATION) * Math.PI)
      : 0;
    const target = focusing ? 0.26 : envelope * 0.16;

    beamStrength.current = THREE.MathUtils.damp(
      beamStrength.current,
      target,
      4,
      step,
    );

    if (beamRef.current) {
      const material = beamRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = beamStrength.current;
      beamRef.current.visible = beamStrength.current > 0.004;
    }

    if (footprintRef.current) {
      const material = footprintRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = beamStrength.current * 1.6;
      footprintRef.current.visible = beamStrength.current > 0.004;
      const scale = 1 + beamStrength.current * 1.2;
      footprintRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group rotation={[0.55, 0, 0.42]}>
      <primitive object={orbitLine} />

      <group ref={orbitRef}>
        <group ref={satelliteRef} position={[ORBIT_RADIUS, 0, 0]}>
          {/* Bus */}
          <mesh>
            <boxGeometry args={[0.034, 0.03, 0.05]} />
            <meshStandardMaterial
              color={palette.satellite}
              roughness={0.4}
              metalness={0.35}
            />
          </mesh>

          {/* Solar array booms and panels */}
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[side * 0.03, 0, 0]}>
                <cylinderGeometry args={[0.0025, 0.0025, 0.022, 5]} />
                <meshStandardMaterial color={palette.satellite} />
              </mesh>
              <mesh position={[side * 0.068, 0, 0]}>
                <boxGeometry args={[0.07, 0.022, 0.004]} />
                <meshStandardMaterial
                  color={palette.satellitePanel}
                  roughness={0.3}
                  metalness={0.45}
                />
              </mesh>
            </group>
          ))}

          {/* Dish pointed at Earth */}
          <mesh position={[0, 0, 0.032]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.013, 0.016, 10, 1, true]} />
            <meshStandardMaterial
              color={palette.hull}
              roughness={0.45}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Footprint beam: apex at the satellite, widening toward Earth. */}
          <mesh
            ref={beamRef}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, BEAM_LENGTH / 2]}
          >
            <coneGeometry args={[0.08, BEAM_LENGTH, 24, 1, true]} />
            <meshBasicMaterial
              color={palette.beam}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>

          {/* Illuminated patch where the beam meets the surface. */}
          <mesh ref={footprintRef} position={[0, 0, BEAM_LENGTH + 0.02]}>
            <circleGeometry args={[0.075, 24]} />
            <meshBasicMaterial
              color={palette.beam}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
};

export default SatelliteScanner;
