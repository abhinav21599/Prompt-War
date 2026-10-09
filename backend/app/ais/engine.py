import math
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Tuple, Optional
import numpy as np


EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = EARTH_RADIUS_KM
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * r * math.asin(math.sqrt(a))


def parse_dt(ts: str) -> datetime:
    ts = ts.replace("Z", "+00:00")
    return datetime.fromisoformat(ts)


def mean_track_bearing(observations: List[Dict]) -> Optional[float]:
    """Return a distance-weighted, date-line-safe mean bearing for an AIS track.

    Bearings are clockwise from north (0° north, 90° east). Longitude deltas
    are wrapped to the shortest arc, and east-west displacement is adjusted by
    cosine of mean latitude. Invalid points are ignored. None means there is
    insufficient or internally cancelling directional evidence.
    """
    positions = []
    for obs in observations:
        try:
            timestamp = parse_dt(obs["timestamp"])
            lat = float(obs["latitude"])
            lon = float(obs["longitude"])
        except (KeyError, TypeError, ValueError, OverflowError):
            continue

        if not isinstance(timestamp, datetime):
            continue
        if not (math.isfinite(lat) and math.isfinite(lon)):
            continue
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            continue
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        else:
            timestamp = timestamp.astimezone(timezone.utc)
        positions.append((timestamp, lat, lon))

    positions.sort(key=lambda item: item[0])
    if len(positions) < 2:
        return None

    sum_sin = 0.0
    sum_cos = 0.0
    total_weight = 0.0
    for (_, lat1, lon1), (_, lat2, lon2) in zip(positions, positions[1:]):
        # Wrap the delta to [-180, 180): a crossing at the date line is a short
        # segment, not a nearly global journey in the opposite direction.
        delta_lon_deg = (lon2 - lon1 + 180.0) % 360.0 - 180.0
        mean_lat_rad = math.radians((lat1 + lat2) / 2.0)
        north_rad = math.radians(lat2 - lat1)
        east_rad = math.radians(delta_lon_deg) * math.cos(mean_lat_rad)
        segment_weight = math.hypot(east_rad, north_rad)
        if segment_weight <= 1e-12:
            continue

        bearing_rad = math.atan2(east_rad, north_rad)
        sum_sin += segment_weight * math.sin(bearing_rad)
        sum_cos += segment_weight * math.cos(bearing_rad)
        total_weight += segment_weight

    if total_weight <= 1e-12:
        return None
    # An almost-zero resultant means opposing track directions cancel; a mean
    # direction would be arbitrary, so report it as indeterminate instead.
    if math.hypot(sum_sin, sum_cos) / total_weight <= 1e-6:
        return None
    return math.degrees(math.atan2(sum_sin, sum_cos)) % 360.0


def spatial_filter(
    observations: List[Dict],
    origin_lat: float,
    origin_lon: float,
    radius_km: float = 50.0,
) -> Tuple[List[Dict], Dict]:
    passed = []
    for obs in observations:
        d = haversine_km(obs["latitude"], obs["longitude"], origin_lat, origin_lon)
        obs["_dist_to_origin_km"] = round(d, 3)
        if d <= radius_km:
            passed.append(obs)
    return passed, {
        "input_count": len(observations),
        "output_count": len(passed),
        "removed_count": len(observations) - len(passed),
        "radius_km": radius_km,
        "origin_lat": origin_lat,
        "origin_lon": origin_lon,
    }


def temporal_filter(
    observations: List[Dict],
    origin_time: datetime,
    window_hours: float = 2.0,
) -> Tuple[List[Dict], Dict]:
    t_min = origin_time - timedelta(hours=window_hours)
    t_max = origin_time + timedelta(hours=window_hours)
    passed = []
    for obs in observations:
        ts = parse_dt(obs["timestamp"])
        if t_min <= ts <= t_max:
            passed.append(obs)
    return passed, {
        "input_count": len(observations),
        "output_count": len(passed),
        "removed_count": len(observations) - len(passed),
        "window_hours": window_hours,
        "t_min": t_min.isoformat(),
        "t_max": t_max.isoformat(),
    }


def _oil_transport_direction(
    current_u: float, current_v: float, wind_u: float, wind_v: float, alpha: float = 0.03
) -> Optional[float]:
    """Return effective drift bearing, or None when forcing is indeterminate."""
    try:
        eff_u = float(current_u) + float(alpha) * float(wind_u)
        eff_v = float(current_v) + float(alpha) * float(wind_v)
    except (TypeError, ValueError, OverflowError):
        return None
    if not (math.isfinite(eff_u) and math.isfinite(eff_v)):
        return None
    if math.hypot(eff_u, eff_v) <= 1e-9:
        return None
    return math.degrees(math.atan2(eff_u, eff_v)) % 360.0


