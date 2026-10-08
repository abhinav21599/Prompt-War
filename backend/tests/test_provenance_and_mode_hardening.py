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

    def test_f_requested_scene_is_actually_used_and_tracked(self):
        """Test F: Exact requested scene ID and source path are tracked in detection and inference metadata."""
        detector = SpillDetector()
        mock_scene_id = "S1B_IW_GRDH_1SDV_20240310T053000_clean"
        res = detector.predict(f"{mock_scene_id}.tif", data_mode="simulation")
        self.assertEqual(res["input_scene_id"], mock_scene_id)
        self.assertIn("structured_provenance", res)
        self.assertEqual(res["structured_provenance"]["scene_id"], mock_scene_id)
        self.assertIn(mock_scene_id, res["structured_provenance"]["source_path"])

    def test_g_invalid_georeferencing_fails_in_real_mode(self):
        """Test G: Real mode vectorization rejects missing or invalid geotransform/bounds."""
        from app.geometry.vectorizer import vectorize_mask
        mask = np.ones((64, 64), dtype=np.uint8)
        # In real mode with no transform or bounds, must fail explicitly
        with self.assertRaises(ValueError) as ctx:
            vectorize_mask(mask, transform=None, bounds=None, data_mode="real")
        self.assertIn("Georeferenced transform or spatial bounds required", str(ctx.exception))

        # In real mode with invalid spatial bounds (e.g. min_lon >= max_lon)
        with self.assertRaises(ValueError) as ctx:
            vectorize_mask(mask, transform=None, bounds={"min_lon": 75.0, "max_lon": 72.0, "min_lat": 15.0, "max_lat": 16.0}, data_mode="real")
        self.assertIn("Invalid spatial bounds", str(ctx.exception))

    def test_h_geometry_output_geographically_valid(self):
        """Test H: Geometry output is geographically valid when georeferencing exists."""
        from app.geometry.vectorizer import vectorize_mask
        from app.geometry.calculator import characterize_polygon
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[20:50, 30:70] = 1
        transform = [0.001, 0.0, 72.0, 0.0, -0.001, 16.0]
        geom = vectorize_mask(mask, transform=transform, data_mode="real")
        self.assertIn("polygon_geojson", geom)
        self.assertGreater(geom["area_km2"], 0.0)
        self.assertGreater(geom["perimeter_km"], 0.0)
        self.assertGreater(geom["compactness"], 0.0)
        self.assertLessEqual(geom["compactness"], 1.0)
        self.assertGreaterEqual(geom["centroid_lon"], 72.0)
        self.assertLessEqual(geom["centroid_lat"], 16.0)

    def test_i_no_hardcoded_demo_scene_in_real_pipeline(self):
        """Test I: AnalysisService in REAL mode fails if scene asset is missing and never falls back to demo tif."""
        from app.services.analysis_service import AnalysisService
        from app.database.engine import get_connection
        conn = get_connection()
        try:
            # Create a mock real incident with missing satellite image asset
            conn.execute("""
                INSERT OR REPLACE INTO oil_spills (id, incident_name, status, data_mode, provenance, created_at, updated_at)
                VALUES ('REAL-SPILL-TEST-001', 'Test Real Spill', 'active', 'real', 'observed', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
            """)
            conn.commit()
            service = AnalysisService()
            with self.assertRaises(Exception) as ctx:
                service.run_pipeline("REAL-SPILL-TEST-001", data_mode="real")
            # Should fail due to missing satellite scene or missing operational data, not silently run demo tif
            self.assertTrue(
                "Satellite scene asset path not found" in str(ctx.exception) or
                "not found" in str(ctx.exception) or
                "Real" in str(ctx.exception)
            )
        finally:
            conn.execute("DELETE FROM audit_log WHERE analysis_run_id LIKE '%REAL-SPILL-TEST-001%'")
            conn.execute("DELETE FROM analysis_runs WHERE spill_id='REAL-SPILL-TEST-001'")
            conn.execute("DELETE FROM oil_spills WHERE id='REAL-SPILL-TEST-001'")
            conn.commit()
            conn.close()


if __name__ == '__main__':
    unittest.main()

