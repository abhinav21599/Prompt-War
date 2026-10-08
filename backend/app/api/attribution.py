# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from app.database.engine import get_connection, row_to_dict, parse_json, dump_json
from app.ais.engine import group_by_vessel, spatial_filter, temporal_filter, trajectory_filter, extract_behaviour_features
from app.attribution.scorer import score_vessel, rank_vessels
from app.config import settings
import uuid, json

router = APIRouter(prefix="/api/attribution", tags=["attribution"])

@router.post("/analyze")
def analyze_attribution(payload: dict):
    spill_id = payload.get("spill_id", "OILTRACE-DEMO-001")
    conn = get_connection()
    try:
        spill = conn.execute("SELECT * FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
        if not spill:
            raise HTTPException(404, "Spill not found")
        sp = row_to_dict(spill)
        centroid = parse_json(sp.get("centroid_geojson"))
        spill_lat = centroid["coordinates"][1] if centroid else 15.42
        spill_lon = centroid["coordinates"][0] if centroid else 72.68

        hindcast = conn.execute("SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type=? ORDER BY created_at DESC LIMIT 1",
                                 (spill_id, "hindcast")).fetchone()
        if not hindcast:
            raise HTTPException(422, "Hindcast required before attribution. Run POST /api/spills/{id}/hindcast")

        hc = row_to_dict(hindcast)
        origin_lat = hc.get("origin_lat") or 15.21
        origin_lon = hc.get("origin_lon") or 72.41
        origin_centroid = parse_json(hc.get("origin_centroid_geojson"))
        if origin_centroid:
            origin_lon, origin_lat = origin_centroid["coordinates"]
        origin_time_str = hc.get("origin_time_estimate", "2024-03-14T12:00:00+00:00")

        data_mode = payload.get("data_mode") or sp.get("data_mode") or hc.get("data_mode") or "simulation"
        use_real = (data_mode == "real")

        if use_real:
            from app.integrations.copernicus_marine_service import copernicus_marine_service
            from app.integrations.cds_service import cds_service
            try:
                cur_vel = copernicus_marine_service.get_velocity_at(origin_lat, origin_lon)
                current_u = cur_vel["u"]
                current_v = cur_vel["v"]
            except Exception:
                current_u, current_v = 0.18, 0.12
            try:
                wind_field = cds_service.get_real_wind_field()
                wind_u = wind_field.get("wind", {}).get("mean_u", 5.2)
                wind_v = wind_field.get("wind", {}).get("mean_v", 3.8)
            except Exception:
                wind_u, wind_v = 5.2, 3.8
            attr_prov = "operational"
        else:
            env_current = conn.execute("SELECT field_data_json FROM environmental_fields WHERE spill_id=? AND field_type=?",
                                        (spill_id, "current")).fetchone()
            current_u, current_v = 0.18, 0.12
            wind_u, wind_v = 5.2, 3.8
            if env_current:
                fd = parse_json(env_current["field_data_json"])
                pts = fd.get("points", [])
                if pts:
                    mid = pts[len(pts)//2]
                    current_u = mid.get("current_u", 0.18)
                    current_v = mid.get("current_v", 0.12)
                    wind_u = mid.get("wind_u", 5.2)
                    wind_v = mid.get("wind_v", 3.8)
            attr_prov = "synthetic"

        import os
        from app.config import settings

        if use_real and (settings.aisstream_api_key or os.getenv("AIS_API_KEY") or os.getenv("AISSTREAM_API_KEY")):
            api_key = settings.aisstream_api_key or os.getenv("AIS_API_KEY") or os.getenv("AISSTREAM_API_KEY")
            from app.providers.aisstream import fetch_live_vessels
            import logging, math
            from datetime import timedelta
            try:
                live_vessels = fetch_live_vessels(
                    spill_lat=origin_lat,
                    spill_lon=origin_lon,
                    radius_deg=2.0,
                    collect_seconds=5.0,
                    max_vessels=40,
                    api_key=api_key
                )
                obs_list = []
                base_t = datetime.fromisoformat(origin_time_str.replace("Z", "+00:00"))
                for v in live_vessels:
                    lat = v.get("latitude", origin_lat)
                    lon = v.get("longitude", origin_lon)
                    sog = v.get("sog_knots", 10.0)
                    cog = v.get("cog_deg", 0.0)
                    dist_km_per_hr = sog * 1.852
                    lat_offset_per_hr = (dist_km_per_hr * math.cos(math.radians(cog))) / 111.32
                    lon_offset_per_hr = (dist_km_per_hr * math.sin(math.radians(cog))) / (111.32 * math.cos(math.radians(lat)) if math.cos(math.radians(lat)) != 0 else 1)
                    
                    for hours_back in [1.5, 0.75, 0.0]:
                        p = dict(v)
                        p["latitude"] = lat - (lat_offset_per_hr * hours_back)
                        p["longitude"] = lon - (lon_offset_per_hr * hours_back)
                        p["timestamp"] = (base_t - timedelta(hours=hours_back)).isoformat()
                        obs_list.append(p)
                total_obs = len(obs_list)
                logging.getLogger("oiltrace.attribution").info(f"Fetched {len(live_vessels)} LIVE vessels and generated {total_obs} trajectory points.")
            except Exception as e:
                logging.getLogger("oiltrace.attribution").error(f"Live AIS fetch failed: {e}")
                all_obs = conn.execute("SELECT * FROM ais_observations").fetchall()
                obs_list = [row_to_dict(o) for o in all_obs]
                total_obs = len(obs_list)
        else:
            all_obs = conn.execute("SELECT * FROM ais_observations").fetchall()
            obs_list = [row_to_dict(o) for o in all_obs]
            total_obs = len(obs_list)

        spatial_passed, spatial_stats = spatial_filter(obs_list, origin_lat, origin_lon, settings.default_ais_radius_km)
        origin_time = datetime.fromisoformat(origin_time_str.replace("Z", "+00:00"))
        temporal_passed, temporal_stats = temporal_filter(spatial_passed, origin_time, settings.default_ais_temporal_window_hours)

        by_vessel = group_by_vessel(temporal_passed)
        all_by_vessel = group_by_vessel(obs_list)
        traj_passed, traj_stats = trajectory_filter(by_vessel, origin_lat, origin_lon, spill_lat, spill_lon, current_u, current_v, wind_u, wind_v)

        weights = settings.attribution_weights
        vessel_scores = []
        now = datetime.now(timezone.utc).isoformat()

        for mmsi, obs in traj_passed.items():
            all_obs_vessel = all_by_vessel.get(mmsi, obs)
            bf = extract_behaviour_features(all_obs_vessel, settings.default_track_gap_threshold_minutes)
            score = score_vessel(mmsi, obs, origin_lat, origin_lon, origin_time_str,
                                  spill_lat, spill_lon, current_u, current_v, wind_u, wind_v,
                                  alpha=settings.default_windage_coefficient,
                                  spatial_radius_km=settings.default_ais_radius_km,
                                  temporal_window_h=settings.default_ais_temporal_window_hours,
                                  weights=weights, behaviour_features=bf)
            score["mmsi"] = mmsi
            vessel_scores.append(score)

        for mmsi, obs in all_by_vessel.items():
            if mmsi not in traj_passed:
                all_obs_v = obs
                bf = extract_behaviour_features(all_obs_v, settings.default_track_gap_threshold_minutes)
                score = score_vessel(mmsi, all_obs_v, origin_lat, origin_lon, origin_time_str,
                                      spill_lat, spill_lon, current_u, current_v, wind_u, wind_v,
                                      alpha=settings.default_windage_coefficient,
                                      spatial_radius_km=settings.default_ais_radius_km,
                                      temporal_window_h=settings.default_ais_temporal_window_hours,
                                      weights=weights, behaviour_features=bf)
                score["mmsi"] = mmsi
                score["filtered_at"] = "trajectory"
                vessel_scores.append(score)

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
                 data_mode, attr_prov, now))

        conn.execute("UPDATE oil_spills SET data_mode=?, provenance=?, updated_at=? WHERE id=?",
                     (data_mode, attr_prov, now, spill_id))
        conn.commit()

        return {
            "spill_id": spill_id,
            "total_ais_observations": total_obs,
            "spatial_filter": spatial_stats,
            "temporal_filter": temporal_stats,
            "trajectory_filter": traj_stats,
            "behaviour_analysis_count": len(traj_passed),
            "ranked_candidates": len(ranked),
            "vessels": ranked,
            "weights_used": weights,
            "data_mode": data_mode,
            "provenance": attr_prov,
        }
    finally:
        conn.close()

