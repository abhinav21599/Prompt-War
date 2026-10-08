import math
from typing import Dict, List, Any, Optional
import numpy as np

EARTH_RADIUS_KM = 6371.0

class UncertaintyEngine:
    """
    Ensemble-based uncertainty quantification engine.
    Derives spatial and temporal confidence bounds from Lagrangian particle dispersions.
    """
    def __init__(self):
        pass

    def calculate_hindcast_uncertainty(
        self,
        particles: List[Dict[str, Any]],
        env_quality: float = 0.85,
        detection_conf: float = 0.90,
    ) -> Dict[str, Any]:
        """
        Calculates spatial and temporal uncertainty from hindcast particle distributions.
        """
        if not particles:
            raise ValueError("Empty particle set for uncertainty calculation.")

        # Extract terminal particle positions
        final_lats = []
        final_lons = []
        for p in particles:
            traj = p.get("trajectory", [])
            if traj:
                last_step = traj[-1]
                final_lats.append(last_step["lat"])
                final_lons.append(last_step["lon"])

        if not final_lats:
            raise ValueError("Particle trajectories contain no coordinates.")

        c_lat = float(np.mean(final_lats))
        c_lon = float(np.mean(final_lons))
        std_lat = float(np.std(final_lats))
        std_lon = float(np.std(final_lons))
        
        # Spatial spread in kilometers (1 deg lat ~ 111.32 km, lon adjusted for cos(lat))
        lat_km = std_lat * 111.32
        lon_km = std_lon * 111.32 * math.cos(math.radians(c_lat))
        spatial_uncertainty_km = float(np.sqrt(lat_km**2 + lon_km**2))
        
        # Temporal uncertainty: Base 1.5h expanded if environmental quality is low
        temporal_uncertainty_h = round(1.5 * (1.0 + (1.0 - env_quality)), 2)
        
        # Overall confidence combining detection confidence and environmental data quality
        confidence_pct = round(min(1.0, detection_conf * env_quality * (1.0 / (1.0 + spatial_uncertainty_km / 100.0))) * 100, 1)

        return {
            "origin_lat": round(c_lat, 6),
            "origin_lon": round(c_lon, 6),
            "spatial_uncertainty_km": round(max(spatial_uncertainty_km, 0.5), 3),
            "temporal_uncertainty_h": temporal_uncertainty_h,
            "confidence_pct": confidence_pct,
            "particle_count": len(particles),
            "method": "ensemble_spread_rk4",
            "data_mode": "simulation",
            "provenance": "synthetic",
        }

    def calculate_forecast_uncertainty(
        self,
        horizon_particles: Dict[int, List[Dict[str, float]]],
        detection_conf: float = 0.90,
    ) -> Dict[str, Any]:
        """
        Calculates forecast uncertainty envelopes across distinct time horizons (+6h, +12h, +24h, +48h).
        """
        stats = {}
        for h, positions in horizon_particles.items():
            if not positions:
                continue
            lats = [p["lat"] for p in positions]
            lons = [p["lon"] for p in positions]
            c_lat = float(np.mean(lats))
            c_lon = float(np.mean(lons))
            
            lat_km = float(np.std(lats)) * 111.32
            lon_km = float(np.std(lons)) * 111.32 * math.cos(math.radians(c_lat))
            spread_km = float(np.sqrt(lat_km**2 + lon_km**2))
            
            conf = round(max(10.0, detection_conf * 100.0 - (h * 0.8)), 1)
            stats[f"+{h}h"] = {
                "centroid_lat": round(c_lat, 6),
                "centroid_lon": round(c_lon, 6),
                "spread_km": round(max(spread_km, 0.5), 3),
                "particle_count": len(positions),
                "confidence_pct": conf,
            }

        return {
            "horizons": stats,
            "method": "ensemble_variance_forecast",
            "data_mode": "simulation",
            "provenance": "synthetic",
        }
