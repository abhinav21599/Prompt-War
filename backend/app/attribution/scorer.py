import math
from typing import Dict, List, Any, Optional
from app.config import settings

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = EARTH_RADIUS_KM
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2)**2
    return 2 * r * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def normalize_proximity(distance_km: float, max_radius_km: float = 50.0) -> float:
    if distance_km <= 0.0:
        return 1.0
    if distance_km >= max_radius_km:
        return 0.0
    return max(0.0, min(1.0, 1.0 - (distance_km / max_radius_km)))


def normalize_temporal(time_delta_h: float, window_h: float = 4.0) -> float:
    dt = abs(time_delta_h)
    if dt <= 0.0:
        return 1.0
    if dt >= window_h:
        return 0.0
    return max(0.0, min(1.0, 1.0 - (dt / window_h)))


def normalize_trajectory(overlap_score: float) -> float:
    return max(0.0, min(1.0, overlap_score))


def normalize_heading(compat_score: float) -> float:
    return max(0.0, min(1.0, compat_score))


def normalize_continuity(coverage_pct: float, gap_detected: bool, gap_duration_min: Optional[float]) -> float:
    base = max(0.0, min(1.0, coverage_pct / 100.0))
    if gap_detected and gap_duration_min:
        penalty = min(0.3, gap_duration_min / 300.0)
        base = max(0.0, base - penalty)
    return max(0.0, min(1.0, base))


def compute_trajectory_score(
    observations: List[Dict],
    origin_lat: float,
    origin_lon: float,
    spill_lat: float,
    spill_lon: float,
) -> float:
    if len(observations) < 2:
        return 0.0
    origin_dist = min(
        haversine_km(o["latitude"], o["longitude"], origin_lat, origin_lon)
        for o in observations
    )
    max_passage_dist = 25.0
    score = max(0.0, min(1.0, 1.0 - origin_dist / max_passage_dist))
    return round(score, 4)


def compute_heading_score(
    observations: List[Dict],
    current_u: float, current_v: float,
    wind_u: float, wind_v: float,
    alpha: float = 0.03,
) -> float:
    if len(observations) < 2:
        return 0.0
    eff_u = current_u + alpha * wind_u
    eff_v = current_v + alpha * wind_v
    oil_dir = math.degrees(math.atan2(eff_u, eff_v)) % 360

    ship_dirs = []
    sorted_obs = sorted(observations, key=lambda x: x["timestamp"])
    for i in range(len(sorted_obs) - 1):
        dlat = sorted_obs[i+1]["latitude"] - sorted_obs[i]["latitude"]
        dlon = sorted_obs[i+1]["longitude"] - sorted_obs[i]["longitude"]
        if abs(dlat) + abs(dlon) > 1e-6:
            d = math.degrees(math.atan2(dlon, dlat)) % 360
            ship_dirs.append(d)

    if not ship_dirs:
        return 0.5
    ship_dir_mean = sum(ship_dirs) / len(ship_dirs)
    angle_diff = abs((ship_dir_mean - oil_dir + 180) % 360 - 180)
    return max(0.0, min(1.0, 1.0 - angle_diff / 180.0))


