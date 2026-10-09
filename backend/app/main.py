import os
# Configure native library threading before C extensions load to minimize memory overhead
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.database.engine import init_db, get_connection, row_get, extract_count, extract_row_val
from app.config import settings
from app.api import health, dashboard, vessels, attribution, reports, analysis, digital_twin, scenes, environment, alerts
from app.api import spills as spills_router
from app.api import ais as ais_router

def _get_process_rss_mb() -> float:
    """Read actual process RSS in MiB (Linux /proc/self/status with cross-platform fallback)."""
    try:
        if os.path.exists("/proc/self/status"):
            with open("/proc/self/status", "r") as f:
                for line in f:
                    if line.startswith("VmRSS:"):
                        parts = line.split()
                        return round(int(parts[1]) / 1024.0, 2)
    except Exception:
        pass
    try:
        import resource
        return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0, 2)
    except Exception:
        pass
    try:
        import psutil
        return round(psutil.Process().memory_info().rss / (1024.0 * 1024.0), 2)
    except Exception:
        return 0.0

def _insert_demo_records(conn, demo: dict):
    img = demo["satellite_image"]
    conn.execute("""INSERT OR REPLACE INTO satellite_images
        (id,filename,file_size_bytes,format,crs,resolution_m,acquisition_time,
         region_name,bounds_geojson,channels,width_px,height_px,satellite_name,
         data_mode,provenance,source,created_at,metadata_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (img["id"],img["filename"],img["file_size_bytes"],img["format"],img["crs"],
         img["resolution_m"],img["acquisition_time"],img["region_name"],img["bounds_geojson"],
         img["channels"],img["width_px"],img["height_px"],img["satellite_name"],
         img["data_mode"],img["provenance"],img["source"],img["created_at"],img["metadata_json"]))
    sp = demo["spill"]
    conn.execute("""INSERT OR REPLACE INTO oil_spills
        (id,satellite_image_id,incident_name,status,detected_class,detection_confidence,
         spill_polygon_geojson,centroid_geojson,bounding_box_geojson,area_km2,perimeter_km,
         length_km,width_km,orientation_deg,compactness,detection_time,satellite_acquisition_time,
         data_mode,provenance,model_version,preprocessing_version,model_threshold,region_name,
         severity,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (sp["id"],sp["satellite_image_id"],sp["incident_name"],sp["status"],sp["detected_class"],
         sp["detection_confidence"],sp["spill_polygon_geojson"],sp["centroid_geojson"],
         sp["bounding_box_geojson"],sp["area_km2"],sp["perimeter_km"],sp["length_km"],
         sp["width_km"],sp["orientation_deg"],sp["compactness"],sp["detection_time"],
         sp["satellite_acquisition_time"],sp["data_mode"],sp["provenance"],sp["model_version"],
         sp["preprocessing_version"],sp["model_threshold"],sp["region_name"],sp["severity"],
         sp["created_at"],sp["updated_at"]))
    for v in demo["vessels"]:
        conn.execute("""INSERT OR IGNORE INTO vessels
            (mmsi,imo,vessel_name,vessel_type,call_sign,flag,length_m,beam_m,draught_m,gross_tonnage,data_mode,provenance,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (v["mmsi"],v["imo"],v["vessel_name"],v["vessel_type"],v.get("call_sign"),v.get("flag"),
             v.get("length_m"),v.get("beam_m"),v.get("draught_m"),v.get("gross_tonnage"),
             v["data_mode"],v["provenance"],v["created_at"]))
    for obs in demo["ais_observations"]:
        conn.execute("""INSERT OR REPLACE INTO ais_observations
            (id,mmsi,timestamp,latitude,longitude,sog_knots,cog_deg,heading_deg,nav_status,data_mode,provenance,source)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (obs["id"],obs["mmsi"],obs["timestamp"],obs["latitude"],obs["longitude"],
             obs.get("sog_knots"),obs.get("cog_deg"),obs.get("heading_deg"),obs.get("nav_status"),
             obs["data_mode"],obs["provenance"],obs.get("source")))
    for t in demo["vessel_tracks"]:
        conn.execute("""INSERT OR REPLACE INTO vessel_tracks
            (id,mmsi,spill_id,track_geojson,start_time,end_time,point_count,data_mode,provenance)
            VALUES (?,?,?,?,?,?,?,?,?)""",
            (t["id"],t["mmsi"],t["spill_id"],t["track_geojson"],t["start_time"],t["end_time"],
             t["point_count"],t["data_mode"],t["provenance"]))
    for ef in demo["environmental_fields"]:
        conn.execute("""INSERT OR REPLACE INTO environmental_fields
            (id,spill_id,field_type,timestamp,valid_time_start,valid_time_end,source,source_version,
             resolution_deg,region_geojson,field_data_json,data_mode,provenance,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (ef["id"],ef["spill_id"],ef["field_type"],ef["timestamp"],ef.get("valid_time_start"),
             ef.get("valid_time_end"),ef["source"],ef.get("source_version"),ef.get("resolution_deg"),
             ef.get("region_geojson"),ef["field_data_json"],ef["data_mode"],ef["provenance"],ef["created_at"]))
    for traj in demo.get("particle_trajectories", []):
        conn.execute("""INSERT OR REPLACE INTO particle_trajectories
            (id,spill_id,run_type,windage_coefficient,particle_count,integration_timestep_min,
             integration_hours,integration_method,particles_json,origin_region_geojson,
             origin_centroid_geojson,origin_time_estimate,origin_time_uncertainty_h,
             spatial_uncertainty_km,environmental_source,data_mode,provenance,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (traj["id"],traj["spill_id"],traj["run_type"],traj["windage_coefficient"],
             traj["particle_count"],traj["integration_timestep_min"],traj["integration_hours"],
             traj["integration_method"],traj["particles_json"],traj.get("origin_region_geojson"),
             traj.get("origin_centroid_geojson"),traj.get("origin_time_estimate"),
             traj.get("origin_time_uncertainty_h"),traj.get("spatial_uncertainty_km"),
             traj.get("environmental_source"),traj["data_mode"],traj["provenance"],traj["created_at"]))
    for attr in demo.get("attributions", []):
        conn.execute("""INSERT OR REPLACE INTO attributions
            (id,spill_id,mmsi,rank,distance_km,time_delta_h,track_overlap_score,heading_compat_score,
             ais_continuity_score,norm_proximity,norm_temporal,norm_trajectory,norm_heading,
             norm_continuity,weight_proximity,weight_temporal,weight_trajectory,weight_heading,
             weight_continuity,evidence_score,data_confidence,final_score,behaviour_observations_json,
             ais_gap_detected,ais_gap_duration_min,slowdown_observed,course_change_observed,
             ais_coverage_pct,spatial_radius_km,temporal_window_h,data_mode,provenance,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (attr["id"],attr["spill_id"],attr["mmsi"],attr["rank"],attr["distance_km"],
             attr["time_delta_h"],attr["track_overlap_score"],attr["heading_compat_score"],
             attr["ais_continuity_score"],attr["norm_proximity"],attr["norm_temporal"],
             attr["norm_trajectory"],attr["norm_heading"],attr["norm_continuity"],
             attr["weight_proximity"],attr["weight_temporal"],attr["weight_trajectory"],
             attr["weight_heading"],attr["weight_continuity"],attr["evidence_score"],
             attr["data_confidence"],attr["final_score"],attr["behaviour_observations_json"],
             attr["ais_gap_detected"],attr["ais_gap_duration_min"],attr["slowdown_observed"],
             attr["course_change_observed"],attr["ais_coverage_pct"],attr["spatial_radius_km"],
             attr["temporal_window_h"],attr["data_mode"],attr["provenance"],attr["created_at"]))
    run = demo.get("analysis_run")
    if run:
        conn.execute("""INSERT OR REPLACE INTO analysis_runs
            (id,spill_id,run_type,status,data_mode,satellite_scene_id,satellite_source,
             capture_timestamp,model_version,preprocessing_version,model_threshold,
             environment_source,environment_time_range_start,environment_time_range_end,
             windage_coefficient,particle_count,integration_timestep_min,hindcast_hours,
             forecast_hours,ais_source,ais_coverage_pct,scoring_config_json,error_message,
             started_at,completed_at,report_version)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (run["id"],run["spill_id"],run["run_type"],run["status"],run["data_mode"],
             run.get("satellite_scene_id"),run.get("satellite_source"),run.get("capture_timestamp"),
             run.get("model_version"),run.get("preprocessing_version"),run.get("model_threshold"),
             run.get("environment_source"),run.get("environment_time_range_start"),
             run.get("environment_time_range_end"),run.get("windage_coefficient"),
             run.get("particle_count"),run.get("integration_timestep_min"),run.get("hindcast_hours"),
             run.get("forecast_hours"),run.get("ais_source"),run.get("ais_coverage_pct"),
             run.get("scoring_config_json"),run.get("error_message"),run["started_at"],
             run.get("completed_at"),run.get("report_version", "1.0")))
    for log in demo.get("audit_logs", []):
        conn.execute("""INSERT OR REPLACE INTO audit_log
            (id,analysis_run_id,event_type,event_data_json,timestamp)
            VALUES (?,?,?,?,?)""",
            (log["id"],log["analysis_run_id"],log["event_type"],log["event_data_json"],log["timestamp"]))
    alt = demo.get("alert")
    if alt:
        conn.execute("""INSERT OR REPLACE INTO alerts
            (id,spill_id,scene_id,title,incident_name,alert_time,acquisition_time,
             satellite_name,severity,status,confidence,detection_confidence,area_km2,
             source_scene,location_geojson,centroid_geojson,polygon_geojson,model_version,
             data_mode,provenance,pipeline_run_id,investigation_spill_id,acknowledged_at,
             created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (alt["id"],alt["spill_id"],alt.get("scene_id"),alt.get("title"),alt.get("incident_name"),
             alt.get("alert_time"),alt.get("acquisition_time"),alt.get("satellite_name"),
             alt.get("severity", "high"),alt.get("status", "active"),alt.get("confidence"),
             alt.get("detection_confidence"),alt.get("area_km2"),alt.get("source_scene"),
             alt.get("location_geojson"),alt.get("centroid_geojson"),alt.get("polygon_geojson"),
             alt.get("model_version"),alt.get("data_mode", "simulation"),alt.get("provenance", "synthetic"),
             alt.get("pipeline_run_id"),alt.get("investigation_spill_id"),alt.get("acknowledged_at"),
             alt["created_at"],alt.get("updated_at")))
    rpt = demo.get("investigation_report")
    if rpt:
        conn.execute("""INSERT OR REPLACE INTO investigation_reports
            (id,spill_id,report_version,status,report_html,report_pdf_path,sections_json,generated_at,created_at)
            VALUES (?,?,?,?,?,?,?,?,?)""",
            (rpt["id"],rpt["spill_id"],rpt["report_version"],rpt["status"],rpt.get("report_html"),
             rpt.get("report_pdf_path"),rpt.get("sections_json"),rpt.get("generated_at"),rpt["created_at"]))


def _seed_incident(incident_id: str):
    conn = get_connection()
    try:
        from app.simulation.generator import generate_demo_incident
        demo = generate_demo_incident(incident_id=incident_id)
        _insert_demo_records(conn, demo)
        conn.commit()
    finally:
        conn.close()


ALL_DEMO_INCIDENTS = ["OILTRACE-DEMO-001", "OILTRACE-DEMO-002", "OILTRACE-DEMO-003"]


def seed_demo_data():
    """Seed all deterministic demo incidents idempotently with full preview records and zero heavy solver overhead."""
    conn = get_connection()
    try:
        from app.simulation.generator import generate_demo_incident
        for inc_id in ALL_DEMO_INCIDENTS:
            demo = generate_demo_incident(incident_id=inc_id)
            _insert_demo_records(conn, demo)
            conn.commit()
        print("[SEED] All 3 demo incidents and complete preview records seeded successfully.")
    except Exception as e:
        print(f"[SEED ERROR] {e}")
        import traceback; traceback.print_exc()
    finally:
        conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    rss_start = _get_process_rss_mb()
    print(f"[STARTUP MEMORY] Process RSS before initialization: {rss_start:.2f} MiB")

    init_db()
    rss_post_db = _get_process_rss_mb()
    print(f"[STARTUP MEMORY] Process RSS after DB init: {rss_post_db:.2f} MiB")

    conn = get_connection()
    try:
        spill_count = conn.execute("SELECT count(*) AS cnt FROM oil_spills").fetchone()
        count_val = extract_count(spill_count)
    except Exception:
        count_val = 0
    finally:
        conn.close()

    current_mode = getattr(settings, "data_mode", getattr(settings, "default_data_mode", "real"))
    should_seed = (
        count_val < len(ALL_DEMO_INCIDENTS)
        or getattr(settings, "simulation_seed_enabled", False)
        or os.getenv("SIMULATION_SEED_ENABLED", "false").lower() in ("true", "1")
        or os.getenv("SEED_DEMO", "false").lower() in ("true", "1")
        or current_mode == "simulation"
    )
    if should_seed:
        seed_demo_data()
        rss_post_seed = _get_process_rss_mb()
        print(f"[STARTUP MEMORY] Process RSS after demo seeding: {rss_post_seed:.2f} MiB")
    else:
        print(f"[STARTUP] {current_mode.upper()} mode active. Seeding skipped.")
    yield

app = FastAPI(
    title="OILTRACE AI API",
    description="Satellite-Based Marine Oil Spill Detection, Drift Reconstruction & Vessel Attribution",
    version="1.0.0",
    lifespan=lifespan,
)

# Allowed CORS origins
allowed_origins = [
    "https://oiltrace-ai-sentinel.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    settings.frontend_url,
]
for env_key in ("PRODUCTION_FRONTEND_URL", "LOCAL_FRONTEND_URL", "FRONTEND_URL"):
    val = os.getenv(env_key)
    if val and val not in allowed_origins:
        allowed_origins.append(val.strip())
extra_origins = os.getenv("CORS_ORIGINS")
if extra_origins:
    for o in extra_origins.split(","):
        if o.strip() and o.strip() not in allowed_origins:
            allowed_origins.append(o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Request
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger("oiltrace")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"[GLOBAL EXCEPTION] {request.method} {request.url.path}: {exc}", exc_info=True)
    origin = request.headers.get("origin", "*")
    headers = {
        "Access-Control-Allow-Origin": origin if origin else "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred.", "path": request.url.path, "error": str(exc)},
        headers=headers,
    )

app.include_router(health.router)
app.include_router(dashboard.router)
app.include_router(spills_router.router)
app.include_router(vessels.router)
app.include_router(attribution.router)
app.include_router(reports.router)
app.include_router(analysis.router)
app.include_router(digital_twin.router)
app.include_router(scenes.router)
app.include_router(environment.router)
app.include_router(alerts.router)
app.include_router(ais_router.router)

from fastapi.staticfiles import StaticFiles
scenes_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../data/satellite_scenes"))
if os.path.exists(scenes_dir):
    app.mount("/static/scenes", StaticFiles(directory=scenes_dir), name="scenes")

@app.get("/health", tags=["health"])
def root_health():
    """Root health check for platform probes (Render, Railway, Kubernetes, Vercel)."""
    return health.health_check()

@app.get("/")
def root():
    return {"product": "OILTRACE AI", "version": "1.0.0", "tagline": "From Satellite Observation to Maritime Evidence"}
