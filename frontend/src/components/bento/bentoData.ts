import type { LayerKey } from '../../state/store';

export type BentoCategory = 'ALL' | 'ENVIRONMENT' | 'OBSERVATION' | 'VESSEL INTELLIGENCE' | 'INVESTIGATION' | 'METOCEAN' | 'CONTEXT';

export interface BentoFeature {
  id: string;
  layerKey?: LayerKey;
  isEnvironment?: boolean;
  category: BentoCategory;
  title: string;
  subtitle: string;
  span: 'bento-span-4' | 'bento-span-6' | 'bento-span-8' | 'bento-span-12';
  color: string;
  badge: string;
  badgeType: 'real' | 'sim' | 'ai' | 'geo' | 'physics' | 'vessel' | 'context';
  iconType:
    | 'radar'
    | 'satellite'
    | 'current'
    | 'wind'
    | 'particles'
    | 'polygon'
    | 'vessel'
    | 'anchor'
    | 'compass'
    | 'depth'
    | 'route'
    | 'grid'
    | 'shield'
    | 'cpu';
  telemetry: {
    label: string;
    value: string;
  }[];
  formula?: string;
  datasetSource?: string;
  specs: {
    k: string;
    v: string;
  }[];
  description: string;
  operationalNote: string;
}

export const BENTO_FEATURES: BentoFeature[] = [
  // ── 1. INVESTIGATION ENVIRONMENT (FEATURED WIDE CARDS) ──
  {
    id: 'env-data-mode',
    isEnvironment: true,
    category: 'ENVIRONMENT',
    title: 'Operational Environment Mode',
    subtitle: 'Dual-engine switcher between deterministic simulation suite and live Copernicus operational reanalysis.',
    span: 'bento-span-8',
    color: '#00D9E8',
    badge: 'ENGINE CORE',
    badgeType: 'real',
    iconType: 'cpu',
    telemetry: [
      { label: 'Active Pipeline', value: 'Hybrid Dual-Mode' },
      { label: 'Simulation Model', value: 'Calibrated / Real' },
      { label: 'Integrity', value: 'Strict Provenance' },
    ],
    formula: 'Mode \\in \\{ \\text{Simulation(Hydrodynamic)}, \\text{Operational(Copernicus Marine + CDS)} \\}',
    datasetSource: 'Copernicus Marine Service (CMEMS) + ECMWF CDS ERA5 + AIS Global Feeds',
    specs: [
      { k: 'Simulation Model', v: 'Calibrated Hydrodynamic Grid' },
      { k: 'Real-Data Ocean Source', v: 'cmems_mod_glo_phy_anfc_merged-uv_PT1H-i' },
      { k: 'Atmospheric Source', v: 'Copernicus Climate Data Store ERA5 (NetCDF)' },
      { k: 'Spatial Bounds', v: 'Goa Coastal Corridor (14.5°N - 16.2°N, 72.0°E - 74.0°E)' },
      { k: 'Database Engine', v: 'SQLite WAL Mode with ISO-8601 Temporal Index' },
    ],
    description:
      'Governs the hydrodynamic forcing, AIS trajectories, and SAR imagery data mode. In Simulation Mode, all telemetry is mathematically deterministic and fully offline. In Real Mode, actual Copernicus physical oceanography feeds are ingested.',
    operationalNote:
      'Switching environment modes dynamically resets model forcing vectors and recomputes the forensic correlation matrix.',
  },
  {
    id: 'env-hydrodynamics',
    isEnvironment: true,
    category: 'ENVIRONMENT',
    title: 'Hydrodynamic Ocean Currents',
    subtitle: 'Eulerian surface velocity vector field (uo / vo) driving advective particle transport.',
    span: 'bento-span-4',
    color: '#00D9E8',
    badge: 'CMEMS COPERNICUS',
    badgeType: 'real',
    iconType: 'current',
    telemetry: [
      { label: 'Depth Layer', value: '0.494 m Surface' },
      { label: 'Resolution', value: '1/12° (~9 km)' },
      { label: 'Update Cadence', value: 'Hourly Analysis' },
    ],
    formula: '\\vec{V}_{ocean}(x, y, t) = u(x, y, t)\\hat{i} + v(x, y, t)\\hat{j}',
    datasetSource: 'Copernicus Marine Service Global Ocean Physics Analysis and Forecast',
    specs: [
      { k: 'Variable U', v: 'Eastward Sea Water Velocity (uo in m/s)' },
      { k: 'Variable V', v: 'Northward Sea Water Velocity (vo in m/s)' },
      { k: 'Vertical Datum', v: 'Surface mixed layer (0 - 0.5m)' },
      { k: 'Interpolation', v: 'Bilinear 4-point Spatial + Linear Temporal' },
    ],
    description:
      'Provides the dominant physical transport forcing for the oil slick. The Eulerian vector grid is sampled in real-time during 4th-order Runge-Kutta numerical integration.',
    operationalNote:
      'Tidal oscillations and coastal upwelling currents along the West Coast of India are fully resolved.',
  },
  {
    id: 'env-atmospheric',
    isEnvironment: true,
    category: 'ENVIRONMENT',
    title: 'Atmospheric Wind Forcing',
    subtitle: '10-meter neutral wind field (u10 / v10) with empirical 3.0% leeway windage coupling.',
    span: 'bento-span-4',
    color: '#38BDF8',
    badge: 'CDS ERA5',
    badgeType: 'real',
    iconType: 'wind',
    telemetry: [
      { label: 'Leeway Factor', value: '3.0% (0.03)' },
      { label: 'Measurement Alt', value: '10 m Surface' },
      { label: 'Source', value: 'ECMWF Reanalysis' },
    ],
    formula: '\\vec{V}_{windage} = 0.030 \\cdot \\vec{V}_{10m} + \\theta_{Coriolis}( \\vec{V}_{10m} )',
    datasetSource: 'Copernicus Climate Data Store (CDS) ERA5 Hourly Atmospheric Reanalysis',
    specs: [
      { k: 'Leeway Parameter', v: '0.03 (Standard Maritime Oil Leeway)' },
      { k: 'Wind Speed Units', v: 'm/s (meters per second) / Knots' },
      { k: 'Deflection Angle', v: '0° to 10° right of wind (Northern Hemisphere)' },
      { k: 'Grid Resolution', v: '0.25° x 0.25° Atmosphere' },
    ],
    description:
      'High-velocity surface winds directly transfer momentum to floating hydrocarbons. The 3.0% windage coefficient models empirical wave-slick surface drift dynamics.',
    operationalNote:
      'During monsoon season, windage accounts for up to 45% of total net slick displacement.',
  },
  {
    id: 'env-lagrangian',
    isEnvironment: true,
    category: 'ENVIRONMENT',
    title: 'Lagrangian RK4 Particle Engine',
    subtitle: '4th-Order Runge-Kutta forward & reverse drift integrator with stochastic random-walk diffusion.',
    span: 'bento-span-8',
    color: '#A879FF',
    badge: 'RK4 PHYSICS',
    badgeType: 'physics',
    iconType: 'particles',
    telemetry: [
      { label: 'Particle Count', value: '100 Ensemble' },
      { label: 'Timestep', value: '30 Minutes' },
      { label: 'Hindcast Window', value: '-18 Hours' },
      { label: 'Forecast Window', value: '+48 Hours' },
    ],
    formula: '\\frac{d\\vec{x}}{dt} = \\vec{V}_{current} + 0.03\\vec{V}_{wind} + \\sqrt{2K_h}\\vec{W}(t)',
    datasetSource: 'OILTRACE Lagrangian Dynamic Numerical Core',
    specs: [
      { k: 'Numerical Scheme', v: 'Classical 4th-Order Runge-Kutta (RK4)' },
      { k: 'Diffusion Coefficient Kh', v: '1.0 to 2.5 m²/s (Stochastic Brownian Walk)' },
      { k: 'Hindcast Duration', v: '18 hours backward to release origin' },
      { k: 'Forecast Horizon', v: '48 hours forward to coastal arrival' },
      { k: 'Uncertainty Metric', v: '2-sigma covariance spatial bounding ellipse' },
    ],
    description:
      'The scientific heart of OILTRACE AI. Evaluates velocity slopes at 4 substeps (k1, k2, k3, k4) per interval, delivering millimeter-accurate drift trajectories without Euler discretization error.',
    operationalNote:
      'Strictly Newtonian fluid kinematics; not a black-box machine learning hallucination.',
  },

  // ── 2. MAP LAYERS (OBSERVATION, VESSELS, INVESTIGATION, METOCEAN, CONTEXT) ──
  {
    id: 'satellite',
    layerKey: 'satellite',
    category: 'OBSERVATION',
    title: 'SAR Satellite Scene',
    subtitle: 'High-resolution Sentinel-1 C-Band SAR radar backscatter raster (VV/VH polarization).',
    span: 'bento-span-4',
    color: '#5E91B3',
    badge: 'SENTINEL-1 C-SAR',
    badgeType: 'geo',
    iconType: 'satellite',
    telemetry: [
      { label: 'Band / Pol', value: 'C-Band / VV + VH' },
      { label: 'Resolution', value: '10 m / Pixel' },
      { label: 'Dynamic Range', value: '-30 to 0 dB' },
    ],
    datasetSource: 'ESA Copernicus Open Access Hub (Sentinel-1A/B)',
    specs: [
      { k: 'Sensor', v: 'Interferometric Wide Swath (IW GRDH)' },
      { k: 'Calibration', v: 'Radiometric Calibration to Sigma Nought (σ° dB)' },
      { k: 'Look-Alike Filter', v: 'Speckle Lee Filter (7x7 window)' },
      { k: 'CRS', v: 'EPSG:4326 (WGS 84)' },
    ],
    description:
      'Synthetic Aperture Radar penetrates cloud cover and darkness. Oil slicks dampen capillary gravity waves, appearing as high-contrast dark patches of low backscatter.',
    operationalNote:
      'Calibrated in decibels (dB) with Lee speckle reduction to eliminate false look-alikes.',
  },
  {
    id: 'slickGeometry',
    layerKey: 'slickGeometry',
    category: 'OBSERVATION',
    title: 'Slick Geodesic Polygon',
    subtitle: 'Equal-area vectorized slick contour with geodesic area, perimeter, and elongation metrics.',
    span: 'bento-span-4',
    color: '#FF7A00',
    badge: 'EPSG:6933 EQUAL-AREA',
    badgeType: 'geo',
    iconType: 'polygon',
    telemetry: [
      { label: 'Measured Area', value: '173.82 km²' },
      { label: 'Perimeter', value: '65.14 km' },
      { label: 'Compactness', value: '0.5148 (Elongated)' },
    ],
    formula: 'A_{geodesic} = \\iint_{\\Omega} \\sqrt{\\det(g)} \\, dx dy, \\quad C = \\frac{4\\pi A}{P^2}',
    datasetSource: 'Shapely + PyProj Equal-Area Cylinder Projection',
    specs: [
      { k: 'Projection', v: 'EPSG:6933 (Equal Earth Cylindrical)' },
      { k: 'Centroid', v: '15.4537°N, 72.8133°E' },
      { k: 'Length / Width', v: '24.2 km / 7.1 km' },
      { k: 'Morphology', v: 'Operational Bilge Discharge Trail' },
    ],
    description:
      'Converts binary segmentation raster to clean vector polygons. Computes true physical area without distortion inherent in planar latitude/longitude coordinates.',
    operationalNote:
      'Elongated trails with compactness < 0.6 strongly correlate with operational vessel washing rather than well blowouts.',
  },
  {
    id: 'detectionMask',
    layerKey: 'detectionMask',
    category: 'OBSERVATION',
    title: 'SAR Detection Mask',
    subtitle: 'Neural U-Net probability heatmap and classical Otsu threshold confidence mask.',
    span: 'bento-span-4',
    color: '#F5B82E',
    badge: 'RESNET-34 U-NET',
    badgeType: 'ai',
    iconType: 'radar',
    telemetry: [
      { label: 'Confidence', value: '94.10%' },
      { label: 'Threshold', value: '0.420 Probability' },
      { label: 'Inference', value: 'PyTorch TorchScript' },
    ],
    datasetSource: 'Deep Learning SAR Segmentation Model (ResNet-34 Backbone)',
    specs: [
      { k: 'Architecture', v: 'Encoder-Decoder U-Net with Skip Connections' },
      { k: 'Input Shape', v: '512 x 512 x 3 Normalized Backscatter' },
      { k: 'Loss Function', v: 'Focal Tversky Loss (α=0.7, β=0.3)' },
      { k: 'Fallback', v: 'Classical Otsu Threshold + Morphology' },
    ],
    description:
      'Distinguishes true petroleum slicks from biogenic look-alikes, low-wind calm areas, and rain cells using deep multi-scale contextual features.',
    operationalNote:
      'Fallback detector automatically activates with transparent labeling if model weights are offline.',
  },
  {
    id: 'aisVessels',
    layerKey: 'aisVessels',
    category: 'VESSEL INTELLIGENCE',
    title: 'AIS Vessel Intelligence',
    subtitle: 'Real-time & historical Class-A / Class-B transponder broadcasts in the fairway corridor.',
    span: 'bento-span-4',
    color: '#CBD5E1',
    badge: 'AIS LIVE',
    badgeType: 'vessel',
    iconType: 'vessel',
    telemetry: [
      { label: 'Fairway Vessels', value: '7 Ships' },
      { label: 'Screening Radius', value: '50 km' },
      { label: 'Transponder Type', value: 'Class-A / B' },
    ],
    datasetSource: 'Global Maritime AIS Transponder Stream / Synthetic Fairway Corridors',
    specs: [
      { k: 'Spatial Filter', v: 'Distance <= 50 km from origin envelope' },
      { k: 'Temporal Filter', v: 'Time delta <= ±2.0 hours from release' },
      { k: 'Attributes', v: 'MMSI, IMO, Ship Type, Length, Beam, Draught' },
      { k: 'Signal Integrity', v: '100% AIS coverage continuity verified' },
    ],
    description:
      'Identifies all vessels transiting near the suspected release location during the estimated discharge window, harvesting kinematic parameters.',
    operationalNote:
      'AIS gaps and spoofing attempts are automatically flagged in the evidence ledger.',
  },
  {
    id: 'vessels3D',
    layerKey: 'vessels3D',
    category: 'VESSEL INTELLIGENCE',
    title: '3D Tactical Vessel Models',
    subtitle: 'WebGL Three.js 3D models with true length, beam, and real-time heading orientation.',
    span: 'bento-span-4',
    color: '#00D9E8',
    badge: 'WEBGL 3D',
    badgeType: 'vessel',
    iconType: 'anchor',
    telemetry: [
      { label: 'Renderer', value: 'Three.js Custom Layer' },
      { label: 'Orientation', value: 'True Heading / COG' },
      { label: 'Scale Factor', value: '1:1 True Hull Dimension' },
    ],
    datasetSource: 'MapLibre GL + Three.js Interleaved Maritime Canvas',
    specs: [
      { k: 'Hull Geometries', v: 'Tanker, Cargo, Bulk Carrier, Tug' },
      { k: 'Lighting', v: 'Tactical Cyan Ambient + Sunlight Directional' },
      { k: 'Depth Test', v: 'Enabled against ocean terrain' },
      { k: 'Interactivity', v: 'Raycasted click selection & hover tooltip' },
    ],
    description:
      'Renders physically scaled 3D hulls directly on the nautical chart to give operators immediate spatial comprehension of vessel maneuvers.',
    operationalNote:
      'Hulls dynamically pitch and align with velocity vectors and course over ground (COG).',
  },
  {
    id: 'candidateVessel',
    layerKey: 'candidateVessel',
    category: 'VESSEL INTELLIGENCE',
    title: 'Top Candidate Focus',
    subtitle: 'High-priority focus on the highest-scored evidence-compatible candidate vessel.',
    span: 'bento-span-4',
    color: '#00D9E8',
    badge: 'ATTRIBUTION 0.46',
    badgeType: 'vessel',
    iconType: 'shield',
    telemetry: [
      { label: 'Vessel', value: 'MT GULF PHOENIX' },
      { label: 'Flag / MMSI', value: 'IN / 419001234' },
      { label: 'Proximity', value: '7.39 km to Origin' },
    ],
    formula: 'S = 0.35S_{prox} + 0.25S_{temp} + 0.20S_{traj} + 0.10S_{head} + 0.10S_{cont}',
    datasetSource: 'OILTRACE Explainable Multi-Factor Attribution Scorer',
    specs: [
      { k: 'Attribution Score', v: '0.46 (Rank #1 Evidence Compatible)' },
      { k: 'Evidence Index', v: '0.64 / Confidence: 0.72' },
      { k: 'Time Delta', v: '3.17 h from release window' },
      { k: 'Heading Alignment', v: '0.96 (Near-perfect track congruence)' },
    ],
    description:
      'Aggregates 5 forensic scoring dimensions. Strictly designates "evidence-compatible candidate" to ensure legal and scientific admissibility.',
    operationalNote:
      'Never uses defamatory language; maintains scientific evidentiary neutrality.',
  },
  {
    id: 'originRegion',
    layerKey: 'originRegion',
    category: 'INVESTIGATION',
    title: 'Origin Release Envelope',
    subtitle: 'Reconstructed spatiotemporal release origin window and 2-sigma spatial bounding zone.',
    span: 'bento-span-4',
    color: '#A879FF',
    badge: 'RECONSTRUCTED',
    badgeType: 'physics',
    iconType: 'compass',
    telemetry: [
      { label: 'Origin Centroid', value: '15.2680°N, 72.5570°E' },
      { label: 'Release Time', value: '-18.0h (12:00 UTC)' },
      { label: 'Uncertainty', value: '±9.10 km Radius' },
    ],
    datasetSource: 'Reverse Lagrangian Particle Cloud Envelope Vectorizer',
    specs: [
      { k: 'Centroid Coordinates', v: '15.2680°N, 72.5570°E' },
      { k: 'Estimated Release Time', v: '2024-03-14T12:00:00+00:00 (±1.5h)' },
      { k: 'Confidence Interval', v: '95% Spatial Gaussian Envelope' },
      { k: 'Historical Backtrack', v: '18 hours against prevailing drift' },
    ],
    description:
      'The computed geographic zone where oil was initially dumped into the ocean, accounting for combined windage and current displacement.',
    operationalNote:
      'Serves as the search cone for filtering historical AIS maritime traffic.',
  },
  {
    id: 'hindcast',
    layerKey: 'hindcast',
    category: 'INVESTIGATION',
    title: 'Hindcast Drift (RK4 -18h)',
    subtitle: 'Backward-in-time Lagrangian particle trajectories tracing the slick back to its origin.',
    span: 'bento-span-4',
    color: '#A879FF',
    badge: 'HINDCAST -18H',
    badgeType: 'physics',
    iconType: 'route',
    telemetry: [
      { label: 'Integration Steps', value: '36 Substeps' },
      { label: 'Time Horizon', value: '-18 Hours' },
      { label: 'Diffusion Spread', value: 'Brownian Motion' },
    ],
    formula: '\\vec{x}(t - \\Delta t) = \\vec{x}(t) - \\int_{t-\\Delta t}^{t} \\vec{V}_{drift}(\\tau) \\, d\\tau',
    datasetSource: 'OILTRACE Reverse Kinematic Transport Integrator',
    specs: [
      { k: 'Reverse Sign', v: 'Negative Velocity Field (-V_drift)' },
      { k: 'Step Size', v: '1800 seconds (30 minutes)' },
      { k: 'Convergence', v: 'High (Standard deviation: 2.1 km)' },
      { k: 'Color Gradient', v: 'Violet to Cyan Temporal Progression' },
    ],
    description:
      'Traces backwards 100 virtual oil particles from observed SAR polygons to uncover when and where the release began.',
    operationalNote:
      'Visualized as animated streamline trails displaying temporal progression.',
  },
  {
    id: 'forecast',
    layerKey: 'forecast',
    category: 'INVESTIGATION',
    title: 'Forecast Dispersion (+48h)',
    subtitle: 'Forward drift simulation modeling slick spread toward coastal zones and marine sanctuaries.',
    span: 'bento-span-4',
    color: '#8D7CFF',
    badge: 'FORECAST +48H',
    badgeType: 'physics',
    iconType: 'particles',
    telemetry: [
      { label: '+6h Centroid', value: '15.45°N, 72.81°E' },
      { label: '+24h Centroid', value: '15.58°N, 73.00°E' },
      { label: '+48h Shore Dist', value: '14.2 km Offshore' },
    ],
    datasetSource: 'Forward Lagrangian Particle Transport Engine + Copernicus Forcing',
    specs: [
      { k: 'Forecast Horizon', v: '48 Hours' },
      { k: 'Spread Radius (+48h)', v: '10.8 km' },
      { k: 'Confidence (+48h)', v: '46.3% (Multi-model spread)' },
      { k: 'Coastal Warning', v: 'Goa South Coastline Advisory Issued' },
    ],
    description:
      'Predicts future slick trajectory and coastal stranding risks to alert disaster response authorities and boom deployment vessels.',
    operationalNote:
      'Enables proactive coastal containment hours before oil reaches vulnerable shorelines.',
  },
  {
    id: 'currentVectors',
    layerKey: 'currentVectors',
    category: 'METOCEAN',
    title: 'Ocean Current Flow Grid',
    subtitle: 'Nautical arrows and vector arrows displaying surface current magnitude and direction.',
    span: 'bento-span-4',
    color: '#00D9E8',
    badge: 'SURFACE VELOCITY',
    badgeType: 'real',
    iconType: 'current',
    telemetry: [
      { label: 'Max Speed', value: '0.68 m/s (1.32 kt)' },
      { label: 'Mean Direction', value: '342° (NNW)' },
      { label: 'Vector Density', value: '15 km Grid Spacing' },
    ],
    datasetSource: 'CMEMS Operational Current Grids',
    specs: [
      { k: 'Vector Head Size', v: 'Proportional to velocity magnitude' },
      { k: 'Color Scale', v: 'Cyan (0.1 m/s) to Electric Blue (1.2 m/s)' },
      { k: 'Update Rate', v: 'Dynamic layer sync' },
    ],
    description:
      'Visualizes the speed and bearing of ocean surface currents across the Arabian Sea coastal basin.',
    operationalNote:
      'Essential for verifying whether slick trajectory matches prevailing hydrodynamic flow.',
  },
  {
    id: 'windVectors',
    layerKey: 'windVectors',
    category: 'METOCEAN',
    title: 'Wind Vector Field (10m)',
    subtitle: 'Atmospheric wind velocity vectors measured 10 meters above mean sea level.',
    span: 'bento-span-4',
    color: '#38BDF8',
    badge: '10M WIND VECTORS',
    badgeType: 'real',
    iconType: 'wind',
    telemetry: [
      { label: 'Average Speed', value: '14.2 Knots' },
      { label: 'Direction', value: '255° (WSW)' },
      { label: 'Gust Factor', value: '1.24x' },
    ],
    datasetSource: 'Copernicus Climate Data Store ERA5',
    specs: [
      { k: 'Standard Height', v: '10 meters above sea surface' },
      { k: 'Units', v: 'Knots / m/s toggleable' },
      { k: 'Vector Style', v: 'Arrowhead barb with speed color map' },
    ],
    description:
      'Renders wind strength and orientation, demonstrating atmospheric coupling on the drifting slick.',
    operationalNote:
      'Rapid shifts in wind direction induce sudden course changes in surface oil movement.',
  },
  {
    id: 'flowAnimation',
    layerKey: 'flowAnimation',
    category: 'METOCEAN',
    title: 'Laminar Vector Flow Animation',
    subtitle: 'Real-time animated particle flow field illustrating hydrodynamic circulation.',
    span: 'bento-span-4',
    color: '#00D9E8',
    badge: 'ANIMATED FLOW',
    badgeType: 'physics',
    iconType: 'current',
    telemetry: [
      { label: 'Streamline Count', value: '1200 Streamlines' },
      { label: 'FPS', value: '60 FPS Hardware Accel' },
      { label: 'Engine', value: 'Canvas 2D Particle Flow' },
    ],
    datasetSource: 'Bilinear Interpolated Vector Streamline Generator',
    specs: [
      { k: 'Particle Lifetime', v: '80 - 140 frames random decay' },
      { k: 'Fade Trail', v: 'Alpha composite trailing blur' },
      { k: 'Performance', v: 'GPU accelerated requestAnimationFrame' },
    ],
    description:
      'Dynamic streamlines give operators an intuitive visual sense of where ocean currents are converging and diverging.',
    operationalNote:
      'Helps spot eddies and coastal gyres that trap drifting oil patches.',
  },
  {
    id: 'shippingLanes',
    layerKey: 'shippingLanes',
    category: 'CONTEXT',
    title: 'Shipping Corridors (TSS)',
    subtitle: 'International Maritime Organization (IMO) Traffic Separation Schemes and nautical fairways.',
    span: 'bento-span-4',
    color: '#D946EF',
    badge: 'IMO TSS',
    badgeType: 'context',
    iconType: 'route',
    telemetry: [
      { label: 'Lane Type', value: 'Deep Water Route' },
      { label: 'Traffic Density', value: 'High (~140 vessels/day)' },
      { label: 'Corridor Width', value: '4.0 Nautical Miles' },
    ],
    datasetSource: 'International Hydrographic Organization (IHO) & IMO Guidelines',
    specs: [
      { k: 'Corridor Name', v: 'Goa - Mumbai Deepwater TSS' },
      { k: 'Separation Zone', v: '1.0 nm neutral separation corridor' },
      { k: 'Boundary Lines', v: 'Magenta nautical charting standard' },
    ],
    description:
      'Demarcates designated commercial shipping lanes to correlate where illegal bilge water dumps occur relative to designated sea lanes.',
    operationalNote:
      'Discharges frequently happen just outside TSS boundaries to evade coastal radar.',
  },
  {
    id: 'bathymetry',
    layerKey: 'bathymetry',
    category: 'METOCEAN',
    title: 'Bathymetry Depth Contours',
    subtitle: 'GEBCO ocean floor depth contours and shallow water shoals.',
    span: 'bento-span-4',
    color: '#19B8CC',
    badge: 'GEBCO DEPTH',
    badgeType: 'geo',
    iconType: 'depth',
    telemetry: [
      { label: 'Depth Range', value: '20 m - 200 m Shelf' },
      { label: 'Shelf Break', value: '180 m Contour' },
      { label: 'Datum', value: 'Lowest Astronomical Tide' },
    ],
    datasetSource: 'General Bathymetric Chart of the Oceans (GEBCO 2024)',
    specs: [
      { k: 'Contour Intervals', v: '20m, 50m, 100m, 200m' },
      { k: 'Coastal Shelf', v: 'Gentle slope (0.12° gradient)' },
      { k: 'Impact', v: 'Controls tidal amplification and nearshore drift' },
    ],
    description:
      'Underwater topography steers bottom friction and current deflection, affecting nearshore oil stranding risk.',
    operationalNote:
      'Shallow water (<30m) restricts deep-draft cleanup barges from approaching.',
  },
  {
    id: 'coordGrid',
    layerKey: 'coordGrid',
    category: 'CONTEXT',
    title: 'Coordinate Graticule',
    subtitle: 'Geodesic latitude and longitude grid with EPSG:6933 and EPSG:4326 reference markers.',
    span: 'bento-span-4',
    color: '#546274',
    badge: 'GRATICULE',
    badgeType: 'context',
    iconType: 'grid',
    telemetry: [
      { label: 'Grid Interval', value: '0.25° (15 Arcmin)' },
      { label: 'Datum', value: 'WGS 84 / GRS 80' },
      { label: 'Projection', value: 'Equal-Area EPSG:6933' },
    ],
    datasetSource: 'Geodesic Graticule Engine',
    specs: [
      { k: 'Labels', v: 'Degrees Minutes Seconds (DMS) & Decimal' },
      { k: 'Line Stroke', v: 'Semi-transparent tactical grid line' },
      { k: 'Purpose', v: 'Precise navigational coordinates for maritime enforcement' },
    ],
    description:
      'Ensures all coordinates cited in forensic evidence briefs are cross-referenced against standard navigational graticules.',
    operationalNote:
      'Toggleable on/off for uncluttered presentation or formal coordinate recording.',
  },
];

