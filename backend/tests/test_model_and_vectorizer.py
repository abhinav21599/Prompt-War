import unittest
import sys
from pathlib import Path
import numpy as np
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

try:
    import torch
    from app.detection.model import UNetResNet34
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

from app.detection.fallback import DemoThresholdDetector
from app.geometry.vectorizer import vectorize_mask
from app.simulation.synthetic_scene import generate_synthetic_sar_scene

class TestModelAndVectorizer(unittest.TestCase):
    def test_unet_resnet34_shape_and_range(self):
        if not HAS_TORCH:
            self.skipTest("PyTorch is not installed")
        model = UNetResNet34(in_channels=1, num_classes=1)
        model.eval()

        dummy_input = torch.randn(1, 1, 128, 128)
        with torch.no_grad():
            output_prob = model.predict_probability(dummy_input)

        self.assertEqual(output_prob.shape, (1, 1, 128, 128))
        self.assertFalse(torch.isnan(output_prob).any())
        self.assertTrue((output_prob >= 0.0).all())
        self.assertTrue((output_prob <= 1.0).all())

    def test_demo_threshold_detector_fallback(self):
        detector = DemoThresholdDetector(threshold_db=-23.0)
        test_array = np.full((100, 100), -17.0, dtype=np.float32) # sea
        test_array[30:60, 30:60] = -27.0 # dark slick

        res = detector.predict(test_array, scene_id="TEST-SCENE-01")
        self.assertFalse(res["is_ai_model"])
        self.assertEqual(res["data_mode"], "simulation")
        self.assertGreater(res["confidence"], 0.5)
        self.assertGreater(res["oil_pixel_count"], 0)
        self.assertEqual(res["mask"].shape, (100, 100))

    def test_synthetic_sar_scene_generation(self):
        scene = generate_synthetic_sar_scene(width=128, height=128, seed=26143)
        self.assertIn("calibrated_db", scene)
        self.assertIn("ground_truth_mask", scene)
        self.assertIn("metadata", scene)

        cal_db = scene["calibrated_db"]
        gt = scene["ground_truth_mask"]
        self.assertEqual(cal_db.shape, (128, 128))
        self.assertEqual(gt.shape, (128, 128))
        # Oil slick must have lower backscatter than clean sea
        oil_mean = np.mean(cal_db[gt == 1])
        sea_mean = np.mean(cal_db[gt == 0])
        self.assertLess(oil_mean, sea_mean)

    def test_vectorize_mask_geodesic_properties(self):
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[30:70, 30:70] = 1 # 40x40 square patch
        bounds = {"min_lon": 72.0, "min_lat": 15.0, "max_lon": 73.0, "max_lat": 16.0}

        geom = vectorize_mask(mask, bounds=bounds)
        self.assertIn("polygon_geojson", geom)
        self.assertIn("area_km2", geom)
        self.assertGreater(geom["area_km2"], 0.0)
        self.assertGreater(geom["perimeter_km"], 0.0)
        self.assertGreater(geom["compactness"], 0.0)
        self.assertLessEqual(geom["compactness"], 1.0)

if __name__ == "__main__":
    unittest.main()
