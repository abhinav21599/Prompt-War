import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Theme } from "@/hooks/theme-context";

import {
  createCloudTexture,
  createEarthTexture,
  createNightLightsTexture,
} from "./earthTexture";
import {
  darkGlobePalette,
  EARTH_RADIUS,
  lightGlobePalette,
  SUN_DIRECTION,
} from "./theme";
import { useThemeMix } from "./useThemeMix";

/** World-space normal, so the terminator stays fixed while the Earth spins. */
const surfaceVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

/**
 * Earth surface.
 *
 * In light mode `uThemeMix` is 0: the basemap renders evenly lit, like a clean
 * GIS daytime map. As it animates to 1 the sun term takes over, the night side
 * falls away and the city-light map fades in only where the surface faces away
 * from the sun.
 */
const surfaceFragmentShader = /* glsl */ `
  uniform sampler2D uDayLight;
  uniform sampler2D uDayDark;
  uniform sampler2D uNightMap;
  uniform vec3 uSunDirection;
  uniform vec3 uAtmosphereColor;
  uniform float uThemeMix;
  uniform float uAmbient;
  uniform float uExposure;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    float sun = dot(normal, normalize(uSunDirection));

    // Wide, soft terminator — a hard edge looks like a CG sphere, not a planet.
    float dayAmount = smoothstep(-0.26, 0.30, sun);

    vec3 day = mix(
      texture2D(uDayLight, vUv).rgb,
      texture2D(uDayDark, vUv).rgb,
      uThemeMix
    );

    // Light mode stays fully lit; dark mode follows the sun.
    float lit = mix(1.0, dayAmount, uThemeMix);
    vec3 color = day * uExposure * (uAmbient + (1.0 - uAmbient) * lit);

    // City lights: night side only, and only once the dark theme is active.
    float nightAmount = (1.0 - dayAmount) * uThemeMix;
    color += texture2D(uNightMap, vUv).rgb * nightAmount * 1.15;

    // Atmospheric scattering toward the limb, strongest on the lit edge.
    float fresnel = pow(1.0 - abs(dot(normal, normalize(vViewDir))), 3.0);
    float rim = fresnel * (0.12 + 0.5 * uThemeMix) * (0.25 + 0.75 * dayAmount);
    color += uAtmosphereColor * rim;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const cloudFragmentShader = /* glsl */ `
  uniform sampler2D uCloudMap;
  uniform vec3 uSunDirection;
  uniform float uThemeMix;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    float sun = dot(normal, normalize(uSunDirection));
    float dayAmount = smoothstep(-0.18, 0.32, sun);
    float lit = mix(1.0, dayAmount, uThemeMix);

    float density = texture2D(uCloudMap, vUv).r;
    vec3 tint = mix(vec3(1.0), vec3(0.72, 0.82, 0.95), uThemeMix);

    gl_FragColor = vec4(tint * (0.25 + 0.75 * lit), density * uOpacity * lit);
  }
`;

/** Soft outer halo; fades out at the silhouette so it reads as air, not a ring. */
const haloFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDirection;
  uniform float uIntensity;
  uniform float uThemeMix;

  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    float fresnel = 1.0 - abs(dot(normal, normalize(vViewDir)));
    float band = smoothstep(1.0, 0.35, fresnel);

    // The glow follows the sun, so the rim brightens on the daylit limb.
    float sun = dot(normal, normalize(uSunDirection));
    float dayAmount = smoothstep(-0.45, 0.35, sun);
    float lit = mix(1.0, 0.18 + 0.82 * dayAmount, uThemeMix);

    gl_FragColor = vec4(uColor, pow(band, 1.2) * uIntensity * lit);
  }
`;

interface EarthProps {
  theme: Theme;
}

/**
 * The Earth body: a day/night surface, a soft cloud layer and an atmospheric
 * halo. Every texture is generated procedurally on the client, so the scene
 * still ships no external 3D assets.
 */
