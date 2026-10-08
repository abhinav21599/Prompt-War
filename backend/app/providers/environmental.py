import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime
import numpy as np

logger = logging.getLogger("oiltrace.environmental")

class EnvironmentalProvider(ABC):
    """Abstract base class for environmental ocean current and wind vector fields."""
    @abstractmethod
    def get_currents(self, bbox: List[float], start_time: datetime, end_time: datetime) -> Dict[str, Any]:
        pass

    @abstractmethod
    def get_wind(self, bbox: List[float], start_time: datetime, end_time: datetime) -> Dict[str, Any]:
        pass


class SimulationEnvironmentalProvider(EnvironmentalProvider):
    """Deterministic simulation provider generating hydrodynamic fields with fixed seed."""
    def __init__(self, seed: int = 26143):
        self.seed = seed

    def get_currents(self, bbox: List[float], start_time: datetime, end_time: datetime) -> Dict[str, Any]:
        rng = np.random.default_rng(self.seed)
        lats = [14.5, 15.0, 15.5, 16.0, 16.5]
        lons = [71.5, 72.0, 72.5, 73.0, 73.5]
        points = []
        for la in lats:
            for lo in lons:
                points.append({
                    "lat": la,
                    "lon": lo,
                    "current_u": round(0.18 + float(rng.normal(0, 0.05)), 4),
                    "current_v": round(0.12 + float(rng.normal(0, 0.05)), 4),
                })
        return {
            "source": "SYNTHETIC_OCEAN_CURRENT_v1",
            "field": "current",
            "data_mode": "simulation",
            "provenance": "synthetic",
            "points": points,
            "crs": "EPSG:4326",
            "resolution_deg": 0.083,
            "units": "m/s",
            "quality": 0.90,
        }

    def get_wind(self, bbox: List[float], start_time: datetime, end_time: datetime) -> Dict[str, Any]:
        rng = np.random.default_rng(self.seed + 2)
        lats = [14.5, 15.0, 15.5, 16.0, 16.5]
        lons = [71.5, 72.0, 72.5, 73.0, 73.5]
        points = []
        for la in lats:
            for lo in lons:
                points.append({
                    "lat": la,
                    "lon": lo,
                    "wind_u": round(5.2 + float(rng.normal(0, 0.3)), 4),
                    "wind_v": round(3.8 + float(rng.normal(0, 0.3)), 4),
                })
        return {
            "source": "SYNTHETIC_ERA5_v1",
            "field": "wind",
            "data_mode": "simulation",
            "provenance": "synthetic",
            "points": points,
            "crs": "EPSG:4326",
            "resolution_deg": 0.25,
            "units": "m/s",
            "quality": 0.88,
        }


class RealEnvironmentalProvider(EnvironmentalProvider):
    """
    Real-world environmental data adapter (Copernicus Marine / ECMWF ERA5 with Open-Meteo fallback).
    Always returns real operational data or fails visibly if all real sources are unreachable.
    Never silently outputs synthetic random fields.
    """
    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        self.api_url = api_url
        self.api_key = api_key

    def get_currents(self, bbox: List[float], start_time: datetime, end_time: datetime) -> Dict[str, Any]:
        # 1. Try Copernicus Marine Service
        try:
            from app.integrations.copernicus_marine_service import copernicus_marine_service
            return copernicus_marine_service.get_real_current_field()
        except Exception as e:
            logger.info(f"Copernicus Marine unavailable: {e}. Trying Open-Meteo operational marine data.")

        # 2. Try Open-Meteo Marine Operational
        try:
            from app.integrations.openmeteo_service import openmeteo_service
            min_lon, min_lat, max_lon, max_lat = bbox if len(bbox) == 4 else (71.5, 14.5, 73.5, 16.5)
            return openmeteo_service.fetch_current_field(min_lat, max_lat, min_lon, max_lon)
        except Exception as e:
            logger.error(f"Open-Meteo current service failed: {e}")

        raise ValueError("Real ocean currents dataset is currently unavailable from remote services.")

    def get_wind(self, bbox: List[float], start_time: datetime, end_time: datetime) -> Dict[str, Any]:
        # 1. Try Copernicus Climate Data Store (CDS ERA5)
        try:
            from app.integrations.cds_service import cds_service
            return cds_service.get_real_wind_field()
        except Exception as e:
            logger.info(f"Copernicus CDS wind unavailable: {e}. Trying Open-Meteo operational atmospheric data.")

        # 2. Try Open-Meteo Operational Wind
        try:
            from app.integrations.openmeteo_service import openmeteo_service
            min_lon, min_lat, max_lon, max_lat = bbox if len(bbox) == 4 else (71.5, 14.5, 73.5, 16.5)
            return openmeteo_service.fetch_wind_field(min_lat, max_lat, min_lon, max_lon)
        except Exception as e:
            logger.error(f"Open-Meteo wind service failed: {e}")

        raise ValueError("Real atmospheric wind dataset is currently unavailable from remote services.")


def get_environmental_provider(data_mode: str = "real") -> EnvironmentalProvider:
    if data_mode == "simulation":
        return SimulationEnvironmentalProvider()
    return RealEnvironmentalProvider()
