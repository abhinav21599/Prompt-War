/**
 * Colour constants for the 3D globe.
 *
 * WebGL materials cannot read CSS custom properties, so the scene keeps its
 * own palette here, with one variant per interface theme:
 *
 *  - light: a bright daytime GIS basemap, clean land, medium blue oceans.
 *  - dark:  Earth from orbit — deep oceans, dim land, visible terminator.
 *
 * Both mirror the design system; neither uses neon or purple.
 */
export interface GlobePalette {
  oceanDeep: string;
  oceanMid: string;
  oceanLight: string;
  landFill: string;
  landEdge: string;
  graticule: string;
  graticuleMajor: string;
  atmosphere: string;
  route: string;
  routeActive: string;
  hull: string;
  hullAccent: string;
  deck: string;
  trail: string;
  satellite: string;
  satellitePanel: string;
  beam: string;
  signal: string;
  station: string;
  particle: string;
  /** Multiplies the day texture; < 1 darkens the lit side for orbital night. */
  dayExposure: number;
  /** 0 = flat daylight everywhere, 1 = full day/night terminator. */
  nightMix: number;
  /** Base illumination on the unlit hemisphere. */
  ambient: number;
}

export const lightGlobePalette: GlobePalette = {
  oceanDeep: "#14568c",
  oceanMid: "#2277b6",
  oceanLight: "#43a0d8",
  landFill: "#f3f9fc",
  landEdge: "#bcd6e8",
  graticule: "rgba(255, 255, 255, 0.11)",
  graticuleMajor: "rgba(255, 255, 255, 0.2)",
  atmosphere: "#5aa8e8",
  route: "#bfe0f6",
  routeActive: "#ffffff",
  hull: "#ffffff",
  hullAccent: "#123c66",
  deck: "#cfe2f1",
  trail: "#d3ecfc",
  satellite: "#2c4a66",
  satellitePanel: "#2f86cc",
  beam: "#7dc0f0",
  signal: "#e8542b",
  station: "#cfe7f8",
  particle: "#a9c6dd",
  dayExposure: 1,
  nightMix: 0,
  ambient: 1,
};

export const darkGlobePalette: GlobePalette = {
  oceanDeep: "#072a52",
  oceanMid: "#12599b",
  oceanLight: "#2585c9",
  landFill: "#3d5a6e",
  landEdge: "#54788f",
  graticule: "rgba(170, 210, 240, 0.07)",
  graticuleMajor: "rgba(170, 210, 240, 0.14)",
  atmosphere: "#4f9ff0",
  route: "#3d82b8",
  routeActive: "#8ecbf5",
  hull: "#eaf4ff",
  hullAccent: "#9ec9e8",
  deck: "#a9bfd2",
  trail: "#6fb4e6",
  satellite: "#aabecf",
  satellitePanel: "#5aa8e8",
  beam: "#7dc0f0",
  signal: "#ff6a3d",
  station: "#6fb4e6",
  particle: "#dce9f5",
  dayExposure: 1,
  nightMix: 1,
  ambient: 0.045,
};

export const globePalettes = {
  light: lightGlobePalette,
  dark: darkGlobePalette,
} as const;

/** Radius of the Earth sphere in scene units. */
export const EARTH_RADIUS = 1;

/**
 * World-space direction of the sun. Fixed in space, so the terminator stays
 * put while the Earth rotates underneath it.
 */
export const SUN_DIRECTION: [number, number, number] = [0.72, 0.26, 0.64];
