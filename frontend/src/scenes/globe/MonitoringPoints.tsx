import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { MonitoringStation } from "@/types";

import { latLonToVector3 } from "./geo";
import { EARTH_RADIUS, type GlobePalette } from "./theme";

interface MonitoringPointsProps {
  stations: MonitoringStation[];
  palette: GlobePalette;
}

/**
 * Passive ocean sensor stations, drawn as one instanced mesh of small discs.
 * They breathe very slowly so the ocean reads as actively monitored without
 * competing with the vessels or the detection marker.
 */
const MonitoringPoints = ({ stations, palette }: MonitoringPointsProps) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  const transforms = useMemo(
    () =>
      stations.map((station) => {
        const normal = latLonToVector3(
          station.position.lat,
          station.position.lon,
        ).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          normal,
        );
        return {
          position: normal.clone().multiplyScalar(EARTH_RADIUS + 0.003),
          quaternion,
        };
      }),
    [stations],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3(1, 1, 1);
    transforms.forEach((transform, index) => {
      matrix.compose(transform.position, transform.quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [transforms]);

  useEffect(() => {
    materialRef.current?.color.set(palette.station);
  }, [palette]);

  useFrame((state) => {
    if (!materialRef.current) return;
    const pulse = Math.sin(state.clock.elapsedTime * 0.9) * 0.5 + 0.5;
    materialRef.current.opacity = 0.3 + pulse * 0.25;
  });

  if (stations.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, stations.length]}
      frustumCulled={false}
    >
      <ringGeometry args={[0.005, 0.009, 12]} />
      <meshBasicMaterial
        ref={materialRef}
        transparent
        opacity={0.4}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
};

export default MonitoringPoints;
