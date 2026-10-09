import math
import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional, Tuple
import numpy as np
from app.config import settings
from app.environmental.fields import interpolate_field
from app.uncertainty.engine import UncertaintyEngine

EARTH_RADIUS_KM = 6371.0


def latlon_offset(lat: float, lon: float, u_ms: float, v_ms: float, dt_s: float) -> Tuple[float, float]:
    dlat = (v_ms * dt_s) / (EARTH_RADIUS_KM * 1000) * (180 / math.pi)
    cos_lat = math.cos(math.radians(lat))
    if abs(cos_lat) < 1e-6:
        cos_lat = 1e-6
    dlon = (u_ms * dt_s) / (EARTH_RADIUS_KM * 1000 * cos_lat) * (180 / math.pi)
    return lat + dlat, lon + dlon


def rk4_step(
    lat: float,
    lon: float,
    current_data: Dict,
    wind_data: Dict,
    windage_alpha: float,
    dt_s: float,
    direction: int = 1,
    current_time: Optional[datetime] = None,
) -> Tuple[float, float]:
    if not current_data:
        raise ValueError("Current data unavailable for this time/location.")
    if not wind_data:
        raise ValueError("Wind data unavailable for this time/location.")

    def velocity(la: float, lo: float, t: Optional[datetime]) -> Tuple[float, float]:
        cu, cv = interpolate_field(la, lo, current_data, target_time=t)
        wu, wv = interpolate_field(la, lo, wind_data, target_time=t)
        u_eff = (cu + windage_alpha * wu) * direction
        v_eff = (cv + windage_alpha * wv) * direction
        return u_eff, v_eff

    # Stage 1: t1 = current_time
    t1 = current_time
    u1, v1 = velocity(lat, lon, t1)

    # Stage 2: t2 = current_time + direction * (dt_s / 2)
    dt_half = dt_s / 2.0
    lat2, lon2 = latlon_offset(lat, lon, u1, v1, dt_half)
    t2 = (current_time + timedelta(seconds=direction * dt_half)) if current_time else None
    u2, v2 = velocity(lat2, lon2, t2)

    # Stage 3: t3 = current_time + direction * (dt_s / 2)
    lat3, lon3 = latlon_offset(lat, lon, u2, v2, dt_half)
    t3 = (current_time + timedelta(seconds=direction * dt_half)) if current_time else None
    u3, v3 = velocity(lat3, lon3, t3)

    # Stage 4: t4 = current_time + direction * dt_s
    lat4, lon4 = latlon_offset(lat, lon, u3, v3, dt_s)
    t4 = (current_time + timedelta(seconds=direction * dt_s)) if current_time else None
    u4, v4 = velocity(lat4, lon4, t4)

    u_avg = (u1 + 2 * u2 + 2 * u3 + u4) / 6.0
    v_avg = (v1 + 2 * v2 + 2 * v3 + v4) / 6.0
    return latlon_offset(lat, lon, u_avg, v_avg, dt_s)


