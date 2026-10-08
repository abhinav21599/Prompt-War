import json
import logging
import re, os
import sqlite3
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def normalize_db_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]

    return url


def get_db_path() -> str:
    from app.config import settings

    url = settings.database_url
    if url.startswith("sqlite:///"):
        return url[len("sqlite:///") :]

    return str(Path(__file__).resolve().parents[2] / "data" / "oiltrace.db")


class PostgresRow(dict):
    """Dictionary that also supports integer indexing like sqlite3.Row."""
    def __getitem__(self, key):
        if isinstance(key, int):
            if key in self:
                return super().__getitem__(key)
            vals = list(self.values())
            if 0 <= key < len(vals):
                return vals[key]
            raise KeyError(key)
        return super().__getitem__(key)


class PostgresCursorWrapper:
    def __init__(self, pg_cursor):
        self._cursor = pg_cursor

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        return PostgresRow(row)

    def fetchall(self):
        return [PostgresRow(row) for row in self._cursor.fetchall()]

    def __iter__(self):
        for row in self._cursor:
            yield PostgresRow(row)

    @property
    def description(self):
        return self._cursor.description


class PostgresConnectionWrapper:
    def __init__(self, pg_conn):
        self._conn = pg_conn

    def _adapt_sql(self, sql: str) -> str:
        adapted = re.sub(
            r"INSERT\s+OR\s+(IGNORE|REPLACE)\s+INTO",
            "INSERT INTO",
            sql,
            flags=re.IGNORECASE,
        )
        if (
            "INSERT INTO" in adapted.upper()
            and "ON CONFLICT" not in adapted.upper()
        ):
            adapted += " ON CONFLICT DO NOTHING"
        return adapted.replace("?", "%s")

    def execute(self, sql: str, params: Any = None):
        cursor = self._conn.cursor()
        adapted = self._adapt_sql(sql)
        if params is None:
            cursor.execute(adapted)
        elif isinstance(params, (list, tuple, dict)):
            cursor.execute(adapted, params)
        else:
            cursor.execute(adapted, (params,))
        return PostgresCursorWrapper(cursor)

    def executescript(self, script: str):
        cursor = self._conn.cursor()
        cursor.execute(script)
        self._conn.commit()

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.rollback() if exc_type else self.commit()


def get_connection():
    from app.config import settings

    url = normalize_db_url(settings.database_url)
    if url.startswith("postgresql://") or url.startswith("postgresql+"):
        try:
            import psycopg2
            from psycopg2.extras import RealDictCursor

            clean_url = re.sub(r"^postgresql\+[a-zA-Z0-9_-]+://", "postgresql://", url)
            connection = psycopg2.connect(
                clean_url, cursor_factory=RealDictCursor, connect_timeout=5
            )
            return PostgresConnectionWrapper(connection)
        except Exception as error:
            env_mode = os.getenv("ENVIRONMENT", "production").lower()
            strict_mode = os.getenv("STRICT_DB", "false").lower() in ("true", "1")
            if (env_mode == "production" and "localhost" not in url and "127.0.0.1" not in url) or strict_mode:
                logger.error("[DB FATAL] Production PostgreSQL database connection failed: %s", error)
                raise RuntimeError(f"Production PostgreSQL connection failed: {error}") from error
            logger.warning(
                "[DB] PostgreSQL unavailable (%s); using local SQLite for development.", error
            )

    db_path = get_db_path()
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, detect_types=sqlite3.PARSE_DECLTYPES)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


