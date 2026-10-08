import math
from typing import Dict, List, Tuple, Optional, Any


def interpolate_field(
    lat: float, lon: float, field_data: Optional[Dict[str, Any]]
) -> Tuple[float, float]:
    """
    Inverse-distance weighted spatial interpolation of vector fields (ocean current or wind).
    Fails visibly with explicit domain error if data is missing or empty.
    """
    if not field_data:
        raise ValueError("Current data unavailable for this time/location.")
        
    points = field_data.get("points", [])
    if not points:
        field_type = field_data.get("field", "current")
        if field_type == "wind":
            raise ValueError("Wind data unavailable for this time/location.")
        else:
            raise ValueError("Current data unavailable for this time/location.")

    field_type = field_data.get("field", "current")
    if field_type == "wind":
        u_key, v_key = "wind_u", "wind_v"
    else:
        u_key, v_key = "current_u", "current_v"

    # Optimization for large grids (e.g. ERA5 or Copernicus Marine with >1000 points):
    # Use cached spatial grid buckets (0.5-deg resolution) for instant O(1) neighbor candidate lookup
    search_points = points
    if len(points) > 100:
        spatial_index = field_data.get("_spatial_index")
        if spatial_index is None:
            spatial_index = {}
            for p in points:
                cell = (int(p["lat"] * 5), int(p["lon"] * 5))
                if cell not in spatial_index:
                    spatial_index[cell] = []
                spatial_index[cell].append(p)
            field_data["_spatial_index"] = spatial_index

        cell = (int(lat * 5), int(lon * 5))
        local_pts = []
        for dlat in (-1, 0, 1):
            for dlon in (-1, 0, 1):
                neighbor = (cell[0] + dlat, cell[1] + dlon)
                pts = spatial_index.get(neighbor)
                if pts:
                    local_pts.extend(pts)
        if local_pts:
            search_points = local_pts
        else:
            local_pts = [p for p in points if abs(p["lat"] - lat) <= 1.0 and abs(p["lon"] - lon) <= 1.0]
            if local_pts:
                search_points = local_pts

    min_dist = float("inf")
    nearest_u, nearest_v = 0.0, 0.0
    for pt in search_points:
        d = math.sqrt((pt["lat"] - lat)**2 + (pt["lon"] - lon)**2)
        if d < min_dist:
            min_dist = d
            nearest_u = pt[u_key]
            nearest_v = pt[v_key]

    if min_dist < 0.5:
        return nearest_u, nearest_v

    total_w = 0.0
    sum_u, sum_v = 0.0, 0.0
    for pt in search_points:
        d = math.sqrt((pt["lat"] - lat)**2 + (pt["lon"] - lon)**2)
        if d < 1e-10:
            return pt[u_key], pt[v_key]
        w = 1.0 / (d**2)
        sum_u += w * pt[u_key]
        sum_v += w * pt[v_key]
        total_w += w
        
    if total_w == 0.0:
        return nearest_u, nearest_v
        
    return sum_u / total_w, sum_v / total_w


def get_field_summary(field_data: Dict[str, Any]) -> Dict[str, Any]:
    points = field_data.get("points", [])
    field_type = field_data.get("field", "current")
    if field_type == "wind":
        u_key, v_key = "wind_u", "wind_v"
    else:
        u_key, v_key = "current_u", "current_v"
    us = [p[u_key] for p in points if u_key in p]
    vs = [p[v_key] for p in points if v_key in p]
    if not us:
        return {}
    speeds = [math.sqrt(u**2 + v**2) for u, v in zip(us, vs)]
    return {
        "mean_speed": round(sum(speeds) / len(speeds), 3),
        "max_speed": round(max(speeds), 3),
        "mean_u": round(sum(us) / len(us), 3),
        "mean_v": round(sum(vs) / len(vs), 3),
        "point_count": len(points),
        "field": field_type,
    }


def load_real_wind_field(explicit_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Load real atmospheric wind field from Copernicus Climate Data Store (ERA5).
    Fails visibly if CDS dataset is unavailable.
    """
    from app.integrations.cds_service import cds_service
    return cds_service.get_real_wind_field(explicit_path=explicit_path)


def load_copernicus_current_field(explicit_path: Optional[str] = None, timestamp: Optional[str] = None) -> Dict[str, Any]:
    """
    Load real hydrodynamic surface current field from Copernicus Marine (cmems_mod_glo_phy_anfc_merged-uv_PT1H-i).
    Fails visibly if Copernicus Marine dataset is unavailable.
    """
    from app.integrations.copernicus_marine_service import copernicus_marine_service
    return copernicus_marine_service.get_real_current_field(explicit_path=explicit_path, timestamp=timestamp)

