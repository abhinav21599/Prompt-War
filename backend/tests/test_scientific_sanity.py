import unittest
import math
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

    def test_forward_and_backward_uniform_reversibility(self):
        """Integrating forward and then backward in known uniform flow must return to origin."""
        current_data = {"field": "current", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.45, "current_v": 0.30}]}
        wind_data = {"field": "wind", "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 6.0, "wind_v": -4.0}]}
        alpha = 0.03

        # Forward 3 hours (3 x 3600s)
        f_lat, f_lon = self.lat, self.lon
        for _ in range(3):
            f_lat, f_lon = rk4_step(f_lat, f_lon, current_data, wind_data, windage_alpha=alpha, dt_s=3600.0, direction=1)

        self.assertNotEqual(f_lat, self.lat)
        self.assertNotEqual(f_lon, self.lon)

        # Backward 3 hours from reached position
        b_lat, b_lon = f_lat, f_lon
        for _ in range(3):
            b_lat, b_lon = rk4_step(b_lat, b_lon, current_data, wind_data, windage_alpha=alpha, dt_s=3600.0, direction=-1)

        self.assertAlmostEqual(b_lat, self.lat, places=5)
        self.assertAlmostEqual(b_lon, self.lon, places=5)

    def test_temporal_interpolation_between_environmental_slices(self):
        """Interpolation between multi-time slices must yield exact linear interpolation over time."""
        from app.environmental.fields import interpolate_field
        from datetime import datetime, timezone

        field_multi = {
            "field": "current",
            "time_slices": [
                {
                    "timestamp": "2026-09-13T00:00:00Z",
                    "points": [{"lat": 15.0, "lon": 72.0, "current_u": 1.0, "current_v": 0.5}],
                },
                {
                    "timestamp": "2026-09-13T02:00:00Z",
                    "points": [{"lat": 15.0, "lon": 72.0, "current_u": 3.0, "current_v": 1.5}],
                },
            ]
        }

        # Halfway point (01:00 UTC) -> u=2.0, v=1.0
        t_mid = datetime(2026, 9, 13, 1, 0, 0, tzinfo=timezone.utc)
        u_mid, v_mid = interpolate_field(15.0, 72.0, field_multi, target_time=t_mid)
        self.assertAlmostEqual(u_mid, 2.0, places=5)
        self.assertAlmostEqual(v_mid, 1.0, places=5)

        # 25% point (00:30 UTC) -> u=1.5, v=0.75
        t_quarter = datetime(2026, 9, 13, 0, 30, 0, tzinfo=timezone.utc)
        u_q, v_q = interpolate_field(15.0, 72.0, field_multi, target_time=t_quarter)
        self.assertAlmostEqual(u_q, 1.5, places=5)
        self.assertAlmostEqual(v_q, 0.75, places=5)

    def test_rk4_time_dependent_intermediate_stage_sampling(self):
        """RK4 solver must evaluate intermediate stages at corresponding intermediate timestamps."""
        from datetime import datetime, timezone
        from app.drift.particle_engine import rk4_step

        t0 = datetime(2026, 9, 13, 0, 0, 0, tzinfo=timezone.utc)
        # Flow accelerating linearly from 1.0 m/s at 00:00 to 2.0 m/s at 01:00
        cur_data = {
            "field": "current",
            "time_slices": [
                {"timestamp": "2026-09-13T00:00:00Z", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 1.0, "current_v": 0.0}]},
                {"timestamp": "2026-09-13T01:00:00Z", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 2.0, "current_v": 0.0}]},
            ]
        }
        wind_zero = {"field": "wind", "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 0.0, "wind_v": 0.0}]}

        # Forward integration over 1 hour (3600s)
        # Analytic average velocity for linear ramp u(t) = 1 + t/3600 is 1.5 m/s
        f_lat, f_lon = rk4_step(15.0, 72.0, cur_data, wind_zero, windage_alpha=0.0, dt_s=3600.0, direction=1, current_time=t0)

        # Expected displacement = 1.5 m/s * 3600s = 5400m
        expected_dlon = 5400.0 / (6371000.0 * math.cos(math.radians(15.0))) * (180.0 / math.pi)
        self.assertAlmostEqual(f_lat, 15.0, places=5)
        self.assertAlmostEqual(f_lon - 72.0, expected_dlon, places=5)

    def test_strict_temporal_coverage_rejection(self):
        """Strict temporal coverage validation must reject intervals outside dataset temporal extent."""
        from app.environmental.fields import validate_temporal_coverage
        from datetime import datetime, timezone

        field_limited = {
            "field": "current",
            "time_slices": [
                {"timestamp": "2026-09-13T00:00:00Z", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.2, "current_v": 0.1}]},
                {"timestamp": "2026-09-13T06:00:00Z", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.2, "current_v": 0.1}]},
            ]
        }

        # Request covering available period -> passes
        t_in_start = datetime(2026, 9, 13, 0, 0, 0, tzinfo=timezone.utc)
        t_in_end = datetime(2026, 9, 13, 6, 0, 0, tzinfo=timezone.utc)
        self.assertTrue(validate_temporal_coverage(field_limited, t_in_start, t_in_end, "currents"))

        # Request outside available period (e.g. 12h later) -> raises clear ValueError
        t_out_start = datetime(2026, 9, 13, 12, 0, 0, tzinfo=timezone.utc)
        t_out_end = datetime(2026, 9, 13, 18, 0, 0, tzinfo=timezone.utc)
        with self.assertRaises(ValueError) as ctx:
            validate_temporal_coverage(field_limited, t_out_start, t_out_end, "currents")
        self.assertIn("insufficient for requested interval", str(ctx.exception))

    def test_simulation_determinism_seed_26143(self):
        """Simulation mode runs must produce bitwise identical trajectories across repeated executions."""
        from app.drift.particle_engine import run_hindcast, run_forecast
        from datetime import datetime, timezone

        cur_sim = {"field": "current", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.18, "current_v": 0.12}]}
        wind_sim = {"field": "wind", "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 5.2, "wind_v": 3.8}]}
        t0 = datetime(2024, 3, 15, 6, 0, 0, tzinfo=timezone.utc)

        h1 = run_hindcast(15.42, 72.68, [], t0, cur_sim, wind_sim, seed=26143, data_mode="simulation")
        h2 = run_hindcast(15.42, 72.68, [], t0, cur_sim, wind_sim, seed=26143, data_mode="simulation")
        self.assertEqual(h1["origin_lat"], h2["origin_lat"])
        self.assertEqual(h1["origin_lon"], h2["origin_lon"])
        self.assertEqual(h1["particles"], h2["particles"])

        f1 = run_forecast(15.42, 72.68, [], t0, cur_sim, wind_sim, seed=26143, data_mode="simulation")
        f2 = run_forecast(15.42, 72.68, [], t0, cur_sim, wind_sim, seed=26143, data_mode="simulation")
        self.assertEqual(f1["particles"], f2["particles"])
        self.assertEqual(f1["horizon_stats"], f2["horizon_stats"])


    def test_single_snapshot_temporal_rule(self):
        """Single-snapshot dataset supports only zero-duration point requests at that exact timestamp."""
        from app.environmental.fields import validate_temporal_coverage
        from datetime import datetime, timezone

        snapshot_field = {
            "field": "wind",
            "timestamp": "2026-08-01T12:00:00Z",
            "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 5.0, "wind_v": 2.0}],
        }
        exact_time = datetime(2026, 8, 1, 12, 0, 0, tzinfo=timezone.utc)
        self.assertTrue(validate_temporal_coverage(snapshot_field, exact_time, exact_time, "wind"))

        # Non-zero interval must raise ValueError
        diff_end = datetime(2026, 8, 1, 18, 0, 0, tzinfo=timezone.utc)
        with self.assertRaises(ValueError) as ctx:
            validate_temporal_coverage(snapshot_field, exact_time, diff_end, "wind")
        self.assertIn("does not provide temporal coverage", str(ctx.exception))

        # Different point timestamp must raise ValueError
        other_time = datetime(2026, 8, 1, 14, 0, 0, tzinfo=timezone.utc)
        with self.assertRaises(ValueError) as ctx:
            validate_temporal_coverage(snapshot_field, other_time, other_time, "wind")
        self.assertIn("does not provide temporal coverage", str(ctx.exception))

    def test_real_mode_drift_rejection_on_insufficient_wind_coverage(self):
        """run_hindcast and run_forecast in real mode must reject insufficient temporal coverage."""
        from app.drift.particle_engine import run_hindcast, run_forecast
        from datetime import datetime, timezone

        cur_multi = {
            "field": "current",
            "data_mode": "real",
            "time_slices": [
                {"timestamp": "2026-09-13T00:00:00Z", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.2, "current_v": 0.1}]},
                {"timestamp": "2026-09-13T12:00:00Z", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.2, "current_v": 0.1}]},
            ],
            "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.2, "current_v": 0.1}],
        }
        wind_snapshot = {
            "field": "wind",
            "data_mode": "real",
            "timestamp": "2026-08-01T12:00:00Z",
            "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 5.0, "wind_v": 2.0}],
        }
        t0 = datetime(2026, 9, 13, 6, 0, 0, tzinfo=timezone.utc)

        # 6-hour hindcast requires wind coverage in [00:00, 06:00]; wind_snapshot is 2026-08-01
        with self.assertRaises(ValueError) as ctx:
            run_hindcast(15.0, 72.0, [], t0, cur_multi, wind_snapshot, hindcast_hours=6.0, data_mode="real")
        self.assertIn("does not provide temporal coverage", str(ctx.exception))

        # 6-hour forecast requires wind coverage in [06:00, 12:00]; wind_snapshot is 2026-08-01
        with self.assertRaises(ValueError) as ctx:
            run_forecast(15.0, 72.0, [], t0, cur_multi, wind_snapshot, forecast_hours=6.0, data_mode="real")
        self.assertIn("does not provide temporal coverage", str(ctx.exception))

        # Current coverage rejection when current field interval is insufficient
        cur_short = {
            "field": "current",
            "data_mode": "real",
            "time_slices": [
                {"timestamp": "2026-09-13T03:00:00Z", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.2, "current_v": 0.1}]},
                {"timestamp": "2026-09-13T06:00:00Z", "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.2, "current_v": 0.1}]},
            ],
            "points": [{"lat": 15.0, "lon": 72.0, "current_u": 0.2, "current_v": 0.1}],
        }
        wind_multi = {
            "field": "wind",
            "data_mode": "real",
            "time_slices": [
                {"timestamp": "2026-09-13T00:00:00Z", "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 5.0, "wind_v": 2.0}]},
                {"timestamp": "2026-09-13T06:00:00Z", "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 5.0, "wind_v": 2.0}]},
            ],
            "points": [{"lat": 15.0, "lon": 72.0, "wind_u": 5.0, "wind_v": 2.0}],
        }
        with self.assertRaises(ValueError) as ctx:
            run_hindcast(15.0, 72.0, [], t0, cur_short, wind_multi, hindcast_hours=6.0, data_mode="real")
        self.assertIn("Operational currents data coverage", str(ctx.exception))

    def test_api_real_mode_hindcast_insufficient_coverage_http_422(self):
        """API must return HTTP 422 when real-mode forcing lacks adequate temporal coverage."""
        from fastapi.testclient import TestClient
        from app.main import app, seed_demo_data
        from app.database.engine import init_db

        init_db()
        seed_demo_data()
        client = TestClient(app)

        # Demo incident OILTRACE-DEMO-001 has acquisition time in 2024-03-15
        # Operational Copernicus Marine data has timestamps in 2026-09-13
        # Requesting mode=real must return HTTP 422 with clear coverage explanation
        resp = client.post("/api/spills/OILTRACE-DEMO-001/hindcast?mode=real")
        self.assertEqual(resp.status_code, 422)
        err_msg = resp.json().get("detail", "")
        self.assertTrue("insufficient" in err_msg or "coverage" in err_msg or "snapshot" in err_msg)

    def test_api_real_mode_hindcast_without_stored_env_rows(self):
        """API real mode must load real environmental providers without requiring pre-stored DB environmental_fields rows."""
        from fastapi.testclient import TestClient
        from app.main import app
        from app.database.engine import init_db, get_connection
        import uuid

        init_db()
        client = TestClient(app)
        test_id = f"TEST-REAL-SPILL-{uuid.uuid4().hex[:6]}"
        conn = get_connection()
        try:
            conn.execute("""INSERT INTO oil_spills (
                id, incident_name, status, detected_class, detection_confidence,
                centroid_geojson, spill_polygon_geojson, satellite_acquisition_time,
                data_mode, provenance, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (
                test_id, "Test Incident", "confirmed", "oil_spill", 0.95,
                '{"type": "Point", "coordinates": [72.68, 15.42]}',
                '{"type": "Polygon", "coordinates": [[[72.67, 15.41], [72.69, 15.41], [72.69, 15.43], [72.67, 15.43], [72.67, 15.41]]]}',
                "2024-03-15T06:00:00Z", "real", "operational", "2024-03-15T06:00:00Z", "2024-03-15T06:00:00Z"
            ))
            conn.commit()
        finally:
            conn.close()

        # No rows exist in environmental_fields for test_id.
        # In real mode, it must reach provider temporal coverage validation and return 422 with coverage details (NOT 422 'Current data unavailable for this time/location').
        resp = client.post(f"/api/spills/{test_id}/hindcast?mode=real")
        self.assertEqual(resp.status_code, 422)
        err_msg = resp.json().get("detail", "")
        self.assertNotIn("Current data unavailable", err_msg)
        self.assertTrue("insufficient" in err_msg or "coverage" in err_msg or "snapshot" in err_msg)


if __name__ == "__main__":
    unittest.main()
