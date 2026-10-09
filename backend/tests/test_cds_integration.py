import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app, seed_demo_data
from app.database.engine import init_db
from app.integrations.cds_service import cds_service


class TestCDSIntegration(unittest.TestCase):
    """
    Test suite for Copernicus Climate Data Store (CDS) ERA5 environmental data integration.
    """

    @classmethod
    def setUpClass(cls):
        init_db()
        seed_demo_data()
        cls.client = TestClient(app)

    def test_01_cds_service_netcdf_parsing(self):
        """Verify cds_service parses ERA5 NetCDF and returns expected schema and metrics."""
        res = cds_service.get_real_wind_field()
        self.assertIsNotNone(res)
        self.assertEqual(res["source"], "Copernicus Climate Data Store")
        self.assertEqual(res["dataset"], "ERA5 hourly reanalysis")
        self.assertEqual(res["status"], "LATEST AVAILABLE / REANALYSIS")
        self.assertEqual(res["provenance"], "OBSERVED")
        self.assertEqual(res["data_mode"], "real")
        self.assertIn("10m_u_component_of_wind", res["variables"])
        self.assertIn("10m_v_component_of_wind", res["variables"])
        self.assertGreater(len(res["points"]), 100)
        self.assertGreater(len(res["sample_vectors"]), 50)
        self.assertGreater(res["wind"]["mean_speed"], 0.0)
        self.assertGreater(res["wind"]["max_speed"], res["wind"]["mean_speed"])
        self.assertEqual(res["bounds"]["north"], 20.0)
        self.assertEqual(res["bounds"]["south"], 10.0)

    def test_02_api_environment_current_real_mode(self):
        """Verify GET /api/environment/current?field=wind returns real CDS ERA5 data with strict provenance."""
        response = self.client.get("/api/environment/current?field=wind&mode=real")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["source"], "Copernicus Climate Data Store")
        self.assertEqual(data["dataset"], "ERA5 hourly reanalysis")
        self.assertEqual(data["status"], "LATEST AVAILABLE / REANALYSIS")
        self.assertEqual(data["provenance"], "OBSERVED")
        self.assertEqual(data["data_mode"], "real")
        self.assertIn("variables", data)
        self.assertIn("bounds", data)
        self.assertIn("grid", data)
        self.assertIn("wind", data)
        self.assertIn("sample_vectors", data)
        self.assertNotIn("LIVE WIND", data.get("status", ""))

    def test_03_api_environment_current_simulation_mode(self):
        """Verify GET /api/environment/current?field=wind&mode=simulation preserves deterministic sim mode."""
        response = self.client.get("/api/environment/current?field=wind&mode=simulation")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["source"], "SYNTHETIC_ERA5_v1")
        self.assertEqual(data["provenance"], "SYNTHETIC")
        self.assertEqual(data["data_mode"], "simulation")

    def test_04_rk4_hindcast_with_real_wind(self):
        """Verify API in real mode rejects requests with insufficient/mismatched operational temporal coverage (HTTP 422)."""
        response = self.client.post("/api/spills/OILTRACE-DEMO-001/hindcast?mode=real")
        self.assertEqual(response.status_code, 422)
        err = response.json().get("detail", "")
        self.assertTrue("insufficient" in err or "coverage" in err or "snapshot" in err)

    def test_05_rk4_forecast_with_real_wind(self):
        """Verify API in real mode rejects requests with insufficient/mismatched operational temporal coverage (HTTP 422)."""
        response = self.client.post("/api/spills/OILTRACE-DEMO-001/forecast?mode=real")
        self.assertEqual(response.status_code, 422)
        err = response.json().get("detail", "")
        self.assertTrue("insufficient" in err or "coverage" in err or "snapshot" in err)

    def test_06_zero_credential_leakage(self):
        """Verify API response never leaks credentials, tokens or private keys."""
        response = self.client.get("/api/environment/current")
        text = response.text.lower()
        self.assertNotIn("cdsapirc", text)
        self.assertNotIn("secret", text)
        self.assertNotIn("api_key", text)
        self.assertNotIn("password", text)


if __name__ == "__main__":
    unittest.main()
