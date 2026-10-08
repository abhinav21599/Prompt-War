import unittest
import math
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.geometry.calculator import (
    haversine_km,
    polygon_area_km2,
    polygon_perimeter_km,
    polygon_centroid,
    polygon_compactness,
    characterize_polygon,
)
from app.attribution.scorer import (
    normalize_proximity,
    normalize_temporal,
    compute_trajectory_score,
    compute_heading_score,
    score_vessel,
)
from app.drift.particle_engine import latlon_offset, rk4_step


class TestGeometryEngine(unittest.TestCase):
    def test_haversine_distance(self):
        d = haversine_km(18.9220, 72.8347, 18.9220, 72.9347)
        self.assertGreater(d, 9.0)
        self.assertLess(d, 12.0)
        self.assertAlmostEqual(haversine_km(18.9, 72.8, 18.9, 72.8), 0.0, places=5)

    def test_polygon_characterization(self):
        coords = [
            [72.5, 18.5],
            [72.6, 18.5],
            [72.6, 18.6],
            [72.5, 18.6],
            [72.5, 18.5],
        ]
        poly = {"type": "Polygon", "coordinates": [coords]}
        result = characterize_polygon(poly)

        self.assertIn("area_km2", result)
        self.assertIn("perimeter_km", result)
        self.assertIn("centroid_lat", result)
        self.assertIn("centroid_lon", result)
        self.assertGreater(result["area_km2"], 50.0)
        self.assertGreater(result["perimeter_km"], 30.0)
        self.assertAlmostEqual(result["centroid_lat"], 18.55, places=2)
        self.assertAlmostEqual(result["centroid_lon"], 72.55, places=2)


class TestAttributionScorer(unittest.TestCase):
    def test_proximity_normalization(self):
        self.assertEqual(normalize_proximity(0.0, 50.0), 1.0)
        self.assertAlmostEqual(normalize_proximity(25.0, 50.0), 0.5)
        self.assertEqual(normalize_proximity(55.0, 50.0), 0.0)

    def test_temporal_normalization(self):
        self.assertEqual(normalize_temporal(0.0, 2.0), 1.0)
        self.assertAlmostEqual(normalize_temporal(1.0, 2.0), 0.5)
        self.assertEqual(normalize_temporal(3.0, 2.0), 0.0)

    def test_vessel_scoring_bounds(self):
        observations = [
            {"timestamp": "2024-03-15T03:00:00Z", "latitude": 18.50, "longitude": 72.50, "speed_knots": 14.5, "heading": 180},
            {"timestamp": "2024-03-15T04:00:00Z", "latitude": 18.30, "longitude": 72.50, "speed_knots": 14.2, "heading": 180},
        ]
        score_data = score_vessel(
            mmsi="419000123",
            observations=observations,
            origin_lat=18.40,
            origin_lon=72.50,
            origin_time_str="2024-03-15T03:30:00Z",
            spill_lat=18.55,
            spill_lon=72.62,
            current_u=0.2,
            current_v=-0.1,
            wind_u=5.0,
            wind_v=-3.0,
        )
        final_score = score_data["final_score"]
        self.assertGreaterEqual(final_score, 0.0)
        self.assertLessEqual(final_score, 100.0)
        self.assertIn("factors", score_data)
        self.assertIn("data_confidence", score_data)


class TestDriftEngine(unittest.TestCase):
    def test_latlon_offset(self):
        lat, lon = 18.5, 72.5
        nlat, nlon = latlon_offset(lat, lon, u_ms=10.0, v_ms=0.0, dt_s=100.0)
        self.assertEqual(nlat, lat)
        self.assertGreater(nlon, lon)

        nlat2, nlon2 = latlon_offset(lat, lon, u_ms=0.0, v_ms=10.0, dt_s=100.0)
        self.assertGreater(nlat2, lat)
        self.assertEqual(nlon2, lon)


if __name__ == "__main__":
    unittest.main()
