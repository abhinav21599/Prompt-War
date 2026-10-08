import os
import math
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np

logger = logging.getLogger("oiltrace.cds")

# Default paths for cached CDS ERA5 NetCDF files
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_NC_PATH = BASE_DIR / "data" / "era5_arabian_sea_wind.nc"
CACHE_DIR = BASE_DIR / "data" / "cache" / "cds"


def _resolve_nc_path(explicit_path: Optional[str] = None) -> Optional[Path]:
    """Find the NetCDF file from explicit path, project data dir, or relative paths."""
    candidates = []
    if explicit_path:
        candidates.append(Path(explicit_path))
    candidates.extend([
        DEFAULT_NC_PATH,
        Path("backend/data/era5_arabian_sea_wind.nc"),
        Path("data/era5_arabian_sea_wind.nc"),
        BASE_DIR.parent / "backend" / "data" / "era5_arabian_sea_wind.nc",
    ])
    for p in candidates:
        if p.exists() and p.is_file():
            return p.resolve()
    return None


class CDSService:
    """
    Copernicus Climate Data Store (CDS) Integration Service.
    
    Provides real ERA5 hourly single-level atmospheric wind fields
    for Lagrangian oil spill drift hindcast/forecast and tactical GIS display.
    Credentials remain strictly backend-side (read from ~/.cdsapirc or env vars).
    """

    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._cached_wind_field: Optional[Dict[str, Any]] = None
        self._cached_file_mtime: Optional[float] = None

    def fetch_era5_wind(
        self,
        bounds: List[float],  # [North, West, South, East]
        target_time: datetime,
        output_path: Optional[Path] = None,
    ) -> Path:
        """
        Request ERA5 10m wind components from CDS API.
        Never logs or exposes API credentials.
        """
        try:
            import cdsapi
        except ImportError:
            raise RuntimeError("cdsapi package is not installed.")

        dest = output_path or (self.cache_dir / f"era5_wind_{target_time.strftime('%Y%m%d_%H%M')}.nc")
        if dest.exists():
            logger.info("Using cached CDS NetCDF: %s", dest)
            return dest

        logger.info("Requesting CDS ERA5 wind data for area %s at %s", bounds, target_time)
        client = cdsapi.Client()
        client.retrieve(
            "reanalysis-era5-single-levels",
            {
                "product_type": ["reanalysis"],
                "variable": [
                    "10m_u_component_of_wind",
                    "10m_v_component_of_wind",
                ],
                "year": [str(target_time.year)],
                "month": [f"{target_time.month:02d}"],
                "day": [f"{target_time.day:02d}"],
                "time": [f"{target_time.hour:02d}:00"],
                "data_format": "netcdf",
                "download_format": "unarchived",
                "area": bounds,
            },
            str(dest),
        )
        logger.info("Successfully downloaded CDS ERA5 wind dataset to %s", dest)
        return dest

    def parse_netcdf(self, nc_path: Path) -> Dict[str, Any]:
        """
        Parse downloaded NetCDF dataset into OILTRACE environmental field dictionary.
        Uses xarray with netCDF4 backend.
        """
        if not nc_path.exists():
            raise FileNotFoundError(f"NetCDF file not found: {nc_path}")

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
                "Neither xarray nor pre-parsed NetCDF sidecar is available. "
                "Ensure xarray/netCDF4 is installed or run with venv python."
            )

        try:
            # Extract coordinates
            lat_coord = ds["latitude"].values if "latitude" in ds else ds["lat"].values
            lon_coord = ds["longitude"].values if "longitude" in ds else ds["lon"].values

            # Extract valid timestamp
            if "valid_time" in ds:
                vt = ds["valid_time"].values
                if isinstance(vt, np.ndarray) and vt.size > 0:
                    vt = vt.flat[0]
                ts_str = str(np.datetime_as_string(vt, unit="s")) + "Z"
            elif "time" in ds:
                t_val = ds["time"].values
                if isinstance(t_val, np.ndarray) and t_val.size > 0:
                    t_val = t_val.flat[0]
                ts_str = str(np.datetime_as_string(t_val, unit="s")) + "Z"
            else:
                ts_str = datetime.now(timezone.utc).isoformat()

            # Extract u10 and v10 arrays
            u_var = ds["u10"] if "u10" in ds else ds["10m_u_component_of_wind"]
            v_var = ds["v10"] if "v10" in ds else ds["10m_v_component_of_wind"]

            u_arr = u_var.values
            v_arr = v_var.values

            # Collapse any leading time/ensemble dimension
            while u_arr.ndim > 2:
                u_arr = u_arr[0]
            while v_arr.ndim > 2:
                v_arr = v_arr[0]

            lats = [float(la) for la in lat_coord]
            lons = [float(lo) for lo in lon_coord]

            points: List[Dict[str, Any]] = []
            speeds: List[float] = []
            us: List[float] = []
            vs: List[float] = []

            for i, la in enumerate(lats):
                for j, lo in enumerate(lons):
                    u = float(u_arr[i, j])
                    v = float(v_arr[i, j])
                    spd = math.sqrt(u**2 + v**2)
                    # Meteorological direction (direction from which the wind blows)
                    dir_deg = (math.degrees(math.atan2(-u, -v)) + 360) % 360

                    points.append({
                        "lat": round(la, 4),
                        "lon": round(lo, 4),
                        "wind_u": round(u, 4),
                        "wind_v": round(v, 4),
                        "wind_speed": round(spd, 2),
                        "wind_direction_deg": round(dir_deg, 1),
                    })
                    speeds.append(spd)
                    us.append(u)
                    vs.append(v)

            north = float(max(lats))
            south = float(min(lats))
            west = float(min(lons))
            east = float(max(lons))

            summary = {
                "mean_speed": round(float(np.mean(speeds)), 2),
                "max_speed": round(float(np.max(speeds)), 2),
                "min_speed": round(float(np.min(speeds)), 2),
                "mean_u": round(float(np.mean(us)), 3),
                "mean_v": round(float(np.mean(vs)), 3),
                "point_count": len(points),
                "lat_count": len(lats),
                "lon_count": len(lons),
                "resolution_deg": round(abs(lats[1] - lats[0]), 2) if len(lats) > 1 else 0.25,
            }

            # Generate sample vector features for direct MapLibre rendering
            # Include full 0.25 deg grid resolution (1,353 vectors) for Arabian Sea domain
            sample_vectors = []
            for i in range(len(lats)):
                for j in range(len(lons)):
                    la = lats[i]
                    lo = lons[j]
                    u = float(u_arr[i, j])
                    v = float(v_arr[i, j])
                    spd = math.sqrt(u**2 + v**2)
                    dir_deg = (math.degrees(math.atan2(-u, -v)) + 360) % 360
                    # Vector end point scaled for visualization (approx 0.05 deg length)
                    length_deg = 0.05
                    end_lon = lo + (u / (spd + 1e-6)) * length_deg
                    end_lat = la + (v / (spd + 1e-6)) * length_deg

                    sample_vectors.append({
                        "lat": round(la, 4),
                        "lon": round(lo, 4),
                        "end_lat": round(end_lat, 4),
                        "end_lon": round(end_lon, 4),
                        "wind_u": round(u, 3),
                        "wind_v": round(v, 3),
                        "wind_speed": round(spd, 2),
                        "wind_direction_deg": round(dir_deg, 1),
                    })

            return {
                "field": "wind",
                "source": "Copernicus Climate Data Store",
                "dataset": "ERA5 hourly reanalysis",
                "status": "LATEST AVAILABLE / REANALYSIS",
                "variables": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
                "timestamp": ts_str,
                "bounds": {
                    "north": north,
                    "south": south,
                    "west": west,
                    "east": east,
                },
                "grid": {
                    "resolution_deg": summary["resolution_deg"],
                    "lat_count": summary["lat_count"],
                    "lon_count": summary["lon_count"],
                    "point_count": summary["point_count"],
                },
                "wind": {
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
                "crs": "EPSG:4326",
                "units": {"wind": "m/s"},
                "data_mode": "real",
                "provenance": "OBSERVED",
                "note": "Reanalysis wind from Copernicus Climate Data Store ERA5 model. Not operational live telemetry.",
            }
        finally:
            ds.close()

    def get_real_wind_field(
        self,
        explicit_path: Optional[str] = None,
        bounds: Optional[List[float]] = None,
        target_time: Optional[datetime] = None,
        force_download: bool = False,
    ) -> Dict[str, Any]:
        """
        Get real CDS ERA5 wind field.
        Checks in-memory cache first, then cached NetCDF on disk, and downloads only if necessary.
        """
        nc_file = _resolve_nc_path(explicit_path)

        if force_download or (nc_file is None and bounds and target_time):
            nc_file = self.fetch_era5_wind(bounds or [20, 68, 10, 76], target_time or datetime(2024, 3, 15, 6, 0))

        if nc_file is None:
            raise FileNotFoundError(
                "No CDS ERA5 NetCDF file found. Run test_cds_wind.py or provide cached dataset."
            )

        # Check mtime cache
        mtime = nc_file.stat().st_mtime
        if self._cached_wind_field and self._cached_file_mtime == mtime:
            return self._cached_wind_field

        data = self.parse_netcdf(nc_file)
        self._cached_wind_field = data
        self._cached_file_mtime = mtime
        return data


# Global singleton instance
cds_service = CDSService()