SCHEMA_SQL = (
    "CREATE TABLE IF NOT EXISTS satellite_images ("
    " id TEXT PRIMARY KEY, filename TEXT, file_size_bytes INTEGER, format TEXT,"
    " crs TEXT, resolution_m REAL, acquisition_time TEXT NOT NULL,"
    " region_name TEXT, bounds_geojson TEXT, channels INTEGER,"
    " width_px INTEGER, height_px INTEGER, satellite_name TEXT DEFAULT 'Sentinel-1A',"
    " data_mode TEXT NOT NULL, provenance TEXT NOT NULL, source TEXT,"
    " created_at TEXT NOT NULL, metadata_json TEXT);"
    "CREATE TABLE IF NOT EXISTS oil_spills ("
    " id TEXT PRIMARY KEY, satellite_image_id TEXT REFERENCES satellite_images(id),"
    " incident_name TEXT, status TEXT NOT NULL, detected_class TEXT,"
    " detection_confidence REAL, spill_polygon_geojson TEXT, centroid_geojson TEXT,"
    " bounding_box_geojson TEXT, area_km2 REAL, perimeter_km REAL, length_km REAL,"
    " width_km REAL, orientation_deg REAL, compactness REAL, detection_time TEXT,"
    " satellite_acquisition_time TEXT, data_mode TEXT NOT NULL, provenance TEXT NOT NULL,"
    " model_version TEXT, preprocessing_version TEXT, model_threshold REAL,"
    " region_name TEXT, severity TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);"
    "CREATE TABLE IF NOT EXISTS alerts ("
    " id TEXT PRIMARY KEY, spill_id TEXT REFERENCES oil_spills(id),"
    " scene_id TEXT, title TEXT, incident_name TEXT, alert_time TEXT, acquisition_time TEXT,"
    " satellite_name TEXT, severity TEXT DEFAULT 'high', status TEXT DEFAULT 'active',"
    " confidence REAL, detection_confidence REAL, area_km2 REAL, source_scene TEXT,"
    " location_geojson TEXT, centroid_geojson TEXT, polygon_geojson TEXT, model_version TEXT,"
    " data_mode TEXT NOT NULL DEFAULT 'real', provenance TEXT NOT NULL DEFAULT 'OBSERVED_REAL_API',"
    " pipeline_run_id TEXT, investigation_spill_id TEXT, acknowledged_at TEXT,"
    " created_at TEXT NOT NULL, updated_at TEXT);"
    "CREATE TABLE IF NOT EXISTS vessels ("
    " mmsi TEXT PRIMARY KEY, imo TEXT, vessel_name TEXT, vessel_type TEXT,"
    " call_sign TEXT, flag TEXT, length_m REAL, beam_m REAL, draught_m REAL,"
    " gross_tonnage REAL, data_mode TEXT NOT NULL, provenance TEXT NOT NULL, created_at TEXT NOT NULL);"
    "CREATE TABLE IF NOT EXISTS ais_observations ("
    " id TEXT PRIMARY KEY, mmsi TEXT NOT NULL, timestamp TEXT NOT NULL,"
    " latitude REAL NOT NULL, longitude REAL NOT NULL, sog_knots REAL, cog_deg REAL,"
    " heading_deg REAL, nav_status TEXT, data_mode TEXT NOT NULL, provenance TEXT NOT NULL, source TEXT);"
    "CREATE TABLE IF NOT EXISTS vessel_tracks ("
    " id TEXT PRIMARY KEY, mmsi TEXT NOT NULL, spill_id TEXT REFERENCES oil_spills(id),"
    " track_geojson TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,"
    " point_count INTEGER, data_mode TEXT NOT NULL, provenance TEXT NOT NULL);"
    "CREATE TABLE IF NOT EXISTS environmental_fields ("
    " id TEXT PRIMARY KEY, spill_id TEXT REFERENCES oil_spills(id),"
    " field_type TEXT NOT NULL, timestamp TEXT NOT NULL, valid_time_start TEXT, valid_time_end TEXT,"
    " source TEXT NOT NULL, source_version TEXT, resolution_deg REAL, region_geojson TEXT,"
    " field_data_json TEXT NOT NULL, data_mode TEXT NOT NULL, provenance TEXT NOT NULL, created_at TEXT NOT NULL);"
    "CREATE TABLE IF NOT EXISTS particle_trajectories ("
    " id TEXT PRIMARY KEY, spill_id TEXT REFERENCES oil_spills(id),"
    " run_type TEXT NOT NULL, windage_coefficient REAL NOT NULL, particle_count INTEGER NOT NULL,"
    " integration_timestep_min INTEGER NOT NULL, integration_hours REAL NOT NULL,"
    " integration_method TEXT NOT NULL, particles_json TEXT NOT NULL,"
    " origin_region_geojson TEXT, origin_centroid_geojson TEXT, origin_time_estimate TEXT,"
    " origin_time_uncertainty_h REAL, spatial_uncertainty_km REAL, environmental_source TEXT,"
    " data_mode TEXT NOT NULL, provenance TEXT NOT NULL, created_at TEXT NOT NULL);"
    "CREATE TABLE IF NOT EXISTS attributions ("
    " id TEXT PRIMARY KEY, spill_id TEXT NOT NULL REFERENCES oil_spills(id),"
    " mmsi TEXT NOT NULL REFERENCES vessels(mmsi), rank INTEGER,"
    " distance_km REAL, time_delta_h REAL, track_overlap_score REAL,"
    " heading_compat_score REAL, ais_continuity_score REAL,"
    " norm_proximity REAL, norm_temporal REAL, norm_trajectory REAL, norm_heading REAL, norm_continuity REAL,"
    " weight_proximity REAL, weight_temporal REAL, weight_trajectory REAL, weight_heading REAL, weight_continuity REAL,"
    " evidence_score REAL, data_confidence REAL, final_score REAL,"
    " behaviour_observations_json TEXT, ais_gap_detected INTEGER DEFAULT 0, ais_gap_duration_min REAL,"
    " slowdown_observed INTEGER DEFAULT 0, course_change_observed INTEGER DEFAULT 0,"
    " ais_coverage_pct REAL, spatial_radius_km REAL, temporal_window_h REAL,"
    " data_mode TEXT NOT NULL, provenance TEXT NOT NULL, created_at TEXT NOT NULL);"
    "CREATE TABLE IF NOT EXISTS investigation_reports ("
    " id TEXT PRIMARY KEY, spill_id TEXT NOT NULL REFERENCES oil_spills(id),"
    " report_version TEXT NOT NULL, status TEXT NOT NULL,"
    " report_html TEXT, report_pdf_path TEXT, sections_json TEXT,"
    " generated_at TEXT, created_at TEXT NOT NULL);"
    "CREATE TABLE IF NOT EXISTS analysis_runs ("
    " id TEXT PRIMARY KEY, spill_id TEXT REFERENCES oil_spills(id),"
    " run_type TEXT NOT NULL, status TEXT NOT NULL, data_mode TEXT NOT NULL,"
    " satellite_scene_id TEXT, satellite_source TEXT, capture_timestamp TEXT,"
    " model_version TEXT, preprocessing_version TEXT, model_threshold REAL,"
    " environment_source TEXT, environment_time_range_start TEXT, environment_time_range_end TEXT,"
    " windage_coefficient REAL, particle_count INTEGER, integration_timestep_min INTEGER,"
    " hindcast_hours REAL, forecast_hours REAL, ais_source TEXT, ais_coverage_pct REAL,"
    " scoring_config_json TEXT, error_message TEXT,"
    " started_at TEXT NOT NULL, completed_at TEXT, report_version TEXT DEFAULT '1.0');"
    "CREATE TABLE IF NOT EXISTS audit_log ("
    " id TEXT PRIMARY KEY, analysis_run_id TEXT REFERENCES analysis_runs(id),"
    " event_type TEXT NOT NULL, event_data_json TEXT, timestamp TEXT NOT NULL);"
    "CREATE INDEX IF NOT EXISTS idx_ais_mmsi ON ais_observations(mmsi, timestamp);"
    "CREATE INDEX IF NOT EXISTS idx_attr_spill ON attributions(spill_id);"
    "CREATE INDEX IF NOT EXISTS idx_particles_spill ON particle_trajectories(spill_id, run_type);"
)


