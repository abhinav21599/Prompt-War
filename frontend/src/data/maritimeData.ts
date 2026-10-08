/**
 * Hydrographic Bathymetric Contours, Charted Shipping Corridors,
 * and Geographic Graticule for the Arabian Sea / Konkan Operational Theater.
 */

export const ARABIAN_SEA_BATHYMETRY_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    // 20m Isobath (Inner Coastal Shelf)
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [73.52, 16.40],
          [73.56, 16.00],
          [73.64, 15.65],
          [73.72, 15.35],
          [73.78, 15.00],
          [73.84, 14.65],
          [73.88, 14.40],
        ],
      },
      properties: { depth: 20, label: '20 m', isobath: '20m' },
    },
    // 50m Isobath (Shallow Coastal Transit)
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [73.20, 16.40],
          [73.25, 16.00],
          [73.34, 15.65],
          [73.42, 15.35],
          [73.50, 15.00],
          [73.58, 14.65],
          [73.65, 14.40],
        ],
      },
      properties: { depth: 50, label: '50 m', isobath: '50m' },
    },
    // 100m Isobath (Mid-Shelf Transit)
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [72.82, 16.40],
          [72.88, 16.00],
          [72.96, 15.65],
          [73.05, 15.35],
          [73.14, 15.00],
          [73.22, 14.65],
          [73.30, 14.40],
        ],
      },
      properties: { depth: 100, label: '100 m', isobath: '100m' },
    },
    // 200m Isobath (Continental Shelf Break / Slope Edge)
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [72.32, 16.40],
          [72.38, 16.00],
          [72.46, 15.65],
          [72.54, 15.35],
          [72.62, 15.00],
          [72.70, 14.65],
          [72.78, 14.40],
        ],
      },
      properties: { depth: 200, label: '200 m SHELF BREAK', isobath: '200m' },
    },
    // 500m Isobath (Upper Continental Slope)
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [71.95, 16.40],
          [72.02, 16.00],
          [72.10, 15.65],
          [72.18, 15.35],
          [72.26, 15.00],
          [72.34, 14.65],
          [72.42, 14.40],
        ],
      },
      properties: { depth: 500, label: '500 m', isobath: '500m' },
    },
    // 1000m Isobath (Deep Ocean Abyss)
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [71.55, 16.40],
          [71.62, 16.00],
          [71.70, 15.65],
          [71.78, 15.35],
          [71.86, 15.00],
          [71.94, 14.65],
          [72.02, 14.40],
        ],
      },
      properties: { depth: 1000, label: '1000 m ABYSS', isobath: '1000m' },
    },
    // Bathymetry Label Points for Symbol Placement
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [73.40, 15.45] },
      properties: { depth: 50, label: '50 m' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [73.02, 15.45] },
      properties: { depth: 100, label: '100 m' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [72.50, 15.45] },
      properties: { depth: 200, label: '200 m (SHELF BREAK)' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [72.14, 15.45] },
      properties: { depth: 500, label: '500 m' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [71.74, 15.45] },
      properties: { depth: 1000, label: '1000 m' },
    },
  ],
};

export const ARABIAN_SEA_SHIPPING_LANES_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    // Main High-Seas Tanker Transit Corridor (Persian Gulf <-> Malacca / Sri Lanka)
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [72.20, 16.50],
            [72.48, 16.50],
            [72.82, 14.30],
            [72.54, 14.30],
            [72.20, 16.50],
          ],
        ],
      },
      properties: {
        lane_name: 'ARABIAN SEA DEEP-WATER TANKER CORRIDOR',
        type: 'TSS_TANKER_CORRIDOR',
        bearing: '155° / 335°',
      },
    },
    // Lane Centerline with Directional Flow
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [72.34, 16.50],
          [72.48, 15.65],
          [72.60, 15.00],
          [72.68, 14.30],
        ],
      },
      properties: {
        lane_name: 'TSS CENTERLINE (DEEP DRAFT)',
        type: 'CENTERLINE',
      },
    },
    // Coastal Inshore Traffic Zone (ITZ)
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [73.15, 16.50],
            [73.45, 16.50],
            [73.75, 14.30],
            [73.45, 14.30],
            [73.15, 16.50],
          ],
        ],
      },
      properties: {
        lane_name: 'KONKAN COAST INSHORE TRAFFIC ZONE (ITZ)',
        type: 'INSHORE_ZONE',
      },
    },
    // Waypoint Markers along Corridor
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [72.41, 16.08] },
      properties: { name: 'WP-NORTH ARABIAN', label: 'TSS NORTHBOUND' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [72.54, 15.35] },
      properties: { name: 'WP-MID ARABIAN', label: 'TANKER TRANSIT WAYPOINT' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [72.64, 14.65] },
      properties: { name: 'WP-SOUTH ARABIAN', label: 'TSS SOUTHBOUND' },
    },
  ],
};

export function generateGraticuleGeoJson(
  minLon: number = 70.0,
  maxLon: number = 75.0,
  minLat: number = 13.5,
  maxLat: number = 17.5,
  stepDeg: number = 0.5
) {
  const features: any[] = [];

  // Parallels (Latitudes)
  for (let lat = minLat; lat <= maxLat + 0.001; lat += stepDeg) {
    const latRounded = Math.round(lat * 10) / 10;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [minLon, latRounded],
          [maxLon, latRounded],
        ],
      },
      properties: {
        label: `${latRounded.toFixed(1)}°N`,
        type: 'parallel',
      },
    });
  }

  // Meridians (Longitudes)
  for (let lon = minLon; lon <= maxLon + 0.001; lon += stepDeg) {
    const lonRounded = Math.round(lon * 10) / 10;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [lonRounded, minLat],
          [lonRounded, maxLat],
        ],
      },
      properties: {
        label: `${lonRounded.toFixed(1)}°E`,
        type: 'meridian',
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
