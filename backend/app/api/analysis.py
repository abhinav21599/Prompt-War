from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
from app.services.analysis_service import analysis_service
from app.database.engine import get_connection, row_to_dict, parse_json

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

@router.post("")
@router.post("/")
def trigger_analysis(payload: Optional[Dict[str, Any]] = None):
    p = payload or {}
    spill_id = p.get("spill_id", "OILTRACE-DEMO-001")
    data_mode = p.get("data_mode", "simulation")
    try:
        result = analysis_service.run_pipeline(spill_id=spill_id, data_mode=data_mode)
        return result
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@router.get("")
@router.get("/")
def list_analysis_runs():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM analysis_runs ORDER BY started_at DESC").fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()

@router.get("/{run_id}")
def get_analysis_run(run_id: str):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM analysis_runs WHERE id=?", (run_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Analysis run {run_id} not found")
        d = row_to_dict(row)
        d["scoring_config_json"] = parse_json(d.get("scoring_config_json"))
        return d
    finally:
        conn.close()

@router.get("/{run_id}/audit")
def get_run_audit_logs(run_id: str):
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM audit_log WHERE analysis_run_id=? ORDER BY timestamp", (run_id,)).fetchall()
        result = []
        for r in rows:
            d = row_to_dict(r)
            d["event_data_json"] = parse_json(d.get("event_data_json"))
            result.append(d)
        return result
    finally:
        conn.close()
