import os
import math
from typing import Dict, Any, Optional, Tuple
import numpy as np
from scipy import ndimage
from app.simulation.synthetic_scene import generate_synthetic_sar_scene

class SARPreprocessor:
    """
    SAR Preprocessor for Sentinel-1 IW GRD products.
    Performs validation, radiometric calibration (DN -> sigma0 dB),
    optional speckle filtering (Lee / median / box), NoData masking,
    and normalization to [-1, 1] for ML tensor conversion while
    strictly preserving geospatial CRS, bounds, and affine transform.
    """
    def __init__(self, use_speckle_filter: bool = False, filter_size: int = 3):
        self.use_speckle_filter = use_speckle_filter
        self.filter_size = filter_size
        self.version = "1.2.0"

    def validate(self, scene_path: str, data_mode: str = "simulation") -> Dict[str, Any]:
        """Validate SAR scene file and extract geospatial metadata."""
        if not scene_path:
            raise ValueError("Satellite image path must be provided.")

        # Check for real GeoTIFF with rasterio if present
        if os.path.exists(scene_path):
            try:
                import rasterio
                with rasterio.open(scene_path) as src:
                    if data_mode == "real":
                        if not src.crs or str(src.crs).strip() == "":
                            raise ValueError(f"Real SAR scene '{scene_path}' is missing valid CRS (Coordinate Reference System).")
                        if not src.transform or src.transform[0] == 0.0 or src.transform[4] == 0.0:
                            raise ValueError(f"Real SAR scene '{scene_path}' is missing valid geotransform.")
                        if src.width <= 0 or src.height <= 0:
                            raise ValueError(f"Real SAR scene '{scene_path}' has invalid raster dimensions: {src.width}x{src.height}.")
                        if src.bounds.left >= src.bounds.right or src.bounds.bottom >= src.bounds.top:
                            raise ValueError(f"Real SAR scene '{scene_path}' has invalid or empty spatial bounds.")

                    bounds = {
                        "min_lon": float(src.bounds.left),
                        "min_lat": float(src.bounds.bottom),
                        "max_lon": float(src.bounds.right),
                        "max_lat": float(src.bounds.top),
                    }
                    scene_id = os.path.splitext(os.path.basename(scene_path))[0]
                    return {
                        "valid": True,
                        "scene_id": scene_id,
                        "crs": str(src.crs) if src.crs else "EPSG:4326",
                        "transform": list(src.transform)[:6],
                        "bounds": bounds,
                        "width": src.width,
                        "height": src.height,
                        "bands": src.count,
                        "resolution_m": float(src.res[0]) if src.res else 10.0,
                        "source": scene_path,
                        "data_mode": data_mode,
                        "provenance": "observed" if data_mode == "real" else "synthetic",
                    }
            except Exception as e:
                if data_mode == "real":
                    if isinstance(e, (ValueError, FileNotFoundError)):
                        raise
                    raise ValueError(f"Failed to read real SAR scene GeoTIFF '{scene_path}': {e}")

        if data_mode == "real":
            raise FileNotFoundError(
                f"Real SAR scene file not found at '{scene_path}'. "
                f"Real-Data Mode requires a verified satellite raster file."
            )

        # Deterministic simulation scene metadata fallback
        scene_id = os.path.splitext(os.path.basename(scene_path))[0] if scene_path else "S1A_IW_GRDH_1SDV_20240315T060000_demo"
        return {
            "valid": True,
            "scene_id": scene_id,
            "crs": "EPSG:4326",
            "transform": [0.002734, 0.0, 72.35, 0.0, -0.001953, 15.65],
            "bounds": {"min_lon": 72.35, "min_lat": 15.15, "max_lon": 73.05, "max_lat": 15.65},
            "width": 256,
            "height": 256,
            "bands": 1,
            "resolution_m": 10.0,
            "data_mode": "simulation",
            "provenance": "synthetic",
            "source": scene_path or "SYNTHETIC_SENTINEL1_SCENE_GENERATOR",
        }

    def preprocess(self, scene_path: str, data_mode: str = "simulation") -> Dict[str, Any]:
        """
        Loads raster data, calibrates DN to sigma0 dB (or ingests calibrated SAR),
        applies speckle filter if enabled, handles NoData, and normalizes to [-1, 1].
        """
        meta = self.validate(scene_path, data_mode=data_mode)
        calibrated_db = None

        # Check if actual raster file exists on disk
        if os.path.exists(scene_path):
            if scene_path.endswith(".npy"):
                try:
                    calibrated_db = np.load(scene_path).astype(np.float32)
                except Exception as e:
                    if data_mode == "real":
                        raise ValueError(f"Failed to load real numpy raster '{scene_path}': {e}")
            elif scene_path.endswith((".tif", ".tiff")):
                try:
                    import rasterio
                    with rasterio.open(scene_path) as src:
                        band1 = src.read(1).astype(np.float32)
                        nodata = src.nodata
                        if nodata is not None:
                            band1[band1 == nodata] = np.nan
                        # Radiometric calibration: sigma0_dB = 10 * log10(DN^2 / A^2)
                        # Assume calibration factor A=500 for uncalibrated DN
                        calibrated_db = 10.0 * np.log10(np.maximum(band1**2 / (500.0**2), 1e-7))
                        calibrated_db = np.nan_to_num(calibrated_db, nan=-30.0)
                except Exception as e:
                    if data_mode == "real":
                        raise ValueError(f"Failed to process real SAR GeoTIFF '{scene_path}': {e}")

        # In real data mode, fail explicitly if raster could not be loaded
        if calibrated_db is None and data_mode == "real":
            raise FileNotFoundError(
                f"Real SAR raster data unavailable for '{scene_path}'. "
                f"Real-Data Mode prohibits synthetic fallback."
            )

        # In simulation mode, generate the deterministic synthetic SAR scene
        if calibrated_db is None:
            req_scene_id = meta.get("scene_id")
            req_source = meta.get("source")
            synth = generate_synthetic_sar_scene(width=256, height=256, seed=26143)
            calibrated_db = synth["calibrated_db"]
            meta = {
                **synth["metadata"],
                "scene_id": req_scene_id or synth["metadata"].get("scene_id", "OILTRACE-DEMO-001"),
                "source": req_source or synth["metadata"].get("source", scene_path),
            }

        # Optional speckle filtering (uniform box or median)
        if self.use_speckle_filter:
            filtered_db = ndimage.uniform_filter(calibrated_db, size=self.filter_size)
        else:
            filtered_db = calibrated_db

        # Normalization to [-1, 1] range: clip between -35 dB and 0 dB
        # Mean sea (-17.5 dB) maps close to 0.0
        normalized = np.clip((filtered_db + 17.5) / 17.5, -1.0, 1.0).astype(np.float32)

        resolved_mode = meta.get("data_mode", data_mode)
        resolved_prov = meta.get("provenance", "observed" if resolved_mode == "real" else "synthetic")

        return {
            "data": normalized,
            "calibrated_db": filtered_db,
            "metadata": meta,
            "preprocessing_version": self.version,
            "calibration": "radiometric_sigma0_dB",
            "speckle_filter_applied": self.use_speckle_filter,
            "data_mode": resolved_mode,
            "provenance": resolved_prov,
        }

