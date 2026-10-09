import sys
from pathlib import Path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.database.engine import get_connection, init_db


client = TestClient(app)

def test_alerts_lifecycle():
    init_db()
    # 1. List alerts
    res = client.get("/api/alerts")
    assert res.status_code == 200
    alerts = res.json()
    assert isinstance(alerts, list)

    conn = get_connection()
    spill_id = "TEST-ALERT-SPILL-01"
    alert_id = None
    try:
        now = datetime.now(timezone.utc).isoformat()
        # Create a parent oil_spill record for foreign key integrity
        conn.execute(
            """INSERT OR IGNORE INTO oil_spills
            (id, status, detected_class, data_mode, provenance, created_at, updated_at)
            VALUES (?, 'active', 'crude_oil_slick', 'real', 'OBSERVED_REAL_API', ?, ?)""",
            (spill_id, now, now),
        )
        conn.commit()

        # 2. Insert test alert directly
        from app.api.alerts import create_alert
        created = create_alert(
            conn,
            spill_id=spill_id,
            incident_name="Test Offshore Leak",
            alert_time=now,
            severity="critical",
            status="active",
            confidence=0.92,
            source_scene="S1A_TEST_SCENE",
            location_geojson={"type": "Point", "coordinates": [72.5, 15.2]},
            provenance="OBSERVED_REAL_API",
        )
        alert_id = created["id"]

        # 3. Retrieve alert details
        detail_res = client.get(f"/api/alerts/{alert_id}")
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert detail["id"] == alert_id
        assert detail["severity"] == "critical"
        assert detail["status"] == "active"
        assert detail["confidence"] == 0.92
        assert "spill" in detail

        # 4. Acknowledge alert
        ack_res = client.post(f"/api/alerts/{alert_id}/ack", json={"acknowledged_by": "test_operator"})
        assert ack_res.status_code == 200
        assert ack_res.json()["status"] == "success"

        # Verify status changed to acknowledged
        updated_res = client.get(f"/api/alerts/{alert_id}")
        assert updated_res.status_code == 200
        assert updated_res.json()["status"] == "acknowledged"
    finally:
        try:
            if alert_id:
                conn.execute("DELETE FROM alerts WHERE id = ? OR spill_id = ?", (alert_id, spill_id))
            conn.execute("DELETE FROM oil_spills WHERE id = ?", (spill_id,))
            conn.commit()
        except Exception:
            pass
        finally:
            conn.close()
