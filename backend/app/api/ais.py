"""
AIS Live Vessel Endpoint.

GET /api/ais/live?spill_id=<id>&lat=<lat>&lon=<lon>&radius_deg=<r>

Fetches live vessel positions near a spill via AISStream.io WebSocket.
Falls back to seeded DB vessels if no API key is configured.
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

router = APIRouter(prefix="/api/ais", tags=["ais"])
logger = logging.getLogger("oiltrace.ais_api")


def _get_spill_centroid(spill_id: str):
    """Return (lat, lon) centroid for a spill, or raise 404."""
    from app.database.engine import get_connection, row_to_dict, parse_json
    conn = get_connection()
    try:
        from app.api.spills import _resolve_spill_id
        resolved = _resolve_spill_id(spill_id, conn)
        row = conn.execute("SELECT centroid_geojson FROM oil_spills WHERE id=?", (resolved,)).fetchone()
        if not row:
            raise HTTPException(404, f"Spill {spill_id} not found")
        centroid = parse_json(row[0]) if isinstance(row[0], str) else row[0]
        if centroid and centroid.get("coordinates"):
            lon, lat = centroid["coordinates"]
            return lat, lon
        return 15.42, 72.68  # Arabian Sea fallback
    finally:
        conn.close()


def _db_fallback_vessels(spill_id: str):
    """Return vessels from the DB (seeded simulation data) as fallback."""
    from app.database.engine import get_connection, row_to_dict
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT vt.mmsi, vt.latitude, vt.longitude, vt.sog_knots, vt.cog_deg,
                   vt.heading_deg, vt.timestamp, vt.nav_status,
                   v.vessel_name, v.vessel_type, v.imo, v.flag, v.call_sign,
                   v.length_m, v.gross_tonnage, v.data_mode
            FROM ais_observations vt
            LEFT JOIN vessels v ON vt.mmsi = v.mmsi
            WHERE v.mmsi IS NOT NULL
            ORDER BY vt.timestamp DESC
        """).fetchall()
        # Deduplicate by MMSI, take most recent observation per vessel
        seen = {}
        for r in rows:
            d = row_to_dict(r)
            mmsi = d.get("mmsi")
            if mmsi and mmsi not in seen:
                seen[mmsi] = {
                    "mmsi": mmsi,
                    "vessel_name": d.get("vessel_name") or f"MMSI {mmsi}",
                    "vessel_type": d.get("vessel_type"),
                    "imo": d.get("imo"),
                    "flag": d.get("flag"),
                    "call_sign": d.get("call_sign"),
                    "length_m": d.get("length_m"),
                    "gross_tonnage": d.get("gross_tonnage"),
                    "latitude": d.get("latitude"),
                    "longitude": d.get("longitude"),
                    "sog_knots": d.get("sog_knots"),
                    "cog_deg": d.get("cog_deg"),
                    "heading_deg": d.get("heading_deg"),
                    "timestamp": d.get("timestamp"),
                    "nav_status": d.get("nav_status"),
                    "data_mode": d.get("data_mode") or "simulation",
                    "provenance": "db_seeded",
                    "source": "oiltrace_db",
                }
        return list(seen.values())
    finally:
        conn.close()


@router.get("/live")
def get_live_vessels(
    spill_id: Optional[str] = Query(None, description="Spill ID to center the search on"),
    lat: Optional[float] = Query(None, description="Manual latitude override"),
    lon: Optional[float] = Query(None, description="Manual longitude override"),
    radius_deg: float = Query(1.5, description="Search radius in degrees (~150 km)"),
    collect_seconds: float = Query(8.0, description="WebSocket collect duration in seconds"),
    max_vessels: int = Query(50, description="Max vessels to return"),
):
    """
    Fetch live AIS vessel positions near a spill location via AISStream.io.

    If AISSTREAM_API_KEY is not configured, returns simulation vessels from the DB.
    Useful as live data source for the Vessel Attribution page.
    """
    # Resolve lat/lon
    if lat is not None and lon is not None:
        spill_lat, spill_lon = lat, lon
    elif spill_id:
        try:
            spill_lat, spill_lon = _get_spill_centroid(spill_id)
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Could not resolve spill centroid for {spill_id}: {e}")
            spill_lat, spill_lon = 15.42, 72.68
    else:
        spill_lat, spill_lon = 15.42, 72.68  # Arabian Sea default

    # Try live AISStream fetch
    from app.config import settings
    api_key = settings.aisstream_api_key

    if api_key:
        try:
            from app.providers.aisstream import fetch_live_vessels
            vessels = fetch_live_vessels(
                spill_lat=spill_lat,
                spill_lon=spill_lon,
                radius_deg=radius_deg,
                collect_seconds=collect_seconds,
                max_vessels=max_vessels,
                api_key=api_key,
            )
            logger.info(f"AISStream returned {len(vessels)} live vessels near ({spill_lat}, {spill_lon})")
            return {
                "source": "aisstream_live",
                "spill_lat": spill_lat,
                "spill_lon": spill_lon,
                "radius_deg": radius_deg,
                "vessel_count": len(vessels),
                "vessels": vessels,
            }
        except Exception as e:
            logger.error(f"AISStream live fetch failed: {e}", exc_info=True)
            # Fall through to DB fallback
            logger.info("Falling back to DB seeded vessels")

    # Fallback: DB vessels
    vessels = _db_fallback_vessels(spill_id or "OILTRACE-DEMO-001")
    return {
        "source": "db_seeded" if not api_key else "db_seeded_fallback",
        "note": "Configure AISSTREAM_API_KEY for live vessel data" if not api_key else "Live fetch failed; serving cached simulation data",
        "spill_lat": spill_lat,
        "spill_lon": spill_lon,
        "radius_deg": radius_deg,
        "vessel_count": len(vessels),
        "vessels": vessels,
    }
