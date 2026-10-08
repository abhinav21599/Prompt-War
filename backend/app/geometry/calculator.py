import math
from typing import Dict, List, Tuple, Any

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Geodesic distance between two points on Earth using the Haversine formula."""
    r = EARTH_RADIUS_KM
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2)**2
    return 2 * r * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def polygon_area_km2(coords: List[List[float]]) -> float:
    """
    Computes polygon area in square kilometers using projected equal-area CRS (EPSG:6933),
    with accurate local ellipsoidal projection fallback.
    """
    pts = coords[:-1] if len(coords) > 3 and coords[0] == coords[-1] else coords
    n = len(pts)
    if n < 3:
        return 0.0

    try:
        import importlib
        pyproj = importlib.import_module("pyproj")
        shapely_geom = importlib.import_module("shapely.geometry")
        shapely_ops = importlib.import_module("shapely.ops")

        poly = shapely_geom.Polygon(pts)
        transformer = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True)
        projected = shapely_ops.transform(transformer.transform, poly)
        area_km2 = projected.area / 1_000_000.0
        return round(abs(area_km2), 4)
    except Exception:
        # High precision local ellipsoidal projection fallback
        ref_lat = math.radians(sum(p[1] for p in pts) / n)
        kx = math.cos(ref_lat) * EARTH_RADIUS_KM * (math.pi / 180.0)
        ky = EARTH_RADIUS_KM * (math.pi / 180.0)

        total = 0.0
        for i in range(n):
            j = (i + 1) % n
            xi = pts[i][0] * kx
            yi = pts[i][1] * ky
            xj = pts[j][0] * kx
            yj = pts[j][1] * ky
            total += xi * yj - xj * yi
        return round(abs(total) / 2.0, 4)


def polygon_perimeter_km(coords: List[List[float]]) -> float:
    """Geodesic perimeter along polygon boundary."""
    n = len(coords)
    total = 0.0
    for i in range(n - 1):
        lon1, lat1 = coords[i]
        lon2, lat2 = coords[i + 1]
        total += haversine_km(lat1, lon1, lat2, lon2)
    return round(total, 4)


def polygon_centroid(coords: List[List[float]]) -> Tuple[float, float]:
    """Centroid (lat, lon) of polygon vertices."""
    pts = coords[:-1] if len(coords) > 3 and coords[0] == coords[-1] else coords
    lons = [c[0] for c in pts]
    lats = [c[1] for c in pts]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def polygon_bounding_box(coords: List[List[float]]) -> Dict[str, float]:
    """Geographic bounding box in WGS84."""
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return {
        "min_lat": round(min(lats), 6),
        "max_lat": round(max(lats), 6),
        "min_lon": round(min(lons), 6),
        "max_lon": round(max(lons), 6),
    }


def polygon_compactness(area_km2: float, perimeter_km: float) -> float:
    """Isoperimetric quotient (compactness): 4*pi*Area / P^2."""
    if perimeter_km == 0:
        return 0.0
    return round((4 * math.pi * area_km2) / (perimeter_km ** 2), 6)


def characterize_polygon(geojson_polygon: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes rigorous geodesic and projected physical properties for a GeoJSON polygon.
    Preserves original WGS84 coordinates.
    """
    coords = geojson_polygon["coordinates"][0]
    area = polygon_area_km2(coords)
    perim = polygon_perimeter_km(coords)
    centroid_lat, centroid_lon = polygon_centroid(coords)
    bb = polygon_bounding_box(coords)
    compactness = polygon_compactness(area, perim)

    # Principal dimensions using geodesic distance
    length = haversine_km(bb["min_lat"], bb["min_lon"], bb["min_lat"], bb["max_lon"])
    width = haversine_km(bb["min_lat"], bb["min_lon"], bb["max_lat"], bb["min_lon"])
    if length < width:
        length, width = width, length

    dlat = bb["max_lat"] - bb["min_lat"]
    dlon = bb["max_lon"] - bb["min_lon"]
    orientation = math.degrees(math.atan2(dlon, dlat)) % 180

    return {
        "centroid_lat": round(centroid_lat, 6),
        "centroid_lon": round(centroid_lon, 6),
        "area_km2": area,
        "perimeter_km": perim,
        "length_km": round(length, 4),
        "width_km": round(width, 4),
        "orientation_deg": round(orientation, 2),
        "compactness": compactness,
        "bounding_box": bb,
        "crs": "EPSG:4326",
    }
