import * as THREE from "three";

import type { Coordinates } from "@/types";

import { EARTH_RADIUS } from "./theme";

const DEG2RAD = Math.PI / 180;

/**
 * Converts geographic coordinates to a point on the sphere, using the
 * convention that matches an equirectangular texture on THREE.SphereGeometry.
 */
export function latLonToVector3(
  lat: number,
  lon: number,
  radius = EARTH_RADIUS,
): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * The globe Y rotation that brings a longitude to face the camera (+Z),
 * together with the X rotation that centres its latitude.
 */
export function focusRotation(position: Coordinates): {
  x: number;
  y: number;
} {
  const point = latLonToVector3(position.lat, position.lon);
  return {
    x: position.lat * DEG2RAD,
    y: -Math.atan2(point.x, point.z),
  };
}

/**
 * Densely samples a great-circle path through the given waypoints so ships and
 * corridors follow the curvature of the Earth instead of cutting through it.
 * Points are lifted slightly above the surface to avoid z-fighting.
 */
export function sampleGreatCirclePath(
  waypoints: Coordinates[],
  altitude = 0.006,
  segmentsPerLeg = 18,
): THREE.Vector3[] {
  const radius = EARTH_RADIUS + altitude;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const from = latLonToVector3(waypoints[i].lat, waypoints[i].lon, radius);
    const to = latLonToVector3(
      waypoints[i + 1].lat,
      waypoints[i + 1].lon,
      radius,
    );
    const last = i === waypoints.length - 2;

    for (let s = 0; s <= segmentsPerLeg; s += 1) {
      if (s === segmentsPerLeg && !last) continue;
      const t = s / segmentsPerLeg;
      // Spherical interpolation keeps the path hugging the surface.
      points.push(
        new THREE.Vector3()
          .copy(from)
          .lerp(to, t)
          .normalize()
          .multiplyScalar(radius),
      );
    }
  }

  return points;
}

/** Position along a sampled path, where `t` is a 0–1 fraction of its length. */
export function samplePathAt(
  points: THREE.Vector3[],
  t: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  if (points.length === 0) return out;
  const clamped = ((t % 1) + 1) % 1;
  const scaled = clamped * (points.length - 1);
  const index = Math.floor(scaled);
  const next = Math.min(index + 1, points.length - 1);
  return out.copy(points[index]).lerp(points[next], scaled - index);
}

/**
 * Where along a path a reported position sits, so a ship starts animating
 * from its last known location rather than from the start of its corridor.
 */
export function nearestProgressOnPath(
  points: THREE.Vector3[],
  position: Coordinates,
): number {
  if (points.length < 2) return 0;

  const target = latLonToVector3(position.lat, position.lon);
  let closest = 0;
  let bestDistance = Infinity;

  points.forEach((point, index) => {
    const distance = point.distanceToSquared(target);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = index;
    }
  });

  return closest / (points.length - 1);
}

/** Shortest signed angular delta between two angles, in radians. */
export function shortestAngle(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  let delta = (to - from) % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  if (delta < -Math.PI) delta += twoPi;
  return delta;
}
