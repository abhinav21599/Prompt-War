from typing import Dict, List, Any, Optional
from datetime import datetime, timezone, timedelta

class DigitalTwinEngine:
    """
    Read-only digital twin visualization engine.
    Synchronizes spatial states across hindcast, observation, and forecast time horizons
    without re-triggering simulation or computation.
    """
    def __init__(self):
        pass

    def get_state_at_time(
        self,
        incident_id: str,
        time_offset_hours: float,
        spill_data: Dict[str, Any],
        hindcast_data: Optional[Dict[str, Any]] = None,
        forecast_data: Optional[Dict[str, Any]] = None,
        ais_data: Optional[List[Dict[str, Any]]] = None,
        env_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Retrieves the exact spatial and temporal snapshot at (T0 + time_offset_hours).
        """
        acq_time_str = spill_data.get("satellite_acquisition_time", "2024-03-15T06:00:00+00:00")
        t0 = datetime.fromisoformat(acq_time_str.replace("Z", "+00:00"))
        current_time = t0 + timedelta(hours=time_offset_hours)

        # Categorize snapshot state
        if time_offset_hours < -0.1:
            state_classification = "Reconstructed"
            layer_source = "hindcast_rk4"
        elif time_offset_hours > 0.1:
            state_classification = "Predicted"
            layer_source = "forecast_rk4"
        else:
            state_classification = "Observed"
            layer_source = "sar_observation"

        # Particles at this specific timestep
        particles_at_t = []
        source_trajectories = []
        if time_offset_hours <= 0 and hindcast_data:
            source_trajectories = hindcast_data.get("particles", [])
        elif time_offset_hours > 0 and forecast_data:
            source_trajectories = forecast_data.get("particles", [])

        # Find closest particle positions
        target_ts_iso = current_time.isoformat()
        for p in source_trajectories:
            traj = p.get("trajectory", [])
            if not traj:
                continue
            # Pick step closest to time_offset_hours
            closest_point = min(
                traj,
                key=lambda pt: abs(
                    (datetime.fromisoformat(pt["timestamp"].replace("Z", "+00:00")) - current_time).total_seconds()
                ),
            )
            particles_at_t.append({
                "particle_id": p.get("particle_id", 0),
                "lat": closest_point["lat"],
                "lon": closest_point["lon"],
                "timestamp": closest_point["timestamp"],
                "provenance_layer": state_classification,
            })

        # AIS vessels at or near this time
        vessel_positions = []
        if ais_data:
            # Group by vessel and find closest observation within 1 hour
            by_mmsi = {}
            for obs in ais_data:
                m = obs["mmsi"]
                if m not in by_mmsi:
                    by_mmsi[m] = []
                by_mmsi[m].append(obs)

            for mmsi, obs_list in by_mmsi.items():
                closest_obs = min(
                    obs_list,
                    key=lambda o: abs(
                        (datetime.fromisoformat(o["timestamp"].replace("Z", "+00:00")) - current_time).total_seconds()
                    ),
                )
                time_diff_min = abs(
                    (datetime.fromisoformat(closest_obs["timestamp"].replace("Z", "+00:00")) - current_time).total_seconds() / 60
                )
                if time_diff_min <= 60:
                    vessel_positions.append({
                        "mmsi": mmsi,
                        "lat": closest_obs["latitude"],
                        "lon": closest_obs["longitude"],
                        "sog_knots": closest_obs.get("sog_knots", 0.0),
                        "cog_deg": closest_obs.get("cog_deg", 0.0),
                        "nav_status": closest_obs.get("nav_status", "under_way"),
                        "timestamp": closest_obs["timestamp"],
                        "data_mode": "simulation",
                        "provenance": "synthetic",
                    })

        return {
            "incident_id": incident_id,
            "target_time": target_ts_iso,
            "time_offset_hours": round(time_offset_hours, 2),
            "state_classification": state_classification,
            "layer_source": layer_source,
            "spill_geometry": spill_data.get("spill_polygon_geojson"),
            "centroid": spill_data.get("centroid_geojson"),
            "active_particles": particles_at_t,
            "particle_count": len(particles_at_t),
            "vessels": vessel_positions,
            "environmental_vectors": env_data.get("points", []) if env_data else [],
            "data_mode": "simulation",
            "provenance": "synthetic",
        }
