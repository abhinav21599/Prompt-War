import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, ForeignKey, Boolean, Index
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

# Check if PostGIS/GeoAlchemy2 is available
try:
    from geoalchemy2 import Geometry
    HAS_GEOALCHEMY = True
except ImportError:
    HAS_GEOALCHEMY = False


class SatelliteImage(Base):
    __tablename__ = "satellite_images"

    id = Column(String(128), primary_key=True)
    filename = Column(String(512))
    file_size_bytes = Column(Integer)
    format = Column(String(64))
    crs = Column(String(64), default="EPSG:4326")
    resolution_m = Column(Float, default=10.0)
    acquisition_time = Column(String(64), nullable=False)
    region_name = Column(String(256))
    bounds_geojson = Column(Text)
    channels = Column(Integer, default=2)
    width_px = Column(Integer)
    height_px = Column(Integer)
    satellite_name = Column(String(128), default="Sentinel-1A")
    data_mode = Column(String(32), default="real", nullable=False)
    provenance = Column(String(64), default="OBSERVED_REAL_API", nullable=False)
    source = Column(String(128))
    created_at = Column(String(64), nullable=False)
    metadata_json = Column(Text)

    if HAS_GEOALCHEMY:
        footprint_geom = Column(Geometry("POLYGON", srid=4326), nullable=True)

    spills = relationship("OilSpill", back_populates="satellite_image")


class OilSpill(Base):
    __tablename__ = "oil_spills"

    id = Column(String(128), primary_key=True)
    satellite_image_id = Column(String(128), ForeignKey("satellite_images.id"), nullable=True)
    incident_name = Column(String(256))
    status = Column(String(64), default="active", nullable=False)
    detected_class = Column(String(128), default="crude_oil_slick")
    detection_confidence = Column(Float)
    spill_polygon_geojson = Column(Text)
    centroid_geojson = Column(Text)
    bounding_box_geojson = Column(Text)
    area_km2 = Column(Float)
    perimeter_km = Column(Float)
    length_km = Column(Float)
    width_km = Column(Float)
    orientation_deg = Column(Float)
    compactness = Column(Float)
    detection_time = Column(String(64))
    satellite_acquisition_time = Column(String(64))
    data_mode = Column(String(32), default="real", nullable=False)
    provenance = Column(String(64), default="OBSERVED_REAL_API", nullable=False)
    model_version = Column(String(64))
    preprocessing_version = Column(String(64))
    model_threshold = Column(Float)
    region_name = Column(String(256))
    severity = Column(String(64), default="moderate")
    created_at = Column(String(64), nullable=False)
    updated_at = Column(String(64), nullable=False)

    if HAS_GEOALCHEMY:
        polygon_geom = Column(Geometry("POLYGON", srid=4326), nullable=True)
        centroid_geom = Column(Geometry("POINT", srid=4326), nullable=True)

    satellite_image = relationship("SatelliteImage", back_populates="spills")
    alerts = relationship("Alert", back_populates="spill")
    trajectories = relationship("ParticleTrajectory", back_populates="spill")
    attributions = relationship("Attribution", back_populates="spill")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String(128), primary_key=True)
    spill_id = Column(String(128), ForeignKey("oil_spills.id"), nullable=True)
    scene_id = Column(String(128), nullable=True)
    title = Column(String(256), nullable=True)
    incident_name = Column(String(256), nullable=True)
    alert_time = Column(String(64), nullable=True)
    acquisition_time = Column(String(64), nullable=True)
    satellite_name = Column(String(128), nullable=True)
    severity = Column(String(64), default="high")
    status = Column(String(64), default="active")  # active, new, acknowledged, resolved, investigating, dismissed
    confidence = Column(Float, nullable=True)
    detection_confidence = Column(Float, nullable=True)
    area_km2 = Column(Float, nullable=True)
    source_scene = Column(String(256), nullable=True)
    location_geojson = Column(Text, nullable=True)
    centroid_geojson = Column(Text, nullable=True)
    polygon_geojson = Column(Text, nullable=True)
    model_version = Column(String(64), nullable=True)
    data_mode = Column(String(32), default="real", nullable=False)
    provenance = Column(String(64), default="OBSERVED_REAL_API", nullable=False)
    pipeline_run_id = Column(String(128), nullable=True)
    investigation_spill_id = Column(String(128), nullable=True)
    acknowledged_at = Column(String(64), nullable=True)
    created_at = Column(String(64), nullable=False)
    updated_at = Column(String(64), nullable=True)

    spill = relationship("OilSpill", back_populates="alerts")


