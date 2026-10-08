import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from app.database.engine import get_connection, row_to_dict, parse_json, dump_json
from app.providers.satellite import get_satellite_provider
from app.detection.detector import SpillDetector

class AlertService:
    """
    Automated Sentinel-1 Candidate Oil-Spill Alert Engine.
    Discovers new SAR acquisitions, executes inference, deduplicates, and manages alert lifecycles.
    """
    def __init__(self, default_threshold: float = 0.42):
        self.default_threshold = default_threshold

    def list_alerts(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_connection()
        try:
            if status:
                rows = conn.execute("SELECT * FROM alerts WHERE status=? ORDER BY acquisition_time DESC", (status,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM alerts ORDER BY acquisition_time DESC").fetchall()
            result = []
            for r in rows:
                d = row_to_dict(r)
                d["centroid_geojson"] = parse_json(d.get("centroid_geojson"))
                d["polygon_geojson"] = parse_json(d.get("polygon_geojson"))
                result.append(d)
            return result
        finally:
            conn.close()

    def poll_aoi_for_alerts(
        self,
        bbox: Optional[List[float]] = None,
        data_mode: str = "simulation",
        threshold: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """
        Polls configured AOI for newly acquired Sentinel-1 scenes and runs detection.
        Deduplicates candidate alerts against existing records.
        """
        aoi_bbox = bbox or [71.5, 14.5, 73.5, 16.5]
        th = threshold if threshold is not None else self.default_threshold
        provider = get_satellite_provider(data_mode)
        scenes = provider.discover_scenes(aoi_bbox)

        detector = SpillDetector(threshold=th)
        new_alerts = []
        now = datetime.now(timezone.utc).isoformat()

        conn = get_connection()
        try:
            for sc in scenes:
                scene_id = sc.get("id") or sc.get("scene_id")
                if not scene_id:
                    continue

                # Deduplicate: check if scene already processed
                existing = conn.execute("SELECT id FROM alerts WHERE scene_id=?", (scene_id,)).fetchone()
                if existing:
                    continue

                # Run detection on scene
                det_res = detector.predict(scene_id + ".tif")
                conf = det_res.get("confidence", 0.0)
                oil_pixels = det_res.get("oil_pixel_count", 0)

                # Detection criteria: confidence >= threshold and detected slick pixels > 0
                if conf >= th and oil_pixels > 0:
                    alert_id = f"ALT-{uuid.uuid4().hex[:8]}"
                    area = det_res.get("area_km2", 0.0)
                    severity = "high" if area > 5.0 else ("medium" if area > 1.0 else "low")
                    title = f"Candidate Oil-Spill Detection: {sc.get('name') or scene_id}"
                    prov = "operational_detection" if data_mode == "real" else "simulation_detection"

                    spill_id = f"INC-{scene_id[:18]}"
                    acq_time = sc.get("acquisition_time", now)

                    existing_spill = conn.execute("SELECT id FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
                    if not existing_spill:
                        conn.execute("""
                            INSERT INTO oil_spills (
                                id, incident_name, status, detected_class, detection_confidence,
                                area_km2, centroid_geojson, spill_polygon_geojson, detection_time,
                                satellite_acquisition_time, data_mode, provenance, model_version,
                                region_name, severity, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            spill_id, title, "candidate", "candidate_oil_spill", conf,
                            area, dump_json(det_res.get("centroid_geojson")),
                            dump_json(det_res.get("polygon_geojson")), acq_time, acq_time,
                            data_mode, prov, detector.model_version, "Offshore Sector",
                            severity, now, now
                        ))

                    conn.execute("""
                        INSERT INTO alerts (
                            id, spill_id, scene_id, title, status, severity, alert_time, acquisition_time,
                            detection_confidence, area_km2, centroid_geojson, polygon_geojson,
                            satellite_name, model_version, data_mode, provenance,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        alert_id, spill_id, scene_id, title, "new", severity, acq_time, acq_time,
                        conf, area, dump_json(det_res.get("centroid_geojson")),
                        dump_json(det_res.get("polygon_geojson")),
                        sc.get("satellite_name", "Sentinel-1A"),
                        detector.model_version, data_mode, prov, now, now
                    ))
                    conn.commit()

                    new_alerts.append({
                        "id": alert_id,
                        "scene_id": scene_id,
                        "title": title,
                        "status": "new",
                        "severity": severity,
                        "detection_confidence": conf,
                        "area_km2": area,
                        "acquisition_time": sc.get("acquisition_time", now),
                        "data_mode": data_mode,
                    })

            return new_alerts
        finally:
            conn.close()

    def investigate_alert(self, alert_id: str) -> Dict[str, Any]:
        """Promotes a candidate alert to an active oil spill investigation."""
        conn = get_connection()
        try:
            row = conn.execute("SELECT * FROM alerts WHERE id=?", (alert_id,)).fetchone()
            if not row:
                raise ValueError(f"Alert {alert_id} not found")
            alt = row_to_dict(row)
            now = datetime.now(timezone.utc).isoformat()

            # Create or reuse investigation incident in oil_spills
            spill_id = f"INC-{alt['scene_id'][:18]}"
            existing_spill = conn.execute("SELECT id FROM oil_spills WHERE id=?", (spill_id,)).fetchone()

            if not existing_spill:
                conn.execute("""
                    INSERT INTO oil_spills (
                        id, incident_name, status, detected_class, detection_confidence,
                        spill_polygon_geojson, centroid_geojson, area_km2, detection_time,
                        satellite_acquisition_time, data_mode, provenance, model_version,
                        region_name, severity, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    spill_id, alt["title"], "investigating", "candidate_oil_spill",
                    alt["detection_confidence"], alt["polygon_geojson"], alt["centroid_geojson"],
                    alt["area_km2"], now, alt["acquisition_time"], alt["data_mode"],
                    alt["provenance"], alt["model_version"], "Offshore Sector",
                    alt["severity"], now, now
                ))

            conn.execute("UPDATE alerts SET status='investigating', investigation_spill_id=?, updated_at=? WHERE id=?",
                         (spill_id, now, alert_id))
            conn.commit()

            return {
                "alert_id": alert_id,
                "status": "investigating",
                "spill_id": spill_id,
                "scene_id": alt["scene_id"],
            }
        finally:
            conn.close()

    def dismiss_alert(self, alert_id: str) -> Dict[str, Any]:
        """Dismisses a candidate alert as false alarm or non-actionable."""
        conn = get_connection()
        try:
            now = datetime.now(timezone.utc).isoformat()
            conn.execute("UPDATE alerts SET status='dismissed', updated_at=? WHERE id=?", (now, alert_id))
            conn.commit()
            return {"alert_id": alert_id, "status": "dismissed", "updated_at": now}
        finally:
            conn.close()

alert_service = AlertService()
