import os
import math
from typing import Dict, Any, Tuple, Optional
import numpy as np
import scipy.ndimage
from app.config import settings

CANONICAL_SIMULATION_SCENARIO = {
    "incident_id": "OILTRACE-DEMO-001",
    "scene_id": "S1A_IW_GRDH_1SDV_20240315T060000_demo",
    "satellite": "Sentinel-1A",
    "acquisition_time": "2024-03-15T06:00:00+00:00",
    "geographic_bounds": {"min_lon": 72.35, "min_lat": 15.15, "max_lon": 73.05, "max_lat": 15.65},
    "true_origin": {"latitude": 15.21, "longitude": 72.41},
    "true_origin_time": "2024-03-14T12:00:00+00:00",
    "spill_release_duration_h": 2.0,
    "wind_field": {"u10": 5.2, "v10": 3.8, "units": "m/s"},
    "current_field": {"u": 0.18, "v": 0.12, "units": "m/s"},
    "windage_alpha": 0.030,
    "particle_count": 500,
    "simulation_duration_h": 48.0,
    "hindcast_duration_h": 18.0,
    "ground_truth_vessel": {
        "mmsi": "419001234",
        "name": "MT GULF PHOENIX",
        "type": "tanker",
        "flag": "IN",
    }
}

def evaluate_origin_error_km(pred_lat: float, pred_lon: float) -> float:
    """Calculates geodesic error between estimated origin and canonical ground-truth source."""
    true_lat = CANONICAL_SIMULATION_SCENARIO["true_origin"]["latitude"]
    true_lon = CANONICAL_SIMULATION_SCENARIO["true_origin"]["longitude"]
    dlat = (pred_lat - true_lat) * 111.32
    dlon = (pred_lon - true_lon) * 111.32 * math.cos(math.radians((pred_lat + true_lat) / 2.0))
    return round(math.sqrt(dlat**2 + dlon**2), 2)

