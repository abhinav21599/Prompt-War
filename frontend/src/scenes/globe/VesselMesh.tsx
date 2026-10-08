import { useMemo } from "react";

import type { VesselType } from "@/types";

import type { GlobePalette } from "./theme";

/**
 * Low-poly miniature vessels.
 *
 * Every model is built from a handful of primitives along +Z (forward) with
 * +Y up, matching the basis `ShipMarker` sets from the surface normal and
 * course. Silhouettes are deliberately distinct so a tanker, a boxship, a
 * general cargo ship and a research vessel read differently at hero scale.
 */

const LENGTH = 0.058;
const BEAM = 0.019;
const FREEBOARD = 0.008;

interface VesselMeshProps {
  type: VesselType;
  palette: GlobePalette;
  /** Lifted slightly while the vessel is hovered or during a focus sweep. */
  emphasis?: number;
}

/** Shared hull: a boxy midbody with a tapered bow and a squared stern. */
const Hull = ({ palette }: { palette: GlobePalette }) => (
  <group>
    <mesh position={[0, 0, -LENGTH * 0.1]}>
      <boxGeometry args={[BEAM, FREEBOARD, LENGTH * 0.78]} />
      <meshStandardMaterial
        color={palette.hullAccent}
        roughness={0.55}
        metalness={0.15}
      />
    </mesh>

    {/* Bow: a 4-sided cone laid on its side gives a clean raked stem. */}
    <mesh
      position={[0, 0, LENGTH * 0.41]}
      rotation={[Math.PI / 2, Math.PI / 4, 0]}
    >
      <coneGeometry args={[BEAM * 0.72, LENGTH * 0.26, 4]} />
      <meshStandardMaterial
        color={palette.hullAccent}
        roughness={0.55}
        metalness={0.15}
      />
    </mesh>

    {/* Weather deck */}
    <mesh position={[0, FREEBOARD * 0.52, -LENGTH * 0.08]}>
      <boxGeometry args={[BEAM * 0.9, FREEBOARD * 0.12, LENGTH * 0.74]} />
      <meshStandardMaterial color={palette.deck} roughness={0.8} />
    </mesh>
  </group>
);

/** Aft accommodation block, common to the merchant types. */
const Deckhouse = ({
  palette,
  z,
  height = FREEBOARD * 1.5,
}: {
  palette: GlobePalette;
  z: number;
  height?: number;
}) => (
  <group position={[0, FREEBOARD * 0.5 + height * 0.5, z]}>
    <mesh>
      <boxGeometry args={[BEAM * 0.72, height, LENGTH * 0.13]} />
      <meshStandardMaterial
        color={palette.hull}
        roughness={0.45}
        metalness={0.08}
      />
    </mesh>
    {/* Funnel */}
    <mesh position={[0, height * 0.62, -LENGTH * 0.03]}>
      <cylinderGeometry args={[BEAM * 0.12, BEAM * 0.14, height * 0.55, 6]} />
      <meshStandardMaterial color={palette.hullAccent} roughness={0.5} />
    </mesh>
  </group>
);

const VesselMesh = ({ type, palette, emphasis = 0 }: VesselMeshProps) => {
  const scale = 1 + emphasis * 0.22;

  const superstructure = useMemo(() => {
    switch (type) {
      // Long flush deck, aft house, and the centreline cargo manifold.
      case "tanker":
        return (
          <>
            <Deckhouse palette={palette} z={-LENGTH * 0.36} />
            <mesh position={[0, FREEBOARD * 0.72, LENGTH * 0.05]}>
              <boxGeometry args={[BEAM * 0.16, FREEBOARD * 0.3, LENGTH * 0.5]} />
              <meshStandardMaterial color={palette.deck} roughness={0.7} />
            </mesh>
            <mesh position={[0, FREEBOARD * 0.95, LENGTH * 0.12]}>
              <cylinderGeometry
                args={[BEAM * 0.07, BEAM * 0.07, FREEBOARD * 0.9, 6]}
              />
              <meshStandardMaterial color={palette.hull} roughness={0.5} />
            </mesh>
          </>
        );

      // Container stacks amidships, house right aft.
      case "container":
        return (
          <>
            <Deckhouse palette={palette} z={-LENGTH * 0.38} />
            {[0.22, 0.06, -0.1].map((z, row) => (
              <mesh
                key={z}
                position={[0, FREEBOARD * 0.5 + FREEBOARD * (0.5 + row * 0.08), LENGTH * z]}
              >
                <boxGeometry
                  args={[
                    BEAM * 0.86,
                    FREEBOARD * (1 + row * 0.16),
                    LENGTH * 0.13,
                  ]}
                />
                <meshStandardMaterial
                  color={row % 2 === 0 ? palette.hull : palette.deck}
                  roughness={0.75}
                />
              </mesh>
            ))}
          </>
        );

      // General cargo: aft house plus a pair of deck cranes.
      case "cargo":
        return (
          <>
            <Deckhouse palette={palette} z={-LENGTH * 0.34} />
            {[0.18, -0.04].map((z) => (
              <group key={z} position={[0, FREEBOARD * 0.6, LENGTH * z]}>
                <mesh position={[0, FREEBOARD * 0.55, 0]}>
                  <cylinderGeometry
                    args={[BEAM * 0.06, BEAM * 0.08, FREEBOARD * 1.1, 6]}
                  />
                  <meshStandardMaterial color={palette.hull} roughness={0.5} />
                </mesh>
                <mesh
                  position={[0, FREEBOARD * 1.02, LENGTH * 0.03]}
                  rotation={[0.5, 0, 0]}
                >
                  <boxGeometry
                    args={[BEAM * 0.05, FREEBOARD * 0.09, LENGTH * 0.12]}
                  />
                  <meshStandardMaterial color={palette.deck} roughness={0.6} />
                </mesh>
              </group>
            ))}
          </>
        );

      // Research vessel: forward bridge, open aft working deck, sensor dome.
      case "research":
        return (
          <>
            <Deckhouse
              palette={palette}
              z={LENGTH * 0.14}
              height={FREEBOARD * 1.9}
            />
            <mesh position={[0, FREEBOARD * 2.6, LENGTH * 0.14]}>
              <sphereGeometry args={[BEAM * 0.2, 10, 8]} />
              <meshStandardMaterial
                color={palette.hull}
                roughness={0.35}
                metalness={0.1}
              />
            </mesh>
            {/* A-frame over the stern */}
            <mesh position={[0, FREEBOARD * 1.1, -LENGTH * 0.36]}>
              <torusGeometry args={[BEAM * 0.34, BEAM * 0.045, 6, 10, Math.PI]} />
              <meshStandardMaterial color={palette.hullAccent} roughness={0.5} />
            </mesh>
          </>
        );

      default:
        return <Deckhouse palette={palette} z={-LENGTH * 0.3} />;
    }
  }, [type, palette]);

  return (
    <group scale={scale}>
      <Hull palette={palette} />
      {superstructure}
    </group>
  );
};

export default VesselMesh;
