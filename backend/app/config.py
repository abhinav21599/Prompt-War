from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_name: str = "OILTRACE AI"
    app_version: str = "1.0.0"
    debug: bool = True

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, v):
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes", "debug")
        return bool(v)

    host: str = "0.0.0.0"
    port: int = 8000
    frontend_url: str = "http://localhost:5173"
    database_url: str = "postgresql://postgres:postgres@localhost:5432/oiltrace"
    oiltrace_demo_seed: int = 26143
    default_data_mode: str = "simulation"
    model_version: str = "1.0.0-demo"
    model_threshold: float = 0.42
    preprocessing_version: str = "1.2.0"
    default_windage_coefficient: float = 0.03
    default_particle_count: int = 100
    default_integration_timestep_minutes: int = 30
    default_hindcast_hours: int = 18
    default_forecast_hours: int = 48
    default_ais_radius_km: float = 50.0
    default_ais_temporal_window_hours: float = 2.0
    default_track_gap_threshold_minutes: int = 60
    weight_proximity: float = 0.35
    weight_temporal: float = 0.25
    weight_trajectory: float = 0.20
    weight_heading: float = 0.10
    weight_continuity: float = 0.10
    model_path: str = ""
    alert_poll_interval_seconds: int = 300
    report_output_dir: str = "data/processed/reports"
    max_upload_size_mb: int = 512
    aisstream_api_key: str = ""

    @property
    def max_upload_bytes(self): return self.max_upload_size_mb * 1024 * 1024

    @property
    def attribution_weights(self):
        return {"proximity": self.weight_proximity, "temporal": self.weight_temporal,
                "trajectory": self.weight_trajectory, "heading": self.weight_heading,
                "continuity": self.weight_continuity}

settings = Settings()
