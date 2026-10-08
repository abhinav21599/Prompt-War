import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { Theme } from "@/hooks/theme-context";

import { useThemeMix } from "./useThemeMix";

const STAR_COUNT = 900;
const ORBITAL_COUNT = 140;

/**
 * Deep-space backdrop.
 *
 * Stars fade in with the dark theme; a small set of slowly drifting orbital
 * particles stays faintly present in both, giving the globe a sense of scale.
 */
const StarField = ({ theme }: { theme: Theme }) => {
  const starsRef = useRef<THREE.Points>(null);
  const starMaterialRef = useRef<THREE.PointsMaterial>(null);
  const orbitalMaterialRef = useRef<THREE.PointsMaterial>(null);
  const themeMix = useThemeMix(theme);

  const { starGeometry, orbitalGeometry } = useMemo(() => {
    let seed = 774411;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    // Stars sit on a far shell, well outside the camera's working range.
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starColors = new Float32Array(STAR_COUNT * 3);
    const warm = new THREE.Color("#fff2dc");
    const cool = new THREE.Color("#cfe2ff");
    const tint = new THREE.Color();

    for (let i = 0; i < STAR_COUNT; i += 1) {
      const radius = 14 + random() * 6;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = radius * Math.cos(phi);
      starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      tint.copy(random() > 0.7 ? warm : cool).multiplyScalar(
        0.55 + random() * 0.45,
      );
      starColors[i * 3] = tint.r;
      starColors[i * 3 + 1] = tint.g;
      starColors[i * 3 + 2] = tint.b;
    }

    const stars = new THREE.BufferGeometry();
    stars.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    stars.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

    // Orbital debris / traffic close to the planet.
    const orbitalPositions = new Float32Array(ORBITAL_COUNT * 3);
    for (let i = 0; i < ORBITAL_COUNT; i += 1) {
      const radius = 1.6 + random() * 1.5;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      orbitalPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      orbitalPositions[i * 3 + 1] = radius * Math.cos(phi) * 0.75;
      orbitalPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }

    const orbitals = new THREE.BufferGeometry();
    orbitals.setAttribute(
      "position",
      new THREE.BufferAttribute(orbitalPositions, 3),
    );

    return { starGeometry: stars, orbitalGeometry: orbitals };
  }, []);

  useFrame((_, delta) => {
    const mix = themeMix.current;

    if (starMaterialRef.current) {
      starMaterialRef.current.opacity = mix * 0.9;
      starMaterialRef.current.visible = mix > 0.01;
    }
    if (orbitalMaterialRef.current) {
      orbitalMaterialRef.current.opacity = THREE.MathUtils.lerp(0.4, 0.55, mix);
      orbitalMaterialRef.current.color.set(mix > 0.5 ? "#c8def2" : "#a9c6dd");
    }
    if (starsRef.current) {
      starsRef.current.rotation.y += delta * 0.004;
    }
  });

  return (
    <group>
      <points ref={starsRef} geometry={starGeometry} frustumCulled={false}>
        <pointsMaterial
          ref={starMaterialRef}
          size={0.055}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0}
          depthWrite={false}
        />
      </points>

      <points geometry={orbitalGeometry} frustumCulled={false}>
        <pointsMaterial
          ref={orbitalMaterialRef}
          size={0.014}
          sizeAttenuation
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </points>
    </group>
  );
};

export default StarField;
