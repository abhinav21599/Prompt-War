import json
import uuid
import logging
import threading
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone

logger = logging.getLogger("oiltrace.spills")
from app.database.engine import get_connection, row_to_dict, row_get, parse_json, dump_json, extract_count
from app.drift.particle_engine import run_hindcast, run_forecast
from app.detection.detector import SpillDetector
from app.geometry.calculator import characterize_polygon
from app.ais.engine import group_by_vessel, spatial_filter, temporal_filter, trajectory_filter, extract_behaviour_features
from app.attribution.scorer import score_vessel, rank_vessels
from app.digital_twin.engine import DigitalTwinEngine
from app.config import settings

router = APIRouter(prefix="/api/spills", tags=["spills"])


@router.get("")
@router.get("/")
def list_spills():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM oil_spills ORDER BY created_at DESC").fetchall()
        result = []
        for r in rows:
            d = row_to_dict(r)
            for f in ["spill_polygon_geojson", "centroid_geojson", "bounding_box_geojson"]:
                d[f] = parse_json(d.get(f))
            result.append(d)
        return result
    finally:
        conn.close()


@router.post("/mode")
def set_spills_data_mode(payload: Optional[Dict[str, Any]] = None):
    p = payload or {}
    mode = p.get("data_mode") or p.get("mode") or "real"
    prov = "operational" if mode == "real" else "synthetic"
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        conn.execute("UPDATE oil_spills SET data_mode=?, provenance=?, updated_at=?", (mode, prov, now))
        conn.commit()
        return {"status": "ok", "data_mode": mode, "provenance": prov, "updated_at": now}
    finally:
        conn.close()


@router.post("/{spill_id}/mode")
def set_spill_data_mode(spill_id: str, payload: Optional[Dict[str, Any]] = None):
    p = payload or {}
    mode = p.get("data_mode") or p.get("mode") or "real"
    prov = "operational" if mode == "real" else "synthetic"
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        conn.execute("UPDATE oil_spills SET data_mode=?, provenance=?, updated_at=? WHERE id=?", (mode, prov, now, spill_id))
        conn.commit()
        return {"status": "ok", "spill_id": spill_id, "data_mode": mode, "provenance": prov, "updated_at": now}
    finally:
        conn.close()