def trajectory_filter(
    observations_by_vessel: Dict[str, List[Dict]],
    origin_lat: float, origin_lon: float,
    spill_lat: float, spill_lon: float,
    current_u: float = 0.18, current_v: float = 0.12,
    wind_u: float = 5.2, wind_v: float = 3.8,
    alpha: float = 0.03,
    max_angle_deg: float = 60.0,
) -> Tuple[Dict[str, List[Dict]], Dict]:
    oil_dir = _oil_transport_direction(current_u, current_v, wind_u, wind_v, alpha)
    passed = {}
    stats = {
        "input_count": 0,
        "output_count": 0,
        "removed_count": 0,
        "indeterminate_count": 0,
        "oil_transport_direction_deg": round(oil_dir, 2) if oil_dir is not None else None,
        "max_angle_deg": max_angle_deg,
    }

    for mmsi, obs_list in observations_by_vessel.items():
        stats["input_count"] += 1
        vessel_dir = mean_track_bearing(obs_list)

        # Missing/zero forcing or a directionless track is not negative evidence.
        # Keep this candidate for spatial, temporal and other evidence stages.
        if oil_dir is None or vessel_dir is None:
            passed[mmsi] = obs_list
            stats["output_count"] += 1
            stats["indeterminate_count"] += 1
            continue

        angle_diff = abs((vessel_dir - oil_dir + 180.0) % 360.0 - 180.0)
        if angle_diff <= max_angle_deg:
            passed[mmsi] = obs_list
            stats["output_count"] += 1
        else:
            stats["removed_count"] += 1

    return passed, stats


def extract_behaviour_features(
    observations: List[Dict],
    gap_threshold_min: int = 30,
    sog_slowdown_threshold: float = 2.0,
) -> Dict[str, Any]:
    if not observations:
        return {"ais_gap_detected": False, "slowdown_observed": False, "course_change_observed": False}

    sorted_obs = sorted(observations, key=lambda x: x["timestamp"])
    gaps = []
    sogs = [o["sog_knots"] for o in sorted_obs if o.get("sog_knots") is not None]
    courses = [o["cog_deg"] for o in sorted_obs if o.get("cog_deg") is not None]

    for i in range(1, len(sorted_obs)):
        t1 = parse_dt(sorted_obs[i-1]["timestamp"])
        t2 = parse_dt(sorted_obs[i]["timestamp"])
        gap_min = (t2 - t1).total_seconds() / 60
        if gap_min >= gap_threshold_min:
            gaps.append({"gap_start": sorted_obs[i-1]["timestamp"],
                          "gap_end": sorted_obs[i]["timestamp"],
                          "duration_min": round(gap_min, 1)})

    slowdown = False
    if len(sogs) > 4:
        min_sog = min(sogs)
        max_sog = max(sogs)
        if min_sog <= 4.5 and max_sog >= 8.0:
            slowdown = True
        elif any(sogs[i] < sogs[i-1] * 0.5 and sogs[i-1] >= 4.0 for i in range(1, len(sogs))):
            slowdown = True

    course_change = False
    if len(courses) > 4:
        diffs = [abs((courses[i+1] - courses[i] + 180) % 360 - 180) for i in range(len(courses)-1)]
        if any(d > 25 for d in diffs):
            course_change = True

    observations_text = []
    if gaps:
        max_gap = max(g["duration_min"] for g in gaps)
        observations_text.append(
            f"AIS reporting gap detected ({len(gaps)} gap(s), longest {max_gap:.0f} min). "
            "Coverage/equipment limitations may also explain this observation."
        )
    if slowdown:
        observations_text.append("SOG reduction observed near estimated origin window.")
    if course_change:
        observations_text.append("Significant course change detected during temporal window.")

    total_obs = len(sorted_obs)
    expected_obs = max(1, int((
        (parse_dt(sorted_obs[-1]["timestamp"]) - parse_dt(sorted_obs[0]["timestamp"])).total_seconds() / 60
    ) / 10 + 1))
    coverage_pct = min(100.0, (total_obs / expected_obs) * 100)

    return {
        "ais_gap_detected": bool(gaps),
        "ais_gap_duration_min": gaps[0]["duration_min"] if gaps else None,
        "gaps": gaps,
        "slowdown_observed": slowdown,
        "course_change_observed": course_change,
        "behaviour_observations": observations_text,
        "ais_coverage_pct": round(coverage_pct, 1),
        "total_observations": total_obs,
    }


def group_by_vessel(observations: List[Dict]) -> Dict[str, List[Dict]]:
    result: Dict[str, List[Dict]] = {}
    for obs in observations:
        mmsi = obs["mmsi"]
        if mmsi not in result:
            result[mmsi] = []
        result[mmsi].append(obs)
    for mmsi in result:
        result[mmsi].sort(key=lambda x: x["timestamp"])
    return result


def nearest_obs_to_origin(observations: List[Dict], origin_lat: float, origin_lon: float) -> Optional[Dict]:
    if not observations:
        return None
    return min(observations, key=lambda o: haversine_km(o["latitude"], o["longitude"], origin_lat, origin_lon))
