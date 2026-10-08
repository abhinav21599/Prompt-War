import numpy as np
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Query
from app.integrations.copernicus_marine_service import copernicus_marine_service
from app.integrations.cds_service import cds_service
from app.config import settings

router = APIRouter(prefix="/api/environment", tags=["environment"])


@router.get("/current")
@router.get("/currents")
def get_current_environment(
    mode: Optional[str] = Query("real"),
    field: Optional[str] = Query("current"),
):
    """
    Retrieve environmental forcing fields.
    
    When field='current' (default):
      Returns hydrodynamic ocean surface current velocity field.
      In Real-Data Mode (mode='real'):
        Returns Copernicus Marine operational analysis/forecast data
        (dataset: cmems_mod_glo_phy_anfc_merged-uv_PT1H-i, variables: uo, vo).
        Status: 'COPERNICUS MARINE — LATEST AVAILABLE'.
        Provenance: 'OPERATIONAL ANALYSIS/FORECAST'.
      In Simulation Mode (mode='simulation'):
        Returns deterministic synthetic hydrodynamic field (Seed 26143).
        Provenance: 'SYNTHETIC'.
        
    When field='wind':
      Returns atmospheric wind fields from Copernicus Climate Data Store (ERA5).
    """
    # Wind compatibility routing
    if field == "wind":
        return _get_wind_environment(mode=mode)

    # Ocean Surface Currents (field == 'current')
    if mode == "simulation":
        # Deterministic simulation hydrodynamic currents (Seed 26143)
        # Spanning full Arabian Sea operational domain (10-20 N, 68-76 E)
        lats = [round(float(x), 2) for x in np.arange(10.0, 20.25, 0.5)]
        lons = [round(float(x), 2) for x in np.arange(68.0, 76.25, 0.5)]
        sample_vectors = []
        points = []
        for la in lats:
            for lo in lons:
                u = round(0.18 + 0.04 * (la - 15.0), 4)
                v = round(0.12 + 0.03 * (lo - 72.0), 4)
                spd = round((u**2 + v**2)**0.5, 3)
                dir_deg = round((((180 / 3.14159) * 0.58) + 360) % 360, 1)
                length_deg = 0.04
                end_lon = round(lo + (u / (spd + 1e-6)) * length_deg, 4)
                end_lat = round(la + (v / (spd + 1e-6)) * length_deg, 4)
                
                vec = {
                    "lat": la,
                    "lon": lo,
                    "end_lat": end_lat,
                    "end_lon": end_lon,
                    "current_u": u,
                    "current_v": v,
                    "current_speed": spd,
                    "current_direction_deg": dir_deg,
                }
                sample_vectors.append(vec)
                points.append({
                    "lat": la,
                    "lon": lo,
                    "current_u": u,
                    "current_v": v,
                    "current_speed": spd,
                    "current_direction_deg": dir_deg,
                })

        speeds = [p["current_speed"] for p in points]
        return {
            "source": "SYNTHETIC_OCEAN_CURRENT_v1",
            "dataset": "Deterministic Simulation Hydrodynamic Grid",
            "status": "DETERMINISTIC SIMULATION (SEED 26143)",
            "timestamp": datetime(2024, 3, 15, 6, 0, 0, tzinfo=timezone.utc).isoformat(),
            "variables": ["uo", "vo"],
            "bounds": {
                "north": max(lats),
                "south": min(lats),
                "west": min(lons),
                "east": max(lons),
            },
            "bounding_box": [min(lons), min(lats), max(lons), max(lats)],
            "grid": {
                "resolution_deg": 0.5,
                "lat_count": len(lats),
                "lon_count": len(lons),
                "point_count": len(points),
            },
            "current": {
                "mean_speed": round(sum(speeds) / len(speeds), 3),
                "max_speed": max(speeds),
                "min_speed": min(speeds),
                "mean_u": 0.18,
                "mean_v": 0.12,
                "unit": "m/s",
            },
            "sample_vectors": sample_vectors,
            "current_vectors": sample_vectors,
            "points": points,
            "units": "m/s",
            "provenance": "SYNTHETIC",
            "mode": "simulation",
            "data_mode": "simulation",
            "note": "Deterministic simulation mode. Seed=26143.",
        }

    # Real-Data Mode: Copernicus Marine Surface Currents
    try:
        data = copernicus_marine_service.get_real_current_field()
        return {
            "source": data["source"],
            "dataset": data["dataset"],
            "status": data["status"],
            "timestamp": data["timestamp"],
            "timestamps": data.get("timestamps", []),
            "variables": data["variables"],
            "depth_m": data.get("depth_m", 0.494025),
            "bounds": data["bounds"],
            "bounding_box": data.get("bounding_box", [
                data["bounds"]["west"],
                data["bounds"]["south"],
                data["bounds"]["east"],
                data["bounds"]["north"],
            ]),
            "grid": data["grid"],
            "current": data["current"],
            "units": data.get("units", "m/s"),
            "sample_vectors": data.get("sample_vectors", []),
            "current_vectors": data.get("current_vectors", data.get("sample_vectors", [])),
            "provenance": data["provenance"],
            "mode": "real",
            "data_mode": "real",
            "note": data.get("note", "Copernicus Marine operational hydrodynamic analysis/forecast."),
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Copernicus Marine current data is temporarily unavailable: {str(e)}. "
                   f"Simulation Mode remains fully operational."
        )


