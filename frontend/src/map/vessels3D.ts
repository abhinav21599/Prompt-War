import * as THREE from 'three';
import * as maplibregl from 'maplibre-gl';
import type { VesselTrack, AISObservation, Attribution } from '../types';

export type VesselArchetype = 'tanker' | 'cargo' | 'fishing' | 'service' | 'patrol' | 'passenger' | 'generic';

// Determine archetype from vessel metadata
export function resolveVesselArchetype(vesselType?: string, vesselName?: string): VesselArchetype {
  const typeStr = (vesselType || '').toLowerCase();
  const nameStr = (vesselName || '').toLowerCase();

  if (typeStr.includes('tank') || nameStr.startsWith('mt ') || nameStr.includes('tanker')) return 'tanker';
  if (typeStr.includes('cargo') || typeStr.includes('container') || typeStr.includes('bulk') || nameStr.startsWith('mv ') || nameStr.includes('cma cgm')) return 'cargo';
  if (typeStr.includes('fish') || typeStr.includes('trawl') || nameStr.startsWith('fv ')) return 'fishing';
  if (typeStr.includes('tug') || typeStr.includes('supply') || typeStr.includes('service') || nameStr.startsWith('psv ')) return 'service';
  if (typeStr.includes('patrol') || typeStr.includes('coast guard') || typeStr.includes('navy') || nameStr.startsWith('icgs ')) return 'patrol';
  if (typeStr.includes('passenger') || typeStr.includes('ferry') || typeStr.includes('cruise')) return 'passenger';
  return 'generic';
}

// Semantic colors conforming to OILTRACE tactical design system
export const VESSEL_COLORS = {
  selected: 0x00E5FF,       // Bright Cyan
  rank1: 0xF59E0B,          // Amber Gold (Top Candidate)
  rank2: 0x38BDF8,          // Sky Blue
  rank3: 0x10B981,          // Emerald Green
  neutral: 0x64748B,        // Slate Gray
  hullDark: 0x1E2228,       // Deep Navy/Charcoal Hull
  waterlineRed: 0x8A2B2B,   // Anti-fouling Waterline
  deckGray: 0x333842,       // Dark Industrial Deck
  superstructure: 0xDDE1E6, // Maritime White/Light Gray
  funnelBlack: 0x111214,    // Exhaust Stack Black
  cargoBlue: 0x1E3A8A,      // Container Blue
  cargoRed: 0xB91C1C,       // Container Red
  cargoGreen: 0x065F46,     // Container Green
  cargoAmber: 0xD97706,     // Container Amber
  headingRay: 0x38BDF8,     // Heading Ray Cyan
  haloCandidate: 0xF59E0B,  // Amber Halo
  haloSelected: 0x00E5FF,   // Cyan Halo
};

// Physical dimensions based on vessel archetype and optional true length_m
export function resolveVesselLength(archetype: VesselArchetype, length_m?: number): number {
  if (length_m && length_m > 15 && length_m < 450) return length_m;
  switch (archetype) {
    case 'tanker': return 210;
    case 'cargo': return 145;
    case 'passenger': return 160;
    case 'service': return 54;
    case 'patrol': return 48;
    case 'fishing': return 32;
    default: return 95;
  }
}

// Singleton Geometry & Material Cache for 60 FPS performance
class VesselGeometryFactory {
  private materials = new Map<string, THREE.Material>();