def run_hindcast(
    spill_lat: float,
    spill_lon: float,
    spill_polygon_coords: List[List[float]],
    t0: datetime,
    current_data: Dict,
    wind_data: Dict,
    windage_coefficient: Optional[float] = None,
    particle_count: Optional[int] = None,
    timestep_min: Optional[int] = None,
    hindcast_hours: Optional[float] = None,
    seed: Optional[int] = None,
    detection_conf: Optional[float] = None,
    data_mode: str = "simulation",
    provenance: Optional[str] = None,
) -> Dict[str, Any]:
    if not current_data or not current_data.get("points"):
        raise ValueError("Current data unavailable for this time/location.")
    if not wind_data or not wind_data.get("points"):
        raise ValueError("Wind data unavailable for this time/location.")

    alpha = windage_coefficient if windage_coefficient is not None else settings.default_windage_coefficient
    n_particles = particle_count if particle_count is not None else settings.default_particle_count
    dt_m = timestep_min if timestep_min is not None else settings.default_integration_timestep_minutes
    h_hours = hindcast_hours if hindcast_hours is not None else settings.default_hindcast_hours
    run_seed = seed if seed is not None else settings.oiltrace_demo_seed

    if data_mode == "real" or current_data.get("data_mode") == "real" or wind_data.get("data_mode") == "real":
        from app.environmental.fields import validate_temporal_coverage
        t_start = t0 - timedelta(hours=h_hours)
        t_end = t0
        validate_temporal_coverage(current_data, t_start, t_end, "currents")
        validate_temporal_coverage(wind_data, t_start, t_end, "wind")

    rng = np.random.default_rng(run_seed)
    dt_s = dt_m * 60
    n_steps = int(h_hours * 60 / dt_m)

    if spill_polygon_coords and len(spill_polygon_coords) > 2:
        lons = [c[0] for c in spill_polygon_coords]
        lats = [c[1] for c in spill_polygon_coords]
        lat_min, lat_max = min(lats), max(lats)
        lon_min, lon_max = min(lons), max(lons)
    else:
        lat_min, lat_max = spill_lat - 0.02, spill_lat + 0.02
        lon_min, lon_max = spill_lon - 0.02, spill_lon + 0.02

    init_lats = rng.uniform(lat_min, lat_max, n_particles)
    init_lons = rng.uniform(lon_min, lon_max, n_particles)

    particles_history = []
    final_positions = []

    for p_idx in range(n_particles):
        lat = float(init_lats[p_idx])
        lon = float(init_lons[p_idx])
        trajectory = [{"step": 0, "lat": round(lat, 6), "lon": round(lon, 6),
                       "timestamp": t0.isoformat(), "mode": "reconstructed"}]

        for step in range(1, n_steps + 1):
            step_time = t0 - timedelta(minutes=(step - 1) * dt_m)
            lat, lon = rk4_step(lat, lon, current_data, wind_data, alpha, dt_s, direction=-1, current_time=step_time)
            lat += float(rng.normal(0, 0.002))
            lon += float(rng.normal(0, 0.002))
            ts = t0 - timedelta(minutes=step * dt_m)
            trajectory.append({"step": -step, "lat": round(lat, 6), "lon": round(lon, 6),
                               "timestamp": ts.isoformat(), "mode": "reconstructed"})

        particles_history.append({"particle_id": p_idx, "trajectory": trajectory})
        final_positions.append({"lat": lat, "lon": lon})

    final_lats = [p["lat"] for p in final_positions]
    final_lons = [p["lon"] for p in final_positions]
    origin_lat = float(np.mean(final_lats))
    origin_lon = float(np.mean(final_lons))
    std_lat = float(np.std(final_lats))
    std_lon = float(np.std(final_lons))

    # Ensemble uncertainty calculation with dynamic detection confidence
    unc_engine = UncertaintyEngine()
    dyn_conf = detection_conf if detection_conf is not None else 0.92
    unc_result = unc_engine.calculate_hindcast_uncertainty(particles_history, env_quality=0.9, detection_conf=dyn_conf)
    spatial_uncertainty_km = unc_result["spatial_uncertainty_km"]
    time_uncertainty_h = unc_result["temporal_uncertainty_h"]

    n_sides = 16
    angles = [i * 2 * math.pi / n_sides for i in range(n_sides)]
    sigma = max(std_lat, std_lon, 0.05) * 2.0
    ellipse_coords = [
        [round(origin_lon + sigma * math.cos(a), 6), round(origin_lat + sigma * math.sin(a), 6)]
        for a in angles
    ]
    ellipse_coords.append(ellipse_coords[0])

    origin_time = t0 - timedelta(hours=h_hours)

    return {
        "particles": particles_history,
        "origin_lat": round(origin_lat, 6),
        "origin_lon": round(origin_lon, 6),
        "spatial_uncertainty_km": round(spatial_uncertainty_km, 3),
        "origin_time_estimate": origin_time.isoformat(),
        "origin_time_uncertainty_h": time_uncertainty_h,
        "origin_region_geojson": {"type": "Polygon", "coordinates": [ellipse_coords]},
        "origin_centroid_geojson": {"type": "Point", "coordinates": [round(origin_lon, 6), round(origin_lat, 6)]},
        "windage_coefficient": alpha,
        "particle_count": n_particles,
        "timestep_min": dt_m,
        "hindcast_hours": h_hours,
        "integration_method": "RK4",
        "n_steps": n_steps,
        "data_mode": data_mode,
        "provenance": provenance if provenance is not None else ("reconstructed" if data_mode == "real" else "synthetic"),
        "seed": run_seed,
    }



