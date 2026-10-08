import unittest
import sys
import os
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.detection.detector import SpillDetector
from app.preprocessing.processor import SARPreprocessor
from app.uncertainty.engine import UncertaintyEngine
from app.digital_twin.engine import DigitalTwinEngine
from app.config import settings


class TestSimulationComponents(unittest.TestCase):
    def test_sar_preprocessor(self):
        preprocessor = SARPreprocessor()
        val = preprocessor.validate("S1A_IW_GRDH_1SDV_20240315T060000_demo.tif")
        self.assertTrue(val["valid"])
        self.assertEqual(val["crs"], "EPSG:4326")
        
        res = preprocessor.preprocess("S1A_IW_GRDH_1SDV_20240315T060000_demo.tif")
        self.assertEqual(res["data_mode"], "simulation")
        self.assertEqual(res["provenance"], "synthetic")
        self.assertIn("data", res)

    def test_spill_detector(self):
        detector = SpillDetector()
        res1 = detector.predict("S1A_IW_GRDH_1SDV_20240315T060000_demo.tif")
        self.assertEqual(res1["data_mode"], "simulation")
        self.assertEqual(res1["provenance"], "synthetic")
        self.assertEqual(res1["seed"], 26143)
        self.assertGreater(res1["confidence"], 0.0)
        self.assertLessEqual(res1["confidence"], 1.0)
        self.assertIn("mask", res1)
        self.assertEqual(res1["mask"].shape, (256, 256))

        # Test determinism
        res2 = detector.predict("S1A_IW_GRDH_1SDV_20240315T060000_demo.tif")
        np.testing.assert_array_equal(res1["mask"], res2["mask"])
        self.assertEqual(res1["confidence"], res2["confidence"])

    def test_uncertainty_engine(self):
        engine = UncertaintyEngine()
        particles = [
            {"particle_id": 0, "trajectory": [{"lat": 15.2, "lon": 72.4}, {"lat": 15.21, "lon": 72.41}]},
            {"particle_id": 1, "trajectory": [{"lat": 15.2, "lon": 72.4}, {"lat": 15.22, "lon": 72.42}]},
            {"particle_id": 2, "trajectory": [{"lat": 15.2, "lon": 72.4}, {"lat": 15.20, "lon": 72.40}]},
        ]
        h_unc = engine.calculate_hindcast_uncertainty(particles)
        self.assertIn("spatial_uncertainty_km", h_unc)
        self.assertIn("temporal_uncertainty_h", h_unc)
        self.assertGreater(h_unc["spatial_uncertainty_km"], 0.0)

        horizons = {
            6: [{"lat": 15.5, "lon": 72.7}, {"lat": 15.52, "lon": 72.72}],
            12: [{"lat": 15.6, "lon": 72.8}, {"lat": 15.63, "lon": 72.83}],
        }
        f_unc = engine.calculate_forecast_uncertainty(horizons)
        self.assertIn("+6h", f_unc["horizons"])
        self.assertIn("+12h", f_unc["horizons"])

    def test_digital_twin_engine(self):
        dt = DigitalTwinEngine()
        spill = {
            "satellite_acquisition_time": "2024-03-15T06:00:00+00:00",
            "spill_polygon_geojson": {"type": "Polygon", "coordinates": [[[72.6, 15.4], [72.7, 15.4], [72.7, 15.5], [72.6, 15.5], [72.6, 15.4]]]},
        }
        state = dt.get_state_at_time("OILTRACE-DEMO-001", time_offset_hours=0.0, spill_data=spill)
        self.assertEqual(state["state_classification"], "Observed")
        self.assertEqual(state["data_mode"], "simulation")

        state_h = dt.get_state_at_time("OILTRACE-DEMO-001", time_offset_hours=-6.0, spill_data=spill)
        self.assertEqual(state_h["state_classification"], "Reconstructed")

        state_f = dt.get_state_at_time("OILTRACE-DEMO-001", time_offset_hours=6.0, spill_data=spill)
        self.assertEqual(state_f["state_classification"], "Predicted")


if __name__ == "__main__":
    unittest.main()