  getMaterial(color: number, opacity: number = 1.0, emissive: number = 0x000000): THREE.Material {
    const key = `${color}_${opacity}_${emissive}`;
    let mat = this.materials.get(key);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({
        color,
        emissive,
        emissiveIntensity: emissive > 0 ? 0.4 : 0.0,
        transparent: opacity < 1.0,
        opacity,
      });
      this.materials.set(key, mat);
    }
    return mat;
  }

  private addNavLights(group: THREE.Group, archetype: VesselArchetype) {
    const portMat = this.getMaterial(0xEF4444, 1.0, 0xEF4444);
    const stbdMat = this.getMaterial(0x10B981, 1.0, 0x10B981);
    const mastMat = this.getMaterial(0xFFFFFF, 1.0, 0xFFFFFF);
    const lightGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);

    let beamOffset = 10;
    let lengthOffset = 15;
    let heightOffset = 12;

    if (archetype === 'fishing' || archetype === 'service') {
      beamOffset = 5;
      lengthOffset = 5;
      heightOffset = 7;
    }

    // Port Light (Red)
    const portLight = new THREE.Mesh(lightGeo, portMat);
    portLight.position.set(-beamOffset, lengthOffset, heightOffset);
    group.add(portLight);

    // Starboard Light (Green)
    const stbdLight = new THREE.Mesh(lightGeo, stbdMat);
    stbdLight.position.set(beamOffset, lengthOffset, heightOffset);
    group.add(stbdLight);

    // Masthead Light (White)
    const mastLight = new THREE.Mesh(lightGeo, mastMat);
    mastLight.position.set(0, -lengthOffset * 1.5, heightOffset + 5);
    group.add(mastLight);
  }

  createVesselMesh(archetype: VesselArchetype, primaryColor: number, isSelected: boolean): THREE.Group {
    const group = new THREE.Group();
    const primaryMat = this.getMaterial(primaryColor, 1.0, isSelected ? primaryColor : 0x000000);
    const hullMat = this.getMaterial(VESSEL_COLORS.hullDark);
    const waterlineMat = this.getMaterial(VESSEL_COLORS.waterlineRed);
    const deckMat = this.getMaterial(VESSEL_COLORS.deckGray);
    const bridgeMat = this.getMaterial(VESSEL_COLORS.superstructure);
    const stackMat = this.getMaterial(VESSEL_COLORS.funnelBlack);

    switch (archetype) {
      case 'tanker': {
        // Hull base (Length: 120m, Beam: 22m, Height: 8m)
        const hull = new THREE.Mesh(new THREE.BoxGeometry(22, 120, 8), hullMat);
        hull.position.set(0, 0, 4);
        group.add(hull);

        // Waterline stripe
        const waterline = new THREE.Mesh(new THREE.BoxGeometry(22.4, 120.4, 2), waterlineMat);
        waterline.position.set(0, 0, 1);
        group.add(waterline);

        // Pointed bulbous bow
        const bow = new THREE.Mesh(new THREE.ConeGeometry(11, 24, 4), primaryMat);
        bow.rotation.x = Math.PI / 2;
        bow.rotation.y = Math.PI / 4;
        bow.position.set(0, 68, 4);
        group.add(bow);

        // Main deck piping manifold spine
        const manifold = new THREE.Mesh(new THREE.BoxGeometry(4, 70, 2.5), deckMat);
        manifold.position.set(0, 10, 8.5);
        group.add(manifold);

        // Tank hatches
        for (let y = -15; y <= 40; y += 15) {
          const tankL = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 2, 8), deckMat);
          tankL.rotation.x = Math.PI / 2;
          tankL.position.set(-6, y, 8.5);
          group.add(tankL);

          const tankR = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 2, 8), deckMat);
          tankR.rotation.x = Math.PI / 2;
          tankR.position.set(6, y, 8.5);
          group.add(tankR);
        }

        // Aft bridge castle / superstructure
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 18, 14), bridgeMat);
        bridge.position.set(0, -42, 14);
        group.add(bridge);

        // Bridge wings
        const wings = new THREE.Mesh(new THREE.BoxGeometry(24, 6, 2.5), primaryMat);
        wings.position.set(0, -42, 19);
        group.add(wings);

        // Twin funnels / smokestacks
        const funnel1 = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 8, 8), stackMat);
        funnel1.rotation.x = Math.PI / 2;
        funnel1.position.set(-4, -50, 18);
        group.add(funnel1);

        const funnel2 = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 8, 8), stackMat);
        funnel2.rotation.x = Math.PI / 2;
        funnel2.position.set(4, -50, 18);
        group.add(funnel2);

        // Radar mast
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 12, 6), primaryMat);
        mast.rotation.x = Math.PI / 2;
        mast.position.set(0, -38, 26);
        group.add(mast);
        break;
      }

      case 'cargo': {
        // Container ship hull (Length: 110m, Beam: 20m, Height: 7m)
        const hull = new THREE.Mesh(new THREE.BoxGeometry(20, 110, 7), hullMat);
        hull.position.set(0, 0, 3.5);
        group.add(hull);

        // Bow wedge
        const bow = new THREE.Mesh(new THREE.ConeGeometry(10, 20, 4), primaryMat);
        bow.rotation.x = Math.PI / 2;
        bow.rotation.y = Math.PI / 4;
        bow.position.set(0, 62, 3.5);
        group.add(bow);

        // Container bays with staggered colors
        const containerColors = [
          VESSEL_COLORS.cargoBlue,
          VESSEL_COLORS.cargoRed,
          VESSEL_COLORS.cargoGreen,
          VESSEL_COLORS.cargoAmber,
        ];
        let cIdx = 0;
        for (let y = -25; y <= 40; y += 14) {
          for (let x of [-5, 5]) {
            const cMat = this.getMaterial(containerColors[cIdx % containerColors.length]);
            const cBox = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 10), cMat);
            cBox.position.set(x, y, 11);
            group.add(cBox);
            cIdx++;
          }
        }

        // Aft bridge tower
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(16, 14, 16), bridgeMat);
        bridge.position.set(0, -40, 14);
        group.add(bridge);

        const stack = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 9, 8), stackMat);
        stack.rotation.x = Math.PI / 2;
        stack.position.set(0, -48, 17);
        group.add(stack);
        break;
      }

      case 'fishing': {
        // Compact trawler hull (Length: 45m, Beam: 12m, Height: 5m)
        const hull = new THREE.Mesh(new THREE.BoxGeometry(12, 45, 5), hullMat);
        hull.position.set(0, 0, 2.5);
        group.add(hull);

        const bow = new THREE.Mesh(new THREE.ConeGeometry(6, 12, 4), primaryMat);
        bow.rotation.x = Math.PI / 2;
        bow.rotation.y = Math.PI / 4;
        bow.position.set(0, 26, 2.5);
        group.add(bow);

        // Forward wheelhouse
        const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(9, 12, 8), bridgeMat);
        wheelhouse.position.set(0, 6, 8.5);
        group.add(wheelhouse);

        // Working stern deck gantry
        const gantry = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 10), primaryMat);
        gantry.position.set(0, -16, 8.5);
        group.add(gantry);
        break;
      }

      case 'service': {
        // Broad utility / tug / PSV hull (Length: 55m, Beam: 16m, Height: 6m)
        const hull = new THREE.Mesh(new THREE.BoxGeometry(16, 55, 6), hullMat);
        hull.position.set(0, 0, 3);
        group.add(hull);

        // Bow push knees
        const pushKnees = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 8), primaryMat);
        pushKnees.position.set(0, 28, 4);
        group.add(pushKnees);

        // High forward wheelhouse
        const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(12, 14, 12), bridgeMat);
        wheelhouse.position.set(0, 10, 11);
        group.add(wheelhouse);

        // Open cargo/winch deck
        const winch = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 6, 8), stackMat);
        winch.position.set(0, -14, 6);
        group.add(winch);
        break;
      }

      case 'patrol': {
        // Sleek wave-piercing interceptor hull (Length: 70m, Beam: 11m, Height: 5m)
        const hull = new THREE.Mesh(new THREE.BoxGeometry(11, 70, 5), hullMat);
        hull.position.set(0, 0, 2.5);
        group.add(hull);

        const bow = new THREE.Mesh(new THREE.ConeGeometry(5.5, 20, 4), primaryMat);
        bow.rotation.x = Math.PI / 2;
        bow.rotation.y = Math.PI / 4;
        bow.position.set(0, 42, 2.5);
        group.add(bow);

        // Angular stealth bridge
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(8, 18, 7), bridgeMat);
        bridge.position.set(0, 4, 7.5);
        group.add(bridge);

        // Radar dome
        const dome = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 8), primaryMat);
        dome.position.set(0, 0, 13);
        group.add(dome);
        break;
      }

      case 'passenger': {
        // Multi-tier passenger vessel (Length: 95m, Beam: 18m, Height: 6m)
        const hull = new THREE.Mesh(new THREE.BoxGeometry(18, 95, 6), hullMat);
        hull.position.set(0, 0, 3);
        group.add(hull);

        const bow = new THREE.Mesh(new THREE.ConeGeometry(9, 18, 4), primaryMat);
        bow.rotation.x = Math.PI / 2;
        bow.rotation.y = Math.PI / 4;
        bow.position.set(0, 53, 3);
        group.add(bow);

        // 3-tiered passenger decks
        const deck1 = new THREE.Mesh(new THREE.BoxGeometry(16, 70, 5), bridgeMat);
        deck1.position.set(0, -5, 8);
        group.add(deck1);

        const deck2 = new THREE.Mesh(new THREE.BoxGeometry(14, 55, 4.5), bridgeMat);
        deck2.position.set(0, -8, 12.5);
        group.add(deck2);

        const deck3 = new THREE.Mesh(new THREE.BoxGeometry(11, 35, 4), primaryMat);
        deck3.position.set(0, -12, 16.5);
        group.add(deck3);
        break;
      }

      case 'generic':
      default: {
        // Balanced general cargo hull (Length: 85m, Beam: 16m, Height: 6m)
        const hull = new THREE.Mesh(new THREE.BoxGeometry(16, 85, 6), hullMat);
        hull.position.set(0, 0, 3);
        group.add(hull);

        const bow = new THREE.Mesh(new THREE.ConeGeometry(8, 16, 4), primaryMat);
        bow.rotation.x = Math.PI / 2;
        bow.rotation.y = Math.PI / 4;
        bow.position.set(0, 48, 3);
        group.add(bow);

        // Cargo hatch hold
        const hold = new THREE.Mesh(new THREE.BoxGeometry(12, 40, 4), deckMat);
        hold.position.set(0, 8, 7.5);
        group.add(hold);

        // Aft bridge
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(14, 16, 10), bridgeMat);
        bridge.position.set(0, -28, 10.5);
        group.add(bridge);

        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 8, 6), primaryMat);
        mast.rotation.x = Math.PI / 2;
        mast.position.set(0, -24, 18);
        group.add(mast);
        break;
      }
    }

    // Directional bow indicator beacon
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(2, 8, 8),
      this.getMaterial(primaryColor, 0.9, primaryColor)
    );
    beacon.position.set(0, 60, 10);
    group.add(beacon);

    // Selected / Candidate ground halo ring
    if (isSelected) {
      const haloGeo = new THREE.RingGeometry(26, 32, 24);
      const haloMat = this.getMaterial(VESSEL_COLORS.selected, 0.75, VESSEL_COLORS.selected);
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(0, 0, 0.5);
      group.add(halo);
    }

    // Add physical navigation lights (port red, starboard green, masthead white)
    this.addNavLights(group, archetype);

    return group;
  }
}

