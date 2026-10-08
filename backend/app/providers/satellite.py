import os
import json
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pathlib import Path
import requests

logger = logging.getLogger("oiltrace.satellite")

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "cache" / "catalogue"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

class SatelliteProvider(ABC):
    """Abstract base class for satellite SAR scene acquisition."""
    @abstractmethod
    def search(self, bbox: List[float], start_time: datetime, end_time: datetime, collections: Optional[List[str]] = None, limit: int = 10) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def get_scene(self, scene_id: str) -> Dict[str, Any]:
        pass

    def discover_scenes(self, bbox: Optional[List[float]] = None, max_records: int = 10, start_time: Optional[datetime] = None, end_time: Optional[datetime] = None) -> List[Dict[str, Any]]:
        from datetime import timedelta
        t_end = end_time or datetime.now(timezone.utc)
        t_start = start_time or (t_end - timedelta(days=14))
        b = bbox or [71.5, 14.5, 73.5, 16.5]
        return self.search(b, t_start, t_end, limit=max_records)


class SimulationSatelliteProvider(SatelliteProvider):
    """Deterministic simulation provider returning calibrated Sentinel-1 metadata."""
    def __init__(self, seed: int = 26143):
        self.seed = seed

    def search(self, bbox: List[float], start_time: datetime, end_time: datetime, collections: Optional[List[str]] = None, limit: int = 10) -> List[Dict[str, Any]]:
        return [self.get_scene("S1A_IW_GRDH_1SDV_20240315T060000_demo")]

    def discover_scenes(self, bbox: Optional[List[float]] = None, max_records: int = 10, start_time: Optional[datetime] = None, end_time: Optional[datetime] = None) -> List[Dict[str, Any]]:
        sc = self.get_scene("S1A_IW_GRDH_1SDV_20240315T060000_demo")
        return [sc]

    def get_scene(self, scene_id: str) -> Dict[str, Any]:
        return {
            "id": scene_id,
            "scene_id": scene_id,
            "satellite": "Sentinel-1A",
            "acquisition_time": "2024-03-15T06:00:00+00:00",
            "bbox": [71.0, 14.0, 74.5, 17.5],
            "geometry": {"type": "Polygon", "coordinates": [[[71.0, 14.0], [74.5, 14.0], [74.5, 17.5], [71.0, 17.5], [71.0, 14.0]]]},
            "crs": "EPSG:4326",
            "resolution_m": 10.0,
            "bands": ["VV", "VH"],
            "asset_path": "S1A_IW_GRDH_1SDV_20240315T060000_demo.tif",
            "data_mode": "simulation",
            "provenance": "synthetic",
            "source": "PRECOMPUTED_DEMO",
            "metadata": {
                "orbit_direction": "descending",
                "polarization": "VV+VH",
                "incidence_angle_center_deg": 38.2,
                "track": 79,
            }
        }


