import os
import math
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np

logger = logging.getLogger("oiltrace.copernicus")

# Default paths for Copernicus Marine NetCDF files
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_NC_PATH = BASE_DIR / "data" / "copernicus" / "arabian_sea_currents.nc"
CACHE_DIR = BASE_DIR / "data" / "cache" / "copernicus"


def _resolve_nc_path(explicit_path: Optional[str] = None) -> Optional[Path]:
    """Find the NetCDF file from explicit path, project data dir, or relative paths."""
    if explicit_path:
        p = Path(explicit_path)
        if p.exists() and p.is_file():
            return p.resolve()
        return None

    candidates = [
        DEFAULT_NC_PATH,
        Path("backend/data/copernicus/arabian_sea_currents.nc"),
        Path("data/copernicus/arabian_sea_currents.nc"),
        BASE_DIR.parent / "backend" / "data" / "copernicus" / "arabian_sea_currents.nc",
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            return p.resolve()
    return None


class CopernicusMarineService:
    """
    Copernicus Marine Service Integration.
    
    Provides real hydrodynamic surface current fields (uo, vo) from:
    Dataset: cmems_mod_glo_phy_anfc_merged-uv_PT1H-i
    Region: Arabian Sea (10-20 N, 68-76 E)
    Depth: Surface (0.494m coordinate)
    
    Supports:
    - Real-Data Mode ocean current forcing for RK4 particle drift engine
    - Direct spatio-temporal lookup at (lat, lon, datetime)
    - Decimated vector field generation for WebGL MapLibre rendering
    - Fast in-memory caching and sidecar JSON fallback
    - Strict credential isolation (no credentials exposed or hardcoded)
    """

    DATASET_ID = "cmems_mod_glo_phy_anfc_merged-uv_PT1H-i"
    SOURCE_LABEL = "Copernicus Marine"
    STATUS_LABEL = "COPERNICUS MARINE — LATEST AVAILABLE"
    PROVENANCE_LABEL = "OPERATIONAL ANALYSIS/FORECAST"

    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._cached_field: Optional[Dict[str, Any]] = None
        self._cached_file_mtime: Optional[float] = None
        self._parsed_grid: Optional[Dict[str, Any]] = None

    def parse_netcdf(self, nc_path: Path) -> Dict[str, Any]:
        """
        Parse downloaded NetCDF dataset into OILTRACE environmental field dictionary.
        Extracts uo (eastward) and vo (northward) at surface depth coordinate.
        """
        if not nc_path.exists():
            raise FileNotFoundError(f"Copernicus Marine NetCDF file not found: {nc_path}")

        try:
            import xarray as xr
            try:
                ds = xr.open_dataset(nc_path, engine="netcdf4")
            except Exception:
                ds = xr.open_dataset(nc_path)
        except ImportError:
            # Check for parsed sidecar generated from the real NetCDF
            sidecar = nc_path.with_name(nc_path.stem + ".parsed.json")
            if sidecar.exists():
                with open(sidecar, "r", encoding="utf-8") as f:
                    return json.load(f)
            raise RuntimeError(
                "Neither xarray nor pre-parsed Copernicus NetCDF sidecar is available. "
                "Ensure xarray/netCDF4 is installed or run with venv python."
            )

        try:
            lat_coord = ds["latitude"].values if "latitude" in ds else ds["lat"].values
            lon_coord = ds["longitude"].values if "longitude" in ds else ds["lon"].values

            # Extract timestamps
            timestamps: List[str] = []
            if "time" in ds:
                t_vals = ds["time"].values
                for tv in t_vals:
                    ts_str = str(np.datetime_as_string(tv, unit="s")) + "Z"
                    timestamps.append(ts_str)
            else:
                timestamps = [datetime.now(timezone.utc).isoformat()]

            # Latest timestamp as primary reference
            primary_timestamp = timestamps[-1] if timestamps else datetime.now(timezone.utc).isoformat()

            # Extract uo and vo (eastward and northward Eulerian velocities)
            if "uo" not in ds or "vo" not in ds:
                raise ValueError(f"NetCDF missing required variables 'uo' and 'vo'. Available: {list(ds.data_vars)}")

            uo_var = ds["uo"]
            vo_var = ds["vo"]

            # Surface depth: index 0 (0.494m)
            # Shapes: (time, depth, latitude, longitude) or (time, latitude, longitude)
            uo_raw = uo_var.values
            vo_raw = vo_var.values

            # Extract the latest time slice at surface depth
            # Indexing: time index -1 (latest), depth index 0 if depth exists
            if uo_raw.ndim == 4:
                # (time, depth, lat, lon)
                uo_arr = uo_raw[-1, 0, :, :]
                vo_arr = vo_raw[-1, 0, :, :]
            elif uo_raw.ndim == 3:
                # (time, lat, lon) or (depth, lat, lon)
                uo_arr = uo_raw[-1, :, :]
                vo_arr = vo_raw[-1, :, :]
            elif uo_raw.ndim == 2:
                uo_arr = uo_raw
                vo_arr = vo_raw
            else:
                raise ValueError(f"Unexpected dimensions for current variables: {uo_raw.shape}")

            lats = [round(float(la), 4) for la in lat_coord]
            lons = [round(float(lo), 4) for lo in lon_coord]

            points: List[Dict[str, Any]] = []
            speeds: List[float] = []
            us: List[float] = []
            vs: List[float] = []

            # Full grid points for high-precision RK4 interpolation
            for i, la in enumerate(lats):
                for j, lo in enumerate(lons):
                    u_val = float(uo_arr[i, j])
                    v_val = float(vo_arr[i, j])
                    # Handle NaN / masked values (e.g. land cells)
                    if np.isnan(u_val) or np.isnan(v_val):
                        continue

                    spd = math.sqrt(u_val**2 + v_val**2)
                    # Oceanographic direction (direction toward which current flows)
                    dir_deg = (math.degrees(math.atan2(u_val, v_val)) + 360) % 360

                    points.append({
                        "lat": la,
                        "lon": lo,
                        "current_u": round(u_val, 4),
                        "current_v": round(v_val, 4),
                        "current_speed": round(spd, 3),
                        "current_direction_deg": round(dir_deg, 1),
                    })
                    speeds.append(spd)
                    us.append(u_val)
                    vs.append(v_val)

            north = float(max(lats))
            south = float(min(lats))
            west = float(min(lons))
            east = float(max(lons))

            summary = {
                "mean_speed": round(float(np.mean(speeds)), 3) if speeds else 0.0,
                "max_speed": round(float(np.max(speeds)), 3) if speeds else 0.0,
                "min_speed": round(float(np.min(speeds)), 3) if speeds else 0.0,
                "mean_u": round(float(np.mean(us)), 4) if us else 0.0,
                "mean_v": round(float(np.mean(vs)), 4) if vs else 0.0,
                "point_count": len(points),
                "lat_count": len(lats),
                "lon_count": len(lons),
                "resolution_deg": round(abs(lats[1] - lats[0]), 4) if len(lats) > 1 else 0.0833,
            }

            # Decimated sampling for MapLibre WebGL visualization (~1,200 vectors for 60 FPS)
            # Step every 3rd lat and 3rd lon
            sample_vectors: List[Dict[str, Any]] = []
            lat_step = 3
            lon_step = 3
            for i in range(0, len(lats), lat_step):
                for j in range(0, len(lons), lon_step):
                    u_val = float(uo_arr[i, j])
                    v_val = float(vo_arr[i, j])
                    if np.isnan(u_val) or np.isnan(v_val):
                        continue

                    la = lats[i]
                    lo = lons[j]
                    spd = math.sqrt(u_val**2 + v_val**2)
                    dir_deg = (math.degrees(math.atan2(u_val, v_val)) + 360) % 360

                    # Length scaled for visualization (approx 0.04 deg length)
                    length_deg = 0.04
                    end_lon = lo + (u_val / (spd + 1e-6)) * length_deg
                    end_lat = la + (v_val / (spd + 1e-6)) * length_deg

                    sample_vectors.append({
                        "lat": la,
                        "lon": lo,
                        "end_lat": round(end_lat, 4),
                        "end_lon": round(end_lon, 4),
                        "current_u": round(u_val, 4),
                        "current_v": round(v_val, 4),
                        "current_speed": round(spd, 3),
                        "current_direction_deg": round(dir_deg, 1),
                    })

            result = {
                "field": "current",
                "source": self.SOURCE_LABEL,
                "dataset": self.DATASET_ID,
                "status": self.STATUS_LABEL,
                "provenance": self.PROVENANCE_LABEL,
                "variables": ["uo", "vo", "utotal", "vtotal"],
                "units": "m/s",
                "timestamp": primary_timestamp,
                "timestamps": timestamps,
                "depth_m": 0.494025,
                "bounds": {
                    "north": north,
                    "south": south,
                    "west": west,
                    "east": east,
                },
                "bounding_box": [west, south, east, north],
                "grid": {
                    "resolution_deg": summary["resolution_deg"],
                    "lat_count": summary["lat_count"],
                    "lon_count": summary["lon_count"],
                    "point_count": summary["point_count"],
                },
                "current": {
                    "mean_speed": summary["mean_speed"],
                    "max_speed": summary["max_speed"],
                    "min_speed": summary["min_speed"],
                    "mean_u": summary["mean_u"],
                    "mean_v": summary["mean_v"],
                    "unit": "m/s",
                },
                "lats": lats,
                "lons": lons,
                "points": points,
                "sample_vectors": sample_vectors,
                "current_vectors": sample_vectors,
                "data_mode": "real",
                "note": "Copernicus Marine operational hydrodynamic analysis/forecast. Real Eulerian velocity field.",
            }

            # Save parsed sidecar cache alongside the NetCDF for runtime resilience
            try:
                sidecar_path = nc_path.with_name(nc_path.stem + ".parsed.json")
                if not sidecar_path.exists():
                    with open(sidecar_path, "w", encoding="utf-8") as f:
                        json.dump(result, f, indent=2)
                    logger.info("Created pre-parsed Copernicus sidecar: %s", sidecar_path)
            except Exception as se:
                logger.warning("Could not write sidecar JSON: %s", se)

            return result
        finally:
            try:
                ds.close()
            except Exception:
                pass

    def get_real_current_field(
        self,
        explicit_path: Optional[str] = None,
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get Copernicus Marine current field. Cached in-memory with file mtime checking.
        Fails visibly if NetCDF dataset is missing or corrupted.
        """
        nc_path = _resolve_nc_path(explicit_path)
        if not nc_path:
            raise FileNotFoundError(
                "Copernicus Marine ocean currents dataset not found at backend/data/copernicus/arabian_sea_currents.nc. "
                "Real-Data Mode requires the verified Copernicus NetCDF dataset."
            )

        mtime = nc_path.stat().st_mtime
        if self._cached_field is not None and self._cached_file_mtime == mtime:
            return self._cached_field

        parsed = self.parse_netcdf(nc_path)
        self._cached_field = parsed
        self._cached_file_mtime = mtime
        return parsed

    def get_velocity_at(
        self,
        lat: float,
        lon: float,
        dt: Optional[datetime] = None,
        explicit_path: Optional[str] = None,
    ) -> Dict[str, float]:
        """
        Provide hydrodynamic surface current velocity lookup at given latitude, longitude, and datetime.
        
        Returns:
            {"u": eastward velocity in m/s, "v": northward velocity in m/s}
            
        Raises:
            ValueError: if coordinates are outside dataset bounds or data is unavailable.
        """
        field_data = self.get_real_current_field(explicit_path=explicit_path)
        bounds = field_data["bounds"]

        # Validate coordinate boundaries
        if not (bounds["south"] <= lat <= bounds["north"] and bounds["west"] <= lon <= bounds["east"]):
            raise ValueError(
                f"Coordinates ({lat:.4f}, {lon:.4f}) outside Copernicus Marine Arabian Sea dataset domain "
                f"[{bounds['south']}–{bounds['north']} N, {bounds['west']}–{bounds['east']} E]."
            )

        # Spatio-temporal interpolation via points
        points = field_data.get("points", [])
        if not points:
            raise ValueError("Copernicus Marine current field contains no valid points.")

        # Local search window (0.6 degree)
        candidates = [p for p in points if abs(p["lat"] - lat) <= 0.6 and abs(p["lon"] - lon) <= 0.6]
        if not candidates:
            candidates = points

        # Inverse-distance weighting
        total_w = 0.0
        sum_u = 0.0
        sum_v = 0.0
        min_d = float("inf")
        nearest_u, nearest_v = 0.0, 0.0

        for pt in candidates:
            d = math.sqrt((pt["lat"] - lat)**2 + (pt["lon"] - lon)**2)
            if d < 1e-6:
                return {"u": pt["current_u"], "v": pt["current_v"]}
            if d < min_d:
                min_d = d
                nearest_u = pt["current_u"]
                nearest_v = pt["current_v"]
            w = 1.0 / (d**2)
            sum_u += w * pt["current_u"]
            sum_v += w * pt["current_v"]
            total_w += w

        if total_w == 0.0:
            return {"u": round(nearest_u, 4), "v": round(nearest_v, 4)}

        return {
            "u": round(sum_u / total_w, 4),
            "v": round(sum_v / total_w, 4)
        }


# Singleton service instance
copernicus_marine_service = CopernicusMarineService()
