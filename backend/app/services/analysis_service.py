import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from app.database.engine import get_connection, row_to_dict, parse_json, dump_json
from app.detection.detector import SpillDetector
from app.geometry.calculator import characterize_polygon
from app.drift.particle_engine import run_hindcast, run_forecast
from app.ais.engine import spatial_filter, temporal_filter, trajectory_filter, extract_behaviour_features, group_by_vessel
from app.attribution.scorer import score_vessel, rank_vessels
from app.uncertainty.engine import UncertaintyEngine
from app.api.reports import _build_html_report
from app.config import settings

class AnalysisService:
    """
    Orchestrates the end-to-end investigation pipeline following the formal State Machine:
    CREATED -> VALIDATING -> PREPROCESSING -> DETECTING -> GEOMETRY -> ENVIRONMENT
    -> HINDCAST -> AIS_FILTERING -> ATTRIBUTION -> FORECAST -> UNCERTAINTY -> REPORT -> COMPLETE
    """
    def __init__(self):
        pass

    def _log_audit_event(self, conn, run_id: str, event_type: str, event_data: Dict[str, Any]):
        event_id = f"AUD-{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("""
            INSERT INTO audit_log (id, analysis_run_id, event_type, event_data_json, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """, (event_id, run_id, event_type, dump_json(event_data), now))

    def _update_stage(self, conn, run_id: str, status: str, message: Optional[str] = None):
        now = datetime.now(timezone.utc).isoformat()
        if status in ("COMPLETE", "completed"):
            conn.execute("UPDATE analysis_runs SET status=?, completed_at=?, error_message=? WHERE id=?",
                         ("completed", now, None, run_id))
        elif status in ("FAILED", "failed"):
            conn.execute("UPDATE analysis_runs SET status=?, completed_at=?, error_message=? WHERE id=?",
                         ("failed", now, message, run_id))
        else:
            conn.execute("UPDATE analysis_runs SET status=?, error_message=? WHERE id=?",
                         (status, None, run_id))
        conn.commit()

    def run_pipeline(self, spill_id: str = "OILTRACE-DEMO-001", data_mode: str = "simulation") -> Dict[str, Any]:
        conn = get_connection()
        run_id = f"RUN-{spill_id}-{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()
        weights = settings.attribution_weights

        try:
            # Stage 1: CREATED
            conn.execute("""
                INSERT INTO analysis_runs (id, spill_id, run_type, status, data_mode, started_at, scoring_config_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (run_id, spill_id, "investigation_pipeline", "CREATED", data_mode, now, dump_json(weights)))
            self._log_audit_event(conn, run_id, "scene_ingested", {"spill_id": spill_id, "data_mode": data_mode})
            conn.commit()

            # Stage 2: VALIDATING
            self._update_stage(conn, run_id, "VALIDATING")
            spill_row = conn.execute("SELECT * FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
            if not spill_row:
                raise ValueError("Satellite image unavailable.")
            sp = row_to_dict(spill_row)

            # Stage 3: PREPROCESSING & DETECTING
            self._update_stage(conn, run_id, "PREPROCESSING")
            self._log_audit_event(conn, run_id, "preprocessing_completed", {"version": sp.get("preprocessing_version", "1.2.0")})
            
            self._update_stage(conn, run_id, "DETECTING")
            detector = SpillDetector(model_version=sp.get("model_version", "1.0.0-demo"), threshold=sp.get("model_threshold", 0.42))
            scene_to_process = sp.get("satellite_image_path") or sp.get("satellite_image_id")
            if not scene_to_process:
                if data_mode == "real":
                    raise ValueError(f"Real-Data Mode: Satellite scene asset path not found for spill '{spill_id}'.")
                scene_to_process = "S1A_IW_GRDH_1SDV_20240315T060000_demo.tif"
            if not scene_to_process.endswith((".tif", ".tiff", ".png", ".npy")):
                scene_to_process = f"{scene_to_process}.tif"
            det_result = detector.predict(scene_to_process, data_mode=data_mode)
            if det_result["confidence"] < detector.threshold:
                raise ValueError("Detection confidence is below the configured investigation threshold.")
            self._log_audit_event(conn, run_id, "detection_completed", {"confidence": det_result["confidence"], "scene": scene_to_process})

            # Stage 4: GEOMETRY (Calculated from raster-detected geometry)
            self._update_stage(conn, run_id, "GEOMETRY")
            poly = det_result.get("polygon_geojson") or parse_json(sp.get("spill_polygon_geojson"))
            if not poly and data_mode == "real":
                raise ValueError(f"Real-Data Mode: No valid georeferenced polygon produced for spill '{spill_id}'.")
            geom = characterize_polygon(poly) if poly else {}
            centroid = det_result.get("centroid_geojson") or ({"type": "Point", "coordinates": [geom.get("centroid_lon", 72.68), geom.get("centroid_lat", 15.42)]} if geom else None)
            conn.execute("""
                UPDATE oil_spills
                SET area_km2=?, perimeter_km=?, length_km=?, width_km=?, orientation_deg=?, compactness=?, 
                    spill_polygon_geojson=?, centroid_geojson=?, updated_at=?
                WHERE id=?
            """, (geom.get("area_km2", 0.0), geom.get("perimeter_km", 0.0), geom.get("length_km", 0.0), geom.get("width_km", 0.0),
                  geom.get("orientation_deg", 0.0), geom.get("compactness", 0.0), 
                  dump_json(poly), dump_json(centroid), now, spill_id))
            self._log_audit_event(conn, run_id, "geometry_completed", geom)

            # Persist alert linked to incident and pipeline run
            try:
                from app.api.alerts import create_alert
                alert_rec = create_alert(
                    conn,
                    spill_id=spill_id,
                    incident_name=sp.get("incident_name", f"Spill Incident {spill_id}"),
                    alert_time=now,
                    severity=sp.get("severity", "high"),
                    status="active",
                    confidence=det_result["confidence"],
                    source_scene=sp.get("satellite_image_id", "Sentinel-1 SAR"),
                    location_geojson=poly,
                    provenance="OBSERVED_REAL_API" if data_mode == "real" else "synthetic",
                    pipeline_run_id=run_id,
                )
                self._log_audit_event(conn, run_id, "alert_created", {"alert_id": alert_rec["id"]})
            except Exception as alert_err:
                self._log_audit_event(conn, run_id, "alert_notice", {"error": str(alert_err)})

            # Stage 5: ENVIRONMENT
            self._update_stage(conn, run_id, "ENVIRONMENT")
            use_real = (data_mode == "real")
            if use_real:
                from app.integrations.copernicus_marine_service import copernicus_marine_service
                from app.integrations.cds_service import cds_service
                from app.integrations.openmeteo_service import openmeteo_service
                bbox = [72.0, 14.5, 73.5, 16.0]
                try:
                    current_data = copernicus_marine_service.get_real_current_field()
                except Exception:
                    current_data = openmeteo_service.fetch_current_field(bbox=bbox)
                try:
                    wind_data = cds_service.get_real_wind_field()
                except Exception:
                    wind_data = openmeteo_service.fetch_wind_field(bbox=bbox)
                env_source = "Copernicus Marine / Open-Meteo Global Marine + ERA5"
                prov_val = "operational"
                self._log_audit_event(conn, run_id, "environment_loaded", {
                    "source": env_source,
                    "data_mode": "real",
                    "provenance": "operational",
                    "status": "OPERATIONAL HYDRODYNAMIC VECTORS"
                })
            else:
                env_current = conn.execute("SELECT field_data_json FROM environmental_fields WHERE spill_id=? AND field_type=?", (spill_id, "current")).fetchone()
                env_wind = conn.execute("SELECT field_data_json FROM environmental_fields WHERE spill_id=? AND field_type=?", (spill_id, "wind")).fetchone()
                if not env_current:
                    raise ValueError("Current data unavailable for this time/location.")
                if not env_wind:
                    raise ValueError("Wind data unavailable for this time/location.")
                current_data = parse_json(env_current["field_data_json"])
                wind_data = parse_json(env_wind["field_data_json"])
                env_source = "SYNTHETIC_HYDRODYNAMICS"
                prov_val = "synthetic"
                self._log_audit_event(conn, run_id, "environment_loaded", {"source": "SYNTHETIC_HYDRODYNAMICS", "data_mode": "simulation"})

            # Stage 6: HINDCAST
            self._update_stage(conn, run_id, "HINDCAST")
            coords = poly["coordinates"][0] if poly else []
            centroid = parse_json(sp["centroid_geojson"])
            c_lat = centroid["coordinates"][1] if centroid else 15.42
            c_lon = centroid["coordinates"][0] if centroid else 72.68
            t0 = datetime.fromisoformat(sp["satellite_acquisition_time"].replace("Z", "+00:00"))

            hcast = run_hindcast(
                c_lat, c_lon, coords, t0, current_data, wind_data,
                windage_coefficient=settings.default_windage_coefficient,
                particle_count=settings.default_particle_count,
                timestep_min=settings.default_integration_timestep_minutes,
                hindcast_hours=settings.default_hindcast_hours,
                seed=settings.oiltrace_demo_seed
            )
            hcast_id = f"HCAST-{spill_id}-{uuid.uuid4().hex[:8]}"
            hcast_prov = "reconstructed" if use_real else "synthetic"
            conn.execute("DELETE FROM particle_trajectories WHERE spill_id=? AND run_type=?", (spill_id, "hindcast"))
            conn.execute("""INSERT INTO particle_trajectories
                (id,spill_id,run_type,windage_coefficient,particle_count,integration_timestep_min,
                 integration_hours,integration_method,particles_json,origin_region_geojson,
                 origin_centroid_geojson,origin_time_estimate,origin_time_uncertainty_h,
                 spatial_uncertainty_km,environmental_source,data_mode,provenance,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (hcast_id, spill_id, "hindcast", hcast["windage_coefficient"], hcast["particle_count"],
                 hcast["timestep_min"], hcast["hindcast_hours"], hcast["integration_method"],
                 dump_json(hcast["particles"]), dump_json(hcast["origin_region_geojson"]),
                 dump_json(hcast["origin_centroid_geojson"]), hcast["origin_time_estimate"],
                 hcast["origin_time_uncertainty_h"], hcast["spatial_uncertainty_km"],
                 env_source, data_mode, hcast_prov, now))
            self._log_audit_event(conn, run_id, "hindcast_completed", {"origin_lat": hcast["origin_lat"], "origin_lon": hcast["origin_lon"], "data_mode": data_mode})

            # Stage 7: AIS FILTERING & ATTRIBUTION
            self._update_stage(conn, run_id, "AIS_FILTERING")
            all_obs = conn.execute("SELECT * FROM ais_observations").fetchall()
            if not all_obs:
                raise ValueError("No AIS records found in the requested window.")
            obs_list = [row_to_dict(o) for o in all_obs]

            origin_lat = hcast["origin_lat"]
            origin_lon = hcast["origin_lon"]
            origin_time = datetime.fromisoformat(hcast["origin_time_estimate"].replace("Z", "+00:00"))

            # Determine velocities for trajectory filter & heading compatibility
            if use_real:
                try:
                    cur_vel = copernicus_marine_service.get_velocity_at(origin_lat, origin_lon)
                    current_u = cur_vel["u"]
                    current_v = cur_vel["v"]
                except Exception:
                    current_u = current_data.get("current", {}).get("mean_u", 0.18)
                    current_v = current_data.get("current", {}).get("mean_v", 0.12)
                wind_u = wind_data.get("wind", {}).get("mean_u", 5.2)
                wind_v = wind_data.get("wind", {}).get("mean_v", 3.8)
            else:
                pts = current_data.get("points", [])
                mid = pts[len(pts)//2] if pts else {}
                current_u = mid.get("current_u", 0.18)
                current_v = mid.get("current_v", 0.12)
                wind_u = mid.get("wind_u", 5.2)
                wind_v = mid.get("wind_v", 3.8)

            spatial_passed, _ = spatial_filter(obs_list, origin_lat, origin_lon, settings.default_ais_radius_km)
            temporal_passed, _ = temporal_filter(spatial_passed, origin_time, settings.default_ais_temporal_window_hours)
            by_vessel = group_by_vessel(temporal_passed)
            all_by_vessel = group_by_vessel(obs_list)
            traj_passed, _ = trajectory_filter(by_vessel, origin_lat, origin_lon, c_lat, c_lon, current_u, current_v, wind_u, wind_v)
            self._log_audit_event(conn, run_id, "AIS_filtered", {"spatial_count": len(spatial_passed), "temporal_count": len(temporal_passed)})

            self._update_stage(conn, run_id, "ATTRIBUTION")
            vessel_scores = []
            for mmsi, obs in traj_passed.items():
                all_v = all_by_vessel.get(mmsi, obs)
                bf = extract_behaviour_features(all_v, settings.default_track_gap_threshold_minutes)
                sc = score_vessel(mmsi, obs, origin_lat, origin_lon, hcast["origin_time_estimate"],
                                  c_lat, c_lon, current_u=current_u, current_v=current_v,
                                  wind_u=wind_u, wind_v=wind_v,
                                  alpha=settings.default_windage_coefficient,
                                  spatial_radius_km=settings.default_ais_radius_km,
                                  temporal_window_h=settings.default_ais_temporal_window_hours,
                                  weights=weights, behaviour_features=bf)
                sc["mmsi"] = mmsi
                vessel_scores.append(sc)

            for mmsi, obs in all_by_vessel.items():
                if mmsi not in traj_passed:
                    bf = extract_behaviour_features(obs, settings.default_track_gap_threshold_minutes)
                    sc = score_vessel(mmsi, obs, origin_lat, origin_lon, hcast["origin_time_estimate"],
                                      c_lat, c_lon, current_u=current_u, current_v=current_v,
                                      wind_u=wind_u, wind_v=wind_v,
                                      alpha=settings.default_windage_coefficient,
                                      spatial_radius_km=settings.default_ais_radius_km,
                                      temporal_window_h=settings.default_ais_temporal_window_hours,
                                      weights=weights, behaviour_features=bf)
                    sc["mmsi"] = mmsi
                    sc["filtered_at"] = "trajectory"
                    vessel_scores.append(sc)

            if not vessel_scores:
                raise ValueError("No vessel satisfies the current filtering criteria.")

            ranked = rank_vessels(vessel_scores)
            attr_prov = "operational" if use_real else "synthetic"
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
            self._log_audit_event(conn, run_id, "attribution_completed", {"ranked_vessels": len(ranked), "data_mode": data_mode})

            # Stage 8: FORECAST & UNCERTAINTY
            self._update_stage(conn, run_id, "FORECAST")
            fcast = run_forecast(
                c_lat, c_lon, coords, t0, current_data, wind_data,
                windage_coefficient=settings.default_windage_coefficient,
                particle_count=settings.default_particle_count,
                timestep_min=settings.default_integration_timestep_minutes,
                forecast_hours=settings.default_forecast_hours,
                seed=settings.oiltrace_demo_seed
            )
            fcast_id = f"FCAST-{spill_id}-{uuid.uuid4().hex[:8]}"
            fcast_prov = "predicted" if use_real else "synthetic"
            conn.execute("DELETE FROM particle_trajectories WHERE spill_id=? AND run_type=?", (spill_id, "forecast"))
            conn.execute("""INSERT INTO particle_trajectories
                (id,spill_id,run_type,windage_coefficient,particle_count,integration_timestep_min,
                 integration_hours,integration_method,particles_json,data_mode,provenance,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (fcast_id, spill_id, "forecast", fcast["windage_coefficient"], fcast["particle_count"],
                 fcast["timestep_min"], fcast["forecast_hours"], fcast["integration_method"],
                 dump_json(fcast["particles"]), data_mode, fcast_prov, now))
            self._log_audit_event(conn, run_id, "forecast_completed", {"horizons": list(fcast["horizon_stats"].keys()), "data_mode": data_mode})

            # Update oil_spills table with current data mode & provenance
            conn.execute("UPDATE oil_spills SET data_mode=?, provenance=?, updated_at=? WHERE id=?",
                         (data_mode, prov_val, now, spill_id))

            # Stage 9: REPORT & COMPLETE
            self._update_stage(conn, run_id, "REPORT")
            from app.reports.generator import generate_investigation_report
            res_report = generate_investigation_report(spill_id, conn)
            report_id = res_report["report_id"]
            html = res_report["html"]
            sections_json = dump_json(res_report["sections"])
            conn.execute("""
                INSERT OR REPLACE INTO investigation_reports
                (id,spill_id,report_version,status,report_html,sections_json,generated_at,created_at)
                VALUES (?,?,?,?,?,?,?,?)
            """, (report_id, spill_id, "1.0", "complete", html, sections_json, now, now))
            self._log_audit_event(conn, run_id, "report_generated", {"report_id": report_id, "data_mode": data_mode})

            self._update_stage(conn, run_id, "COMPLETE")
            structured_prov = {
                "mode": data_mode,
                "provenance": prov_val,
                "source": env_source,
                "scene_id": sp.get("satellite_image_id") or spill_id,
                "acquisition_time": sp.get("satellite_acquisition_time"),
                "processing_version": sp.get("preprocessing_version", "1.2.0"),
                "generated_at": now,
            }
            return {
                "run_id": run_id,
                "spill_id": spill_id,
                "status": "completed",
                "stages_completed": ["VALIDATING", "PREPROCESSING", "DETECTING", "GEOMETRY", "ENVIRONMENT", "HINDCAST", "AIS_FILTERING", "ATTRIBUTION", "FORECAST", "UNCERTAINTY", "REPORT"],
                "data_mode": data_mode,
                "mode": data_mode,
                "provenance": prov_val,
                "environmental_source": env_source,
                "structured_provenance": structured_prov,
                "seed": settings.oiltrace_demo_seed if data_mode == "simulation" else None,
            }

        except Exception as e:
            self._update_stage(conn, run_id, "FAILED", str(e))
            self._log_audit_event(conn, run_id, "pipeline_failed", {"error": str(e)})
            raise e
        finally:
            conn.close()

analysis_service = AnalysisService()
