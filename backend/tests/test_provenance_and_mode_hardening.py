import os
import sys
import unittest
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from app.main import app, seed_demo_data
from app.database.engine import init_db
from app.preprocessing.processor import SARPreprocessor
from app.detection.inference import MLInferenceEngine
from app.detection.detector import SpillDetector
from app.simulation.synthetic_scene import generate_synthetic_sar_scene
from app.simulation.generator import generate_demo_incident


class TestProvenanceAndModeHardening(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        seed_demo_data()
        cls.client = TestClient(app)

    def test_a_real_mode_rejects_missing_file(self):
        """Test A: REAL mode rejects missing/invalid real file without synthetic fallback."""
        processor = SARPreprocessor()
        with self.assertRaises(FileNotFoundError):
            processor.preprocess("non_existent_sar_image_real_test_xyz123.tif", data_mode="real")

    def test_a_real_mode_rejects_single_channel_when_dual_pol_required(self):
        """Test A: REAL mode inference engine rejects single channel input without synthesizing VH."""
        engine = MLInferenceEngine()
        single_channel = np.random.rand(1, 128, 128).astype(np.float32)
        with self.assertRaises(ValueError) as ctx:
            engine.predict(single_channel, data_mode="real")
        self.assertIn("Dual-polarization (VV+VH) required for real-data AI model inference", str(ctx.exception))

    def test_b_real_mode_does_not_invoke_synthetic_fallback(self):
        """Test B: SpillDetector with REAL mode will fail on missing file and not substitute synthetic."""
        detector = SpillDetector()
        with self.assertRaises(FileNotFoundError):
            detector.predict("non_existent_operational_file.tif", data_mode="real")

    def test_c_simulation_mode_is_reproducible(self):
        """Test C: SIMULATION mode remains reproducible with Seed 26143."""
        sar1 = generate_synthetic_sar_scene(seed=26143)
        sar2 = generate_synthetic_sar_scene(seed=26143)
        np.testing.assert_array_almost_equal(sar1["calibrated_db"], sar2["calibrated_db"])
        np.testing.assert_array_almost_equal(sar1["normalized"], sar2["normalized"])
        self.assertEqual(sar1["metadata"]["seed"], 26143)
        self.assertEqual(sar1["metadata"]["data_mode"], "simulation")

        inc1 = generate_demo_incident()
        inc2 = generate_demo_incident()
        self.assertEqual(inc1["incident_id"], inc2["incident_id"])
        self.assertEqual(len(inc1["vessels"]), len(inc2["vessels"]))
        self.assertEqual(inc1["metadata"]["data_mode"], "simulation")

    def test_d_provenance_fields_present(self):
        """Test D: Provenance fields are structured and truthful."""
        detector = SpillDetector()
        # In simulation mode with mock path
        result = detector.predict("mock_demo_scene.tif", data_mode="simulation")
        self.assertIn("structured_provenance", result)
        prov = result["structured_provenance"]
        self.assertEqual(prov["mode"], "simulation")
        self.assertEqual(prov["provenance"], "synthetic")
        self.assertIn("UNet-ResNet34", prov["source"])
        self.assertIn("processing_version", prov)
        self.assertIn("generated_at", prov)

    def test_e_api_error_states_are_distinguishable(self):
        """Test E: 404 on missing scene/spill vs valid response."""
        # Non-existent scene metadata returns 404, not fallback
        resp = self.client.get("/api/scenes/non_existent_scene_xyz_999")
        self.assertEqual(resp.status_code, 404)

        # Non-existent scene raster returns 404, not fallback
        resp = self.client.get("/api/scenes/non_existent_scene_xyz_999/raster")
        self.assertEqual(resp.status_code, 404)

        # Non-existent spill hindcast returns 404, not cross-incident fallback
        resp = self.client.get("/api/spills/NON_EXISTENT_SPILL_ID_999/hindcast")
        self.assertEqual(resp.status_code, 404)

        # Non-existent spill forecast returns 404
        resp = self.client.get("/api/spills/NON_EXISTENT_SPILL_ID_999/forecast")
        self.assertEqual(resp.status_code, 404)

        # Valid existing demo spill returns 200
        resp = self.client.get("/api/spills/OILTRACE-DEMO-001")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["data_mode"], "simulation")


if __name__ == '__main__':
    unittest.main()
