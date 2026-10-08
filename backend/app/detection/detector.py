import os
import time
from typing import Dict, Any, Optional
import numpy as np
from app.config import settings
from app.preprocessing.processor import SARPreprocessor
from app.detection.fallback import DemoThresholdDetector

class SpillDetector:
    """
    Modular Satellite SAR Oil Spill Detector.
    Strictly distinguishes trained AI vs transparent classical fallback:
    - If a valid PyTorch checkpoint is present at `model_path`: runs UNet-ResNet34.
    - If no checkpoint exists: uses DemoThresholdDetector (intensity threshold + morphology).
      Transparently tagged with is_ai_model=False, data_mode="simulation".
    Never fabricates AI confidence values or runs untrained models claiming detection.
    """
    def __init__(
        self,
        model_version: str = "1.0.0-demo",
        threshold: float = 0.42,
        model_path: Optional[str] = None,
    ):
        self.model_version = model_version
        self.threshold = threshold
        self.preprocessor = SARPreprocessor()
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        env_model_path = os.getenv("MODEL_PATH")
        candidates = [
            model_path,
            getattr(settings, "model_path", None),
            env_model_path,
            os.path.join(repo_root, "models", "oiltrace_unet_v1.pt"),
            os.path.join(repo_root, "models", "oiltrace_demo_unet.pt"),
            "models/oiltrace_unet_v1.pt",
            "models/oiltrace_demo_unet.pt",
            "../models/oiltrace_unet_v1.pt",
            "../models/oiltrace_demo_unet.pt",
        ]
        self.model_path = next((p for p in candidates if p and os.path.exists(p)), None)
        
        # Download from MODEL_URL if specified and no checkpoint found locally
        model_url = os.getenv("MODEL_URL")
        if not self.model_path and model_url:
            target_path = os.path.join(repo_root, "models", "oiltrace_unet_v1.pt")
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            try:
                import urllib.request
                print(f"[MODEL DOWNLOAD] Downloading model checkpoint from {model_url}...")
                urllib.request.urlretrieve(model_url, target_path)
                if os.path.exists(target_path):
                    self.model_path = target_path
            except Exception as dl_err:
                print(f"[MODEL DOWNLOAD ERROR] Failed to download model from {model_url}: {dl_err}")

        self.has_checkpoint = bool(self.model_path and os.path.exists(self.model_path))

        self.ml_engine = None
        if self.has_checkpoint:
            self.is_ai_model = True
            self.model_name = "UNet-ResNet34"
        else:
            self.is_ai_model = False
            self.model_name = "DemoThresholdDetector"

        self.demo_detector = DemoThresholdDetector(threshold_db=-23.0)

    def predict(self, scene_input: Any = "S1A_IW_GRDH_1SDV_20240315T060000_demo.tif") -> Dict[str, Any]:
        """
        Runs oil spill detection on a GeoTIFF path, PNG path, or preprocessed dictionary/array.
        Returns a rich DetectionResult dictionary.
        """
        start_time = time.perf_counter()

        # 1. Preprocessing
        if isinstance(scene_input, dict) and "data" in scene_input:
            prep_result = scene_input
        elif isinstance(scene_input, str):
            prep_result = self.preprocessor.preprocess(scene_input)
        elif isinstance(scene_input, np.ndarray):
            prep_result = {
                "data": scene_input,
                "metadata": {
                    "bounds": {"min_lon": 72.35, "min_lat": 15.15, "max_lon": 73.05, "max_lat": 15.65},
                    "crs": "EPSG:4326",
                    "transform": [0.002, 0.0, 72.35, 0.0, -0.002, 15.65],
                },
                "preprocessing_version": "1.2.0",
                "calibration": "radiometric_sigma0_dB",
                "data_mode": "simulation",
                "provenance": "synthetic",
            }
        else:
            raise ValueError(f"Unsupported scene input type: {type(scene_input)}")

        meta = prep_result.get("metadata", {})
        calibrated_db = prep_result.get("calibrated_db", prep_result["data"])
        normalized_data = prep_result["data"]
        scene_id = meta.get("scene_id", "OILTRACE-DEMO-001")

        # 2. Inference: ML or Classical Fallback
        input_data_mode = prep_result.get("data_mode", "simulation")
        if self.is_ai_model:
            if self.ml_engine is None and self.has_checkpoint:
                try:
                    from app.detection.inference import MLInferenceEngine
                    self.ml_engine = MLInferenceEngine(checkpoint_path=self.model_path, threshold=self.threshold)
                except Exception as e:
                    print(f"[DETECTOR WARN] Could not initialize PyTorch ML engine: {e}. Falling back to DemoThresholdDetector.")
                    self.ml_engine = None
                    self.is_ai_model = False
                    self.model_name = "DemoThresholdDetector"

            if self.ml_engine:
                result = self.ml_engine.predict(normalized_data, scene_id=scene_id, data_mode=input_data_mode)
            else:
                result = self.demo_detector.predict(calibrated_db, scene_id=scene_id)
        else:
            result = self.demo_detector.predict(calibrated_db, scene_id=scene_id)

        # 3. Vectorize mask to georeferenced polygon and geodesic characteristics
        raw_mask = result.get("mask")
        if raw_mask is not None:
            from app.geometry.vectorizer import vectorize_mask
            geom = vectorize_mask(
                raw_mask,
                transform=meta.get("transform"),
                bounds=meta.get("bounds"),
                crs=meta.get("crs", "EPSG:4326"),
            )
            result["geometry"] = geom
            result["polygon_geojson"] = geom.get("polygon_geojson")
            result["centroid_geojson"] = geom.get("centroid_geojson")
            result["polygon"] = geom.get("polygon_geojson")
            result["centroid"] = geom.get("centroid_geojson")
            result["area_km2"] = geom.get("area_km2", 0.0)
            result["perimeter_km"] = geom.get("perimeter_km", 0.0)
            result["length_km"] = geom.get("length_km", 0.0)
            result["width_km"] = geom.get("width_km", 0.0)
            result["orientation_deg"] = geom.get("orientation_deg", 0.0)
            result["compactness"] = geom.get("compactness", 0.0)

        # 4. Augment with geospatial and pipeline metadata
        elapsed_s = round(time.perf_counter() - start_time, 4)
        result["preprocessing_version"] = prep_result.get("preprocessing_version", "1.2.0")
        result["bounds"] = meta.get("bounds")
        result["crs"] = meta.get("crs", "EPSG:4326")
        result["transform"] = meta.get("transform")
        result["processing_time"] = elapsed_s
        result["input_scene_id"] = scene_id
        result["model_threshold"] = self.threshold
        result["seed"] = getattr(settings, "oiltrace_demo_seed", 26143)
        result["data_mode"] = input_data_mode
        result["provenance"] = prep_result.get("provenance", "synthetic")

        return result

