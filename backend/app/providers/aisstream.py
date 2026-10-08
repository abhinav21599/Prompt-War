"""
AISStream.io WebSocket provider.

Connects to wss://stream.aisstream.io/v0/stream, subscribes to PositionReport
and ShipStaticData messages within a bounding box, collects messages for a
configurable number of seconds, then disconnects and returns normalized vessel
records de-duplicated by MMSI.

Requires: websockets>=12 (pip install websockets)
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("oiltrace.aisstream")

AISSTREAM_WS_URL = "wss://stream.aisstream.io/v0/stream"


def _get_api_key() -> str:
    """Return AISStream API key from config or environment."""
    try:
        from app.config import settings
        key = settings.aisstream_api_key
        if key:
            return key
    except Exception:
        pass
    return os.getenv("AISSTREAM_API_KEY") or os.getenv("AIS_API_KEY") or ""


async def _fetch_live_vessels_async(
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
    api_key: str,
    collect_seconds: float = 8.0,
    max_vessels: int = 50,
) -> List[Dict[str, Any]]:
    """
    Open an AISStream WebSocket, subscribe, collect for collect_seconds, close.
    """
    try:
        import websockets
    except ImportError:
        raise ImportError("websockets package not installed. Run: pip install websockets")

    vessels: Dict[str, Dict[str, Any]] = {}

    subscription = {
        "APIKey": api_key,
        "BoundingBoxes": [[[min_lat, min_lon], [max_lat, max_lon]]],
        "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
    }

    try:
        async with websockets.connect(
            AISSTREAM_WS_URL,
            extra_headers={"User-Agent": "OilTrace-AI/1.0"},
            open_timeout=10,
            close_timeout=5,
            max_size=2**20,
            compression="deflate",
        ) as ws:
            await ws.send(json.dumps(subscription))
            deadline = asyncio.get_event_loop().time() + collect_seconds

            while asyncio.get_event_loop().time() < deadline and len(vessels) < max_vessels:
                try:
                    remaining = deadline - asyncio.get_event_loop().time()
                    if remaining <= 0:
                        break
                    raw = await asyncio.wait_for(ws.recv(), timeout=min(remaining, 2.0))
                    msg = json.loads(raw) if isinstance(raw, str) else json.loads(raw.decode())
                except asyncio.TimeoutError:
                    break
                except Exception as e:
                    logger.debug(f"AISStream recv error: {e}")
                    break

                msg_type = msg.get("MessageType")
                if msg_type == "SubscriptionConfirmation":
                    continue

                meta = msg.get("MetaData", {})
                mmsi = str(meta.get("MMSI", "")).strip()
                if not mmsi or mmsi == "0":
                    continue

                lat = meta.get("Latitude")
                lon = meta.get("Longitude")
                ship_name = meta.get("ShipName", "").strip() or f"MMSI {mmsi}"

                if msg_type == "PositionReport":
                    pos = msg.get("Message", {}).get("PositionReport", {})
                    sog = pos.get("Sog") or 0.0
                    cog = pos.get("Cog") or 0.0
                    heading = pos.get("TrueHeading") or cog
                    nav_status = pos.get("NavigationalStatus", 0)

                    if mmsi not in vessels:
                        vessels[mmsi] = {
                            "mmsi": mmsi,
                            "vessel_name": ship_name,
                            "vessel_type": None,
                            "imo": None,
                            "flag": None,
                            "call_sign": None,
                            "length_m": None,
                            "gross_tonnage": None,
                        }
                    vessels[mmsi].update({
                        "latitude": lat,
                        "longitude": lon,
                        "sog_knots": round(float(sog), 2) if sog else 0.0,
                        "cog_deg": round(float(cog), 1) if cog else 0.0,
                        "heading_deg": round(float(heading), 1) if heading else 0.0,
                        "nav_status": nav_status,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "data_mode": "real",
                        "provenance": "aisstream",
                        "source": "aisstream.io",
                    })

                elif msg_type == "ShipStaticData":
                    static = msg.get("Message", {}).get("ShipStaticData", {})
                    vessel_type_code = static.get("Type", 0)
                    dim = static.get("Dimension", {}) or {}
                    imo = static.get("ImoNumber") or static.get("Imo")
                    call_sign = static.get("CallSign", "").strip()
                    name = static.get("Name", "").strip() or ship_name

                    if mmsi not in vessels:
                        vessels[mmsi] = {
                            "mmsi": mmsi,
                            "latitude": lat,
                            "longitude": lon,
                            "sog_knots": 0.0,
                            "cog_deg": 0.0,
                            "heading_deg": 0.0,
                            "nav_status": 0,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "data_mode": "real",
                            "provenance": "aisstream",
                            "source": "aisstream.io",
                        }
                    vessels[mmsi].update({
                        "vessel_name": name or vessels[mmsi].get("vessel_name", f"MMSI {mmsi}"),
                        "vessel_type": _decode_vessel_type(vessel_type_code),
                        "imo": str(imo) if imo else None,
                        "flag": static.get("Flag", "").strip() or None,
                        "call_sign": call_sign or None,
                        "length_m": _sum_dim(dim, "A", "B"),
                        "gross_tonnage": None,
                    })

    except Exception as e:
        logger.error(f"AISStream connection error: {e}", exc_info=True)
        raise

    return list(vessels.values())


def _sum_dim(dim: dict, *keys) -> Optional[float]:
    total = sum(float(dim.get(k, 0) or 0) for k in keys)
    return round(total, 1) if total > 0 else None


def _decode_vessel_type(code: int) -> str:
    if 70 <= code <= 79:
        return "cargo"
    if 80 <= code <= 89:
        return "tanker"
    if 30 <= code <= 39:
        return "fishing"
    if 50 <= code <= 59:
        return "service"
    if 60 <= code <= 69:
        return "passenger"
    if 20 <= code <= 29:
        return "towing"
    return "other"


def fetch_live_vessels(
    spill_lat: float,
    spill_lon: float,
    radius_deg: float = 1.5,
    collect_seconds: float = 8.0,
    max_vessels: int = 50,
    api_key: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Synchronous wrapper: fetch live AIS vessels in a bbox around spill location.
    Returns list of vessel dicts with mmsi, vessel_name, latitude, longitude, etc.
    """
    key = api_key or _get_api_key()
    if not key:
        raise ValueError(
            "No AISStream API key configured. "
            "Set AISSTREAM_API_KEY in your Render environment variables."
        )

    min_lat = round(spill_lat - radius_deg, 6)
    max_lat = round(spill_lat + radius_deg, 6)
    min_lon = round(spill_lon - radius_deg, 6)
    max_lon = round(spill_lon + radius_deg, 6)

    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(
            asyncio.run,
            _fetch_live_vessels_async(
                min_lat, min_lon, max_lat, max_lon,
                key, collect_seconds, max_vessels
            )
        )
        return future.result(timeout=collect_seconds + 10)
