import math
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.ais.engine import mean_track_bearing, trajectory_filter
from app.attribution.scorer import compute_heading_score


class TestHeadingScoring(unittest.TestCase):
    def score(self, observations, u, v):
        return compute_heading_score(
            observations, current_u=u, current_v=v,
            wind_u=0.0, wind_v=0.0, alpha=0.0,
        )

    def test_circular_mean_does_not_average_359_and_1_as_south(self):
        track = [
            {"timestamp": "2026-01-01T00:00:00Z", "latitude": 0.0, "longitude": 0.0},
            {"timestamp": "2026-01-01T00:10:00Z", "latitude": 1.0, "longitude": -0.01745},
            {"timestamp": "2026-01-01T00:20:00Z", "latitude": 2.0, "longitude": 0.0},
        ]
        self.assertGreater(self.score(track, 0.0, 1.0), 0.99)
        bearing = mean_track_bearing(track)
        self.assertIsNotNone(bearing)
        self.assertLess(min(bearing, 360.0 - bearing), 2.0)

    def test_date_line_crossing_is_short_eastward_segment(self):
        track = [
            {"timestamp": "2026-01-01T00:00:00Z", "latitude": 0.0, "longitude": 179.9},
            {"timestamp": "2026-01-01T00:10:00Z", "latitude": 0.0, "longitude": -179.9},
        ]
        self.assertAlmostEqual(mean_track_bearing(track), 90.0, places=5)
        self.assertGreater(self.score(track, 1.0, 0.0), 0.99)

    def test_east_west_displacement_adjusts_for_latitude(self):
        track = [
            {"timestamp": "2026-01-01T00:00:00Z", "latitude": 60.0, "longitude": 0.0},
            {"timestamp": "2026-01-01T00:10:00Z", "latitude": 60.01, "longitude": 0.01},
        ]
        expected = math.degrees(math.atan2(
            math.radians(0.01) * math.cos(math.radians(60.005)),
            math.radians(0.01),
        ))
        self.assertAlmostEqual(mean_track_bearing(track), expected, places=4)
        angle = math.radians(expected)
        self.assertGreater(self.score(track, math.sin(angle), math.cos(angle)), 0.999)

    def test_zero_drift_vector_returns_neutral_score(self):
        northbound = [
            {"timestamp": "2026-01-01T00:00:00Z", "latitude": 0.0, "longitude": 0.0},
            {"timestamp": "2026-01-01T00:10:00Z", "latitude": 1.0, "longitude": 0.0},
        ]
        self.assertEqual(self.score(northbound, 0.0, 0.0), 0.5)

    def test_stationary_or_single_point_track_is_indeterminate(self):
        same = {"timestamp": "2026-01-01T00:00:00Z", "latitude": 12.0, "longitude": 70.0}
        self.assertIsNone(mean_track_bearing([same, {**same, "timestamp": "2026-01-01T00:10:00Z"}]))
        self.assertIsNone(mean_track_bearing([same]))
        self.assertEqual(self.score([same], 0.0, 1.0), 0.5)

    def test_trajectory_filter_keeps_date_line_track_when_eastward(self):
        track = [
            {"timestamp": "2026-01-01T00:00:00Z", "latitude": 0.0, "longitude": 179.9},
            {"timestamp": "2026-01-01T00:10:00Z", "latitude": 0.0, "longitude": -179.9},
        ]
        selected, stats = trajectory_filter(
            {"123456789": track}, origin_lat=0.0, origin_lon=180.0,
            spill_lat=0.0, spill_lon=180.0,
            current_u=1.0, current_v=0.0, wind_u=0.0, wind_v=0.0, alpha=0.0,
        )
        self.assertIn("123456789", selected)
        self.assertEqual(stats["removed_count"], 0)

    def test_trajectory_filter_does_not_reject_on_zero_environmental_vector(self):
        northbound = [
            {"timestamp": "2026-01-01T00:00:00Z", "latitude": 0.0, "longitude": 0.0},
            {"timestamp": "2026-01-01T00:10:00Z", "latitude": 1.0, "longitude": 0.0},
        ]
        selected, stats = trajectory_filter(
            {"123456789": northbound}, origin_lat=0.0, origin_lon=0.0,
            spill_lat=0.0, spill_lon=0.0,
            current_u=0.0, current_v=0.0, wind_u=0.0, wind_v=0.0, alpha=0.0,
        )
        self.assertIn("123456789", selected)
        self.assertEqual(stats["indeterminate_count"], 1)


if __name__ == "__main__":
    unittest.main()