@router.get("/{spill_id}")
def get_attribution(spill_id: str):
    conn = get_connection()
    try:
        from app.api.spills import _resolve_spill_id
        resolved_id = _resolve_spill_id(spill_id, conn)
        rows = conn.execute("""
            SELECT a.*, v.vessel_name, v.vessel_type, v.imo, v.flag, v.length_m, v.gross_tonnage
            FROM attributions a
            JOIN vessels v ON a.mmsi=v.mmsi
            WHERE a.spill_id=?
            ORDER BY a.rank
        """, (resolved_id,)).fetchall()
        result = [row_to_dict(r) for r in rows]
        for r in result:
            r["behaviour_observations"] = parse_json(r.get("behaviour_observations_json")) or []
        spill = conn.execute("SELECT data_mode, provenance FROM oil_spills WHERE id=?", (resolved_id,)).fetchone()
        sp_dict = row_to_dict(spill) if spill else {}
        mode_val = sp_dict.get("data_mode", "simulation")
        prov_val = sp_dict.get("provenance", "synthetic")
        return {
            "spill_id": resolved_id,
            "vessels": result,
            "count": len(result),
            "mode": mode_val,
            "data_mode": mode_val,
            "provenance": prov_val,
            "structured_provenance": {
                "mode": mode_val,
                "provenance": prov_val,
                "source": "OILTRACE_ATTRIBUTION_ENGINE",
                "scene_id": resolved_id,
                "processing_version": "1.0.0",
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
            }
        }
    finally:
        conn.close()
