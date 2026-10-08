import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { Theme } from "@/hooks/theme-context";
import type {
  GlobeScanState,
  GlobeTarget,
  MaritimeRoute,
  MonitoringStation,
  TrackedShip,
} from "@/types";

import CameraRig from "./globe/CameraRig";
import Earth from "./globe/Earth";
import MonitoringPoints from "./globe/MonitoringPoints";
import RotatingGlobe from "./globe/RotatingGlobe";
import SatelliteScanner from "./globe/SatelliteScanner";
import ShipMarker from "./globe/ShipMarker";
import ShipRoute from "./globe/ShipRoute";
import SpillSignal from "./globe/SpillSignal";
import StarField from "./globe/StarField";
import { nearestProgressOnPath, sampleGreatCirclePath } from "./globe/geo";
import { globePalettes, SUN_DIRECTION } from "./globe/theme";
import { useThemeMix } from "./globe/useThemeMix";

export interface GlobeSceneProps {
  /** Vessels to render, supplied by the service layer. */
  ships?: TrackedShip[];
  /** Maritime corridors drawn across the ocean. */
  routes?: MaritimeRoute[];
  /** Passive ocean sensor stations. */
  stations?: MonitoringStation[];
  /** Detection the globe focuses on during the investigation transition. */
  targetLocation?: GlobeTarget | null;
  /** Drives focusing, beam intensity and signal highlight. */
  scanState?: GlobeScanState;
  /** Selects the globe palette and day/night lighting model. */
  theme?: Theme;
}

/** Cross-fades the key light so the terminator appears with the dark theme. */
const SceneLighting = ({ theme }: { theme: Theme }) => {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);
  const themeMix = useThemeMix(theme);

  useFrame(() => {
    const mix = themeMix.current;
    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.lerp(1.15, 0.22, mix);
    }
    if (keyRef.current) {
      keyRef.current.intensity = THREE.MathUtils.lerp(1.05, 2.1, mix);
    }
    if (fillRef.current) {
      fillRef.current.intensity = THREE.MathUtils.lerp(0.35, 0.12, mix);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={1.15} />
      {/* Key light shares the shader's sun vector, so lit sides agree. */}
      <directionalLight
        ref={keyRef}
        position={[
          SUN_DIRECTION[0] * 6,
          SUN_DIRECTION[1] * 6,
          SUN_DIRECTION[2] * 6,
        ]}
        intensity={1.05}
      />
      <directionalLight
        ref={fillRef}
        position={[-4, -1.5, -2.5]}
        intensity={0.35}
        color="#cfe3f5"
      />
    </>
  );
};

/**
 * The hero globe.
 *
 * Fully data-driven: it never imports fixtures and never calls an API. Swap
 * the demo payload for live AIS / SAR data and this component is unchanged.
 */
const GlobeScene = ({
  ships = [],
  routes = [],
  stations = [],
  targetLocation = null,
  scanState = "idle",
  theme = "light",
}: GlobeSceneProps) => {
  // Dropped automatically if the device cannot hold a comfortable frame rate.
  const [dpr, setDpr] = useState(1.6);
  const palette = globePalettes[theme];

  // Each corridor is sampled once; ships share their route's geometry.
  const paths = useMemo(() => {
    const map = new Map<string, ReturnType<typeof sampleGreatCirclePath>>();
    routes.forEach((route) => {
      map.set(route.id, sampleGreatCirclePath(route.waypoints, 0.012));
    });
    return map;
  }, [routes]);

  const placedShips = useMemo(
    () =>
      ships
        .map((ship) => {
          const path = paths.get(ship.route);
          if (!path) return null;
          return {
            ship,
            path,
            progress: nearestProgressOnPath(path, {
              lat: ship.latitude,
              lon: ship.longitude,
            }),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [ships, paths],
  );

  // While focusing, corridors near the detection are treated as relevant.
  const activeRouteIds = useMemo(() => {
    if (!targetLocation) return new Set<string>();
    const ids = new Set<string>();
    routes.forEach((route) => {
      const near = route.waypoints.some(
        (point) =>
          Math.abs(point.lat - targetLocation.position.lat) < 14 &&
          Math.abs(point.lon - targetLocation.position.lon) < 24,
      );
      if (near) ids.add(route.id);
    });
    return ids;
  }, [routes, targetLocation]);

  const focusing = scanState === "focusing";

  return (
    <Canvas
      flat
      dpr={dpr}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 4.2], fov: 38, near: 0.1, far: 40 }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(1.6)}
      />

      <SceneLighting theme={theme} />
      <StarField theme={theme} />

      <RotatingGlobe
        scanState={scanState}
        focusOn={targetLocation?.position ?? null}
      >
        <Earth theme={theme} />

        {routes.map((route) => (
          <ShipRoute
            key={route.id}
            route={route}
            palette={palette}
            active={focusing && activeRouteIds.has(route.id)}
          />
        ))}

        <MonitoringPoints stations={stations} palette={palette} />

        {placedShips.map(({ ship, path, progress }) => (
          <ShipMarker
            key={ship.id}
            ship={ship}
            path={path}
            initialProgress={progress}
            palette={palette}
            highlighted={focusing && activeRouteIds.has(ship.route)}
          />
        ))}

        {targetLocation ? (
          <SpillSignal
            target={targetLocation}
            palette={palette}
            highlighted={focusing}
          />
        ) : null}
      </RotatingGlobe>

      <SatelliteScanner scanState={scanState} palette={palette} />
      <CameraRig scanState={scanState} />
    </Canvas>
  );
};

export default GlobeScene;
