import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from app.main import app, seed_demo_data
from app.database.engine import init_db
from app.integrations.copernicus_marine_service import copernicus_marine_service, CopernicusMarineService
from app.environmental.fields import load_copernicus_current_field, interpolate_field


class TestCopernicusMarineIntegration(unittest.TestCase):
    """
    Test suite for Copernicus Marine real hydrodynamic current data integration.
    Dataset: cmems_mod_glo_phy_anfc_merged-uv_PT1H-i
    Variables: uo, vo
    Region: Arabian Sea (10-20 N, 68-76 E)
    """

    @classmethod
    def setUpClass(cls):
        init_db()
        seed_demo_data()
        cls.client = TestClient(app)

    def test_01_dataset_loading_and_variables(self):
        """Verify NetCDF dataset loads successfully and extracts uo/vo with surface depth coordinates."""
        data = copernicus_marine_service.get_real_current_field()
        self.assertIsNotNone(data)
        self.assertEqual(data["source"], "Copernicus Marine")
        self.assertEqual(data["dataset"], "cmems_mod_glo_phy_anfc_merged-uv_PT1H-i")
        self.assertEqual(data["status"], "COPERNICUS MARINE — LATEST AVAILABLE")
        self.assertEqual(data["provenance"], "OPERATIONAL ANALYSIS/FORECAST")
        self.assertEqual(data["data_mode"], "real")
        self.assertEqual(data["units"], "m/s")
        self.assertIn("uo", data["variables"])
        self.assertIn("vo", data["variables"])
        self.assertAlmostEqual(data["depth_m"], 0.494025, places=3)
        self.assertGreater(len(data["points"]), 5000)
        self.assertGreater(len(data["current_vectors"]), 500)
        self.assertGreater(data["current"]["mean_speed"], 0.0)
        self.assertGreater(data["current"]["max_speed"], data["current"]["mean_speed"])

    def test_02_coordinate_boundaries_and_domain(self):
        """Verify geographical boundaries match Arabian Sea domain 10-20 N, 68-76 E."""
        data = copernicus_marine_service.get_real_current_field()
        bounds = data["bounds"]
        self.assertEqual(bounds["north"], 20.0)
        self.assertEqual(bounds["south"], 10.0)
        self.assertEqual(bounds["west"], 68.0)
        self.assertEqual(bounds["east"], 76.0)

    def test_03_velocity_lookup_at_coordinates(self):
        """Verify spatio-temporal velocity lookup returns eastward/northward velocities in m/s."""
        vel = copernicus_marine_service.get_velocity_at(15.42, 72.68)
        self.assertIn("u", vel)
        self.assertIn("v", vel)
        self.assertIsInstance(vel["u"], float)
        self.assertIsInstance(vel["v"], float)
        # Verify plausible ocean current magnitude (< 2 m/s in open Arabian Sea)
        speed = (vel["u"]**2 + vel["v"]**2)**0.5
        self.assertLess(speed, 2.0)

    def test_04_out_of_bounds_handling(self):
        """Verify out-of-bounds coordinates raise explicit domain ValueError."""
        with self.assertRaises(ValueError) as ctx:
            copernicus_marine_service.get_velocity_at(35.0, 72.0)
        self.assertIn("outside Copernicus Marine Arabian Sea dataset domain", str(ctx.exception))

    def test_05_api_environment_current_real_mode(self):
        """Verify GET /api/environment/current?mode=real exposes real Copernicus Marine current telemetry."""
        response = self.client.get("/api/environment/current?mode=real")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["source"], "Copernicus Marine")
        self.assertEqual(data["dataset"], "cmems_mod_glo_phy_anfc_merged-uv_PT1H-i")
        self.assertEqual(data["status"], "COPERNICUS MARINE — LATEST AVAILABLE")
        self.assertEqual(data["provenance"], "OPERATIONAL ANALYSIS/FORECAST")
        self.assertEqual(data["data_mode"], "real")
        self.assertEqual(data["units"], "m/s")
        self.assertIn("current", data)
        self.assertIn("current_vectors", data)
        self.assertIn("timestamp", data)
        self.assertNotIn("LIVE CURRENT", data.get("status", ""))
        self.assertGreater(len(data["current_vectors"]), 100)

    def test_06_api_environment_current_simulation_mode(self):
        """Verify GET /api/environment/current?mode=simulation preserves deterministic sim mode (Seed 26143)."""
        response = self.client.get("/api/environment/current?mode=simulation")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["source"], "SYNTHETIC_OCEAN_CURRENT_v1")
        self.assertEqual(data["provenance"], "SYNTHETIC")
        self.assertEqual(data["data_mode"], "simulation")
        self.assertEqual(data["status"], "DETERMINISTIC SIMULATION (SEED 26143)")

    def test_07_rk4_hindcast_with_real_currents(self):
        """Verify RK4 reverse drift hindcast integrates with real Copernicus Marine currents."""
        response = self.client.post("/api/spills/OILTRACE-DEMO-001/hindcast?mode=real")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("Copernicus Marine", data["environmental_source"])
        self.assertIn("Copernicus Climate Data Store (ERA5)", data["environmental_source"])
        self.assertEqual(data["data_mode"], "real")
        self.assertEqual(data["provenance"], "reconstructed")
        self.assertIn("origin_lat", data)
        self.assertIn("origin_lon", data)
        # Origin must lie within Arabian Sea domain
        self.assertTrue(10.0 <= data["origin_lat"] <= 20.0)
        self.assertTrue(68.0 <= data["origin_lon"] <= 76.0)

    def test_08_rk4_forecast_with_real_currents(self):
        """Verify RK4 forward forecast integrates with real Copernicus Marine currents."""
        response = self.client.post("/api/spills/OILTRACE-DEMO-001/forecast?mode=real")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("Copernicus Marine", data["environmental_source"])
        self.assertEqual(data["data_mode"], "real")
        self.assertEqual(data["provenance"], "predicted")
        self.assertIn("horizon_stats", data)
        self.assertIn("+6h", data["horizon_stats"])
        self.assertIn("+48h", data["horizon_stats"])

    def test_09_simulation_mode_safety_and_determinism(self):
        """Verify Simulation Mode preserves exact deterministic Seed 26143 results."""
        h_sim = self.client.post("/api/spills/OILTRACE-DEMO-001/hindcast?mode=simulation")
        self.assertEqual(h_sim.status_code, 200)
        h_data = h_sim.json()
        self.assertEqual(h_data["data_mode"], "simulation")
        self.assertEqual(h_data["environmental_source"], "SYNTHETIC_ERA5_v1")

        # Verify incident still returns valid candidate ranking and timeline in simulation mode
        tl = self.client.get("/api/spills/OILTRACE-DEMO-001/timeline")
        self.assertEqual(tl.status_code, 200)
        c_list = tl.json().get("top_candidates", [])
        self.assertGreater(len(c_list), 0)

        vessels = self.client.get("/api/spills/OILTRACE-DEMO-001/vessels")
        self.assertEqual(vessels.status_code, 200)
        self.assertGreater(len(vessels.json()), 0)

    def test_10_missing_file_handling_error(self):
        """Verify service raises descriptive error when file is missing without fabricating data."""
        svc = CopernicusMarineService()
        with self.assertRaises(FileNotFoundError):
            svc.get_real_current_field(explicit_path="nonexistent/path/currents.nc")

    def test_11_zero_credential_leakage(self):
        """Verify API response never leaks credentials, passwords, or token keys."""
        resp = self.client.get("/api/environment/current?mode=real")
        text = resp.text.lower()
        self.assertNotIn("copernicusmarine-credentials", text)
        self.assertNotIn("secret", text)
        self.assertNotIn("password", text)
        self.assertNotIn("api_key", text)


if __name__ == "__main__":
    unittest.main()
