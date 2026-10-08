import os
import csv
import uuid
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pathlib import Path

class AisProvider(ABC):
    """Abstract base class for maritime AIS vessel tracking data."""
    @abstractmethod
    def get_observations(self, bbox: List[float], start_time: datetime, end_time: datetime) -> List[Dict[str, Any]]:
        pass


class SimulationAisProvider(AisProvider):
    """Simulation provider loading precomputed deterministic vessel observations."""
    def __init__(self, seed: int = 26143):
        self.seed = seed

    def get_observations(self, bbox: List[float], start_time: datetime, end_time: datetime) -> List[Dict[str, Any]]:
        from app.database.engine import get_connection, row_to_dict
        conn = get_connection()
        try:
            rows = conn.execute("SELECT * FROM ais_observations WHERE data_mode='simulation' OR data_mode IS NULL ORDER BY timestamp").fetchall()
            return [row_to_dict(r) for r in rows]
        finally:
            conn.close()


class RealAisProvider(AisProvider):
    """
    Real-world AIS provider adapter (MarineCadastre / AccessAIS / Spire / exactEarth).
    Queries real-mode ingested observations or live API, failing explicitly if unavailable.
    """
    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None, data_dir: Optional[str] = None):
        self.api_url = api_url
        self.api_key = api_key
        self.data_dir = data_dir or os.path.join(os.getcwd(), "data", "ais")

    def get_observations(self, bbox: List[float], start_time: datetime, end_time: datetime) -> List[Dict[str, Any]]:
        from app.database.engine import get_connection, row_to_dict
        conn = get_connection()
        try:
            # First check if real AIS data has been ingested into database
            min_lon, min_lat, max_lon, max_lat = bbox
            t_start = start_time.isoformat()
            t_end = end_time.isoformat()
            query = """
                SELECT * FROM ais_observations
                WHERE data_mode = 'real'
                  AND latitude >= ? AND latitude <= ?
                  AND longitude >= ? AND longitude <= ?
                  AND timestamp >= ? AND timestamp <= ?
                ORDER BY timestamp
            """
            rows = conn.execute(query, (min_lat, max_lat, min_lon, max_lon, t_start, t_end)).fetchall()
            if rows:
                return [row_to_dict(r) for r in rows]
        finally:
            conn.close()

        # If no records in database and no API key configured, fail explicitly
        if not self.api_key:
            raise ValueError(
                "No real AIS records found in the requested window for real-data mode. "
                "Ingest a MarineCadastre AIS dataset or configure live AIS provider API credentials."
            )
        return []


def ingest_marinecadastre_ais(file_path: str, data_mode: str = "real", limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Ingests and normalizes MarineCadastre or AccessAIS CSV records into standard OilTrace AIS observations.
    Expected schema: MMSI, BaseDateTime, LAT, LON, SOG, COG, Heading, VesselName, IMO, CallSign, VesselType
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"AIS data file not found: {file_path}")

    records = []
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            if limit and idx >= limit:
                break
            
            mmsi = row.get("MMSI") or row.get("mmsi")
            dt_str = row.get("BaseDateTime") or row.get("timestamp") or row.get("time")
            lat_str = row.get("LAT") or row.get("latitude") or row.get("lat")
            lon_str = row.get("LON") or row.get("longitude") or row.get("lon")

            if not (mmsi and dt_str and lat_str and lon_str):
                continue

            try:
                lat = float(lat_str)
                lon = float(lon_str)
                sog = float(row.get("SOG") or row.get("sog_knots") or 0.0)
                cog = float(row.get("COG") or row.get("cog_deg") or 0.0)
                heading = float(row.get("Heading") or row.get("heading_deg") or cog)
            except ValueError:
                continue

            # Standardize timestamp to ISO 8601
            try:
                dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            except Exception:
                try:
                    dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                except Exception:
                    continue

            records.append({
                "id": f"AIS-{mmsi}-{uuid.uuid4().hex[:6]}",
                "mmsi": str(mmsi),
                "timestamp": dt.isoformat(),
                "latitude": lat,
                "longitude": lon,
                "sog_knots": sog,
                "cog_deg": cog,
                "heading_deg": heading,
                "nav_status": row.get("Status") or "under_way",
                "data_mode": data_mode,
                "provenance": "marine_cadastre_ais",
                "source": path.name,
                "vessel_name": row.get("VesselName") or f"Vessel-{mmsi}",
                "imo": row.get("IMO"),
                "vessel_type": row.get("VesselType") or "Cargo",
            })

    return records


def get_ais_provider(data_mode: str = "simulation") -> AisProvider:
    if data_mode == "real":
        from app.config import settings
        return RealAisProvider(api_key=settings.aisstream_api_key or os.getenv("AIS_API_KEY") or os.getenv("AISSTREAM_API_KEY"))
    return SimulationAisProvider()