@router.get("/wind")
def get_wind_environment(mode: Optional[str] = Query("real")):
    """
    Retrieve atmospheric wind fields (Copernicus CDS ERA5 in real mode, synthetic in sim mode).
    """
    return _get_wind_environment(mode=mode)


def _get_wind_environment(mode: Optional[str] = "real") -> Dict[str, Any]:
    if mode == "simulation":
        # Deterministic simulation metocean data
        from app.simulation.generator import _env_grid
        grid_data = _env_grid()
        points = grid_data["points"]
        us = [p["wind_u"] for p in points]
        vs = [p["wind_v"] for p in points]
        speeds = [(u**2 + v**2)**0.5 for u, v in zip(us, vs)]

        sample_vectors = []
        for p in points:
            spd = (p["wind_u"]**2 + p["wind_v"]**2)**0.5
            length_deg = 0.05
            end_lon = p["lon"] + (p["wind_u"] / (spd + 1e-6)) * length_deg
            end_lat = p["lat"] + (p["wind_v"] / (spd + 1e-6)) * length_deg
            sample_vectors.append({
                "lat": p["lat"],
                "lon": p["lon"],
                "end_lat": round(end_lat, 4),
                "end_lon": round(end_lon, 4),
                "wind_u": p["wind_u"],
                "wind_v": p["wind_v"],
                "wind_speed": round(spd, 2),
                "wind_direction_deg": round((p.get("wind_direction_deg") or 235.0), 1),
            })

        return {
            "source": "SYNTHETIC_ERA5_v1",
            "dataset": "Deterministic Simulation Grid",
            "status": "DETERMINISTIC SIMULATION (SEED 26143)",
            "timestamp": datetime(2024, 3, 15, 6, 0, 0, tzinfo=timezone.utc).isoformat(),
            "variables": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
            "bounds": {
                "north": max(grid_data["lats"]),
                "south": min(grid_data["lats"]),
                "west": min(grid_data["lons"]),
                "east": max(grid_data["lons"]),
            },
            "bounding_box": [min(grid_data["lons"]), min(grid_data["lats"]), max(grid_data["lons"]), max(grid_data["lats"])],
            "grid": {
                "resolution_deg": 0.5,
                "lat_count": len(grid_data["lats"]),
                "lon_count": len(grid_data["lons"]),
                "point_count": len(points),
            },
            "wind": {
                "mean_speed": round(sum(speeds) / len(speeds), 2),
                "max_speed": round(max(speeds), 2),
                "min_speed": round(min(speeds), 2),
                "mean_u": round(sum(us) / len(us), 3),
                "mean_v": round(sum(vs) / len(vs), 3),
                "unit": "m/s",
            },
            "sample_vectors": sample_vectors,
            "units": "m/s",
            "provenance": "SYNTHETIC",
            "mode": "simulation",
            "data_mode": "simulation",
            "note": "Deterministic simulation mode. Seed=26143.",
        }

    # Real-Data Mode: Copernicus Climate Data Store
    try:
        data = cds_service.get_real_wind_field()
        return {
            "source": data["source"],
            "dataset": data["dataset"],
            "status": data["status"],
            "timestamp": data["timestamp"],
            "variables": data["variables"],
            "bounds": data["bounds"],
            "bounding_box": [data["bounds"]["west"], data["bounds"]["south"], data["bounds"]["east"], data["bounds"]["north"]],
            "grid": data["grid"],
            "wind": data["wind"],
            "units": "m/s",
            "sample_vectors": data.get("sample_vectors", []),
            "provenance": data["provenance"],
            "mode": "real",
            "data_mode": "real",
            "note": data.get("note", "Copernicus Climate Data Store ERA5 model."),
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Copernicus Climate Data Store environmental data is temporarily unavailable: {str(e)}. "
                   f"Simulation Mode remains fully operational."
        )


@router.get("/summary")
def get_environment_summary(mode: Optional[str] = Query("real")):
    """
    Combined summary of metocean hydrodynamic (currents) and atmospheric (winds) forcing.
    """
    currents_info = get_current_environment(mode=mode, field="current")
    wind_info = _get_wind_environment(mode=mode)
    return {
        "mode": mode,
        "currents": {
            "source": currents_info["source"],
            "dataset": currents_info["dataset"],
            "status": currents_info["status"],
            "provenance": currents_info["provenance"],
            "timestamp": currents_info["timestamp"],
            "units": currents_info["units"],
            "mean_speed": currents_info["current"]["mean_speed"],
        },
        "wind": {
            "source": wind_info["source"],
            "dataset": wind_info["dataset"],
            "status": wind_info["status"],
            "provenance": wind_info["provenance"],
            "timestamp": wind_info["timestamp"],
            "units": wind_info["units"],
            "mean_speed": wind_info["wind"]["mean_speed"],
        },
    }

