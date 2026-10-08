import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { TrackedShip, VesselType } from "@/types";

import VesselMesh from "./VesselMesh";
import { samplePathAt } from "./geo";
import type { GlobePalette } from "./theme";

const TRAIL_SEGMENTS = 26;
/** Fraction of the route covered by the wake behind a vessel. */
const TRAIL_SPAN = 0.06;

const VESSEL_LABELS: Record<VesselType, string> = {
  tanker: "Oil Tanker",
  container: "Container Ship",
  cargo: "Cargo Ship",
  research: "Research Vessel",
  fishing: "Fishing Vessel",
  tug: "Tug",
  other: "Vessel",
};

interface ShipMarkerProps {
  ship: TrackedShip;
  /** Pre-sampled great-circle path this vessel travels along. */
  path: THREE.Vector3[];
  /** Where along the path the vessel starts, 0–1. */
  initialProgress: number;
  palette: GlobePalette;
  /** Raised while the investigation transition highlights nearby traffic. */
  highlighted?: boolean;
}

/**
 * A single vessel: a small 3D hull oriented along its course, trailed by a
 * thin wake, with an on-hover readout. The transform and wake are mutated
 * imperatively so the component only re-renders when hover state changes.
 */
const ShipMarker = ({
  ship,
  path,
  initialProgress,
  palette,
  highlighted = false,
}: ShipMarkerProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const progress = useRef(initialProgress);
  const emphasis = useRef(0);
  const meshRef = useRef<THREE.Group>(null);
  /** True while the vessel is on the hemisphere facing the camera. */
  const facing = useRef(false);
  const [hovered, setHovered] = useState(false);
  const camera = useThree((state) => state.camera);

  const scratch = useMemo(
    () => ({
      position: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
      point: new THREE.Vector3(),
      world: new THREE.Vector3(),
      toCamera: new THREE.Vector3(),
    }),
    [],
  );

  const trail = useMemo(() => {
    const positions = new Float32Array(TRAIL_SEGMENTS * 3);
    const colors = new Float32Array(TRAIL_SEGMENTS * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });

    return new THREE.Line(geometry, material);
  }, []);

  // Wake colours follow the theme, so they are refreshed when the palette flips.
  useEffect(() => {
    const attribute = trail.geometry.getAttribute(
      "color",
    ) as THREE.BufferAttribute;
    const head = new THREE.Color(palette.trail);
    const tail = new THREE.Color(palette.oceanMid);
    const mixed = new THREE.Color();

    for (let i = 0; i < TRAIL_SEGMENTS; i += 1) {
      mixed.copy(head).lerp(tail, i / (TRAIL_SEGMENTS - 1));
      attribute.setXYZ(i, mixed.r, mixed.g, mixed.b);
    }
    attribute.needsUpdate = true;
  }, [palette, trail]);

  useEffect(
    () => () => {
      trail.geometry.dispose();
      (trail.material as THREE.Material).dispose();
    },
    [trail],
  );

  useFrame((_, delta) => {
    if (!groupRef.current || path.length < 2) return;
    const step = Math.min(delta, 0.05);

    // Hovering holds the vessel in place so the readout can be read.
    if (!hovered) {
      progress.current = (progress.current + step * ship.speed) % 1;
    }

    const {
      position,
      ahead,
      normal,
      forward,
      right,
      basis,
      point,
      world,
      toCamera,
    } = scratch;

    samplePathAt(path, progress.current, position);
    samplePathAt(path, progress.current + 0.004, ahead);
    groupRef.current.position.copy(position);

    // Orient the hull: +Y along the surface normal, +Z along the course.
    normal.copy(position).normalize();
    forward.copy(ahead).sub(position);
    if (forward.lengthSq() < 1e-10) forward.set(0, 0, 1);
    forward.normalize();
    right.crossVectors(normal, forward).normalize();
    forward.crossVectors(right, normal).normalize();
    basis.makeBasis(right, normal, forward);
    groupRef.current.quaternion.setFromRotationMatrix(basis);

    // Only the near hemisphere may be hovered; the Earth hides the rest.
    groupRef.current.getWorldPosition(world);
    toCamera.copy(camera.position).sub(world).normalize();
    world.normalize();
    facing.current = world.dot(toCamera) > 0.08;

    emphasis.current = THREE.MathUtils.damp(
      emphasis.current,
      hovered || highlighted ? 1 : 0,
      4,
      step,
    );
    if (meshRef.current) {
      const scale = 1 + emphasis.current * 0.3;
      meshRef.current.scale.setScalar(scale);
    }

    const attribute = trail.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let i = 0; i < TRAIL_SEGMENTS; i += 1) {
      const t = progress.current - (i / (TRAIL_SEGMENTS - 1)) * TRAIL_SPAN;
      samplePathAt(path, t, point);
      attribute.setXYZ(i, point.x, point.y, point.z);
    }
    attribute.needsUpdate = true;

    const material = trail.material as THREE.LineBasicMaterial;
    material.opacity = 0.5 + emphasis.current * 0.35;
  });

  return (
    <group>
      <primitive object={trail} />

      <group ref={groupRef}>
        <group ref={meshRef}>
          <VesselMesh type={ship.type} palette={palette} />
        </group>

        {/* Invisible, generously sized hover target. */}
        <mesh
          visible={false}
          onPointerOver={(event) => {
            if (!facing.current) return;
            event.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
        >
          <sphereGeometry args={[0.04, 8, 8]} />
        </mesh>

        {hovered ? (
          <Html
            position={[0, 0.055, 0]}
            center
            zIndexRange={[20, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div className="w-[9.5rem] -translate-y-1/2 border border-border bg-card/95 px-3 py-2.5 shadow-panel backdrop-blur-sm">
              <p className="text-label">Vessel</p>
              <p className="mt-0.5 truncate font-mono text-xs font-semibold text-foreground">
                {ship.name}
              </p>

              <p className="mt-2 text-label">Type</p>
              <p className="mt-0.5 font-mono text-xs text-foreground">
                {VESSEL_LABELS[ship.type]}
              </p>

              <p className="mt-2 text-label">Speed</p>
              <p className="mt-0.5 font-mono text-xs text-primary">
                {ship.speedKn.toFixed(1)} knots
              </p>
            </div>
          </Html>
        ) : null}
      </group>
    </group>
  );
};

export default ShipMarker;