class RealSatelliteProvider(SatelliteProvider):
    """
    Copernicus Data Space Ecosystem (CDSE) Satellite Provider.
    Queries real Sentinel-1 C-SAR IW GRD scenes using the Copernicus OData catalogue API.
    Caches catalogue metadata locally and provides true geographic footprints.
    """
    BASE_URL = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"

    def __init__(self, username: Optional[str] = None, password: Optional[str] = None, cache_dir: Optional[Path] = None):
        self.username = username
        self.password = password
        self.cache_dir = cache_dir or CACHE_DIR

    def _get_cache_path(self, key: str) -> Path:
        safe_key = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in key)
        return self.cache_dir / f"{safe_key}.json"

    def search(self, bbox: List[float], start_time: datetime, end_time: datetime, collections: Optional[List[str]] = None, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Search for Sentinel-1 GRD acquisitions matching bounding box and date range.
        bbox format: [min_lon, min_lat, max_lon, max_lat]
        """
        min_lon, min_lat, max_lon, max_lat = bbox
        aoi_wkt = (
            f"geography'SRID=4326;POLYGON(("
            f"{min_lon} {min_lat}, {max_lon} {min_lat}, "
            f"{max_lon} {max_lat}, {min_lon} {max_lat}, "
            f"{min_lon} {min_lat}))'"
        )
        t_start = start_time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        t_end = end_time.strftime("%Y-%m-%dT%H:%M:%S.000Z")

        cache_key = f"search_{min_lon}_{min_lat}_{max_lon}_{max_lat}_{t_start}_{t_end}_{limit}"
        cache_file = self._get_cache_path(cache_key)

        if cache_file.exists():
            try:
                with open(cache_file, "r") as f:
                    return json.load(f)
            except Exception:
                pass

        filter_expr = (
            f"Collection/Name eq 'SENTINEL-1' and contains(Name,'IW_GRDH') and "
            f"OData.CSC.Intersects(area={aoi_wkt}) and "
            f"ContentDate/Start ge {t_start} and ContentDate/Start le {t_end}"
        )
        params = {
            "$filter": filter_expr,
            "$top": limit,
            "$orderby": "ContentDate/Start desc"
        }

        try:
            r = requests.get(self.BASE_URL, params=params, timeout=20)
            if r.status_code != 200:
                logger.warning(f"CDSE catalogue returned HTTP {r.status_code}: {r.text[:200]}")
                raise ValueError(f"Copernicus catalogue query failed with HTTP {r.status_code}")

            data = r.json()
            items = data.get("value", [])
            scenes = []

            for item in items:
                scene = self._normalize_cdse_product(item)
                scenes.append(scene)

            with open(cache_file, "w") as f:
                json.dump(scenes, f, indent=2)

            return scenes

        except requests.exceptions.RequestException as e:
            logger.error(f"CDSE connection failed: {e}")
            raise ValueError(f"Copernicus Data Space Ecosystem unavailable: {e}")

    def get_scene(self, scene_id: str) -> Dict[str, Any]:
        """
        Retrieve metadata for a specific Sentinel-1 scene ID from CDSE or local cache.
        """
        cache_file = self._get_cache_path(f"scene_{scene_id}")
        if cache_file.exists():
            try:
                with open(cache_file, "r") as f:
                    return json.load(f)
            except Exception:
                pass

        # Try lookup by name
        params = {
            "$filter": f"contains(Name,'{scene_id}')",
            "$top": 1
        }
        try:
            r = requests.get(self.BASE_URL, params=params, timeout=15)
            if r.status_code == 200:
                val = r.json().get("value", [])
                if val:
                    scene = self._normalize_cdse_product(val[0])
                    with open(cache_file, "w") as f:
                        json.dump(scene, f, indent=2)
                    return scene
        except Exception as e:
            logger.error(f"Failed to query scene {scene_id}: {e}")

        raise ValueError(f"Satellite scene '{scene_id}' not found in Copernicus Data Space catalogue.")

    def _normalize_cdse_product(self, item: Dict[str, Any]) -> Dict[str, Any]:
        name = item.get("Name", "")
        clean_id = name.replace(".SAFE", "")
        footprint = item.get("GeoFootprint") or {}
        coords = footprint.get("coordinates", [[]])[0] if footprint.get("coordinates") else []
        
        if coords:
            lons = [c[0] for c in coords]
            lats = [c[1] for c in coords]
            bbox = [min(lons), min(lats), max(lons), max(lats)]
        else:
            bbox = [72.0, 15.0, 74.0, 16.0]

        start_date = item.get("ContentDate", {}).get("Start", "")
        product_id = item.get("Id", "")

        return {
            "id": clean_id,
            "scene_id": clean_id,
            "catalogue_id": product_id,
            "satellite": "Sentinel-1A" if "S1A" in name else "Sentinel-1B",
            "acquisition_time": start_date,
            "bbox": bbox,
            "geometry": footprint,
            "footprint_geojson": footprint,
            "crs": "EPSG:4326",
            "resolution_m": 10.0,
            "bands": ["VV", "VH"],
            "asset_path": name,
            "data_mode": "real",
            "provenance": "observed",
            "source": "COPERNICUS_DATA_SPACE_ECOSYSTEM",
            "quicklook_url": f"https://catalogue.dataspace.copernicus.eu/odata/v1/Products({product_id})/$value",
            "metadata": {
                "orbit_direction": "descending" if "D" in clean_id else "ascending",
                "polarization": "VV+VH",
                "instrument": "C-SAR",
                "product_type": "GRD",
            }
        }


def get_satellite_provider(data_mode: str = "real") -> SatelliteProvider:
    if data_mode == "simulation":
        return SimulationSatelliteProvider()
    return RealSatelliteProvider()
