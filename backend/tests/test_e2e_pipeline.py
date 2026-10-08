import os
import sys
import unittest
import json
from pathlib import Path

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.database.engine import init_db, get_connection
from app.demo import run_demo

class TestE2EPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_complete_pipeline_execution(self):
        """
        Executes the entire 12-stage investigative pipeline end-to-end:
        scene generation -> preprocessing -> detection -> geometry -> environment ->
        hindcast -> origin -> AIS screening -> attribution -> forecast -> uncertainty -> report.
        """
        demo_results = run_demo(incident_id="OILTRACE-DEMO-001", verbose=False)

        # 1. Verification of incident ID and mode
        self.assertEqual(demo_results["incident_id"], "OILTRACE-DEMO-001")

        # 2. Verification of detection
        det = demo_results["detection"]
        self.assertIn("polygon_geojson", det)
        self.assertGreater(det["area_km2"], 0.0)
        self.assertGreater(det["perimeter_km"], 0.0)
        self.assertGreater(det["compactness"], 0.0)
        self.assertLessEqual(det["compactness"], 1.0)
        self.assertGreater(demo_results["detection_confidence"], 0.0)
        self.assertLessEqual(demo_results["detection_confidence"], 1.0)

        # 3. Verification of Lagrangian hindcast & origin estimation
        hc = demo_results["hindcast"]
        self.assertGreater(len(hc["particles"]), 0)
        self.assertIn("origin_region_geojson", hc)
        self.assertGreater(hc["spatial_uncertainty_km"], 0.0)
        self.assertAlmostEqual(hc["windage_coefficient"], 0.03, places=3)
        self.assertIn("origin_time_estimate", hc)

        # 4. Verification of AIS candidate screening and ranking
        ranked = demo_results["ranked_vessels"]
        self.assertGreaterEqual(len(ranked), 1)

        top_cand = demo_results["top_candidate"]
        self.assertIsNotNone(top_cand)
        self.assertIn("mmsi", top_cand)
        self.assertIn("final_score", top_cand)
        self.assertIn("evidence_score", top_cand)
        self.assertIn("data_confidence", top_cand)
        self.assertIn("explanation", top_cand)
        # Check that top candidate is indeed MT GULF PHOENIX
        self.assertEqual(top_cand["mmsi"], "419001234")
        self.assertGreater(top_cand["final_score"], 0.0)

        # Ensure explanation contains actual dynamic features
        explanation = top_cand["explanation"]
        self.assertIn(str(top_cand["mmsi"]), explanation)
        self.assertIn("attribution score", explanation)

        # 5. Verification of 48-hour forward forecast & uncertainty
        fc = demo_results["forecast"]
        self.assertGreater(len(fc["particles"]), 0)
        stats = fc["horizon_stats"]
        self.assertIn("+6h", stats)
        self.assertIn("+12h", stats)
        self.assertIn("+24h", stats)
        self.assertIn("+48h", stats)
        for h in ["+6h", "+12h", "+24h", "+48h"]:
            self.assertGreater(stats[h]["spread_km"], 0.0)
            self.assertGreater(stats[h]["confidence_pct"], 0.0)

        # 6. Verification of Forensic Investigation Report
        report_path = demo_results["report_file"]
        self.assertTrue(os.path.exists(report_path))
        with open(report_path, "r", encoding="utf-8") as f:
            html = f.read()
            self.assertIn("Forensic Maritime Investigation Report", html)
            self.assertIn("1. Incident Overview", html)
            self.assertIn("4. Spill Geometry", html)
            self.assertIn("7. Estimated Origin Region", html)
            self.assertIn("10. Attribution Evidence", html)
            self.assertIn("15. Legal & Investigative Disclaimer", html)
            self.assertIn("SIMULATION / DEMO DATA", html)

    def test_reproducibility_seed_26143(self):
        """
        Executing the simulation twice with seed 26143 must yield materially identical results.
        """
        run1 = run_demo(incident_id="OILTRACE-DEMO-001", verbose=False)
        run2 = run_demo(incident_id="OILTRACE-DEMO-001", verbose=False)

        self.assertAlmostEqual(run1["detection"]["area_km2"], run2["detection"]["area_km2"], places=3)
        self.assertAlmostEqual(run1["hindcast"]["origin_lat"], run2["hindcast"]["origin_lat"], places=4)
        self.assertAlmostEqual(run1["hindcast"]["origin_lon"], run2["hindcast"]["origin_lon"], places=4)
        self.assertAlmostEqual(run1["top_candidate"]["final_score"], run2["top_candidate"]["final_score"], places=4)

if __name__ == "__main__":
    unittest.main()