export const vesselGeometryFactory = new VesselGeometryFactory();

// Smooth circular angle interpolation (handles 359° -> 1° wrap-around)
export function interpolateAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % 360;
  if (diff < -180) diff += 360;
  if (diff > 180) diff -= 360;
  return (a + diff * t + 360) % 360;
}

// Compute interpolated position and heading for a track at a normalized timeline position
export function getInterpolatedVesselState(
  track: VesselTrack,
  timelinePos: number = 0.5
): {
  lat: number;
  lon: number;
  cog: number;
  heading: number;
  sog: number;
  timestamp: string;
} {
  const obs = track.observations;

  if (obs && obs.length > 0) {
    if (obs.length === 1) {
      const o = obs[0];
      return {
        lat: o.latitude,
        lon: o.longitude,
        cog: o.cog_deg || 0,
        heading: o.heading_deg || o.cog_deg || 0,
        sog: o.sog_knots || 0,
        timestamp: o.timestamp,
      };
    }

    // Sort observations by timestamp
    const sorted = [...obs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const tFirst = new Date(sorted[0].timestamp).getTime();
    const tLast = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const tDuration = tLast - tFirst;

    if (tDuration <= 0) {
      const o = sorted[0];
      return {
        lat: o.latitude,
        lon: o.longitude,
        cog: o.cog_deg || 0,
        heading: o.heading_deg || o.cog_deg || 0,
        sog: o.sog_knots || 0,
        timestamp: o.timestamp,
      };
    }

    // Target time along timeline
    const tTarget = tFirst + tDuration * Math.min(Math.max(timelinePos, 0), 1);

    // Find bounding observations
    let idx = 0;
    while (idx < sorted.length - 1 && new Date(sorted[idx + 1].timestamp).getTime() <= tTarget) {
      idx++;
    }

    if (idx >= sorted.length - 1) {
      const last = sorted[sorted.length - 1];
      return {
        lat: last.latitude,
        lon: last.longitude,
        cog: last.cog_deg || 0,
        heading: last.heading_deg || last.cog_deg || 0,
        sog: last.sog_knots || 0,
        timestamp: last.timestamp,
      };
    }

    const oA = sorted[idx];
    const oB = sorted[idx + 1];
    const tA = new Date(oA.timestamp).getTime();
    const tB = new Date(oB.timestamp).getTime();
    const frac = tB > tA ? (tTarget - tA) / (tB - tA) : 0;

    const lat = oA.latitude + frac * (oB.latitude - oA.latitude);
    const lon = oA.longitude + frac * (oB.longitude - oA.longitude);
    const cog = interpolateAngle(oA.cog_deg || 0, oB.cog_deg || 0, frac);
    const heading = interpolateAngle(
      oA.heading_deg || oA.cog_deg || 0,
      oB.heading_deg || oB.cog_deg || 0,
      frac
    );
    const sog = (oA.sog_knots || 0) + frac * ((oB.sog_knots || 0) - (oA.sog_knots || 0));

    return {
      lat,
      lon,
      cog,
      heading,
      sog: Math.round(sog * 10) / 10,
      timestamp: new Date(tTarget).toISOString(),
    };
  }

  // Fallback to track_geojson coordinates if observations are absent
  const coords = track.track_geojson?.coordinates;
  if (coords && coords.length >= 2) {
    const floatIdx = (coords.length - 1) * Math.min(Math.max(timelinePos, 0), 1);
    const baseIdx = Math.floor(floatIdx);
    const frac = floatIdx - baseIdx;
    const ptA = coords[baseIdx];
    const ptB = coords[Math.min(baseIdx + 1, coords.length - 1)];

    const lon = ptA[0] + frac * (ptB[0] - ptA[0]);
    const lat = ptA[1] + frac * (ptB[1] - ptA[1]);

    // Compute COG from segment vector
    const dx = ptB[0] - ptA[0];
    const dy = ptB[1] - ptA[1];
    const cog = (Math.atan2(dx, dy) * (180 / Math.PI) + 360) % 360;

    return {
      lat,
      lon,
      cog,
      heading: cog,
      sog: 10.5,
      timestamp: track.start_time || '2024-03-15T06:00:00Z',
    };
  }

  return {
    lat: 15.42,
    lon: 72.68,
    cog: 0,
    heading: 0,
    sog: 0,
    timestamp: '2024-03-15T06:00:00Z',
  };
}

// MapLibre Custom WebGL Layer for 3D Maritime Vessels
export class Vessel3DCustomLayer implements maplibregl.CustomLayerInterface {
  id = '3d-vessels-layer';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  camera!: THREE.Camera;
  scene!: THREE.Scene;
  renderer!: THREE.WebGLRenderer;
  map!: maplibregl.Map;
  vesselMeshes = new Map<string, THREE.Group>();
  interactiveObjects: THREE.Object3D[] = [];
  visible = true;

  constructor(id: string = '3d-vessels-layer') {
    this.id = id;
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.95);
    sun.position.set(0.4, -0.6, 0.8).normalize();
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x38bdf8, 0.35);
    fill.position.set(-0.4, 0.6, -0.4).normalize();
    this.scene.add(fill);

    // Calm tactical 3D ocean plane with subtle depth shading
    const oceanGeo = new THREE.PlaneGeometry(10, 10);
    const oceanMat = new THREE.MeshBasicMaterial({
      color: 0x070B12,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const oceanPlane = new THREE.Mesh(oceanGeo, oceanMat);
    oceanPlane.position.set(0.5, 0.5, -0.0001);
    this.scene.add(oceanPlane);

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
  }

  render(gl: any, options: any) {
    if (!this.renderer || !this.scene || !this.camera || !this.visible) return;

    // Update dynamic zoom-adaptive scaling
    const zoom = this.map ? this.map.getZoom() : 10;
    const zoomFactor = zoom < 12 ? Math.max(1.0, Math.pow(2, (12 - zoom)) * 0.45) : 1.0;

    for (const group of this.vesselMeshes.values()) {
      const baseScale = group.userData?.baseMeterScale || 0.00001;
      const s = baseScale * zoomFactor;
      group.scale.set(s, s, s);
    }

    const matArray = options?.modelViewProjectionMatrix || options;
    if (matArray) {
      const m = new THREE.Matrix4().fromArray(matArray);
      this.camera.projectionMatrix = m;
    }
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  updateVessels(
    tracks: VesselTrack[],
    attributions: Attribution[],
    selectedMmsi: string | null,
    timelinePos: number,
    layersConfig: any,
    is3DActive: boolean
  ) {
    this.visible = !!layersConfig?.vessels3D;
    if (!this.scene) return;

    const attrMap = new Map<string, Attribution>();
    (attributions || []).forEach((a) => attrMap.set(String(a.mmsi), a));
    const candidateMmsis = new Set((attributions || []).slice(0, 3).map((a) => String(a.mmsi)));

    const activeMmsis = new Set<string>();
    this.interactiveObjects = [];

    for (const t of tracks) {
      const mmsi = String(t.mmsi);
      activeMmsis.add(mmsi);

      const attr = attrMap.get(mmsi);
      const rank = attr?.rank;
      const isSelected = mmsi === String(selectedMmsi);
      const isCandidate = candidateMmsis.has(mmsi);
      const archetype = resolveVesselArchetype(t.vessel_type, t.vessel_name);

      const primaryColor = isSelected
        ? VESSEL_COLORS.selected
        : rank === 1
        ? VESSEL_COLORS.rank1
        : rank === 2
        ? VESSEL_COLORS.rank2
        : rank === 3
        ? VESSEL_COLORS.rank3
        : VESSEL_COLORS.neutral;

      const state = getInterpolatedVesselState(t, timelinePos);

      let group = this.vesselMeshes.get(mmsi);
      // If color or selection changed, recreate mesh
      if (group && (group.userData?.primaryColor !== primaryColor || group.userData?.isSelected !== isSelected)) {
        this.scene.remove(group);
        group = undefined;
      }

      if (!group) {
        group = vesselGeometryFactory.createVesselMesh(archetype, primaryColor, isSelected);
        this.scene.add(group);
        this.vesselMeshes.set(mmsi, group);
      }

      // Proportional physical length scaling
      const realLength = resolveVesselLength(archetype, (t as any).length_m || attr?.length_m);
      const lengthScaleRatio = realLength / 110.0;

      const coord = maplibregl.MercatorCoordinate.fromLngLat([state.lon, state.lat], 0);
      const meterScale = coord.meterInMercatorCoordinateUnits() * lengthScaleRatio;

      group.userData = {
        primaryColor,
        isSelected,
        baseMeterScale: meterScale,
        realLength,
        vessel: {
          ...state,
          mmsi,
          vessel_name: t.vessel_name || `MMSI ${mmsi}`,
          vessel_type: t.vessel_type || 'Commercial Vessel',
          length_m: realLength,
          archetype,
          rank: rank || null,
          final_score: attr?.final_score || null,
          distance_km: attr?.distance_km || null,
          flag: attr?.flag || (t as any).flag || '—',
          isCandidate,
          isSelected,
        },
      };

      group.position.set(coord.x, coord.y, coord.z);

      const zoom = this.map ? this.map.getZoom() : 10;
      const zoomFactor = zoom < 12 ? Math.max(1.0, Math.pow(2, (12 - zoom)) * 0.45) : 1.0;
      const finalScale = meterScale * zoomFactor;
      group.scale.set(finalScale, finalScale, finalScale);

      const rotZ = Math.PI - (((state.heading != null ? state.heading : state.cog) || 0) * Math.PI / 180);
      group.rotation.set(0, 0, rotZ);

      group.visible = this.visible;
      this.interactiveObjects.push(group);
    }

    // Clean up old meshes
    for (const [mmsi, group] of this.vesselMeshes.entries()) {
      if (!activeMmsis.has(mmsi)) {
        this.scene.remove(group);
        this.vesselMeshes.delete(mmsi);
      }
    }

    if (this.map) this.map.triggerRepaint();
  }

  raycast(point: { x: number; y: number }): any | null {
    if (!this.map || !this.visible || this.interactiveObjects.length === 0) return null;
    
    let closestVessel: any = null;
    let minDistanceSq = 24 * 24; // 24px pick radius

    for (const obj of this.interactiveObjects) {
      const vessel = obj.userData?.vessel;
      if (!vessel || vessel.lon == null || vessel.lat == null) continue;

      try {
        const screenPoint = this.map.project([vessel.lon, vessel.lat]);
        const dx = screenPoint.x - point.x;
        const dy = screenPoint.y - point.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
          closestVessel = vessel;
        }
      } catch {
        // ignore projection errors
      }
    }

    return closestVessel;
  }

  onRemove() {
    for (const group of this.vesselMeshes.values()) {
      this.scene?.remove(group);
    }
    this.vesselMeshes.clear();
    this.interactiveObjects = [];
    if (this.renderer) {
      try {
        this.renderer.dispose();
      } catch {
        // ignore dispose errors
      }
    }
  }
}
