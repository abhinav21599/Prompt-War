import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.database.engine import get_connection, row_to_dict, parse_json, dump_json

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class AlertAckPayload(BaseModel):
    acknowledged_by: Optional[str] = "operator"


def create_alert(
    conn,
    spill_id: str,
    incident_name: str,
    alert_time: str,
    severity: str = "high",
    status: str = "active",
    confidence: float = 0.85,
    source_scene: Optional[str] = None,
    location_geojson: Optional[Any] = None,
    provenance: str = "OBSERVED_REAL_API",
    pipeline_run_id: Optional[str] = None,
) -> Dict[str, Any]:
    alert_id = f"ALT-{uuid.uuid4().hex[:8].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    loc_str = dump_json(location_geojson) if isinstance(location_geojson, (dict, list)) else location_geojson

    conn.execute(
        """INSERT INTO alerts
        (id, spill_id, incident_name, alert_time, severity, status, confidence,
         source_scene, location_geojson, provenance, pipeline_run_id, acknowledged_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)""",
        (
            alert_id,
            spill_id,
            incident_name,
            alert_time,
            severity,
            status,
            confidence,
            source_scene,
            loc_str,
            provenance,
            pipeline_run_id,
            now,
        ),
    )
    conn.commit()
    return {
        "id": alert_id,
        "spill_id": spill_id,
        "incident_name": incident_name,
        "alert_time": alert_time,
        "severity": severity,
        "status": status,
        "confidence": confidence,
        "source_scene": source_scene,
        "location_geojson": parse_json(loc_str),
        "provenance": provenance,
        "pipeline_run_id": pipeline_run_id,
        "created_at": now,
    }


@router.get("")
@router.get("/")
def list_alerts(
    status: Optional[str] = Query(None, description="Filter by status: active, acknowledged, resolved"),
    limit: int = Query(50, ge=1, le=200),
):
    conn = get_connection()
    try:
        if status:
            rows = conn.execute(
                "SELECT * FROM alerts WHERE status=? ORDER BY created_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()

        alerts = []
        for r in rows:
            d = row_to_dict(r)
            d["location_geojson"] = parse_json(d.get("location_geojson"))
            alerts.append(d)
        return alerts
    finally:
        conn.close()


@router.get("/{alert_id}")
def get_alert_detail(alert_id: str):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM alerts WHERE id=?", (alert_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"Alert {alert_id} not found.")
        d = row_to_dict(row)
        d["location_geojson"] = parse_json(d.get("location_geojson"))

        # Link spill info if available
        spill_row = conn.execute("SELECT * FROM oil_spills WHERE id=?", (d["spill_id"],)).fetchone()
        if spill_row:
            sp = row_to_dict(spill_row)
            d["spill"] = {
                "id": sp["id"],
                "incident_name": sp.get("incident_name"),
                "status": sp.get("status"),
                "area_km2": sp.get("area_km2"),
                "detection_time": sp.get("detection_time"),
                "centroid_geojson": parse_json(sp.get("centroid_geojson")),
                "spill_polygon_geojson": parse_json(sp.get("spill_polygon_geojson")),
            }
        return d
    finally:
        conn.close()


@router.post("/{alert_id}/ack")
@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str, payload: Optional[AlertAckPayload] = None):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM alerts WHERE id=?", (alert_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"Alert {alert_id} not found.")

        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE alerts SET status='acknowledged', acknowledged_at=? WHERE id=?",
            (now, alert_id),
        )
        conn.commit()
        return {"status": "success", "alert_id": alert_id, "acknowledged_at": now}
    finally:
        conn.close()