def score_vessel(
    mmsi: str,
    observations: List[Dict],
    origin_lat: float,
    origin_lon: float,
    origin_time_str: str,
    spill_lat: float,
    spill_lon: float,
    current_u: float = 0.18,
    current_v: float = 0.12,
    wind_u: float = 5.2,
    wind_v: float = 3.8,
    alpha: float = 0.03,
    spatial_radius_km: Optional[float] = None,
    temporal_window_h: Optional[float] = None,
    weights: Optional[Dict[str, float]] = None,
    behaviour_features: Optional[Dict] = None,
    satellite_confidence: float = 0.90,
    environmental_quality: float = 0.90,
    origin_time_certainty: float = 0.85,
) -> Dict[str, Any]:
    """
    Computes explainable evidence score, data confidence, and final ranking score for a vessel.
    Uses configurable weights from settings.
    """
    from app.ais.engine import nearest_obs_to_origin, parse_dt

    configured_weights = settings.attribution_weights
    w = weights if weights is not None else configured_weights
    
    radius_km = spatial_radius_km if spatial_radius_km is not None else settings.default_ais_radius_km
    window_h = temporal_window_h if temporal_window_h is not None else settings.default_ais_temporal_window_hours

    nearest = nearest_obs_to_origin(observations, origin_lat, origin_lon)
    if nearest is None:
        return {
            "mmsi": mmsi,
            "evidence_score": 0.0,
            "data_confidence": 0.0,
            "final_score": 0.0,
            "factors": [],
            "data_mode": "simulation",
            "provenance": "synthetic",
        }

    distance_km = haversine_km(nearest["latitude"], nearest["longitude"], origin_lat, origin_lon)
    origin_time = parse_dt(origin_time_str)
    obs_time = parse_dt(nearest["timestamp"])
    time_delta_h = (obs_time - origin_time).total_seconds() / 3600.0

    traj_score = compute_trajectory_score(observations, origin_lat, origin_lon, spill_lat, spill_lon)
    heading_score = compute_heading_score(observations, current_u, current_v, wind_u, wind_v, alpha)

    bf = behaviour_features or {}
    coverage_pct = bf.get("ais_coverage_pct", 80.0)
    gap_detected = bf.get("ais_gap_detected", False)
    gap_dur = bf.get("ais_gap_duration_min", None)

    norm_prox = normalize_proximity(distance_km, radius_km)
    norm_temp = normalize_temporal(time_delta_h, window_h)
    norm_traj = normalize_trajectory(traj_score)
    norm_head = normalize_heading(heading_score)
    norm_cont = normalize_continuity(coverage_pct, gap_detected, gap_dur)

    # 1. Evidence Score = weighted sum of normalized components [0, 1]
    evidence_score = (
        w.get("proximity", 0.35) * norm_prox +
        w.get("temporal", 0.25) * norm_temp +
        w.get("trajectory", 0.20) * norm_traj +
        w.get("heading", 0.10) * norm_head +
        w.get("continuity", 0.10) * norm_cont
    )
    evidence_score = max(0.0, min(1.0, evidence_score))

    # 2. Data Confidence = satellite_conf * env_quality * origin_time_certainty * ais_coverage_fraction
    ais_fraction = max(0.0, min(1.0, coverage_pct / 100.0))
    if gap_detected:
        ais_fraction *= 0.85
    data_confidence = satellite_confidence * environmental_quality * origin_time_certainty * ais_fraction
    data_confidence = round(max(0.0, min(1.0, data_confidence)), 4)

    # 3. Final Score for Ranking = Evidence Score * Data Confidence
    final_score = round(evidence_score * data_confidence, 4)

    factors = [
        {
            "factor": "spatial_proximity",
            "label": "Distance proximity",
            "raw_value": round(distance_km, 3),
            "raw_unit": "km",
            "normalized": round(norm_prox, 4),
            "weight": w.get("proximity", 0.35),
            "contribution": round(w.get("proximity", 0.35) * norm_prox, 4),
        },
        {
            "factor": "temporal_alignment",
            "label": "Temporal alignment",
            "raw_value": round(abs(time_delta_h), 3),
            "raw_unit": "h",
            "normalized": round(norm_temp, 4),
            "weight": w.get("temporal", 0.25),
            "contribution": round(w.get("temporal", 0.25) * norm_temp, 4),
        },
        {
            "factor": "track_compatibility",
            "label": "Track compatibility",
            "raw_value": round(traj_score, 4),
            "raw_unit": "score",
            "normalized": round(norm_traj, 4),
            "weight": w.get("trajectory", 0.20),
            "contribution": round(w.get("trajectory", 0.20) * norm_traj, 4),
        },
        {
            "factor": "heading_compatibility",
            "label": "Heading compatibility",
            "raw_value": round(heading_score, 4),
            "raw_unit": "score",
            "normalized": round(norm_head, 4),
            "weight": w.get("heading", 0.10),
            "contribution": round(w.get("heading", 0.10) * norm_head, 4),
        },
        {
            "factor": "ais_continuity",
            "label": "AIS continuity",
            "raw_value": round(coverage_pct, 1),
            "raw_unit": "%",
            "normalized": round(norm_cont, 4),
            "weight": w.get("continuity", 0.10),
            "contribution": round(w.get("continuity", 0.10) * norm_cont, 4),
        },
    ]

    explanation = generate_attribution_explanation(
        mmsi=mmsi,
        distance_km=distance_km,
        time_delta_h=time_delta_h,
        heading_score=heading_score,
        traj_score=traj_score,
        evidence_score=evidence_score,
        data_confidence=data_confidence,
        final_score=final_score,
        gap_detected=gap_detected,
        gap_duration_min=gap_dur,
        slowdown=bf.get("slowdown_observed", False),
    )

    return {
        "mmsi": mmsi,
        "distance_km": round(distance_km, 3),
        "time_delta_h": round(time_delta_h, 3),
        "track_overlap_score": round(traj_score, 4),
        "heading_compat_score": round(heading_score, 4),
        "ais_continuity_score": round(norm_cont, 4),
        "norm_proximity": round(norm_prox, 4),
        "norm_temporal": round(norm_temp, 4),
        "norm_trajectory": round(norm_traj, 4),
        "norm_heading": round(norm_head, 4),
        "norm_continuity": round(norm_cont, 4),
        "evidence_score": round(evidence_score, 4),
        "data_confidence": data_confidence,
        "final_score": final_score,
        "factors": factors,
        "explanation": explanation,
        "behaviour_observations": bf.get("behaviour_observations", []),
        "ais_gap_detected": gap_detected,
        "ais_gap_duration_min": gap_dur,
        "slowdown_observed": bf.get("slowdown_observed", False),
        "course_change_observed": bf.get("course_change_observed", False),
        "ais_coverage_pct": coverage_pct,
        "weights_used": w,
        "data_mode": "simulation",
        "provenance": "synthetic",
    }


