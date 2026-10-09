import unittest
import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from app.main import app, seed_demo_data
from app.database.engine import init_db, get_connection

class TestDemoPreviewAndWorkflows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        seed_demo_data()
        cls.client = TestClient(app)

    def test_all_three_incidents_present_with_distinct_regional_coordinates(self):
        resp = self.client.get("/api/spills/")
        self.assertEqual(resp.status_code, 200)
        spills = resp.json()
        self.assertGreaterEqual(len(spills), 3)

        spill_dict = {s["id"]: s for s in spills}
        self.assertIn("OILTRACE-DEMO-001", spill_dict)
        self.assertIn("OILTRACE-DEMO-002", spill_dict)
        self.assertIn("OILTRACE-DEMO-003", spill_dict)

        # Goa, Kutch, Lakshadweep coordinates check
        goa = spill_dict["OILTRACE-DEMO-001"]
        kutch = spill_dict["OILTRACE-DEMO-002"]
        lak = spill_dict["OILTRACE-DEMO-003"]

        self.assertIn("Goa", goa.get("region_name", ""))
        self.assertIn("Kutch", kutch.get("region_name", ""))
        self.assertIn("Lakshadweep", lak.get("region_name", ""))

        goa_lon = goa["centroid_geojson"]["coordinates"][0]
        goa_lat = goa["centroid_geojson"]["coordinates"][1]
        kutch_lon = kutch["centroid_geojson"]["coordinates"][0]
        kutch_lat = kutch["centroid_geojson"]["coordinates"][1]
        lak_lon = lak["centroid_geojson"]["coordinates"][0]
        lak_lat = lak["centroid_geojson"]["coordinates"][1]

        # Distinct locations
        self.assertNotEqual(goa_lon, kutch_lon)
        self.assertNotEqual(goa_lon, lak_lon)
        self.assertNotEqual(kutch_lon, lak_lon)

        # Region coordinate bounds
        self.assertTrue(72.0 <= goa_lon <= 74.5 and 14.5 <= goa_lat <= 16.5)
        self.assertTrue(68.0 <= kutch_lon <= 70.5 and 22.0 <= kutch_lat <= 23.5)
        self.assertTrue(71.0 <= lak_lon <= 73.5 and 10.0 <= lak_lat <= 11.5)

        # Provenance check
        for s in [goa, kutch, lak]:
            self.assertEqual(s["data_mode"], "simulation")
            self.assertEqual(s["provenance"], "synthetic")

    def test_idempotent_seeding(self):
        # Call seeding multiple times
        seed_demo_data()
        seed_demo_data()
        resp = self.client.get("/api/spills/")
        self.assertEqual(resp.status_code, 200)
        spills = resp.json()
        ids = [s["id"] for s in spills if s["id"].startswith("OILTRACE-DEMO-")]
        self.assertEqual(len(ids), 3)

    def test_no_full_analysis_on_get_requests(self):
        # Patch _execute_full_analysis in spills module to ensure it is never called on GET routes
        with patch("app.api.spills._execute_full_analysis") as mock_spills_full:
            for inc_id in ["OILTRACE-DEMO-001", "OILTRACE-DEMO-002", "OILTRACE-DEMO-003"]:
                r1 = self.client.get(f"/api/spills/{inc_id}")
                self.assertEqual(r1.status_code, 200)

                r2 = self.client.get(f"/api/spills/{inc_id}/hindcast")
                self.assertEqual(r2.status_code, 200)

                r3 = self.client.get(f"/api/spills/{inc_id}/forecast")
                self.assertEqual(r3.status_code, 200)

                r4 = self.client.get(f"/api/attribution/{inc_id}")
                self.assertEqual(r4.status_code, 200)

                r5 = self.client.get(f"/api/spills/{inc_id}/vessels")
                self.assertEqual(r5.status_code, 200)

                r6 = self.client.get(f"/api/reports/{inc_id}")
                self.assertEqual(r6.status_code, 200)

                r7 = self.client.get(f"/api/vessels/tracks?spill_id={inc_id}")
                self.assertEqual(r7.status_code, 200)

            mock_spills_full.assert_not_called()

    def test_presence_of_preview_records_for_each_workflow(self):
        for inc_id in ["OILTRACE-DEMO-001", "OILTRACE-DEMO-002", "OILTRACE-DEMO-003"]:
            # 1. Hindcast preview
            h_resp = self.client.get(f"/api/spills/{inc_id}/hindcast")
            self.assertEqual(h_resp.status_code, 200)
            h_data = h_resp.json()
            self.assertIn("particles", h_data)
            self.assertGreaterEqual(len(h_data["particles"]), 10)
            self.assertIn("origin_region_geojson", h_data)
            self.assertEqual(h_data.get("provenance"), "synthetic")

            # 2. Forecast preview
            f_resp = self.client.get(f"/api/spills/{inc_id}/forecast")
            self.assertEqual(f_resp.status_code, 200)
            f_data = f_resp.json()
            self.assertIn("particles", f_data)
            self.assertGreaterEqual(len(f_data["particles"]), 10)
            self.assertEqual(f_data.get("provenance"), "synthetic")

            # 3. Attribution preview
            a_resp = self.client.get(f"/api/attribution/{inc_id}")
            self.assertEqual(a_resp.status_code, 200)
            a_data = a_resp.json()
            candidates = a_data.get("candidates") or a_data.get("vessels")
            self.assertIsNotNone(candidates)
            self.assertGreaterEqual(len(candidates), 3)
            self.assertIn("factors", candidates[0])
            self.assertIn("final_score", candidates[0])

            # 4. Vessel tracks
            t_resp = self.client.get(f"/api/vessels/tracks?spill_id={inc_id}")
            self.assertEqual(t_resp.status_code, 200)
            tracks = t_resp.json()
            self.assertGreaterEqual(len(tracks), 3)
            self.assertIn("track_geojson", tracks[0])

            # 5. Reports preview
            rep_resp = self.client.get(f"/api/reports/{inc_id}")
            self.assertEqual(rep_resp.status_code, 200)
            rep_data = rep_resp.json()
            self.assertEqual(rep_data["spill_id"], inc_id)
            self.assertIn("sections", rep_data)
            self.assertIn("1_incident_overview", rep_data["sections"])
            self.assertIn("10_attribution_evidence", rep_data["sections"])

            # 6. Report HTML preview
            html_resp = self.client.get(f"/api/reports/{inc_id}/html")
            self.assertEqual(html_resp.status_code, 200)
            self.assertIn("text/html", html_resp.headers.get("content-type", ""))

    def test_sar_scene_detection_endpoint(self):
        # Scenes list
        s_resp = self.client.get("/api/scenes")
        self.assertEqual(s_resp.status_code, 200)
        scenes = s_resp.json()
        self.assertGreaterEqual(len(scenes), 3)

        scene_id = scenes[0]["id"]
        # Scene detect action
        det_resp = self.client.post("/api/scenes/detect", json={"scene_id": scene_id, "threshold": 0.42})
        self.assertEqual(det_resp.status_code, 200)
        det_data = det_resp.json()
        self.assertEqual(det_data["status"], "success")
        self.assertIn("spill_id", det_data)
        self.assertIn("confidence", det_data)

    def test_report_generation_without_full_solver(self):
        with patch("app.api.spills._execute_full_analysis") as mock_full:
            resp = self.client.post("/api/reports/OILTRACE-DEMO-001/generate")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("report_id", data)
            mock_full.assert_not_called()

    def test_alerts_list_and_acknowledgement(self):
        resp = self.client.get("/api/alerts")
        self.assertEqual(resp.status_code, 200)
        alerts = resp.json()
        self.assertGreaterEqual(len(alerts), 1)

        alert_id = alerts[0]["id"]
        ack_resp = self.client.post(f"/api/alerts/{alert_id}/acknowledge", json={"acknowledged_by": "test_operator"})
        self.assertEqual(ack_resp.status_code, 200)
        self.assertEqual(ack_resp.json()["status"], "success")

    def test_dashboard_stats(self):
        resp = self.client.get("/api/dashboard/stats")
        self.assertEqual(resp.status_code, 200)
        stats = resp.json()
        self.assertIn("active_incidents", stats)
        self.assertIn("analyzed_vessels", stats)
        self.assertIn("high_priority_cases", stats)
        self.assertGreaterEqual(stats["active_incidents"], 3)
