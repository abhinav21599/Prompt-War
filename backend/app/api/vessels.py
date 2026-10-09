from fastapi import APIRouter, HTTPException
from app.database.engine import get_connection, row_to_dict, parse_json, row_get

router = APIRouter(prefix="/api/vessels", tags=["vessels"])

@router.get("/")
def list_vessels():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM vessels").fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()

@router.get("/tracks")
def get_all_vessel_tracks(spill_id: str = None):
    conn = get_connection()
    try:
        if spill_id:
            from app.api.spills import _resolve_spill_id
            spill_id = _resolve_spill_id(spill_id, conn)
            rows = conn.execute("""
                SELECT vt.*, v.vessel_name, v.vessel_type, v.flag, v.length_m, v.gross_tonnage
                FROM vessel_tracks vt
                LEFT JOIN vessels v ON vt.mmsi=v.mmsi
                WHERE vt.spill_id=?
            """, (spill_id,)).fetchall()
            if not rows:
                rows = conn.execute("""
                    SELECT vt.*, v.vessel_name, v.vessel_type, v.flag, v.length_m, v.gross_tonnage
                    FROM vessel_tracks vt
                    LEFT JOIN vessels v ON vt.mmsi=v.mmsi
                """).fetchall()
        else:
            rows = conn.execute("""
                SELECT vt.*, v.vessel_name, v.vessel_type, v.flag, v.length_m, v.gross_tonnage
                FROM vessel_tracks vt
                LEFT JOIN vessels v ON vt.mmsi=v.mmsi
            """).fetchall()
        
        result = []
        for r in rows:
            d = row_to_dict(r)
            d["track_geojson"] = parse_json(d.get("track_geojson"))
            result.append(d)
        return result
    finally:
        conn.close()

@router.get("/{mmsi}")
def get_vessel(mmsi: str):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM vessels WHERE mmsi=?", (mmsi,)).fetchone()
        if not row:
            raise HTTPException(404, f"Vessel {mmsi} not found")
        return row_to_dict(row)
    finally:
        conn.close()

@router.get("/{mmsi}/track")
def get_vessel_track(mmsi: str, spill_id: str = None):
    conn = get_connection()
    try:
        if spill_id:
            from app.api.spills import _resolve_spill_id
            spill_id = _resolve_spill_id(spill_id, conn)
            row = conn.execute("SELECT * FROM vessel_tracks WHERE mmsi=? AND spill_id=?", (mmsi, spill_id)).fetchone()
            if not row:
                row = conn.execute("SELECT * FROM vessel_tracks WHERE mmsi=? ORDER BY start_time DESC LIMIT 1", (mmsi,)).fetchone()
        else:
            row = conn.execute("SELECT * FROM vessel_tracks WHERE mmsi=? ORDER BY start_time DESC LIMIT 1", (mmsi,)).fetchone()
        if not row:
            return {"mmsi": mmsi, "track_geojson": None, "message": "No track found"}
        d = row_to_dict(row)
        d["track_geojson"] = parse_json(d["track_geojson"])
        obs = conn.execute("SELECT * FROM ais_observations WHERE mmsi=? ORDER BY timestamp", (mmsi,)).fetchall()
        d["observations"] = [row_to_dict(o) for o in obs]
        return d
    finally:
        conn.close()

@router.get("/{mmsi}/attribution/{spill_id}")
def get_vessel_attribution(mmsi: str, spill_id: str):
    conn = get_connection()
    try:
        from app.api.spills import _resolve_spill_id
        resolved_spill_id = _resolve_spill_id(spill_id, conn)
        row = conn.execute("SELECT a.*, v.vessel_name, v.vessel_type, v.imo, v.flag FROM attributions a JOIN vessels v ON a.mmsi=v.mmsi WHERE a.mmsi=? AND a.spill_id=?", (mmsi, resolved_spill_id)).fetchone()
        if not row:
            row = conn.execute("SELECT a.*, v.vessel_name, v.vessel_type, v.imo, v.flag FROM attributions a JOIN vessels v ON a.mmsi=v.mmsi WHERE a.mmsi=? ORDER BY a.final_score DESC LIMIT 1", (mmsi,)).fetchone()
        if not row:
            raise HTTPException(404, "Attribution not found")
        d = row_to_dict(row)
        d["behaviour_observations"] = parse_json(d.get("behaviour_observations_json")) or []
        return d
    finally:
        conn.close()
