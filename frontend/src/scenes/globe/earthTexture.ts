import * as THREE from "three";

import {
  cityLights,
  inlandSeaPolygons,
  landPolygons,
  type Polygon,
} from "./landmasses";
import type { GlobePalette } from "./theme";

const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1024;

function project(lon: number, lat: number, width: number, height: number) {
  return {
    x: ((lon + 180) / 360) * width,
    y: ((90 - lat) / 180) * height,
  };
}

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  polygon: Polygon,
  width: number,
  height: number,
) {
  ctx.beginPath();
  polygon.forEach(([lon, lat], index) => {
    const { x, y } = project(lon, lat, width, height);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function paintOcean(ctx: CanvasRenderingContext2D, palette: GlobePalette) {
  const base = ctx.createLinearGradient(0, 0, 0, TEXTURE_HEIGHT);
  base.addColorStop(0, palette.oceanDeep);
  base.addColorStop(0.35, palette.oceanMid);
  base.addColorStop(0.5, palette.oceanLight);
  base.addColorStop(0.65, palette.oceanMid);
  base.addColorStop(1, palette.oceanDeep);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  // Soft lighter-blue basins so the ocean is not a flat fill.
  const basins: [number, number, number][] = [
    [0.18, 0.42, 0.3],
    [0.46, 0.58, 0.26],
    [0.72, 0.38, 0.32],
    [0.9, 0.62, 0.22],
  ];

  ctx.globalAlpha = 0.35;
  basins.forEach(([cx, cy, r]) => {
    const x = cx * TEXTURE_WIDTH;
    const y = cy * TEXTURE_HEIGHT;
    const radius = r * TEXTURE_HEIGHT;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, palette.oceanLight);
    glow.addColorStop(1, "rgba(18, 85, 143, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  });
  ctx.globalAlpha = 1;
}

function paintGraticule(ctx: CanvasRenderingContext2D, palette: GlobePalette) {
  ctx.lineWidth = 1;

  for (let lon = -180; lon <= 180; lon += 15) {
    const { x } = project(lon, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    ctx.strokeStyle = lon === 0 ? palette.graticuleMajor : palette.graticule;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TEXTURE_HEIGHT);
    ctx.stroke();
  }

  for (let lat = -75; lat <= 75; lat += 15) {
    const { y } = project(0, lat, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    ctx.strokeStyle = lat === 0 ? palette.graticuleMajor : palette.graticule;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEXTURE_WIDTH, y);
    ctx.stroke();
  }
}

function paintLand(ctx: CanvasRenderingContext2D, palette: GlobePalette) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Continents are drawn three times, shifted by a full map width, so shapes
  // that straddle the antimeridian do not clip at the texture seam.
  const offsets = [-TEXTURE_WIDTH, 0, TEXTURE_WIDTH];

  offsets.forEach((offset) => {
    ctx.save();
    ctx.translate(offset, 0);

    landPolygons.forEach((polygon) => {
      tracePolygon(ctx, polygon, TEXTURE_WIDTH, TEXTURE_HEIGHT);
      ctx.fillStyle = palette.landFill;
      ctx.fill();
      ctx.strokeStyle = palette.landEdge;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });

    inlandSeaPolygons.forEach((polygon) => {
      tracePolygon(ctx, polygon, TEXTURE_WIDTH, TEXTURE_HEIGHT);
      ctx.fillStyle = palette.oceanMid;
      ctx.fill();
    });

    ctx.restore();
  });
}

/** Builds the daytime basemap used as the Earth's colour map. */
export function createEarthTexture(palette: GlobePalette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    paintOcean(ctx, palette);
    paintGraticule(ctx, palette);
    paintLand(ctx, palette);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Builds the night-side emissive map: warm city glows at real urban centres,
 * with a faint halo around dense corridors. Sampled only where the surface
 * faces away from the sun, so it never washes over the daylit hemisphere.
 */
export function createNightLightsTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    let seed = 90210;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    cityLights.forEach(([lon, lat, intensity]) => {
      const { x, y } = project(lon, lat, width, height);

      // Broad, dim halo: the glow of the wider metropolitan area.
      const haloRadius = 11 + intensity * 20;
      const halo = ctx.createRadialGradient(x, y, 0, x, y, haloRadius);
      halo.addColorStop(0, `rgba(255, 214, 150, ${0.3 * intensity})`);
      halo.addColorStop(0.45, `rgba(255, 186, 110, ${0.11 * intensity})`);
      halo.addColorStop(1, "rgba(255, 170, 90, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(x - haloRadius, y - haloRadius, haloRadius * 2, haloRadius * 2);

      // Bright core.
      const coreRadius = 1.4 + intensity * 2.6;
      const core = ctx.createRadialGradient(x, y, 0, x, y, coreRadius);
      core.addColorStop(0, `rgba(255, 244, 214, ${0.85 * intensity})`);
      core.addColorStop(1, "rgba(255, 200, 130, 0)");
      ctx.fillStyle = core;
      ctx.fillRect(x - coreRadius, y - coreRadius, coreRadius * 2, coreRadius * 2);

      // A few satellite towns scattered around the larger centres.
      const satellites = Math.round(intensity * 5);
      for (let i = 0; i < satellites; i += 1) {
        const angle = random() * Math.PI * 2;
        const distance = (0.35 + random() * 0.9) * haloRadius;
        const sx = x + Math.cos(angle) * distance;
        const sy = y + Math.sin(angle) * distance * 0.7;
        const sr = 0.8 + random() * 1.5;
        const dot = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        dot.addColorStop(0, `rgba(255, 226, 170, ${0.4 * intensity})`);
        dot.addColorStop(1, "rgba(255, 200, 130, 0)");
        ctx.fillStyle = dot;
        ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      }
    });

    ctx.globalCompositeOperation = "source-over";
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

/**
 * Builds a soft cloud layer from blobs clustered into the latitudinal bands
 * where real cloud cover concentrates. Cheaper than noise and keeps the
 * basemap legible underneath.
 */
export function createCloudTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.clearRect(0, 0, width, height);
    const bands = [0.16, 0.34, 0.5, 0.66, 0.84];
    let seed = 20260920;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    bands.forEach((band) => {
      for (let i = 0; i < 26; i += 1) {
        const x = random() * width;
        const y = (band + (random() - 0.5) * 0.07) * height;
        const radius = 26 + random() * 58;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, radius);
        blob.addColorStop(0, "rgba(255, 255, 255, 0.55)");
        blob.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = blob;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