def generate_synthetic_sar_scene(
    width: int = 256,
    height: int = 256,
    seed: int = 26143,
    output_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generates a realistic, deterministic synthetic Sentinel-1 SAR scene
    with ocean Bragg backscatter, multi-look speckle clutter, an irregular
    low-backscatter mineral oil slick, and a secondary look-alike region.
    All outputs strictly adhere to seed 26143.
    """
    rng = np.random.default_rng(seed)

    # 1. Base Sea Surface Backscatter: mean -17.0 dB
    # Radar intensity follows Gamma distribution (multi-look speckle with ENL ~ 4.5)
    enl = 4.5
    speckle = rng.gamma(enl, 1.0 / enl, size=(height, width)).astype(np.float32)

    # Clean ocean base sigma0 in linear scale: 10^(-17.0 / 10) ~ 0.02
    base_sea_linear = 0.020
    sea_intensity = base_sea_linear * speckle

    # 2. Irregular Oil Slick Geometry (Mineral Oil Slick)
    # Physically coupled to 18-hour forward advection from true origin (15.21N, 72.41E)
    # Drift vector (current + 0.03*wind) advects slick toward (15.42N, 72.68E) ~ pixel (135, 125)
    y, x = np.ogrid[:height, :width]
    cx, cy = 135.0, 125.0

    # Base shape tilted along physical drift axis (35 degrees)
    dx = (x - cx) * 0.82 + (y - cy) * 0.57
    dy = (y - cy) * 0.82 - (x - cx) * 0.57

    # Spatially correlated Gaussian random field for boundary perturbation
    grf_raw = rng.normal(0.0, 1.0, size=(height, width)).astype(np.float32)
    grf_aniso = scipy.ndimage.gaussian_filter(grf_raw, sigma=(2.0, 4.5))

    # Perturb with sinusoidal harmonics to create natural filament fringes
    angle = np.arctan2(y - cy, x - cx)
    radius_noise = (
        12.0 * np.sin(3.0 * angle + 0.8) +
        7.0 * np.cos(5.0 * angle - 1.2) +
        4.0 * np.sin(8.0 * angle)
    )

    slick_metric = (dx**2 / (42.0 + radius_noise * 0.5)**2) + (dy**2 / (19.0 + radius_noise * 0.3)**2)
    slick_perturbed = slick_metric + (grf_aniso * 0.20)
    oil_mask = (slick_perturbed <= 1.0).astype(np.uint8)

    # Secondary tail filament (spill drift tail towards source)
    tail_metric = (((x - 170) * 0.9 + (y - 148) * 0.4)**2 / 24.0**2) + (((y - 148) * 0.9 - (x - 170) * 0.4)**2 / 8.0**2)
    oil_mask = np.maximum(oil_mask, (tail_metric <= 1.0).astype(np.uint8))
    oil_mask = scipy.ndimage.binary_closing(oil_mask, structure=np.ones((3, 3))).astype(np.uint8)

    # 3. Look-Alike Region (Low wind sheltered zone / natural surfactant)
    # Placed in upper left corner (x=50, y=55), mild dampening (-21.5 dB)
    lookalike_metric = ((x - 50)**2 / 25.0**2) + ((y - 55)**2 / 16.0**2)
    lookalike_mask = ((lookalike_metric <= 1.0) & (oil_mask == 0)).astype(np.uint8)

    # 4. Modulate Radar Intensity
    # Oil slick: strong capillary wave dampening -> backscatter drops to -27.0 dB (~0.002 linear)
    oil_dampening_factor = 0.095
    # Lookalike: mild dampening -> backscatter drops to -21.5 dB (~0.007 linear)
    lookalike_dampening_factor = 0.38

    modulated_intensity = sea_intensity.copy()
    # Smooth boundary transitions using Gaussian-like feathering
    modulated_intensity = np.where(oil_mask == 1, modulated_intensity * oil_dampening_factor, modulated_intensity)
    modulated_intensity = np.where(lookalike_mask == 1, modulated_intensity * lookalike_dampening_factor, modulated_intensity)

    # 5. Radiometric Calibration to sigma0 dB
    # sigma0_dB = 10 * log10(intensity)
    sigma0_db = 10.0 * np.log10(np.maximum(modulated_intensity, 1e-7))
    # Clip to realistic marine SAR range [-35 dB, 0 dB]
    sigma0_db = np.clip(sigma0_db, -35.0, 0.0).astype(np.float32)

    # 6. Normalize to [-1, 1] range for ML tensor ingestion
    normalized = np.clip((sigma0_db + 17.5) / 17.5, -1.0, 1.0).astype(np.float32)

    # 7. Geospatial Metadata (Arabian Sea Off Goa offshore fairway)
    min_lon, max_lon = 72.35, 73.05
    min_lat, max_lat = 15.15, 15.65
    res_x = (max_lon - min_lon) / width
    res_y = -(max_lat - min_lat) / height
    transform = [res_x, 0.0, min_lon, 0.0, res_y, max_lat]
    bounds = {"min_lon": min_lon, "min_lat": min_lat, "max_lon": max_lon, "max_lat": max_lat}

    result = {
        "calibrated_db": sigma0_db,
        "normalized": normalized,
        "ground_truth_mask": oil_mask,
        "lookalike_mask": lookalike_mask,
        "metadata": {
            "scene_id": "OILTRACE-DEMO-001",
            "satellite": "Sentinel-1A",
            "instrument": "C-SAR (5.405 GHz)",
            "polarization": "VV",
            "acquisition_time": "2024-03-15T06:00:00+00:00",
            "region_name": "Arabian Sea (Goa Offshore)",
            "bounds": bounds,
            "crs": "EPSG:4326",
            "transform": transform,
            "width": width,
            "height": height,
            "resolution_m": 10.0,
            "data_mode": "simulation",
            "provenance": "synthetic",
            "seed": seed,
            "ground_truth_oil_pixels": int(np.sum(oil_mask)),
        },
    }

    # If output directory specified, save arrays
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        raw_path = os.path.join(output_dir, "OILTRACE-DEMO-001_calibrated_db.npy")
        gt_path = os.path.join(output_dir, "OILTRACE-DEMO-001_ground_truth.npy")
        np.save(raw_path, sigma0_db)
        np.save(gt_path, oil_mask)
        result["calibrated_db_path"] = raw_path
        result["ground_truth_path"] = gt_path

    return result