def init_db():
    from app.config import settings

    url = normalize_db_url(settings.database_url)
    if url.startswith("postgresql://"):
        try:
            import importlib
            sqlalchemy = importlib.import_module("sqlalchemy")
            create_engine = getattr(sqlalchemy, "create_engine")
            text = getattr(sqlalchemy, "text")
            from app.database.models import Base

            engine = create_engine(url, connect_args={"connect_timeout": 5})
            with engine.connect() as connection:
                try:
                    connection.execute(
                        text("CREATE EXTENSION IF NOT EXISTS postgis;")
                    )
                    connection.commit()
                except Exception as ext_err:
                    logger.warning("[DB] PostGIS extension notice: %s", ext_err)
            Base.metadata.create_all(bind=engine)
            logger.info("[DB] PostgreSQL schema ready at %s", url.split("@")[-1])
            return
        except (Exception, ImportError) as pg_err:
            env_mode = os.getenv("ENVIRONMENT", "production").lower()
            strict_mode = os.getenv("STRICT_DB", "false").lower() in ("true", "1")
            if (env_mode == "production" and "localhost" not in url and "127.0.0.1" not in url) or strict_mode:
                logger.error("[DB FATAL] Production PostgreSQL schema initialization failed: %s", pg_err)
                raise RuntimeError(f"Production PostgreSQL schema initialization failed: {pg_err}") from pg_err
            logger.warning(
                "[DB] PostgreSQL / SQLAlchemy unavailable (%s); initializing local SQLite fallback schema for local development.",
                pg_err,
            )

    connection = get_connection()
    try:
        connection.executescript(SCHEMA_SQL)
        columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(analysis_runs)"
            ).fetchall()
        }
        for name, column_type in (
            ("scoring_config_json", "TEXT"),
            ("environment_source", "TEXT"),
            ("environment_time_range_start", "TEXT"),
            ("environment_time_range_end", "TEXT"),
        ):
            if name not in columns:
                connection.execute(
                    f"ALTER TABLE analysis_runs ADD COLUMN {name} {column_type}"
                )

        alert_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(alerts)"
            ).fetchall()
        }
        for name, column_type in (
            ("scene_id", "TEXT"),
            ("title", "TEXT"),
            ("acquisition_time", "TEXT"),
            ("satellite_name", "TEXT"),
            ("detection_confidence", "REAL"),
            ("area_km2", "REAL"),
            ("centroid_geojson", "TEXT"),
            ("polygon_geojson", "TEXT"),
            ("model_version", "TEXT"),
            ("data_mode", "TEXT DEFAULT 'real'"),
            ("provenance", "TEXT DEFAULT 'OBSERVED_REAL_API'"),
            ("investigation_spill_id", "TEXT"),
            ("updated_at", "TEXT"),
        ):
            if name not in alert_columns:
                connection.execute(
                    f"ALTER TABLE alerts ADD COLUMN {name} {column_type}"
                )

        connection.commit()
        logger.info("[DB] Initialized SQLite at %s", get_db_path())
    finally:
        connection.close()


