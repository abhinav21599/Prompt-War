import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.drift.particle_engine import rk4_step, latlon_offset
from app.attribution.scorer import score_vessel

class TestScientificSanity(unittest.TestCase):
    def setUp(self):
        self.lat = 15.0
        self.lon = 72.0
        self.dt_s = 3600.0  # 1 hour

    def test_zero_current_zero_wind(self):
        """Particles must not move when forcing velocities are zero."""
        current_data = {"field": "current", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.0, "current_v": 0.0}]}
        wind_data = {"field": "wind", "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 0.0, "wind_v": 0.0}]}
        nlat, nlon = rk4_step(self.lat, self.lon, current_data, wind_data, windage_alpha=0.03, dt_s=self.dt_s)
        self.assertAlmostEqual(nlat, self.lat, places=6)
        self.assertAlmostEqual(nlon, self.lon, places=6)

    def test_pure_eastward_current(self):
        """Pure eastward current (u > 0, v = 0) must displace particles eastward only."""
        current_data = {"field": "current", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.5, "current_v": 0.0}]}
        wind_data = {"field": "wind", "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 0.0, "wind_v": 0.0}]}
        nlat, nlon = rk4_step(self.lat, self.lon, current_data, wind_data, windage_alpha=0.03, dt_s=self.dt_s)
        self.assertAlmostEqual(nlat, self.lat, places=5)
        self.assertGreater(nlon, self.lon)

    def test_pure_northward_current(self):
        """Pure northward current (u = 0, v > 0) must displace particles northward only."""
        current_data = {"field": "current", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.0, "current_v": 0.5}]}
        wind_data = {"field": "wind", "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 0.0, "wind_v": 0.0}]}
        nlat, nlon = rk4_step(self.lat, self.lon, current_data, wind_data, windage_alpha=0.03, dt_s=self.dt_s)
        self.assertGreater(nlat, self.lat)
        self.assertAlmostEqual(nlon, self.lon, places=5)

    def test_zero_windage(self):
        """When windage alpha is zero, gale force winds must produce zero drift."""
        current_data = {"field": "current", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.0, "current_v": 0.0}]}
        wind_data = {"field": "wind", "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 25.0, "wind_v": 25.0}]}
        nlat, nlon = rk4_step(self.lat, self.lon, current_data, wind_data, windage_alpha=0.0, dt_s=self.dt_s)
        self.assertAlmostEqual(nlat, self.lat, places=6)
        self.assertAlmostEqual(nlon, self.lon, places=6)

    def test_attribution_ranking_sanity(self):
        """A vessel closely matching origin position, time, and trajectory must score higher than a distant vessel."""
        # Vessel 1: Close to origin (15.21, 72.41) at T0
        obs_close = [
            {"timestamp": "2024-03-14T11:50:00+00:00", "latitude": 15.20, "longitude": 72.40, "sog_knots": 12.0, "cog_deg": 45.0},
            {"timestamp": "2024-03-14T12:10:00+00:00", "latitude": 15.22, "longitude": 72.42, "sog_knots": 12.0, "cog_deg": 45.0},
        ]
        score_close = score_vessel(
            mmsi="111111111",
            observations=obs_close,
            origin_lat=15.21,
            origin_lon=72.41,
            origin_time_str="2024-03-14T12:00:00+00:00",
            spill_lat=15.42,
            spill_lon=72.68,
        )

        # Vessel 2: Distant from origin (18.5, 74.0)
        obs_far = [
            {"timestamp": "2024-03-14T11:50:00+00:00", "latitude": 18.50, "longitude": 74.00, "sog_knots": 14.0, "cog_deg": 270.0},
            {"timestamp": "2024-03-14T12:10:00+00:00", "latitude": 18.55, "longitude": 74.05, "sog_knots": 14.0, "cog_deg": 270.0},
        ]
        score_far = score_vessel(
            mmsi="222222222",
            observations=obs_far,
            origin_lat=15.21,
            origin_lon=72.41,
            origin_time_str="2024-03-14T12:00:00+00:00",
            spill_lat=15.42,
            spill_lon=72.68,
        )

        self.assertGreater(score_close["final_score"], score_far["final_score"])
        self.assertGreater(score_close["evidence_score"], score_far["evidence_score"])

    def test_vessel_track_perturbation_sensitivity(self):
        """Moving a candidate vessel far away drops its score; restoring it increases score."""
        mmsi = "419001234"
        origin_lat, origin_lon = 15.21, 72.41
        origin_time = "2024-03-14T12:00:00+00:00"

        # 1. Compatible passage
        track_compatible = [
            {"timestamp": "2024-03-14T11:55:00+00:00", "latitude": 15.215, "longitude": 72.408, "sog_knots": 12.0, "cog_deg": 45.0},
            {"timestamp": "2024-03-14T12:05:00+00:00", "latitude": 15.225, "longitude": 72.418, "sog_knots": 12.0, "cog_deg": 45.0},
        ]
        score_comp = score_vessel(
            mmsi=mmsi, observations=track_compatible,
            origin_lat=origin_lat, origin_lon=origin_lon, origin_time_str=origin_time,
            spill_lat=15.42, spill_lon=72.68
        )

        # 2. Perturb track: move 40 km away
        track_perturbed = [
            {"timestamp": "2024-03-14T11:55:00+00:00", "latitude": 15.550, "longitude": 72.800, "sog_knots": 12.0, "cog_deg": 45.0},
            {"timestamp": "2024-03-14T12:05:00+00:00", "latitude": 15.560, "longitude": 72.810, "sog_knots": 12.0, "cog_deg": 45.0},
        ]
        score_pert = score_vessel(
            mmsi=mmsi, observations=track_perturbed,
            origin_lat=origin_lat, origin_lon=origin_lon, origin_time_str=origin_time,
            spill_lat=15.42, spill_lon=72.68
        )

        # Score must drop significantly
        self.assertGreater(score_comp["final_score"], score_pert["final_score"])
        self.assertGreater(score_comp["distance_km"], 0.0)
        self.assertGreater(score_pert["distance_km"], score_comp["distance_km"])

    def test_temporal_misalignment_penalty(self):
        """Passing 6 hours after the release window must eliminate temporal score."""
        mmsi = "419001234"
        origin_lat, origin_lon = 15.21, 72.41
        origin_time = "2024-03-14T12:00:00+00:00"

        track_late = [
            {"timestamp": "2024-03-14T18:00:00+00:00", "latitude": 15.215, "longitude": 72.408, "sog_knots": 12.0, "cog_deg": 45.0},
            {"timestamp": "2024-03-14T18:10:00+00:00", "latitude": 15.225, "longitude": 72.418, "sog_knots": 12.0, "cog_deg": 45.0},
        ]
        score_late = score_vessel(
            mmsi=mmsi, observations=track_late,
            origin_lat=origin_lat, origin_lon=origin_lon, origin_time_str=origin_time,
            spill_lat=15.42, spill_lon=72.68,
            temporal_window_h=2.0
        )
        self.assertEqual(score_late["norm_temporal"], 0.0)

    def test_wind_direction_displacement_change(self):
        """Reversing wind direction must reverse the wind-driven displacement vector."""
        current_data = {"field": "current", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.0, "current_v": 0.0}]}
        wind_east = {"field": "wind", "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 10.0, "wind_v": 0.0}]}
        wind_west = {"field": "wind", "points": [{"lat": 15.0, "lon": 72.0, "wind_u": -10.0, "wind_v": 0.0}]}

        _, lon_east = rk4_step(15.0, 72.0, current_data, wind_east, windage_alpha=0.03, dt_s=3600.0)
        _, lon_west = rk4_step(15.0, 72.0, current_data, wind_west, windage_alpha=0.03, dt_s=3600.0)

        self.assertGreater(lon_east, 72.0)
        self.assertLess(lon_west, 72.0)


if __name__ == "__main__":
    unittest.main()