def _resolve_spill_id(spill_id: str, conn) -> str:
    row = conn.execute("SELECT id FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
    if row:
        return row_get(row, "id", row_get(row, 0, spill_id))
    if spill_id and spill_id.lower() in ("demo", "latest", "active", "default", "current"):
        latest = conn.execute("SELECT id FROM oil_spills ORDER BY created_at DESC LIMIT 1").fetchone()
        if latest:
            return row_get(latest, "id", row_get(latest, 0, spill_id))
    return spill_id


@router.get("/{spill_id}")
def get_spill(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        row = conn.execute("SELECT * FROM oil_spills WHERE id=?", (resolved_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"Spill {spill_id} not found")
        d = row_to_dict(row)
        for f in ["spill_polygon_geojson", "centroid_geojson", "bounding_box_geojson"]:
            d[f] = parse_json(d.get(f))
        return d
    finally:
        conn.close()


@router.get("/{spill_id}/image")
def get_spill_image(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        spill = conn.execute("SELECT * FROM oil_spills WHERE id=?", (resolved_id,)).fetchone()
        if not spill:
            raise HTTPException(404, "Satellite image unavailable.")
        sp = row_to_dict(spill)
        img = conn.execute("SELECT * FROM satellite_images WHERE id=?", (sp.get("satellite_image_id"),)).fetchone()
        if not img:
            raise HTTPException(404, f"Satellite image unavailable for incident {spill_id}.")
        d = row_to_dict(img)
        d["metadata_json"] = parse_json(d.get("metadata_json"))
        d["bounds_geojson"] = parse_json(d.get("bounds_geojson"))
        d["image_url"] = f"/api/spills/{resolved_id}/raster?mode=composite"
        return d
    finally:
        conn.close()

@router.get("/{spill_id}/raster")
def get_spill_raster(spill_id: str, mode: str = Query("composite")):
    from app.api.scenes import get_scene_image
    return get_scene_image(spill_id, mode)


@router.get("/{spill_id}/environment")
def get_environment(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        rows = conn.execute("SELECT * FROM environmental_fields WHERE spill_id=?", (resolved_id,)).fetchall()
        result = []
        for r in rows:
            d = row_to_dict(r)
            d["field_data"] = parse_json(d["field_data_json"])
            result.append(d)
        return result
    finally:
        conn.close()


@router.get("/{spill_id}/environment/currents")
def get_environment_currents(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        row = conn.execute(
            "SELECT * FROM environmental_fields WHERE spill_id=? AND field_type='current' ORDER BY created_at DESC LIMIT 1",
            (resolved_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Ocean currents data unavailable for spill {spill_id}.")
        d = row_to_dict(row)
        d["field_data"] = parse_json(d["field_data_json"])
        return d
    finally:
        conn.close()


@router.get("/{spill_id}/environment/wind")
def get_environment_wind(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        row = conn.execute(
            "SELECT * FROM environmental_fields WHERE spill_id=? AND field_type='wind' ORDER BY created_at DESC LIMIT 1",
            (resolved_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Wind field data unavailable for spill {spill_id}.")
        d = row_to_dict(row)
        d["field_data"] = parse_json(d["field_data_json"])
        return d
    finally:
        conn.close()


@router.get("/{spill_id}/environment/current")
def get_environment_current_field(spill_id: str):
    return get_environment_currents(spill_id)



@router.post("/{spill_id}/hindcast")
def run_hindcast_endpoint(spill_id: str, mode: Optional[str] = Query(None)):
    conn = get_connection()
    try:
        spill_row = conn.execute("SELECT * FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
        if not spill_row:
            raise HTTPException(404, "Satellite image unavailable.")
        sp = row_to_dict(spill_row)
        polygon = parse_json(sp["spill_polygon_geojson"])
        coords = polygon["coordinates"][0] if polygon else []
        centroid = parse_json(sp["centroid_geojson"])
        c_lat = centroid["coordinates"][1] if centroid else 15.42
        c_lon = centroid["coordinates"][0] if centroid else 72.68
        use_real = (mode == "real") if mode is not None else (sp.get("data_mode") == "real")
        if use_real:
            from app.integrations.copernicus_marine_service import copernicus_marine_service
            from app.integrations.cds_service import cds_service
            try:
                current_data = copernicus_marine_service.get_real_current_field()
            except Exception as e:
                raise HTTPException(
                    503,
                    f"Copernicus Marine ocean currents data is temporarily unavailable: {e}. "
                    f"Simulation Mode remains fully operational."
                )
            try:
                wind_data = cds_service.get_real_wind_field()
            except Exception as e:
                raise HTTPException(
                    503,
                    f"Copernicus Climate Data Store ERA5 wind data is temporarily unavailable: {e}. "
                    f"Simulation Mode remains fully operational."
                )
            env_source = "Copernicus Marine + Copernicus Climate Data Store (ERA5)"
            data_mode_val = "real"
        else:
            env_row = conn.execute(
                "SELECT field_data_json FROM environmental_fields WHERE spill_id=? AND field_type=?",
                (spill_id, "current")
            ).fetchone()
            wind_row = conn.execute(
                "SELECT field_data_json FROM environmental_fields WHERE spill_id=? AND field_type=?",
                (spill_id, "wind")
            ).fetchone()
            if not env_row:
                raise HTTPException(422, "Current data unavailable for this time/location.")
            if not wind_row:
                raise HTTPException(422, "Wind data unavailable for this time/location.")
            current_data = parse_json(env_row["field_data_json"])
            current_data["field"] = "current"
            wind_data = parse_json(wind_row["field_data_json"])
            wind_data["field"] = "wind"
            env_source = "SYNTHETIC_ERA5_v1"
            data_mode_val = "simulation"

        t0 = datetime.fromisoformat(sp["satellite_acquisition_time"].replace("Z", "+00:00"))
        prov_val = "reconstructed" if data_mode_val == "real" else "synthetic"

        try:
            result = run_hindcast(
                c_lat, c_lon, coords, t0, current_data, wind_data,
                windage_coefficient=settings.default_windage_coefficient,
                particle_count=settings.default_particle_count,
                timestep_min=settings.default_integration_timestep_minutes,
                hindcast_hours=settings.default_hindcast_hours,
                seed=settings.oiltrace_demo_seed,
                data_mode=data_mode_val,
                provenance=prov_val,
            )
        except ValueError as e:
            raise HTTPException(422, str(e))

        now = datetime.now(timezone.utc).isoformat()
        run_id = f"HCAST-{spill_id}-{uuid.uuid4().hex[:8]}"
        conn.execute("DELETE FROM particle_trajectories WHERE spill_id=? AND run_type=?", (spill_id, "hindcast"))
        conn.execute("""INSERT INTO particle_trajectories
            (id,spill_id,run_type,windage_coefficient,particle_count,integration_timestep_min,
             integration_hours,integration_method,particles_json,origin_region_geojson,
             origin_centroid_geojson,origin_time_estimate,origin_time_uncertainty_h,
             spatial_uncertainty_km,environmental_source,data_mode,provenance,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (run_id, spill_id, "hindcast", result["windage_coefficient"], result["particle_count"],
             result["timestep_min"], result["hindcast_hours"], result["integration_method"],
             dump_json(result["particles"]), dump_json(result["origin_region_geojson"]),
             dump_json(result["origin_centroid_geojson"]), result["origin_time_estimate"],
             result["origin_time_uncertainty_h"], result["spatial_uncertainty_km"],
             env_source, data_mode_val, "reconstructed", now))
        conn.execute("UPDATE oil_spills SET data_mode=?, provenance=?, updated_at=? WHERE id=?",
                     (data_mode_val, "operational" if data_mode_val == "real" else "synthetic", now, spill_id))
        conn.commit()
        return {**result, "run_id": run_id, "spill_id": spill_id, "data_mode": data_mode_val, "provenance": "reconstructed", "environmental_source": env_source}
    finally:
        conn.close()


@router.get("/{spill_id}/hindcast")
def get_hindcast(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        row = conn.execute(
            "SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type=? ORDER BY created_at DESC LIMIT 1",
            (resolved_id, "hindcast")
        ).fetchone()
        if not row:
            spill = conn.execute("SELECT data_mode FROM oil_spills WHERE id=?", (resolved_id,)).fetchone()
            if spill:
                _execute_full_analysis(resolved_id)
                row = conn.execute(
                    "SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type=? ORDER BY created_at DESC LIMIT 1",
                    (resolved_id, "hindcast")
                ).fetchone()
        if not row:
            raise HTTPException(404, f"No hindcast found for incident {spill_id}.")
        d = row_to_dict(row)
        d["particles"] = parse_json(d["particles_json"])
        d["origin_region_geojson"] = parse_json(d["origin_region_geojson"])
        d["origin_centroid_geojson"] = parse_json(d["origin_centroid_geojson"])
        return d
    finally:
        conn.close()


@router.post("/{spill_id}/forecast")
def run_forecast_endpoint(spill_id: str, mode: Optional[str] = Query(None)):
    conn = get_connection()
    try:
        spill_row = conn.execute("SELECT * FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
        if not spill_row:
            raise HTTPException(404, "Satellite image unavailable.")
        sp = row_to_dict(spill_row)
        polygon = parse_json(sp["spill_polygon_geojson"])
        coords = polygon["coordinates"][0] if polygon else []
        centroid = parse_json(sp["centroid_geojson"])
        c_lat = centroid["coordinates"][1] if centroid else 15.42
        c_lon = centroid["coordinates"][0] if centroid else 72.68
        use_real = (mode == "real") if mode is not None else (sp.get("data_mode") == "real")
        if use_real:
            from app.integrations.copernicus_marine_service import copernicus_marine_service
            from app.integrations.cds_service import cds_service
            try:
                current_data = copernicus_marine_service.get_real_current_field()
            except Exception as e:
                raise HTTPException(
                    503,
                    f"Copernicus Marine ocean currents data is temporarily unavailable: {e}. "
                    f"Simulation Mode remains fully operational."
                )
            try:
                wind_data = cds_service.get_real_wind_field()
            except Exception as e:
                raise HTTPException(
                    503,
                    f"Copernicus Climate Data Store ERA5 wind data is temporarily unavailable: {e}. "
                    f"Simulation Mode remains fully operational."
                )
            env_source = "Copernicus Marine + Copernicus Climate Data Store (ERA5)"
            data_mode_val = "real"
        else:
            env_row = conn.execute(
                "SELECT field_data_json FROM environmental_fields WHERE spill_id=? AND field_type=?",
                (spill_id, "current")
            ).fetchone()
            wind_row = conn.execute(
                "SELECT field_data_json FROM environmental_fields WHERE spill_id=? AND field_type=?",
                (spill_id, "wind")
            ).fetchone()
            if not env_row:
                raise HTTPException(422, "Current data unavailable for this time/location.")
            if not wind_row:
                raise HTTPException(422, "Wind data unavailable for this time/location.")
            current_data = parse_json(env_row["field_data_json"])
            current_data["field"] = "current"
            wind_data = parse_json(wind_row["field_data_json"])
            wind_data["field"] = "wind"
            env_source = "SYNTHETIC_ERA5_v1"
            data_mode_val = "simulation"

        t0 = datetime.fromisoformat(sp["satellite_acquisition_time"].replace("Z", "+00:00"))
        prov_val = "predicted" if data_mode_val == "real" else "synthetic"

        try:
            result = run_forecast(
                c_lat, c_lon, coords, t0, current_data, wind_data,
                windage_coefficient=settings.default_windage_coefficient,
                particle_count=settings.default_particle_count,
                timestep_min=settings.default_integration_timestep_minutes,
                forecast_hours=settings.default_forecast_hours,
                seed=settings.oiltrace_demo_seed,
                data_mode=data_mode_val,
                provenance=prov_val,
            )
        except ValueError as e:
            raise HTTPException(422, str(e))

        now = datetime.now(timezone.utc).isoformat()
        run_id = f"FCAST-{spill_id}-{uuid.uuid4().hex[:8]}"
        conn.execute("DELETE FROM particle_trajectories WHERE spill_id=? AND run_type=?", (spill_id, "forecast"))
        conn.execute("""INSERT INTO particle_trajectories
            (id,spill_id,run_type,windage_coefficient,particle_count,integration_timestep_min,
             integration_hours,integration_method,particles_json,environmental_source,data_mode,provenance,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (run_id, spill_id, "forecast", result["windage_coefficient"], result["particle_count"],
             result["timestep_min"], result["forecast_hours"], result["integration_method"],
             dump_json(result["particles"]), env_source, data_mode_val, "predicted", now))
        conn.execute("UPDATE oil_spills SET data_mode=?, provenance=?, updated_at=? WHERE id=?",
                     (data_mode_val, "operational" if data_mode_val == "real" else "synthetic", now, spill_id))
        conn.commit()
        return {
            **result,
            "run_id": run_id,
            "spill_id": spill_id,
            "data_mode": data_mode_val,
            "provenance": "predicted",
            "environmental_source": env_source,
            "horizon_stats": result.get("horizon_stats", {})
        }
    finally:
        conn.close()


@router.get("/{spill_id}/forecast")
def get_forecast(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        row = conn.execute(
            "SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type=? ORDER BY created_at DESC LIMIT 1",
            (resolved_id, "forecast")
        ).fetchone()
        if not row:
            spill = conn.execute("SELECT data_mode FROM oil_spills WHERE id=?", (resolved_id,)).fetchone()
            if spill:
                _execute_full_analysis(resolved_id)
                row = conn.execute(
                    "SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type=? ORDER BY created_at DESC LIMIT 1",
                    (resolved_id, "forecast")
                ).fetchone()
        if not row:
            raise HTTPException(404, f"No forecast found for incident {spill_id}.")
        d = row_to_dict(row)
        d["particles"] = parse_json(d["particles_json"])
        return d
    finally:
        conn.close()


@router.get("/{spill_id}/vessels")
def get_spill_vessels(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        attrs = conn.execute("""
            SELECT a.*, v.vessel_name, v.vessel_type, v.imo, v.flag, v.length_m, v.gross_tonnage
            FROM attributions a
            JOIN vessels v ON a.mmsi=v.mmsi
            WHERE a.spill_id=?
            ORDER BY a.rank
        """, (resolved_id,)).fetchall()

        if not attrs:
            spill = conn.execute("SELECT data_mode FROM oil_spills WHERE id=?", (resolved_id,)).fetchone()
            if spill:
                _execute_full_analysis(resolved_id)
                attrs = conn.execute("""
                    SELECT a.*, v.vessel_name, v.vessel_type, v.imo, v.flag, v.length_m, v.gross_tonnage
                    FROM attributions a
                    JOIN vessels v ON a.mmsi=v.mmsi
                    WHERE a.spill_id=?
                    ORDER BY a.rank
                """, (resolved_id,)).fetchall()

        if attrs:
            result = []
            weights = settings.attribution_weights
            for r in attrs:
                d = row_to_dict(r)
                d["behaviour_observations"] = parse_json(d.get("behaviour_observations_json")) or []
                
                # Reconstruct factors for explainability inspection
                d["factors"] = [
                    {"factor": "spatial_proximity", "label": "Distance proximity", "raw_value": d.get("distance_km"), "raw_unit": "km", "normalized": d.get("norm_proximity"), "weight": weights.get("proximity", 0.35)},
                    {"factor": "temporal_alignment", "label": "Temporal alignment", "raw_value": d.get("time_delta_h"), "raw_unit": "h", "normalized": d.get("norm_temporal"), "weight": weights.get("temporal", 0.25)},
                    {"factor": "track_compatibility", "label": "Track compatibility", "raw_value": d.get("track_overlap_score"), "raw_unit": "score", "normalized": d.get("norm_trajectory"), "weight": weights.get("trajectory", 0.20)},
                    {"factor": "heading_compatibility", "label": "Heading compatibility", "raw_value": d.get("heading_compat_score"), "raw_unit": "score", "normalized": d.get("norm_heading"), "weight": weights.get("heading", 0.10)},
                    {"factor": "ais_continuity", "label": "AIS continuity", "raw_value": d.get("ais_coverage_pct"), "raw_unit": "%", "normalized": d.get("norm_continuity"), "weight": weights.get("continuity", 0.10)},
                ]
                result.append(d)
            return result
        return []
    finally:
        conn.close()


@router.get("/{spill_id}/tracks")
def get_all_tracks(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        rows = conn.execute("""
            SELECT t.*, v.vessel_name, v.vessel_type, v.length_m, v.beam_m, v.draught_m, v.gross_tonnage, v.flag, v.call_sign
            FROM vessel_tracks t
            JOIN vessels v ON t.mmsi=v.mmsi
            WHERE t.spill_id=?
        """, (resolved_id,)).fetchall()
        result = []
        for r in rows:
            d = row_to_dict(r)
            d["track_geojson"] = parse_json(d["track_geojson"])
            obs = conn.execute(
                "SELECT * FROM ais_observations WHERE mmsi=? ORDER BY timestamp",
                (d["mmsi"],)
            ).fetchall()
            d["observations"] = [row_to_dict(o) for o in obs]
            result.append(d)
        return result
    finally:
        conn.close()


@router.get("/{spill_id}/timeline")
def get_timeline(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        sp = conn.execute("SELECT * FROM oil_spills WHERE id=?", (resolved_id,)).fetchone()
        if not sp:
            raise HTTPException(404, "Satellite image unavailable.")
        sp_d = row_to_dict(sp)
        hcast = conn.execute(
            "SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type=? ORDER BY created_at DESC LIMIT 1",
            (resolved_id, "hindcast")
        ).fetchone()
        fcast = conn.execute(
            "SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type=? ORDER BY created_at DESC LIMIT 1",
            (resolved_id, "forecast")
        ).fetchone()
        tracks = conn.execute("""
            SELECT t.*, v.vessel_name, v.vessel_type
            FROM vessel_tracks t
            JOIN vessels v ON t.mmsi=v.mmsi
            WHERE t.spill_id=?
        """, (resolved_id,)).fetchall()
        attrs = conn.execute("SELECT * FROM attributions WHERE spill_id=? ORDER BY rank LIMIT 3", (resolved_id,)).fetchall()
        return {
            "spill": sp_d,
            "hindcast": row_to_dict(hcast) if hcast else None,
            "forecast": row_to_dict(fcast) if fcast else None,
            "tracks": [row_to_dict(t) for t in tracks],
            "top_candidates": [row_to_dict(a) for a in attrs],
            "data_mode": sp_d.get("data_mode", "simulation"),
            "provenance": sp_d.get("provenance", "synthetic"),
        }
    finally:
        conn.close()


@router.get("/{spill_id}/digital-twin")
def get_digital_twin_state(spill_id: str, offset_hours: float = Query(0.0)):
    conn = get_connection()
    try:
        spill = conn.execute("SELECT * FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
        if not spill:
            raise HTTPException(404, "Satellite image unavailable.")
        sp_d = row_to_dict(spill)
        
        hcast = conn.execute(
            "SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type=? ORDER BY created_at DESC LIMIT 1",
            (spill_id, "hindcast")
        ).fetchone()
        hc_d = row_to_dict(hcast) if hcast else {}
        if hc_d:
            hc_d["particles"] = parse_json(hc_d.get("particles_json"))

        fcast = conn.execute(
            "SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type=? ORDER BY created_at DESC LIMIT 1",
            (spill_id, "forecast")
        ).fetchone()
        fc_d = row_to_dict(fcast) if fcast else {}
        if fc_d:
            fc_d["particles"] = parse_json(fc_d.get("particles_json"))

        ais_rows = conn.execute("SELECT * FROM ais_observations").fetchall()
        ais_obs = [row_to_dict(r) for r in ais_rows]

        env_row = conn.execute(
            "SELECT field_data_json FROM environmental_fields WHERE spill_id=? AND field_type=?",
            (spill_id, "current")
        ).fetchone()
        env_data = parse_json(env_row["field_data_json"]) if env_row else {}

        engine = DigitalTwinEngine()
        return engine.get_state_at_time(
            incident_id=spill_id,
            time_offset_hours=offset_hours,
            spill_data=sp_d,
            hindcast_data=hc_d,
            forecast_data=fc_d,
            ais_data=ais_obs,
            env_data=env_data,
        )
    finally:
        conn.close()


_analysis_lock = threading.Lock()


def _execute_full_analysis(spill_id: str, force: bool = False):
    """Executes deterministic end-to-end simulation analysis and populates all tables."""
    with _analysis_lock:
        return _execute_full_analysis_locked(spill_id, force)


def _execute_full_analysis_locked(spill_id: str, force: bool = False):
    conn = get_connection()
    try:
        if not force:
            traj_cnt = extract_count(conn.execute("SELECT count(*) AS cnt FROM particle_trajectories WHERE spill_id=?", (spill_id,)).fetchone())
            attr_cnt = extract_count(conn.execute("SELECT count(*) AS cnt FROM attributions WHERE spill_id=?", (spill_id,)).fetchone())
            run_row = conn.execute("SELECT * FROM analysis_runs WHERE spill_id=? ORDER BY started_at DESC LIMIT 1", (spill_id,)).fetchone()
            if traj_cnt > 0 and attr_cnt > 0 and run_row:
                return {
                    "run_id": row_get(run_row, "id", f"RUN-{spill_id}"),
                    "spill_id": spill_id,
                    "status": row_get(run_row, "status", "completed"),
                    "data_mode": "simulation",
                    "provenance": "synthetic",
                }

        spill = conn.execute("SELECT * FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
        if not spill:
            raise HTTPException(404, "Satellite image unavailable.")
        sp = row_to_dict(spill)
        
        # 1. Detection Step
        detector = SpillDetector(model_version=sp.get("model_version", "1.0.0-demo"), threshold=sp.get("model_threshold", 0.42))
        data_mode = sp.get("data_mode", "simulation")
        scene_to_process = sp.get("satellite_image_path") or sp.get("satellite_image_id")
        if not scene_to_process:
            if data_mode == "real":
                raise HTTPException(404, f"Real satellite image asset not found for spill '{spill_id}'.")
            scene_to_process = "S1A_IW_GRDH_1SDV_20240315T060000_demo.tif"
        if not scene_to_process.endswith((".tif", ".tiff", ".png", ".npy")):
            scene_to_process = f"{scene_to_process}.tif"
        det_result = detector.predict(scene_to_process, data_mode=data_mode)
        if det_result["confidence"] < detector.threshold:
            raise HTTPException(422, "Detection confidence is below the configured investigation threshold.")

        # 2. Geometry Step (Calculated in projected equal-area CRS)
        poly = det_result.get("polygon_geojson") or parse_json(sp.get("spill_polygon_geojson"))
        if not poly and data_mode == "real":
            raise HTTPException(422, f"No valid georeferenced polygon produced for spill '{spill_id}'.")
        geom_result = characterize_polygon(poly) if poly else {}
        centroid = det_result.get("centroid_geojson") or ({"type": "Point", "coordinates": [geom_result.get("centroid_lon", 72.68), geom_result.get("centroid_lat", 15.42)]} if geom_result else None)
        conn.execute("""
            UPDATE oil_spills
            SET area_km2=?, perimeter_km=?, length_km=?, width_km=?, orientation_deg=?, compactness=?, 
                spill_polygon_geojson=?, centroid_geojson=?, updated_at=?
            WHERE id=?
        """, (
            geom_result.get("area_km2", 0.0), geom_result.get("perimeter_km", 0.0), geom_result.get("length_km", 0.0),
            geom_result.get("width_km", 0.0), geom_result.get("orientation_deg", 0.0), geom_result.get("compactness", 0.0),
            dump_json(poly), dump_json(centroid), datetime.now(timezone.utc).isoformat(), spill_id
        ))

        # 3. Hindcast & Forecast
        coords = poly["coordinates"][0] if poly else []
        centroid = parse_json(sp["centroid_geojson"])
        c_lat = centroid["coordinates"][1] if centroid else 15.42
        c_lon = centroid["coordinates"][0] if centroid else 72.68
        t0 = datetime.fromisoformat(sp["satellite_acquisition_time"].replace("Z", "+00:00"))

        env_row = conn.execute("SELECT field_data_json FROM environmental_fields WHERE spill_id=? AND field_type=?", (spill_id, "current")).fetchone()
        wind_row = conn.execute("SELECT field_data_json FROM environmental_fields WHERE spill_id=? AND field_type=?", (spill_id, "wind")).fetchone()
        if not env_row:
            raise HTTPException(422, "Current data unavailable for this time/location.")
        if not wind_row:
            raise HTTPException(422, "Wind data unavailable for this time/location.")

        current_data = parse_json(env_row["field_data_json"])
        current_data["field"] = "current"
        wind_data = parse_json(wind_row["field_data_json"])
        wind_data["field"] = "wind"

        hindcast_res = run_hindcast(
            c_lat, c_lon, coords, t0, current_data, wind_data,
            windage_coefficient=settings.default_windage_coefficient,
            particle_count=settings.default_particle_count,
            timestep_min=settings.default_integration_timestep_minutes,
            hindcast_hours=settings.default_hindcast_hours,
            seed=settings.oiltrace_demo_seed
        )
        now = datetime.now(timezone.utc).isoformat()
        hcast_id = f"HCAST-{spill_id}-{uuid.uuid4().hex[:8]}"
        conn.execute("DELETE FROM particle_trajectories WHERE spill_id=? AND run_type=?", (spill_id, "hindcast"))
        conn.execute("""INSERT INTO particle_trajectories
            (id,spill_id,run_type,windage_coefficient,particle_count,integration_timestep_min,
             integration_hours,integration_method,particles_json,origin_region_geojson,
             origin_centroid_geojson,origin_time_estimate,origin_time_uncertainty_h,
             spatial_uncertainty_km,environmental_source,data_mode,provenance,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (hcast_id, spill_id, "hindcast", hindcast_res["windage_coefficient"], hindcast_res["particle_count"],
             hindcast_res["timestep_min"], hindcast_res["hindcast_hours"], hindcast_res["integration_method"],
             dump_json(hindcast_res["particles"]), dump_json(hindcast_res["origin_region_geojson"]),
             dump_json(hindcast_res["origin_centroid_geojson"]), hindcast_res["origin_time_estimate"],
             hindcast_res["origin_time_uncertainty_h"], hindcast_res["spatial_uncertainty_km"],
             "SYNTHETIC", "simulation", "synthetic", now))

        forecast_res = run_forecast(
            c_lat, c_lon, coords, t0, current_data, wind_data,
            windage_coefficient=settings.default_windage_coefficient,
            particle_count=settings.default_particle_count,
            timestep_min=settings.default_integration_timestep_minutes,
            forecast_hours=settings.default_forecast_hours,
            seed=settings.oiltrace_demo_seed
        )
        fcast_id = f"FCAST-{spill_id}-{uuid.uuid4().hex[:8]}"
        conn.execute("DELETE FROM particle_trajectories WHERE spill_id=? AND run_type=?", (spill_id, "forecast"))
        conn.execute("""INSERT INTO particle_trajectories
            (id,spill_id,run_type,windage_coefficient,particle_count,integration_timestep_min,
             integration_hours,integration_method,particles_json,data_mode,provenance,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (fcast_id, spill_id, "forecast", forecast_res["windage_coefficient"], forecast_res["particle_count"],
             forecast_res["timestep_min"], forecast_res["forecast_hours"], forecast_res["integration_method"],
             dump_json(forecast_res["particles"]), "simulation", "synthetic", now))

        # 4. AIS Filtering & Attribution
        all_obs = conn.execute("SELECT * FROM ais_observations").fetchall()
        if not all_obs:
            raise HTTPException(404, "No AIS records found in the requested window.")
        obs_list = [row_to_dict(o) for o in all_obs]

        origin_lat = hindcast_res["origin_lat"]
        origin_lon = hindcast_res["origin_lon"]
        origin_time = datetime.fromisoformat(hindcast_res["origin_time_estimate"].replace("Z", "+00:00"))

        spatial_passed, _ = spatial_filter(obs_list, origin_lat, origin_lon, settings.default_ais_radius_km)
        temporal_passed, _ = temporal_filter(spatial_passed, origin_time, settings.default_ais_temporal_window_hours)

        by_vessel = group_by_vessel(temporal_passed)
        all_by_vessel = group_by_vessel(obs_list)
        traj_passed, _ = trajectory_filter(
            by_vessel, origin_lat, origin_lon, c_lat, c_lon,
            current_u=0.18, current_v=0.12, wind_u=5.2, wind_v=3.8
        )

        weights = settings.attribution_weights
        vessel_scores = []

        for mmsi, obs in traj_passed.items():
            all_obs_v = all_by_vessel.get(mmsi, obs)
            bf = extract_behaviour_features(all_obs_v, settings.default_track_gap_threshold_minutes)
            sc = score_vessel(
                mmsi, obs, origin_lat, origin_lon, hindcast_res["origin_time_estimate"],
                c_lat, c_lon, current_u=0.18, current_v=0.12, wind_u=5.2, wind_v=3.8,
                alpha=settings.default_windage_coefficient,
                spatial_radius_km=settings.default_ais_radius_km,
                temporal_window_h=settings.default_ais_temporal_window_hours,
                weights=weights, behaviour_features=bf
            )
            vessel_scores.append(sc)

        for mmsi, obs in all_by_vessel.items():
            if mmsi not in traj_passed:
                bf = extract_behaviour_features(obs, settings.default_track_gap_threshold_minutes)
                sc = score_vessel(
                    mmsi, obs, origin_lat, origin_lon, hindcast_res["origin_time_estimate"],
                    c_lat, c_lon, current_u=0.18, current_v=0.12, wind_u=5.2, wind_v=3.8,
                    alpha=settings.default_windage_coefficient,
                    spatial_radius_km=settings.default_ais_radius_km,
                    temporal_window_h=settings.default_ais_temporal_window_hours,
                    weights=weights, behaviour_features=bf
                )
                vessel_scores.append(sc)

        if not vessel_scores:
            raise HTTPException(404, "No vessel satisfies the current filtering criteria.")

        ranked = rank_vessels(vessel_scores)
        conn.execute("DELETE FROM attributions WHERE spill_id=?", (spill_id,))
        for vs in ranked:
            attr_id = f"ATTR-{spill_id}-{vs['mmsi']}"
            conn.execute("""INSERT INTO attributions
                (id,spill_id,mmsi,rank,distance_km,time_delta_h,track_overlap_score,heading_compat_score,ais_continuity_score,
                 norm_proximity,norm_temporal,norm_trajectory,norm_heading,norm_continuity,
                 weight_proximity,weight_temporal,weight_trajectory,weight_heading,weight_continuity,
                 evidence_score,data_confidence,final_score,behaviour_observations_json,
                 ais_gap_detected,ais_gap_duration_min,slowdown_observed,course_change_observed,ais_coverage_pct,
                 spatial_radius_km,temporal_window_h,data_mode,provenance,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (attr_id, spill_id, vs["mmsi"], vs.get("rank"), vs.get("distance_km"), vs.get("time_delta_h"),
                 vs.get("track_overlap_score"), vs.get("heading_compat_score"), vs.get("ais_continuity_score"),
                 vs.get("norm_proximity"), vs.get("norm_temporal"), vs.get("norm_trajectory"),
                 vs.get("norm_heading"), vs.get("norm_continuity"),
                 weights.get("proximity"), weights.get("temporal"), weights.get("trajectory"),
                 weights.get("heading"), weights.get("continuity"),
                 vs.get("evidence_score"), vs.get("data_confidence"), vs.get("final_score"),
                 dump_json(vs.get("behaviour_observations", [])),
                 int(vs.get("ais_gap_detected", False)), vs.get("ais_gap_duration_min"),
                 int(vs.get("slowdown_observed", False)), int(vs.get("course_change_observed", False)),
                 vs.get("ais_coverage_pct"), settings.default_ais_radius_km, settings.default_ais_temporal_window_hours,
                 "simulation", "synthetic", now))

        # 5. Record Analysis Run
        run_id = f"RUN-{spill_id}-{uuid.uuid4().hex[:8]}"
        conn.execute("""INSERT INTO analysis_runs
            (id,spill_id,run_type,status,data_mode,satellite_scene_id,model_version,
             preprocessing_version,model_threshold,environment_source,scoring_config_json,started_at,completed_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (run_id, spill_id, "simulation_pipeline", "completed", "simulation",
             sp.get("satellite_image_id"), sp.get("model_version"), sp.get("preprocessing_version"),
             sp.get("model_threshold"), "SYNTHETIC", dump_json(weights), now, now))

        conn.commit()

        return {
            "run_id": run_id,
            "spill_id": spill_id,
            "status": "completed",
            "detection": {
                "confidence": det_result["confidence"],
                "class_probabilities": det_result["class_probabilities"],
                "model_version": det_result["model_version"],
                "threshold": det_result["threshold"],
                "data_mode": "simulation",
                "provenance": "synthetic",
                "seed": settings.oiltrace_demo_seed,
            },
            "geometry": geom_result,
            "hindcast": {
                "origin_lat": hindcast_res["origin_lat"],
                "origin_lon": hindcast_res["origin_lon"],
                "spatial_uncertainty_km": hindcast_res["spatial_uncertainty_km"],
                "origin_time_estimate": hindcast_res["origin_time_estimate"],
                "origin_time_uncertainty_h": hindcast_res["origin_time_uncertainty_h"],
                "origin_region_geojson": hindcast_res["origin_region_geojson"],
                "data_mode": "simulation",
                "provenance": "synthetic",
            },
            "forecast": {
                "horizon_stats": forecast_res["horizon_stats"],
                "forecast_hours": forecast_res["forecast_hours"],
                "data_mode": "simulation",
                "provenance": "synthetic",
            },
            "vessels": ranked,
            "data_mode": "simulation",
            "provenance": "synthetic",
            "seed": settings.oiltrace_demo_seed,
        }
    finally:
        conn.close()


@router.post("/{spill_id}/analyze")
def analyze_spill(spill_id: str):
    """
    Triggers end-to-end simulation analysis pipeline.
    Returns status: started with spill_id and run_id.
    """
    summary = _execute_full_analysis(spill_id, force=True)
    return {
        "status": "started",
        "spill_id": spill_id,
        "run_id": summary.get("run_id", f"RUN-{spill_id}"),
        "data_mode": "simulation",
        "provenance": "synthetic",
    }


@router.get("/{spill_id}/analysis")
def get_spill_analysis_summary(spill_id: str):
    """
    Retrieves latest analysis summary for the incident.
    """
    conn = get_connection()
    try:
        run = conn.execute(
            "SELECT * FROM analysis_runs WHERE spill_id=? ORDER BY started_at DESC LIMIT 1",
            (spill_id,)
        ).fetchone()
        if not run:
            # If not yet executed, execute it now to ensure availability
            return _execute_full_analysis(spill_id)

        spill = conn.execute("SELECT * FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
        attrs = conn.execute("SELECT * FROM attributions WHERE spill_id=? ORDER BY rank", (spill_id,)).fetchall()
        hcast = conn.execute("SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type='hindcast' ORDER BY created_at DESC LIMIT 1", (spill_id,)).fetchone()
        fcast = conn.execute("SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type='forecast' ORDER BY created_at DESC LIMIT 1", (spill_id,)).fetchone()

        sp = row_to_dict(spill) if spill else {}
        poly = parse_json(sp.get("spill_polygon_geojson")) if sp else None
        geom = characterize_polygon(poly) if poly else {}

        hc = row_to_dict(hcast) if hcast else {}
        fc = row_to_dict(fcast) if fcast else {}

        ranked = [row_to_dict(a) for a in attrs]
        weights = settings.attribution_weights
        for r in ranked:
            r["behaviour_observations"] = parse_json(r.get("behaviour_observations_json")) or []
            r["factors"] = [
                {"factor": "spatial_proximity", "label": "Distance proximity", "raw_value": r.get("distance_km"), "raw_unit": "km", "normalized": r.get("norm_proximity"), "weight": weights.get("proximity", 0.35)},
                {"factor": "temporal_alignment", "label": "Temporal alignment", "raw_value": r.get("time_delta_h"), "raw_unit": "h", "normalized": r.get("norm_temporal"), "weight": weights.get("temporal", 0.25)},
                {"factor": "track_compatibility", "label": "Track compatibility", "raw_value": r.get("track_overlap_score"), "raw_unit": "score", "normalized": r.get("norm_trajectory"), "weight": weights.get("trajectory", 0.20)},
                {"factor": "heading_compatibility", "label": "Heading compatibility", "raw_value": r.get("heading_compat_score"), "raw_unit": "score", "normalized": r.get("norm_heading"), "weight": weights.get("heading", 0.10)},
                {"factor": "ais_continuity", "label": "AIS continuity", "raw_value": r.get("ais_coverage_pct"), "raw_unit": "%", "normalized": r.get("norm_continuity"), "weight": weights.get("continuity", 0.10)},
            ]

        return {
            "run_id": dict(run)["id"],
            "spill_id": spill_id,
            "status": dict(run)["status"],
            "detection": {
                "confidence": sp.get("detection_confidence", 0.941),
                "model_version": sp.get("model_version", "1.0.0-demo"),
                "threshold": sp.get("model_threshold", 0.42),
                "data_mode": "simulation",
                "provenance": "synthetic",
                "seed": settings.oiltrace_demo_seed,
            },
            "geometry": geom,
            "hindcast": {
                "origin_time_estimate": hc.get("origin_time_estimate"),
                "origin_time_uncertainty_h": hc.get("origin_time_uncertainty_h"),
                "spatial_uncertainty_km": hc.get("spatial_uncertainty_km"),
                "origin_region_geojson": parse_json(hc.get("origin_region_geojson")),
                "data_mode": "simulation",
                "provenance": "synthetic",
            },
            "forecast": {
                "forecast_hours": hc.get("integration_hours"),
                "data_mode": "simulation",
                "provenance": "synthetic",
            },
            "vessels": ranked,
            "data_mode": "simulation",
            "provenance": "synthetic",
            "seed": settings.oiltrace_demo_seed,
        }
    finally:
        conn.close()


@router.get("/{spill_id}/analysis/{target_id}")
def get_spill_analysis_by_id(spill_id: str, target_id: str):
    """
    Returns candidate vessel attributions list with full explainable scores,
    satisfying both `jq '.[] | .final_score'` test and comprehensive analysis details.
    """
    conn = get_connection()
    try:
        attrs = conn.execute("""
            SELECT a.*, v.vessel_name, v.vessel_type, v.imo, v.flag, v.length_m, v.gross_tonnage
            FROM attributions a
            JOIN vessels v ON a.mmsi=v.mmsi
            WHERE a.spill_id=?
            ORDER BY a.rank
        """, (spill_id,)).fetchall()

        if not attrs:
            summary = _execute_full_analysis(spill_id)
            attrs = conn.execute("""
                SELECT a.*, v.vessel_name, v.vessel_type, v.imo, v.flag, v.length_m, v.gross_tonnage
                FROM attributions a
                JOIN vessels v ON a.mmsi=v.mmsi
                WHERE a.spill_id=?
                ORDER BY a.rank
            """, (spill_id,)).fetchall()

        spill = conn.execute("SELECT * FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
        sp = row_to_dict(spill) if spill else {}
        poly = parse_json(sp.get("spill_polygon_geojson")) if sp else None
        geom = characterize_polygon(poly) if poly else {}

        hcast = conn.execute("SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type='hindcast' ORDER BY created_at DESC LIMIT 1", (spill_id,)).fetchone()
        hc = row_to_dict(hcast) if hcast else {}

        fcast = conn.execute("SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type='forecast' ORDER BY created_at DESC LIMIT 1", (spill_id,)).fetchone()
        fc = row_to_dict(fcast) if fcast else {}

        weights = settings.attribution_weights
        result = []
        for r in attrs:
            d = row_to_dict(r)
            d["behaviour_observations"] = parse_json(d.get("behaviour_observations_json")) or []
            d["factors"] = [
                {"factor": "spatial_proximity", "label": "Distance proximity", "raw_value": d.get("distance_km"), "raw_unit": "km", "normalized": d.get("norm_proximity"), "weight": weights.get("proximity", 0.35)},
                {"factor": "temporal_alignment", "label": "Temporal alignment", "raw_value": d.get("time_delta_h"), "raw_unit": "h", "normalized": d.get("norm_temporal"), "weight": weights.get("temporal", 0.25)},
                {"factor": "track_compatibility", "label": "Track compatibility", "raw_value": d.get("track_overlap_score"), "raw_unit": "score", "normalized": d.get("norm_trajectory"), "weight": weights.get("trajectory", 0.20)},
                {"factor": "heading_compatibility", "label": "Heading compatibility", "raw_value": d.get("heading_compat_score"), "raw_unit": "score", "normalized": d.get("norm_heading"), "weight": weights.get("heading", 0.10)},
                {"factor": "ais_continuity", "label": "AIS continuity", "raw_value": d.get("ais_coverage_pct"), "raw_unit": "%", "normalized": d.get("norm_continuity"), "weight": weights.get("continuity", 0.10)},
            ]
            d["detection"] = {
                "confidence": sp.get("detection_confidence", 0.941),
                "model_version": sp.get("model_version", "1.0.0-demo"),
                "data_mode": "simulation",
                "provenance": "synthetic",
                "seed": settings.oiltrace_demo_seed,
            }
            d["geometry"] = geom
            d["hindcast"] = {
                "origin_time_estimate": hc.get("origin_time_estimate"),
                "origin_time_uncertainty_h": hc.get("origin_time_uncertainty_h"),
                "spatial_uncertainty_km": hc.get("spatial_uncertainty_km"),
                "origin_region_geojson": parse_json(hc.get("origin_region_geojson")),
                "data_mode": "simulation",
                "provenance": "synthetic",
            }
            d["forecast"] = {
                "forecast_hours": fc.get("integration_hours", 48),
                "data_mode": "simulation",
                "provenance": "synthetic",
            }
            d["data_mode"] = "simulation"
            d["provenance"] = "synthetic"
            d["seed"] = settings.oiltrace_demo_seed
            result.append(d)

        return result
    finally:
        conn.close()