# ── Utility helpers ────────────────────────────────────────────────────────────


def row_to_dict(row):
    if row is None:
        return None
    if isinstance(row, dict):
        return row
    try:
        return dict(row)
    except Exception:
        return row


def row_get(row, key_or_index, default=None):
    if row is None:
        return default
    if isinstance(row, dict):
        if isinstance(key_or_index, str):
            return row.get(key_or_index, default)
        # If integer key requested on a dict, check if values list has it or key exists
        if key_or_index in row:
            return row[key_or_index]
        vals = list(row.values())
        if isinstance(key_or_index, int) and 0 <= key_or_index < len(vals):
            return vals[key_or_index]
        return default
    try:
        return row[key_or_index]
    except Exception:
        return default


def extract_count(row) -> int:
    """Safely extracts integer count from a row regardless of column name or driver mapping."""
    if row is None:
        return 0
    if isinstance(row, dict):
        for k in ("cnt", "count", "count(*)"):
            if k in row:
                try:
                    return int(row[k] or 0)
                except (ValueError, TypeError):
                    pass
        vals = list(row.values())
        if vals:
            try:
                return int(vals[0] or 0)
            except (ValueError, TypeError):
                pass
    try:
        return int(row["cnt"])
    except Exception:
        pass
    try:
        return int(row["count"])
    except Exception:
        pass
    try:
        return int(row[0])
    except Exception:
        pass
    return 0


def extract_row_val(row, key: str, index: int = 0, default: Any = None) -> Any:
    """Safely extracts a column value from sqlite3.Row, RealDictRow, PostgresRow, dict, or tuple."""
    if row is None:
        return default
    if isinstance(row, dict):
        if key in row:
            return row[key]
        vals = list(row.values())
        if 0 <= index < len(vals):
            return vals[index]
        return default
    try:
        return row[key]
    except Exception:
        try:
            return row[index]
        except Exception:
            return default


def parse_json(value):
    if value is None:
        return None
    try:
        return json.loads(value)
    except Exception:
        return value


def dump_json(value):
    if value is None:
        return None
    return json.dumps(value, default=str)
