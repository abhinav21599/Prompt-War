import math
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional, Any, Union


def parse_iso_datetime(ts_val: Union[str, datetime]) -> datetime:
    """Parse string or datetime to timezone-aware UTC datetime."""
    if isinstance(ts_val, datetime):
        if ts_val.tzinfo is None:
            return ts_val.replace(tzinfo=timezone.utc)
        return ts_val.astimezone(timezone.utc)
    ts_str = str(ts_val).strip()
    if ts_str.endswith("Z"):
        ts_str = ts_str[:-1] + "+00:00"
    dt = datetime.fromisoformat(ts_str)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def interpolate_field_spatial(
    lat: float,
    lon: float,
    points: List[Dict[str, Any]],
    u_key: str,
    v_key: str,
    container_dict: Optional[Dict[str, Any]] = None,
) -> Tuple[float, float]:
    """
    Inverse-distance weighted (IDW) spatial interpolation of vector points at (lat, lon).
    Returns (u, v) in m/s.
    """
    if not points:
        return 0.0, 0.0

    search_points = points
    if len(points) > 100:
        spatial_index = None
        if container_dict is not None:
            spatial_index = container_dict.get("_spatial_index")

        if spatial_index is None:
            spatial_index = {}
            for p in points:
                cell = (int(p["lat"] * 5), int(p["lon"] * 5))
                if cell not in spatial_index:
                    spatial_index[cell] = []
                spatial_index[cell].append(p)
            if container_dict is not None:
                container_dict["_spatial_index"] = spatial_index

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
        if d < 1e-6:
            return pt[u_key], pt[v_key]
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


def validate_temporal_coverage(
    field_data: Dict[str, Any],
    start_time: datetime,
    end_time: datetime,
    field_name: str = "environmental",
) -> bool:
    """
    Validate that field_data has temporal coverage encompassing [min(start, end), max(start, end)].
    Raises ValueError if operational dataset lacks adequate temporal coverage.
    """
    if not field_data:
        raise ValueError(f"Operational {field_name} data is missing.")

    req_start = parse_iso_datetime(min(start_time, end_time))
    req_end = parse_iso_datetime(max(start_time, end_time))

    time_slices = field_data.get("time_slices")
    if time_slices and len(time_slices) > 0:
        parsed_times = [parse_iso_datetime(s["timestamp"]) for s in time_slices if "timestamp" in s]
        if not parsed_times:
            raise ValueError(f"Operational {field_name} dataset is missing valid temporal metadata.")
        cov_start = min(parsed_times)
        cov_end = max(parsed_times)
        if req_start < cov_start or req_end > cov_end:
            raise ValueError(
                f"Operational {field_name} data coverage [{cov_start.isoformat()}, {cov_end.isoformat()}] "
                f"is insufficient for requested interval [{req_start.isoformat()}, {req_end.isoformat()}]. "
                f"Temporal extrapolation is disallowed in real-data mode."
            )
        return True

    if "timestamp" in field_data:
        cov_time = parse_iso_datetime(field_data["timestamp"])
        if req_end != req_start or req_start != cov_time:
            raise ValueError(
                f"Operational {field_name} snapshot at {cov_time.isoformat()} does not provide temporal coverage for the requested interval [{req_start.isoformat()}, {req_end.isoformat()}]."
            )
        return True

    raise ValueError(f"Operational {field_name} dataset is missing temporal metadata.")


def interpolate_field(
    lat: float,
    lon: float,
    field_data: Optional[Dict[str, Any]],
    target_time: Optional[Union[datetime, str]] = None,
) -> Tuple[float, float]:
    """
    Spatio-temporal interpolation of vector fields (ocean current or wind).
    Uses Inverse-Distance Weighting (IDW) spatially and linear interpolation between time slices.
    Fails visibly with explicit domain error if data is missing, empty, or outside temporal coverage.
    """
    if not field_data:
        raise ValueError("Current data unavailable for this time/location.")

    field_type = field_data.get("field", "current")
    if field_type == "wind":
        u_key, v_key = "wind_u", "wind_v"
        default_err = "Wind data unavailable for this time/location."
    else:
        u_key, v_key = "current_u", "current_v"
        default_err = "Current data unavailable for this time/location."

    is_real = field_data.get("data_mode") == "real" or field_data.get("strict_temporal", False)

    time_slices = field_data.get("time_slices")
    if time_slices and len(time_slices) > 0 and target_time is not None:
        t_target = parse_iso_datetime(target_time)
        parsed_slices = []
        for s in time_slices:
            if "points" in s and s["points"]:
                s_time = parse_iso_datetime(s["timestamp"])
                parsed_slices.append((s_time, s))
        parsed_slices.sort(key=lambda x: x[0])

        if not parsed_slices:
            raise ValueError(default_err)

        cov_min = parsed_slices[0][0]
        cov_max = parsed_slices[-1][0]

        if t_target < cov_min or t_target > cov_max:
            if is_real:
                raise ValueError(
                    f"Requested timestamp {t_target.isoformat()} is outside available operational "
                    f"temporal coverage [{cov_min.isoformat()}, {cov_max.isoformat()}]. Extrapolation is disallowed."
                )
            if t_target < cov_min:
                target_slice = parsed_slices[0][1]
            else:
                target_slice = parsed_slices[-1][1]
            return interpolate_field_spatial(
                lat, lon, target_slice["points"], u_key, v_key, container_dict=target_slice
            )

        # Find bounding time slices for linear temporal interpolation
        for i in range(len(parsed_slices) - 1):
            t_a, s_a = parsed_slices[i]
            t_b, s_b = parsed_slices[i + 1]
            if t_a <= t_target <= t_b:
                total_span = (t_b - t_a).total_seconds()
                if total_span <= 0:
                    return interpolate_field_spatial(lat, lon, s_a["points"], u_key, v_key, container_dict=s_a)
                alpha = (t_target - t_a).total_seconds() / total_span
                ua, va = interpolate_field_spatial(lat, lon, s_a["points"], u_key, v_key, container_dict=s_a)
                ub, vb = interpolate_field_spatial(lat, lon, s_b["points"], u_key, v_key, container_dict=s_b)
                return (1.0 - alpha) * ua + alpha * ub, (1.0 - alpha) * va + alpha * vb

        # If at exact endpoint
        return interpolate_field_spatial(
            lat, lon, parsed_slices[-1][1]["points"], u_key, v_key, container_dict=parsed_slices[-1][1]
        )

    if target_time is not None and is_real:
        if "timestamp" in field_data:
            t_target = parse_iso_datetime(target_time)
            cov_time = parse_iso_datetime(field_data["timestamp"])
            if t_target != cov_time:
                raise ValueError(
                    f"Requested timestamp {t_target.isoformat()} does not match operational {field_type} snapshot at {cov_time.isoformat()}."
                )
        elif not time_slices:
            raise ValueError(f"Operational {field_type} dataset is missing temporal metadata.")

    # Standard spatial-only interpolation (single time slice or no target_time specified)
    points = field_data.get("points", [])
    if not points:
        raise ValueError(default_err)

    u_val, v_val = interpolate_field_spatial(lat, lon, points, u_key, v_key, container_dict=field_data)
    return u_val, v_val


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

