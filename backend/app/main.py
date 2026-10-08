import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.database.engine import init_db, get_connection, row_get, extract_count, extract_row_val
from app.config import settings
from app.api import health, dashboard, vessels, attribution, reports, analysis, digital_twin, scenes, environment, alerts
from app.api import spills as spills_router
from app.api import ais as ais_router

def _seed_incident(incident_id: str):
    conn = get_connection()
    try:
        from app.simulation.generator import generate_demo_incident
        demo = generate_demo_incident(incident_id=incident_id)
        img = demo["satellite_image"]
        conn.execute("""INSERT OR IGNORE INTO satellite_images
            (id,filename,file_size_bytes,format,crs,resolution_m,acquisition_time,
             region_name,bounds_geojson,channels,width_px,height_px,satellite_name,
             data_mode,provenance,source,created_at,metadata_json)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (img["id"],img["filename"],img["file_size_bytes"],img["format"],img["crs"],
             img["resolution_m"],img["acquisition_time"],img["region_name"],img["bounds_geojson"],
             img["channels"],img["width_px"],img["height_px"],img["satellite_name"],
             img["data_mode"],img["provenance"],img["source"],img["created_at"],img["metadata_json"]))
        sp = demo["spill"]
        conn.execute("""INSERT OR IGNORE INTO oil_spills
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
            conn.execute("""INSERT OR IGNORE INTO ais_observations
                (id,mmsi,timestamp,latitude,longitude,sog_knots,cog_deg,heading_deg,nav_status,data_mode,provenance,source)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (obs["id"],obs["mmsi"],obs["timestamp"],obs["latitude"],obs["longitude"],
                 obs.get("sog_knots"),obs.get("cog_deg"),obs.get("heading_deg"),obs.get("nav_status"),
                 obs["data_mode"],obs["provenance"],obs.get("source")))
        for t in demo["vessel_tracks"]:
            conn.execute("""INSERT OR IGNORE INTO vessel_tracks
                (id,mmsi,spill_id,track_geojson,start_time,end_time,point_count,data_mode,provenance)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (t["id"],t["mmsi"],t["spill_id"],t["track_geojson"],t["start_time"],t["end_time"],
                 t["point_count"],t["data_mode"],t["provenance"]))
        for ef in demo["environmental_fields"]:
            conn.execute("""INSERT OR IGNORE INTO environmental_fields
                (id,spill_id,field_type,timestamp,valid_time_start,valid_time_end,source,source_version,
                 resolution_deg,region_geojson,field_data_json,data_mode,provenance,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (ef["id"],ef["spill_id"],ef["field_type"],ef["timestamp"],ef.get("valid_time_start"),
                 ef.get("valid_time_end"),ef["source"],ef.get("source_version"),ef.get("resolution_deg"),
                 ef.get("region_geojson"),ef["field_data_json"],ef["data_mode"],ef["provenance"],ef["created_at"]))
        conn.commit()

        traj_row = conn.execute("SELECT count(*) AS cnt FROM particle_trajectories WHERE spill_id=?", (incident_id,)).fetchone()
        traj_count = extract_count(traj_row)
        if traj_count == 0:
            from app.api.spills import _execute_full_analysis
            _execute_full_analysis(incident_id)
            print(f"[SEED] Deterministic hindcast/forecast/attribution pre-generated for {incident_id}.")
    finally:
        conn.close()

def seed_demo_data():
    """Seed the demo incident if not already present."""
    scenes_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../data/satellite_scenes"))
    if not os.path.exists(os.path.join(scenes_dir, "S1A_IW_GRDH_1SDV_20240315T060000_composite.png")):
        from app.simulation.satellite_imagery_generator import generate_mock_satellite_scenes
        generate_mock_satellite_scenes(scenes_dir)

    conn = get_connection()
    try:
        for inc_id in ["OILTRACE-DEMO-001"]:
            row = conn.execute("SELECT id FROM oil_spills WHERE id=?", (inc_id,)).fetchone()
            if not row:
                _seed_incident(inc_id)
            else:
                conn.execute("UPDATE oil_spills SET data_mode='simulation', provenance='synthetic' WHERE id=?", (inc_id,))
                conn.commit()
                traj_row = conn.execute("SELECT count(*) AS cnt FROM particle_trajectories WHERE spill_id=?", (inc_id,)).fetchone()
                traj_count = extract_count(traj_row)
                if traj_count == 0:
                    from app.api.spills import _execute_full_analysis
                    _execute_full_analysis(inc_id)
        print("[SEED] Demo data seeded successfully.")
    except Exception as e:
        print(f"[SEED ERROR] {e}")
        import traceback; traceback.print_exc()
    finally:
        conn.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    conn = get_connection()
    try:
        spill_count = conn.execute("SELECT count(*) AS cnt FROM oil_spills").fetchone()
        count_val = extract_count(spill_count)
        traj_count = conn.execute("SELECT count(*) AS cnt FROM particle_trajectories WHERE spill_id='OILTRACE-DEMO-001'").fetchone()
        traj_val = extract_count(traj_count)
    except Exception:
        count_val = 0
        traj_val = 0
    finally:
        conn.close()

    current_mode = getattr(settings, "data_mode", getattr(settings, "default_data_mode", "real"))
    should_seed = (
        count_val == 0
        or traj_val == 0
        or getattr(settings, "simulation_seed_enabled", False)
        or os.getenv("SIMULATION_SEED_ENABLED", "false").lower() in ("true", "1")
        or os.getenv("SEED_DEMO", "false").lower() in ("true", "1")
        or current_mode == "simulation"
    )
    if should_seed:
        seed_demo_data()
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
