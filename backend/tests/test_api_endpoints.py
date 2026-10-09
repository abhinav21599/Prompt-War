import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from app.main import app, seed_demo_data
from app.database.engine import init_db

class TestApiEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        seed_demo_data()
        cls.client = TestClient(app)

    def test_01_health_check(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["data_mode"], "simulation")
        services = data["services"]
        self.assertEqual(services["database"], "online")
        self.assertEqual(services["detection"], "precomputed_demo")
        self.assertEqual(services["environment"], "synthetic")
        self.assertEqual(services["AIS"], "synthetic")
        self.assertEqual(services["drift"], "online")
        self.assertEqual(services["attribution"], "online")

    def test_02_seed_verification(self):
        resp = self.client.get("/api/spills")
        self.assertEqual(resp.status_code, 200)
        spills = resp.json()
        self.assertGreaterEqual(len(spills), 1)
        spill_ids = [s["id"] for s in spills]
        self.assertIn("OILTRACE-DEMO-001", spill_ids)

    def test_03_detection_labels(self):
        resp = self.client.get("/api/spills/OILTRACE-DEMO-001")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["data_mode"], "simulation")
        self.assertEqual(data["provenance"], "synthetic")
        self.assertGreaterEqual(data["detection_confidence"], 0.8)

    def test_04_geometry_units(self):
        resp = self.client.get("/api/spills/OILTRACE-DEMO-001")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        area = data["area_km2"]
        self.assertGreater(area, 0.0)
        self.assertLess(area, 1000.0)
        self.assertIn("perimeter_km", data)

    def test_05_hindcast_uncertainty(self):
        # Run hindcast first
        post_resp = self.client.post("/api/spills/OILTRACE-DEMO-001/hindcast")
        self.assertEqual(post_resp.status_code, 200)
        get_resp = self.client.get("/api/spills/OILTRACE-DEMO-001/hindcast")
        self.assertEqual(get_resp.status_code, 200)
        data = get_resp.json()
        self.assertGreater(data["spatial_uncertainty_km"], 0.0)
        self.assertIn("origin_region_geojson", data)

    def test_06_attribution_explainability(self):
        # Run analyze
        analyze_resp = self.client.post("/api/spills/OILTRACE-DEMO-001/analyze")
        self.assertEqual(analyze_resp.status_code, 200)
        
        vessels_resp = self.client.get("/api/spills/OILTRACE-DEMO-001/vessels")
        self.assertEqual(vessels_resp.status_code, 200)
        vessels = vessels_resp.json()
        self.assertGreaterEqual(len(vessels), 1)
        v0 = vessels[0]
        self.assertIn("evidence_score", v0)
        self.assertIn("data_confidence", v0)
        self.assertIn("final_score", v0)
        self.assertIn("factors", v0)
        self.assertGreaterEqual(len(v0["factors"]), 5)

    def test_07_determinism(self):
        # Run 1
        resp1 = self.client.post("/api/spills/OILTRACE-DEMO-001/analyze")
        self.assertEqual(resp1.status_code, 200)
        spill_id = resp1.json()["spill_id"]
        res1 = self.client.get(f"/api/spills/{spill_id}/analysis/{spill_id}").json()
        scores1 = [item["final_score"] for item in res1]

        # Run 2
        resp2 = self.client.post("/api/spills/OILTRACE-DEMO-001/analyze")
        self.assertEqual(resp2.status_code, 200)
        res2 = self.client.get(f"/api/spills/{spill_id}/analysis/{spill_id}").json()
        scores2 = [item["final_score"] for item in res2]

        self.assertEqual(scores1, scores2)
        self.assertGreater(len(scores1), 0)

    def test_08_error_handling(self):
        # Non-existent spill should return explicit 404
        resp = self.client.get("/api/spills/NON-EXISTENT-ID/image")
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.json()["detail"], "Satellite image unavailable.")

    def test_09_multiple_incidents_and_idempotence(self):
        # Repeated seeding must be idempotent
        seed_demo_data()
        seed_demo_data()

        resp = self.client.get("/api/spills")
        self.assertEqual(resp.status_code, 200)
        spills = resp.json()
        spill_ids = [s["id"] for s in spills]

        # Verify 3 distinct demo incidents
        self.assertIn("OILTRACE-DEMO-001", spill_ids)
        self.assertIn("OILTRACE-DEMO-002", spill_ids)
        self.assertIn("OILTRACE-DEMO-003", spill_ids)

        # Verify no duplicate IDs
        self.assertEqual(len(spill_ids), len(set(spill_ids)))

        # Verify each incident has simulation and synthetic labelling
        for s in spills:
            if s["id"].startswith("OILTRACE-DEMO-"):
                self.assertEqual(s["data_mode"], "simulation")
                self.assertEqual(s["provenance"], "synthetic")
                self.assertIsNotNone(s.get("centroid_geojson"))

        # Verify individual incidents are queryable
        for inc_id in ["OILTRACE-DEMO-001", "OILTRACE-DEMO-002", "OILTRACE-DEMO-003"]:
            r = self.client.get(f"/api/spills/{inc_id}")
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()["id"], inc_id)


if __name__ == "__main__":
    unittest.main()