def generate_attribution_explanation(
    mmsi: str,
    distance_km: float,
    time_delta_h: float,
    heading_score: float,
    traj_score: float,
    evidence_score: float,
    data_confidence: float,
    final_score: float,
    gap_detected: bool,
    gap_duration_min: Optional[float],
    slowdown: bool,
    rank: Optional[int] = None,
    vessel_name: Optional[str] = None,
) -> str:
    """
    Generates a scientifically honest natural language investigative explanation
    derived exclusively from actual computed feature values.
    """
    name_str = f"{vessel_name} (MMSI {mmsi})" if vessel_name else f"Candidate vessel MMSI {mmsi}"
    rank_str = f"ranked #{rank}" if rank else "evaluated"

    parts = [
        f"{name_str} is {rank_str} with an overall attribution score of {final_score:.2f} "
        f"(evidence score: {evidence_score:.2f}, data confidence: {data_confidence:.2f})."
    ]

    # Proximity & Timing
    if distance_km <= 5.0:
        parts.append(f"Historical AIS indicates the vessel passed within {distance_km:.1f} km of the reconstructed origin centroid.")
    else:
        parts.append(f"Historical AIS indicates closest point of approach was {distance_km:.1f} km from the estimated origin.")

    abs_dt = abs(time_delta_h)
    if abs_dt <= 1.0:
        parts.append(f"Temporal passage closely aligned with estimated release window (delta: {abs_dt:.1f} h).")
    else:
        parts.append(f"Temporal passage occurred {abs_dt:.1f} hours from estimated spill release time.")

    # Drift & Heading
    if heading_score >= 0.70:
        parts.append("Observed course heading is highly compatible with modeled ocean current and wind drift vectors.")
    elif heading_score < 0.40:
        parts.append("Observed course heading diverges significantly from modeled hydrodynamic transport.")

    # Anomalies
    if gap_detected and gap_duration_min:
        parts.append(f"An AIS reporting gap of {gap_duration_min:.0f} minutes was detected during passage, reducing continuity confidence.")

    if slowdown:
        parts.append("A notable speed reduction (SOG drop) was recorded near the origin vicinity.")

    parts.append("Observations indicate candidate status warranting maritime authority verification.")
    return " ".join(parts)


def rank_vessels(vessel_scores: List[Dict]) -> List[Dict]:
    sorted_scores = sorted(vessel_scores, key=lambda x: x["final_score"], reverse=True)
    for i, v in enumerate(sorted_scores):
        v["rank"] = i + 1
        # Re-generate explanation with rank
        v["explanation"] = generate_attribution_explanation(
            mmsi=v["mmsi"],
            distance_km=v.get("distance_km", 0.0),
            time_delta_h=v.get("time_delta_h", 0.0),
            heading_score=v.get("heading_compat_score", 0.5),
            traj_score=v.get("track_overlap_score", 0.5),
            evidence_score=v.get("evidence_score", 0.0),
            data_confidence=v.get("data_confidence", 0.0),
            final_score=v.get("final_score", 0.0),
            gap_detected=v.get("ais_gap_detected", False),
            gap_duration_min=v.get("ais_gap_duration_min"),
            slowdown=v.get("slowdown_observed", False),
            rank=i + 1,
            vessel_name=v.get("vessel_name"),
        )
    return sorted_scores
