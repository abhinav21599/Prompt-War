import math
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
from scipy import ndimage
try:
    from shapely.geometry import shape, mapping, Polygon, MultiPolygon
    from shapely.ops import unary_union
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False
    shape = None
    mapping = None
    Polygon = None
    MultiPolygon = None
    unary_union = None

from app.geometry.calculator import characterize_polygon

def mask_to_contours(binary_mask: np.ndarray, min_pixels: int = 15) -> List[np.ndarray]:
    """
    Extracts outer boundary pixel coordinates of connected components in a binary mask.
    """
    labeled, num_features = ndimage.label(binary_mask)
    if num_features == 0:
        return []

    contours = []
    for feat_id in range(1, num_features + 1):
        feat_mask = (labeled == feat_id)
        if np.sum(feat_mask) < min_pixels:
            continue

        # Find boundary pixels (pixels in mask with at least one 4-neighbor outside)
        eroded = ndimage.binary_erosion(feat_mask)
        boundary = feat_mask ^ eroded
        y_indices, x_indices = np.where(boundary)

        if len(x_indices) < 3:
            continue

        # Sort boundary coordinates cyclically around centroid to form a clean polygon loop
        cy, cx = np.mean(y_indices), np.mean(x_indices)
        angles = np.arctan2(y_indices - cy, x_indices - cx)
        sort_order = np.argsort(angles)

        pts = np.column_stack((x_indices[sort_order], y_indices[sort_order]))
        # Subsample to keep vertex count reasonable (e.g. 20-40 vertices)
        step = max(1, len(pts) // 30)
        sub_pts = pts[::step]
        if len(sub_pts) >= 3:
            # Close the ring
            closed_pts = np.vstack([sub_pts, sub_pts[0]])
            contours.append(closed_pts)

    return contours

def pixel_to_geo(x: float, y: float, transform: List[float]) -> Tuple[float, float]:
    """
    Converts (pixel_x, pixel_y) -> (longitude, latitude) using affine transform:
    [x_scale, x_shear, x_origin, y_shear, y_scale, y_origin]
    """
    a, b, c, d, e, f = transform
    lon = a * x + b * y + c
    lat = d * x + e * y + f
    return round(float(lon), 6), round(float(lat), 6)

def vectorize_mask(
    mask: np.ndarray,
    transform: Optional[List[float]] = None,
    bounds: Optional[Dict[str, float]] = None,
    crs: str = "EPSG:4326",
    min_pixels: int = 20,
    data_mode: str = "simulation",
) -> Dict[str, Any]:
    """
    Vectorizes a 2D binary segmentation mask into a georeferenced GeoJSON polygon
    and computes geodesic physical metrics (EPSG:6933 equal-area area, perimeter, compactness).
    """
    h, w = mask.shape

    # Derive affine transform from bounds if not provided directly
    if transform is None:
        if bounds and bounds.get("min_lon") is not None:
            min_lon, max_lon = bounds["min_lon"], bounds["max_lon"]
            min_lat, max_lat = bounds["min_lat"], bounds["max_lat"]
            if min_lon >= max_lon or min_lat >= max_lat:
                if data_mode == "real":
                    raise ValueError(f"Real-Data Mode: Invalid spatial bounds for vectorization: {bounds}")
            res_x = (max_lon - min_lon) / w
            res_y = -(max_lat - min_lat) / h
            transform = [res_x, 0.0, min_lon, 0.0, res_y, max_lat]
        else:
            if data_mode == "real":
                raise ValueError("Real-Data Mode: Georeferenced transform or spatial bounds required for mask vectorization.")
            # Default Arabian Sea offshore demo bounds
            min_lon, max_lon = 72.35, 73.05
            min_lat, max_lat = 15.15, 15.65
            res_x = (max_lon - min_lon) / w
            res_y = -(max_lat - min_lat) / h
            transform = [res_x, 0.0, min_lon, 0.0, res_y, max_lat]

    # Try rasterio.features.shapes if rasterio is available
    polygons = []
    try:
        import rasterio.features
        from affine import Affine
        aff = Affine(transform[0], transform[1], transform[2], transform[3], transform[4], transform[5])
        shapes_gen = rasterio.features.shapes(mask.astype(np.int16), mask=(mask > 0), transform=aff)
        for geom, val in shapes_gen:
            if val > 0:
                s = shape(geom)
                if s.is_valid and not s.is_empty and s.area > 0:
                    polygons.append(s)
    except Exception:
        pass

    if not polygons:
        # Classical contour boundary tracing fallback
        contours = mask_to_contours(mask, min_pixels=min_pixels)
        for ring in contours:
            geo_ring = [pixel_to_geo(pt[0], pt[1], transform) for pt in ring]
            if len(geo_ring) >= 4:
                if geo_ring[0] != geo_ring[-1]:
                    geo_ring.append(geo_ring[0])
                if HAS_SHAPELY and Polygon is not None:
                    p = Polygon(geo_ring)
                    if p.is_valid and not p.is_empty and p.area > 0:
                        polygons.append(p)
                else:
                    polygons.append({"type": "Polygon", "coordinates": [geo_ring]})

    if not polygons:
        # If mask is empty or no valid polygon, return clean zero-area fallback
        cx = transform[2] + (transform[0] * w) / 2.0
        cy = transform[5] + (transform[4] * h) / 2.0
        empty_poly = {
            "type": "Polygon",
            "coordinates": [[[cx, cy], [cx, cy], [cx, cy], [cx, cy]]],
        }
        return {
            "polygon_geojson": empty_poly,
            "centroid_geojson": {"type": "Point", "coordinates": [round(cx, 6), round(cy, 6)]},
            "area_km2": 0.0,
            "perimeter_km": 0.0,
            "length_km": 0.0,
            "width_km": 0.0,
            "orientation_deg": 0.0,
            "compactness": 0.0,
            "bounding_box": {"min_lat": cy, "max_lat": cy, "min_lon": cx, "max_lon": cx},
            "crs": crs,
            "detected_slick_count": 0,
        }

    # Extract largest polygon
    if HAS_SHAPELY and mapping is not None and hasattr(polygons[0], 'area'):
        polygons.sort(key=lambda p: p.area, reverse=True)
        main_poly = polygons[0]
        geojson_poly = mapping(main_poly)
    else:
        geojson_poly = polygons[0] if isinstance(polygons[0], dict) else {"type": "Polygon", "coordinates": []}

    # Ensure coordinates are standard GeoJSON polygon
    if geojson_poly.get("type") == "MultiPolygon":
        largest_coords = max(geojson_poly["coordinates"], key=lambda c: len(c[0]))
        geojson_poly = {"type": "Polygon", "coordinates": largest_coords}

    # Compute geodesic characteristics using equal-area projection EPSG:6933
    geom_metrics = characterize_polygon(geojson_poly)
    geom_metrics["polygon_geojson"] = geojson_poly
    geom_metrics["centroid_geojson"] = {
        "type": "Point",
        "coordinates": [geom_metrics["centroid_lon"], geom_metrics["centroid_lat"]],
    }
    geom_metrics["detected_slick_count"] = len(polygons)

    return geom_metrics
