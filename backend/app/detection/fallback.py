import time
from typing import Dict, Any, Tuple
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
from scipy import ndimage

class DemoThresholdDetector:
    """
    Classical Computer Vision Threshold Detector for Simulation / Fallback Mode.
    Operates transparently on calibrated SAR backscatter (sigma0 dB).
    Never masquerades as deep learning or trained AI.
    """
    def __init__(self, threshold_db: float = -23.0, min_slick_pixels: int = 20):
        self.threshold_db = threshold_db
        self.min_slick_pixels = min_slick_pixels
        self.model_name = "DemoThresholdDetector"
        self.model_version = "1.0.0-classical"

    def predict(self, calibrated_db: np.ndarray, scene_id: str = "OILTRACE-DEMO-001") -> Dict[str, Any]:
        """
        Segments dark water patches from radar backscatter array using calibrated intensity threshold
        and morphological filtering.
        """
        t_start = time.perf_counter()
        
        # Handle multi-channel arrays (e.g. dual polarization)
        if calibrated_db.ndim > 2:
            if calibrated_db.shape[0] < calibrated_db.shape[-1]:
                calibrated_db = calibrated_db[0]  # (C, H, W) -> take first channel
            else:
                calibrated_db = calibrated_db[:, :, 0]  # (H, W, C) -> take first channel
                
        h, w = calibrated_db.shape

        # 1. Intensity thresholding: oil dampens Bragg waves, causing lower backscatter (darker)
        # Typically sea is -15 to -20 dB, oil slicks are < -22 dB
        raw_mask = (calibrated_db < self.threshold_db).astype(np.uint8)

        # 2. Morphological cleanup: remove single-pixel speckle clutter
        # 3x3 structuring element
        struct = ndimage.generate_binary_structure(2, 1)
        cleaned = ndimage.binary_opening(raw_mask, structure=struct, iterations=1)
        cleaned = ndimage.binary_closing(cleaned, structure=struct, iterations=1)

        # 3. Connected component labeling to filter out sub-scale false alarms
        labeled, num_features = ndimage.label(cleaned)
        component_sizes = ndimage.sum(cleaned, labeled, range(num_features + 1))
        
        final_mask = np.zeros_like(cleaned, dtype=np.uint8)
        for i, sz in enumerate(component_sizes):
            if i > 0 and sz >= self.min_slick_pixels:
                final_mask[labeled == i] = 1

        # 4. Derive empirical probability map from distance to threshold
        # Pixels much darker than threshold have higher probability
        diff = self.threshold_db - calibrated_db
        # Sigmoid scale: diff of +5 dB -> prob ~0.95
        prob_map = 1.0 / (1.0 + np.exp(-np.clip(diff * 0.8, -10, 10)))
        # Zero out non-slick region in prob map for focused view
        prob_map = np.where(final_mask == 1, prob_map, prob_map * 0.2)

        oil_pixel_count = int(np.sum(final_mask))
        if oil_pixel_count > 0:
            # Measured empirical confidence from slick pixels
            mean_conf = float(np.mean(prob_map[final_mask == 1]))
        else:
            mean_conf = 0.0

        elapsed_ms = round((time.perf_counter() - t_start) * 1000, 2)

        return {
            "mask": final_mask,
            "probability_map": prob_map,
            "confidence": round(mean_conf, 4),
            "class_probabilities": {
                "sea": round(1.0 - mean_conf, 4),
                "oil": round(mean_conf, 4),
                "look_alike": 0.0,
            },
            "threshold": self.threshold_db,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "is_ai_model": False,
            "input_scene_id": scene_id,
            "data_mode": "simulation",
            "provenance": "synthetic_classical_cv",
            "inference_time_ms": elapsed_ms,
            "height": h,
            "width": w,
            "oil_pixel_count": oil_pixel_count,
        }
