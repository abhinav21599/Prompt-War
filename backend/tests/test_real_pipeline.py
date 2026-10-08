import unittest
import sys
import os
import numpy as np

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
)

from app.providers.satellite import (
    RealSatelliteProvider,
    get_satellite_provider,
)
from app.providers.ais import (
    RealAisProvider,
    SimulationAisProvider,
    get_ais_provider,
)
from app.geometry.vectorizer import vectorize_mask, pixel_to_geo
from app.detection.detector import SpillDetector
from app.ais.engine import (
    spatial_filter,
    temporal_filter,
    trajectory_filter,
    group_by_vessel,
)
from datetime import datetime, timezone


class TestRealPipeline(unittest.TestCase):
    def test_01_real_satellite_provider_structure(self):
        provider = RealSatelliteProvider()
        # Verify provider queries catalogue without crash
        scenes = provider.discover_scenes(
            [72.0, 15.0, 73.0, 16.0], max_records=2
        )
        self.assertIsInstance(scenes, list)
        if scenes:
            sc = scenes[0]
            self.assertIn("id", sc)
            self.assertIn("geometry", sc)
            self.assertEqual(sc.get("data_mode"), "real")

    def test_02_georeferencing_pixel_to_geo(self):
        # Affine: res_x=0.002, res_y=-0.002, x_origin=72.0, y_origin=16.0
        transform = [0.002, 0.0, 72.0, 0.0, -0.002, 16.0]
        lon, lat = pixel_to_geo(10, 20, transform)
        self.assertAlmostEqual(lon, 72.02, places=4)
        self.assertAlmostEqual(lat, 15.96, places=4)

        # Geodesic vectorization
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[20:40, 20:50] = 1
        geom = vectorize_mask(mask, transform=transform)
        self.assertIn("polygon_geojson", geom)
        self.assertGreater(geom["area_km2"], 0.0)
        self.assertGreater(geom["perimeter_km"], 0.0)

    def test_03_real_ais_provider_strict_separation(self):
        real_ais = RealAisProvider()
        # In real mode without ingested records or API key, it must fail explicitly
        with self.assertRaises(ValueError):
            real_ais.get_observations(
                [72.0, 15.0, 73.0, 16.0],
                datetime(2024, 3, 15, tzinfo=timezone.utc),
                datetime(2024, 3, 15, 6, tzinfo=timezone.utc),
            )

        # Simulation mode returns deterministic rows
        sim_ais = SimulationAisProvider()
        obs = sim_ais.get_observations(
            [72.0, 15.0, 73.0, 16.0],
            datetime(2024, 3, 15, tzinfo=timezone.utc),
            datetime(2024, 3, 15, 6, tzinfo=timezone.utc),
        )
        self.assertIsInstance(obs, list)

    def test_04_ais_progressive_filtering_funnel(self):
        obs_list = [
            {
                "id": "1",
                "mmsi": "111",
                "latitude": 15.40,
                "longitude": 72.65,
                "timestamp": "2024-03-15T04:00:00Z",
                "sog_knots": 10.0,
                "cog_deg": 45.0,
            },
            {
                "id": "2",
                "mmsi": "111",
                "latitude": 15.42,
                "longitude": 72.68,
                "timestamp": "2024-03-15T05:00:00Z",
                "sog_knots": 8.0,
                "cog_deg": 45.0,
            },
            {
                "id": "3",
                "mmsi": "222",
                "latitude": 18.00,
                "longitude": 75.00,
                "timestamp": "2024-03-15T04:00:00Z",
                "sog_knots": 12.0,
                "cog_deg": 90.0,
            },  # Out of bounds
        ]
        origin_lat, origin_lon = 15.40, 72.65
        origin_time = datetime(2024, 3, 15, 4, 30, tzinfo=timezone.utc)

        sp_pass, sp_stats = spatial_filter(
            obs_list, origin_lat, origin_lon, radius_km=50.0
        )
        self.assertEqual(len(sp_pass), 2)
        self.assertEqual(sp_stats["removed_count"], 1)

        temp_pass, temp_stats = temporal_filter(
            sp_pass, origin_time, window_hours=2.0
        )
        self.assertEqual(len(temp_pass), 2)

        by_vessel = group_by_vessel(temp_pass)
        traj_pass, traj_stats = trajectory_filter(
            by_vessel, origin_lat, origin_lon, 15.42, 72.68
        )
        self.assertIn("111", traj_pass)

    def test_05_dual_channel_model_detection(self):
        detector = SpillDetector()
        self.assertTrue(detector.is_ai_model)
        # Test 2-channel VV/VH patch input
        dual_pol_array = np.random.uniform(-0.5, 0.5, size=(2, 64, 64)).astype(
            np.float32
        )
        res = detector.predict(dual_pol_array)
        self.assertIn("mask", res)
        self.assertIn("confidence", res)
        self.assertEqual(res["mask"].shape, (64, 64))


if __name__ == "__main__":
    unittest.main()