class Vessel(Base):
    __tablename__ = "vessels"

    mmsi = Column(String(32), primary_key=True)
    imo = Column(String(32), nullable=True)
    vessel_name = Column(String(256))
    vessel_type = Column(String(128))
    call_sign = Column(String(64), nullable=True)
    flag = Column(String(64), nullable=True)
    length_m = Column(Float, nullable=True)
    beam_m = Column(Float, nullable=True)
    draught_m = Column(Float, nullable=True)
    gross_tonnage = Column(Float, nullable=True)
    data_mode = Column(String(32), default="real", nullable=False)
    provenance = Column(String(64), default="OBSERVED_REAL_API", nullable=False)
    created_at = Column(String(64), nullable=False)

    observations = relationship("AisObservation", back_populates="vessel")


class AisObservation(Base):
    __tablename__ = "ais_observations"

    id = Column(String(128), primary_key=True)
    mmsi = Column(String(32), ForeignKey("vessels.mmsi"), nullable=False, index=True)
    timestamp = Column(String(64), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    sog_knots = Column(Float)
    cog_deg = Column(Float)
    heading_deg = Column(Float)
    nav_status = Column(String(64))
    data_mode = Column(String(32), default="real", nullable=False)
    provenance = Column(String(64), default="OBSERVED_REAL_API", nullable=False)
    source = Column(String(128))

    if HAS_GEOALCHEMY:
        location_geom = Column(Geometry("POINT", srid=4326), nullable=True)

    vessel = relationship("Vessel", back_populates="observations")


class VesselTrack(Base):
    __tablename__ = "vessel_tracks"

    id = Column(String(128), primary_key=True)
    mmsi = Column(String(32), nullable=False, index=True)
    spill_id = Column(String(128), ForeignKey("oil_spills.id"), nullable=True)
    track_geojson = Column(Text, nullable=False)
    start_time = Column(String(64), nullable=False)
    end_time = Column(String(64), nullable=False)
    point_count = Column(Integer)
    data_mode = Column(String(32), default="real", nullable=False)
    provenance = Column(String(64), default="OBSERVED_REAL_API", nullable=False)

    if HAS_GEOALCHEMY:
        track_geom = Column(Geometry("LINESTRING", srid=4326), nullable=True)


class EnvironmentalField(Base):
    __tablename__ = "environmental_fields"

    id = Column(String(128), primary_key=True)
    spill_id = Column(String(128), ForeignKey("oil_spills.id"), nullable=True)
    field_type = Column(String(32), nullable=False)  # 'current' or 'wind'
    timestamp = Column(String(64), nullable=False)
    valid_time_start = Column(String(64))
    valid_time_end = Column(String(64))
    source = Column(String(128), nullable=False)
    source_version = Column(String(64))
    resolution_deg = Column(Float)
    region_geojson = Column(Text)
    field_data_json = Column(Text, nullable=False)
    data_mode = Column(String(32), default="real", nullable=False)
    provenance = Column(String(64), default="OBSERVED_REAL_API", nullable=False)
    created_at = Column(String(64), nullable=False)


class ParticleTrajectory(Base):
    __tablename__ = "particle_trajectories"

    id = Column(String(128), primary_key=True)
    spill_id = Column(String(128), ForeignKey("oil_spills.id"), nullable=False, index=True)
    run_type = Column(String(32), nullable=False)  # 'hindcast' or 'forecast'
    windage_coefficient = Column(Float, nullable=False)
    particle_count = Column(Integer, nullable=False)
    integration_timestep_min = Column(Integer, nullable=False)
    integration_hours = Column(Float, nullable=False)
    integration_method = Column(String(32), default="RK4")
    particles_json = Column(Text, nullable=False)
    origin_region_geojson = Column(Text)
    origin_centroid_geojson = Column(Text)
    origin_time_estimate = Column(String(64))
    origin_time_uncertainty_h = Column(Float)
    spatial_uncertainty_km = Column(Float)
    environmental_source = Column(String(128))
    data_mode = Column(String(32), default="real", nullable=False)
    provenance = Column(String(64), default="RECONSTRUCTED", nullable=False)
    created_at = Column(String(64), nullable=False)

    if HAS_GEOALCHEMY:
        origin_geom = Column(Geometry("POLYGON", srid=4326), nullable=True)

    spill = relationship("OilSpill", back_populates="trajectories")


class Attribution(Base):
    __tablename__ = "attributions"

    id = Column(String(128), primary_key=True)
    spill_id = Column(String(128), ForeignKey("oil_spills.id"), nullable=False, index=True)
    mmsi = Column(String(32), ForeignKey("vessels.mmsi"), nullable=False)
    rank = Column(Integer)
    distance_km = Column(Float)
    time_delta_h = Column(Float)
    track_overlap_score = Column(Float)
    heading_compat_score = Column(Float)
    ais_continuity_score = Column(Float)
    norm_proximity = Column(Float)
    norm_temporal = Column(Float)
    norm_trajectory = Column(Float)
    norm_heading = Column(Float)
    norm_continuity = Column(Float)
    weight_proximity = Column(Float)
    weight_temporal = Column(Float)
    weight_trajectory = Column(Float)
    weight_heading = Column(Float)
    weight_continuity = Column(Float)
    evidence_score = Column(Float)
    data_confidence = Column(Float)
    final_score = Column(Float)
    behaviour_observations_json = Column(Text)
    ais_gap_detected = Column(Integer, default=0)
    ais_gap_duration_min = Column(Float, default=0.0)
    slowdown_observed = Column(Integer, default=0)
    course_change_observed = Column(Integer, default=0)
    ais_coverage_pct = Column(Float)
    spatial_radius_km = Column(Float)
    temporal_window_h = Column(Float)
    data_mode = Column(String(32), default="real", nullable=False)
    provenance = Column(String(64), default="RECONSTRUCTED", nullable=False)
    created_at = Column(String(64), nullable=False)

    spill = relationship("OilSpill", back_populates="attributions")


class InvestigationReport(Base):
    __tablename__ = "investigation_reports"

    id = Column(String(128), primary_key=True)
    spill_id = Column(String(128), ForeignKey("oil_spills.id"), nullable=False)
    report_version = Column(String(32), default="1.0", nullable=False)
    status = Column(String(64), default="generated", nullable=False)
    report_html = Column(Text)
    report_pdf_path = Column(String(512), nullable=True)
    sections_json = Column(Text)
    generated_at = Column(String(64))
    created_at = Column(String(64), nullable=False)


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id = Column(String(128), primary_key=True)
    spill_id = Column(String(128), ForeignKey("oil_spills.id"), nullable=True)
    run_type = Column(String(64), default="investigation_pipeline", nullable=False)
    status = Column(String(64), default="CREATED", nullable=False)
    data_mode = Column(String(32), default="real", nullable=False)
    satellite_scene_id = Column(String(128))
    satellite_source = Column(String(128))
    capture_timestamp = Column(String(64))
    model_version = Column(String(64))
    preprocessing_version = Column(String(64))
    model_threshold = Column(Float)
    environment_source = Column(String(128))
    environment_time_range_start = Column(String(64))
    environment_time_range_end = Column(String(64))
    windage_coefficient = Column(Float)
    particle_count = Column(Integer)
    integration_timestep_min = Column(Integer)
    hindcast_hours = Column(Float)
    forecast_hours = Column(Float)
    ais_source = Column(String(128))
    ais_coverage_pct = Column(Float)
    scoring_config_json = Column(Text)
    error_message = Column(Text, nullable=True)
    started_at = Column(String(64), nullable=False)
    completed_at = Column(String(64), nullable=True)
    report_version = Column(String(32), default="1.0")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(String(128), primary_key=True)
    analysis_run_id = Column(String(128), ForeignKey("analysis_runs.id"), nullable=True)
    event_type = Column(String(128), nullable=False)
    event_data_json = Column(Text)
    timestamp = Column(String(64), nullable=False)