def run_forecast(
    spill_lat: float,
    spill_lon: float,
    spill_polygon_coords: List[List[float]],
    t0: datetime,
    current_data: Dict,
    wind_data: Dict,
    windage_coefficient: Optional[float] = None,
    particle_count: Optional[int] = None,
    timestep_min: Optional[int] = None,
    forecast_hours: Optional[float] = None,
    seed: Optional[int] = None,
    detection_conf: Optional[float] = None,
    data_mode: str = "simulation",
    provenance: Optional[str] = None,
) -> Dict[str, Any]:
    if not current_data or not current_data.get("points"):
        raise ValueError("Current data unavailable for this time/location.")
    if not wind_data or not wind_data.get("points"):
        raise ValueError("Wind data unavailable for this time/location.")

    alpha = windage_coefficient if windage_coefficient is not None else settings.default_windage_coefficient
    n_particles = particle_count if particle_count is not None else settings.default_particle_count
    dt_m = timestep_min if timestep_min is not None else settings.default_integration_timestep_minutes
    f_hours = forecast_hours if forecast_hours is not None else settings.default_forecast_hours
    run_seed = seed if seed is not None else settings.oiltrace_demo_seed

    if data_mode == "real" or current_data.get("data_mode") == "real" or wind_data.get("data_mode") == "real":
        from app.environmental.fields import validate_temporal_coverage
        t_start = t0
        t_end = t0 + timedelta(hours=f_hours)
        validate_temporal_coverage(current_data, t_start, t_end, "currents")
        validate_temporal_coverage(wind_data, t_start, t_end, "wind")

    rng = np.random.default_rng(run_seed + 1)
    dt_s = dt_m * 60
    n_steps = int(f_hours * 60 / dt_m)

    if spill_polygon_coords and len(spill_polygon_coords) > 2:
        lons = [c[0] for c in spill_polygon_coords]
        lats = [c[1] for c in spill_polygon_coords]
        lat_min, lat_max = min(lats), max(lats)
        lon_min, lon_max = min(lons), max(lons)
    else:
        lat_min, lat_max = spill_lat - 0.02, spill_lat + 0.02
        lon_min, lon_max = spill_lon - 0.02, spill_lon + 0.02

    init_lats = rng.uniform(lat_min, lat_max, n_particles)
    init_lons = rng.uniform(lon_min, lon_max, n_particles)

    particles_history = []
    horizon_summaries = {}

    for p_idx in range(n_particles):
        lat = float(init_lats[p_idx])
        lon = float(init_lons[p_idx])
        trajectory = [{"step": 0, "lat": round(lat, 6), "lon": round(lon, 6),
                       "timestamp": t0.isoformat(), "mode": "observed"}]

        for step in range(1, n_steps + 1):
            step_time = t0 + timedelta(minutes=(step - 1) * dt_m)
            lat, lon = rk4_step(lat, lon, current_data, wind_data, alpha, dt_s, direction=1, current_time=step_time)
            lat += float(rng.normal(0, 0.003))
            lon += float(rng.normal(0, 0.003))
            ts = t0 + timedelta(minutes=step * dt_m)
            trajectory.append({"step": step, "lat": round(lat, 6), "lon": round(lon, 6),
                               "timestamp": ts.isoformat(), "mode": "predicted"})

            hours_elapsed = step * dt_m / 60
            for h in [6, 12, 24, 48]:
                if abs(hours_elapsed - h) < (dt_m / 60 / 2):
                    if h not in horizon_summaries:
                        horizon_summaries[h] = []
                    horizon_summaries[h].append({"lat": lat, "lon": lon})

        particles_history.append({"particle_id": p_idx, "trajectory": trajectory})

    unc_engine = UncertaintyEngine()
    dyn_conf = detection_conf if detection_conf is not None else 0.92
    unc_forecast = unc_engine.calculate_forecast_uncertainty(horizon_summaries, detection_conf=dyn_conf)

    return {
        "particles": particles_history,
        "horizon_stats": unc_forecast["horizons"],
        "windage_coefficient": alpha,
        "particle_count": n_particles,
        "timestep_min": dt_m,
        "forecast_hours": f_hours,
        "integration_method": "RK4",
        "data_mode": data_mode,
        "provenance": provenance if provenance is not None else ("predicted" if data_mode == "real" else "synthetic"),
        "seed": run_seed,
    }