const Earth = ({ theme }: EarthProps) => {
  const cloudsRef = useRef<THREE.Mesh>(null);
  const themeMix = useThemeMix(theme);

  const textures = useMemo(
    () => ({
      dayLight: createEarthTexture(lightGlobePalette),
      dayDark: createEarthTexture(darkGlobePalette),
      night: createNightLightsTexture(),
      cloud: createCloudTexture(),
    }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(textures).forEach((texture) => texture.dispose());
    },
    [textures],
  );

  const sunDirection = useMemo(
    () => new THREE.Vector3(...SUN_DIRECTION).normalize(),
    [],
  );

  const surfaceUniforms = useMemo(
    () => ({
      uDayLight: { value: textures.dayLight },
      uDayDark: { value: textures.dayDark },
      uNightMap: { value: textures.night },
      uSunDirection: { value: sunDirection },
      uAtmosphereColor: { value: new THREE.Color(lightGlobePalette.atmosphere) },
      uThemeMix: { value: theme === "dark" ? 1 : 0 },
      uAmbient: { value: lightGlobePalette.ambient },
      uExposure: { value: lightGlobePalette.dayExposure },
    }),
    // Uniform objects are created once and mutated in the render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textures, sunDirection],
  );

  const cloudUniforms = useMemo(
    () => ({
      uCloudMap: { value: textures.cloud },
      uSunDirection: { value: sunDirection },
      uThemeMix: { value: theme === "dark" ? 1 : 0 },
      uOpacity: { value: 0.18 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textures, sunDirection],
  );

  const haloUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(lightGlobePalette.atmosphere) },
      uSunDirection: { value: sunDirection },
      uIntensity: { value: 0.45 },
      uThemeMix: { value: theme === "dark" ? 1 : 0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sunDirection],
  );

  const scratch = useMemo(
    () => ({
      light: new THREE.Color(lightGlobePalette.atmosphere),
      dark: new THREE.Color(darkGlobePalette.atmosphere),
    }),
    [],
  );

  useFrame((_, delta) => {
    const mix = themeMix.current;

    surfaceUniforms.uThemeMix.value = mix;
    surfaceUniforms.uAmbient.value = THREE.MathUtils.lerp(
      lightGlobePalette.ambient,
      darkGlobePalette.ambient,
      mix,
    );
    surfaceUniforms.uExposure.value = THREE.MathUtils.lerp(
      lightGlobePalette.dayExposure,
      darkGlobePalette.dayExposure,
      mix,
    );
    surfaceUniforms.uAtmosphereColor.value
      .copy(scratch.light)
      .lerp(scratch.dark, mix);

    cloudUniforms.uThemeMix.value = mix;
    cloudUniforms.uOpacity.value = THREE.MathUtils.lerp(0.18, 0.3, mix);

    haloUniforms.uThemeMix.value = mix;
    haloUniforms.uIntensity.value = THREE.MathUtils.lerp(0.45, 0.85, mix);
    haloUniforms.uColor.value.copy(scratch.light).lerp(scratch.dark, mix);

    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * 0.008;
    }
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 96, 64]} />
        <shaderMaterial
          vertexShader={surfaceVertexShader}
          fragmentShader={surfaceFragmentShader}
          uniforms={surfaceUniforms}
        />
      </mesh>

      <mesh ref={cloudsRef} scale={1.006}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 40]} />
        <shaderMaterial
          vertexShader={surfaceVertexShader}
          fragmentShader={cloudFragmentShader}
          uniforms={cloudUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* Outer atmosphere halo */}
      <mesh scale={1.07}>
        <sphereGeometry args={[EARTH_RADIUS, 48, 32]} />
        <shaderMaterial
          vertexShader={surfaceVertexShader}
          fragmentShader={haloFragmentShader}
          uniforms={haloUniforms}
          transparent
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export default Earth;
