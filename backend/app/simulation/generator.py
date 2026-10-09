import json
import math
import hashlib
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Tuple, Optional
import numpy as np
from app.config import settings
from app.simulation.synthetic_scene import generate_synthetic_sar_scene
from app.geometry.vectorizer import vectorize_mask

INCIDENT_ID = "OILTRACE-DEMO-001"
T0 = datetime(2024, 3, 15, 6, 0, 0, tzinfo=timezone.utc)
SPILL_LAT, SPILL_LON = 15.42, 72.68
ORIGIN_LAT, ORIGIN_LON = 15.21, 72.41
CURRENT_U, CURRENT_V = 0.18, 0.12
WIND_U10, WIND_V10 = 5.2, 3.8
CANDIDATE_MMSI = "419001234"

VESSEL_FLEET = [
    {
        "mmsi": "419001234",
        "imo": "9432156",
        "vessel_name": "MT GULF PHOENIX",
        "vessel_type": "tanker",
        "call_sign": "VARC",
        "flag": "IN",
        "length_m": 243.0,
        "beam_m": 42.0,
        "draught_m": 11.2,
        "gross_tonnage": 55200.0,
        "_candidate": True,
        "_initial_lat": 15.10,
        "_initial_lon": 72.25,
        "_final_lat": 15.89,
        "_final_lon": 73.10,
    },
    {
        "mmsi": "419002345",
        "imo": "9511234",
        "vessel_name": "MV SAGAR SAMRAT",
        "vessel_type": "cargo",
        "call_sign": "VSSG",
        "flag": "IN",
        "length_m": 189.0,
        "beam_m": 28.0,
        "draught_m": 9.4,
        "gross_tonnage": 22000.0,
        "_candidate": False,
        "_initial_lat": 15.80,
        "_initial_lon": 72.90,
        "_final_lat": 16.20,
        "_final_lon": 73.40,
    },
    {
        "mmsi": "419003456",
        "imo": "9622345",
        "vessel_name": "FV JALADHI",
        "vessel_type": "fishing",
        "call_sign": "VFJD",
        "flag": "IN",
        "length_m": 42.0,
        "beam_m": 8.5,
        "draught_m": 3.1,
        "gross_tonnage": 180.0,
        "_candidate": False,
        "_initial_lat": 14.90,
        "_initial_lon": 72.55,
        "_final_lat": 15.30,
        "_final_lon": 72.80,
    },
    {
        "mmsi": "419004567",
        "imo": "9733456",
        "vessel_name": "MV KONKAN ROSE",
        "vessel_type": "cargo",
        "call_sign": "VKRS",
        "flag": "IN",
        "length_m": 134.0,
        "beam_m": 22.0,
        "draught_m": 7.8,
        "gross_tonnage": 8500.0,
        "_candidate": False,
        "_initial_lat": 14.60,
        "_initial_lon": 72.20,
        "_final_lat": 15.10,
        "_final_lon": 72.60,
    },
    {
        "mmsi": "636015432",
        "imo": "9844567",
        "vessel_name": "MT SEA EMPRESS",
        "vessel_type": "tanker",
        "call_sign": "A8PX",
        "flag": "LR",
        "length_m": 274.0,
        "beam_m": 48.0,
        "draught_m": 14.1,
        "gross_tonnage": 81200.0,
        "_candidate": False,
        "_initial_lat": 16.40,
        "_initial_lon": 71.80,
        "_final_lat": 17.20,
        "_final_lon": 72.50,
    },
    {
        "mmsi": "477009876",
        "imo": "9955678",
        "vessel_name": "CMA CGM PADMA",
        "vessel_type": "cargo",
        "call_sign": "VRPD",
        "flag": "HK",
        "length_m": 299.0,
        "beam_m": 48.2,
        "draught_m": 14.0,
        "gross_tonnage": 94200.0,
        "_candidate": False,
        "_initial_lat": 14.20,
        "_initial_lon": 71.60,
        "_final_lat": 15.50,
        "_final_lon": 73.80,
    },
    {
        "mmsi": "419005678",
        "imo": "9066789",
        "vessel_name": "PSV SAMUDRA SEVA",
        "vessel_type": "service",
        "call_sign": "VSMS",
        "flag": "IN",
        "length_m": 78.0,
        "beam_m": 16.0,
        "draught_m": 4.6,
        "gross_tonnage": 2100.0,
        "_candidate": False,
        "_initial_lat": 15.60,
        "_initial_lon": 72.95,
        "_final_lat": 15.90,
        "_final_lon": 73.20,
    },
]

DEMO_SCENARIOS = {
    "OILTRACE-DEMO-001": {
        "incident_id": "OILTRACE-DEMO-001",
        "incident_name": "Arabian Sea Oil Spill - Goa Sector",
        "scene_id": "S1A_IW_GRDH_1SDV_20240315T060000_demo",
        "filename": "S1A_IW_GRDH_1SDV_20240315T060000_demo.tif",
        "satellite_name": "Sentinel-1A",
        "region_name": "Arabian Sea Off Goa",
        "acquisition_time": T0,
        "spill_lat": SPILL_LAT,
        "spill_lon": SPILL_LON,
        "origin_lat": ORIGIN_LAT,
        "origin_lon": ORIGIN_LON,
        "bounds": {"min_lon": 72.35, "min_lat": 15.15, "max_lon": 73.05, "max_lat": 15.65},
        "region_bounds": [[71.0, 14.0], [74.5, 14.0], [74.5, 17.5], [71.0, 17.5], [71.0, 14.0]],
        "current_u": CURRENT_U,
        "current_v": CURRENT_V,
        "wind_u10": WIND_U10,
        "wind_v10": WIND_V10,
        "candidate_mmsi": CANDIDATE_MMSI,
        "confidence": 0.885,
        "seed": 26143,
        "fleet": VESSEL_FLEET,
    },
    "OILTRACE-DEMO-002": {
        "incident_id": "OILTRACE-DEMO-002",
        "incident_name": "Gulf of Kutch Tanker Fairway Discharge",
        "scene_id": "S1A_IW_GRDH_1SDV_20240318T054500_kutch",
        "filename": "S1A_IW_GRDH_1SDV_20240318T054500_kutch.tif",
        "satellite_name": "Sentinel-1A",
        "region_name": "Gulf of Kutch Approaches",
        "acquisition_time": datetime(2024, 3, 18, 5, 45, 0, tzinfo=timezone.utc),
        "spill_lat": 22.45,
        "spill_lon": 69.30,
        "origin_lat": 22.32,
        "origin_lon": 69.12,
        "bounds": {"min_lon": 68.80, "min_lat": 22.10, "max_lon": 69.80, "max_lat": 22.80},
        "region_bounds": [[68.0, 21.5], [70.5, 21.5], [70.5, 23.5], [68.0, 23.5], [68.0, 21.5]],
        "current_u": 0.20,
        "current_v": 0.15,
        "wind_u10": 5.8,
        "wind_v10": 4.1,
        "candidate_mmsi": "470123456",
        "confidence": 0.918,
        "seed": 10924,
        "fleet": [
            {
                "mmsi": "470123456",
                "imo": "9523412",
                "vessel_name": "VLCC AL-MARWAH",
                "vessel_type": "tanker",
                "call_sign": "HZAM",
                "flag": "SA",
                "length_m": 333.0,
                "beam_m": 60.0,
                "draught_m": 21.5,
                "gross_tonnage": 160000.0,
                "_candidate": True,
                "_initial_lat": 22.15,
                "_initial_lon": 68.85,
                "_final_lat": 22.75,
                "_final_lon": 69.75,
            },
            {
                "mmsi": "419006789",
                "imo": "9612345",
                "vessel_name": "MV KUTCH PRIDE",
                "vessel_type": "cargo",
                "call_sign": "VKPR",
                "flag": "IN",
                "length_m": 175.0,
                "beam_m": 26.0,
                "draught_m": 8.5,
                "gross_tonnage": 18500.0,
                "_candidate": False,
                "_initial_lat": 22.50,
                "_initial_lon": 69.45,
                "_final_lat": 22.80,
                "_final_lon": 69.75,
            },
            {
                "mmsi": "419007890",
                "imo": "9723456",
                "vessel_name": "FV SAGAR SHAKTI",
                "vessel_type": "fishing",
                "call_sign": "VFSS",
                "flag": "IN",
                "length_m": 38.0,
                "beam_m": 8.0,
                "draught_m": 2.9,
                "gross_tonnage": 150.0,
                "_candidate": False,
                "_initial_lat": 22.25,
                "_initial_lon": 69.15,
                "_final_lat": 22.40,
                "_final_lon": 69.35,
            },
            {
                "mmsi": "419008901",
                "imo": "9834567",
                "vessel_name": "TUG KANDLA STAR",
                "vessel_type": "service",
                "call_sign": "VTKS",
                "flag": "IN",
                "length_m": 32.0,
                "beam_m": 11.0,
                "draught_m": 4.2,
                "gross_tonnage": 450.0,
                "_candidate": False,
                "_initial_lat": 22.35,
                "_initial_lon": 69.25,
                "_final_lat": 22.55,
                "_final_lon": 69.50,
            },
            {
                "mmsi": "636019876",
                "imo": "9812345",
                "vessel_name": "MT ARABIAN BREEZE",
                "vessel_type": "tanker",
                "call_sign": "ELAA",
                "flag": "LR",
                "length_m": 245.0,
                "beam_m": 42.0,
                "draught_m": 12.0,
                "gross_tonnage": 58000.0,
                "_candidate": False,
                "_initial_lat": 22.05,
                "_initial_lon": 68.80,
                "_final_lat": 22.70,
                "_final_lon": 69.70,
            },
        ],
    },
    "OILTRACE-DEMO-003": {
        "incident_id": "OILTRACE-DEMO-003",
        "incident_name": "Lakshadweep High Seas Passage Slick",
        "scene_id": "S1C_IW_GRDH_1SDV_20240322T061500_lakshadweep",
        "filename": "S1C_IW_GRDH_1SDV_20240322T061500_lakshadweep.tif",
        "satellite_name": "Sentinel-1C",
        "region_name": "Lakshadweep High Seas Corridors",
        "acquisition_time": datetime(2024, 3, 22, 6, 15, 0, tzinfo=timezone.utc),
        "spill_lat": 10.80,
        "spill_lon": 72.45,
        "origin_lat": 10.65,
        "origin_lon": 72.28,
        "bounds": {"min_lon": 71.80, "min_lat": 10.20, "max_lon": 73.10, "max_lat": 11.40},
        "region_bounds": [[71.0, 9.5], [74.0, 9.5], [74.0, 12.0], [71.0, 12.0], [71.0, 9.5]],
        "current_u": 0.15,
        "current_v": 0.10,
        "wind_u10": 4.8,
        "wind_v10": 3.2,
        "candidate_mmsi": "419009012",
        "confidence": 0.885,
        "seed": 77123,
        "fleet": [
            {
                "mmsi": "419009012",
                "imo": "9384567",
                "vessel_name": "COASTAL TANKER SURYA",
                "vessel_type": "tanker",
                "call_sign": "VSUR",
                "flag": "IN",
                "length_m": 145.0,
                "beam_m": 23.0,
                "draught_m": 7.2,
                "gross_tonnage": 9800.0,
                "_candidate": True,
                "_initial_lat": 10.45,
                "_initial_lon": 72.05,
                "_final_lat": 11.15,
                "_final_lon": 72.85,
            },
            {
                "mmsi": "538008123",
                "imo": "9485678",
                "vessel_name": "REEFER CARRIER PACIFIC",
                "vessel_type": "cargo",
                "call_sign": "V7PR",
                "flag": "MH",
                "length_m": 152.0,
                "beam_m": 24.0,
                "draught_m": 7.8,
                "gross_tonnage": 11200.0,
                "_candidate": False,
                "_initial_lat": 10.90,
                "_initial_lon": 72.55,
                "_final_lat": 11.35,
                "_final_lon": 72.95,
            },
            {
                "mmsi": "419010123",
                "imo": "9596789",
                "vessel_name": "FV LAKSHADWEEP QUEEN",
                "vessel_type": "fishing",
                "call_sign": "VFLQ",
                "flag": "IN",
                "length_m": 35.0,
                "beam_m": 7.5,
                "draught_m": 2.8,
                "gross_tonnage": 130.0,
                "_candidate": False,
                "_initial_lat": 10.60,
                "_initial_lon": 72.30,
                "_final_lat": 10.95,
                "_final_lon": 72.60,
            },
            {
                "mmsi": "419011234",
                "imo": "9607890",
                "vessel_name": "INS SUNAYNA",
                "vessel_type": "service",
                "call_sign": "VWSN",
                "flag": "IN",
                "length_m": 105.0,
                "beam_m": 13.0,
                "draught_m": 3.8,
                "gross_tonnage": 2200.0,
                "_candidate": False,
                "_initial_lat": 10.70,
                "_initial_lon": 72.35,
                "_final_lat": 11.00,
                "_final_lon": 72.65,
            },
            {
                "mmsi": "477015432",
                "imo": "9712345",
                "vessel_name": "CMA CGM MALABAR",
                "vessel_type": "cargo",
                "call_sign": "VRML",
                "flag": "HK",
                "length_m": 280.0,
                "beam_m": 44.0,
                "draught_m": 13.5,
                "gross_tonnage": 75000.0,
                "_candidate": False,
                "_initial_lat": 10.40,
                "_initial_lon": 71.95,
                "_final_lat": 11.25,
                "_final_lon": 72.90,
            },
        ],
    },
}

def get_rng(seed=None):
    return np.random.default_rng(seed if seed is not None else settings.oiltrace_demo_seed)

def _ais_track(vessel, rng, candidate, origin_lat=ORIGIN_LAT, origin_lon=ORIGIN_LON, t0=T0):
    obs = []
    start = t0 - timedelta(hours=20)
    n_steps = 144
    i_lat, i_lon = vessel["_initial_lat"], vessel["_initial_lon"]
    f_lat, f_lon = vessel["_final_lat"], vessel["_final_lon"]

    if candidate:
        # Candidate passes near reconstructed origin at step 48 (T0 - 12h = origin time)
        # Waypoints: start -> origin vicinity -> final destination
        waypoints = [
            (i_lat, i_lon, 0),
            (origin_lat + float(rng.uniform(-0.010, 0.010)), origin_lon + float(rng.uniform(-0.010, 0.010)), 48),
            (f_lat, f_lon, n_steps - 1)
        ]
        # AIS reporting gap during passage: steps 50 to 55 (50 min gap)
        gap_start, gap_end, slow_step = 50, 55, 47
    else:
        waypoints = [(i_lat, i_lon, 0), (f_lat, f_lon, n_steps - 1)]
        gap_start = gap_end = slow_step = None

    def interp(t):
        for i in range(len(waypoints) - 1):
            t0w, t1w = waypoints[i][2], waypoints[i + 1][2]
            if t0w <= t <= t1w:
                fr = (t - t0w) / max(t1w - t0w, 1)
                return waypoints[i][0] + fr * (waypoints[i + 1][0] - waypoints[i][0]), waypoints[i][1] + fr * (waypoints[i + 1][1] - waypoints[i][1])
        return waypoints[-1][0], waypoints[-1][1]

    for step in range(n_steps):
        if candidate and gap_start is not None and gap_start <= step < gap_end:
            continue
        ts = start + timedelta(minutes=step * 10)
        lat, lon = interp(step)
        lat += float(rng.normal(0, 0.0008))
        lon += float(rng.normal(0, 0.0008))
        sog = 12.5
        if step > 0:
            pl, po = interp(step - 1)
            d = math.sqrt(((lat - pl) * 111.32)**2 + ((lon - po) * 111.32 * math.cos(math.radians(lat)))**2)
            sog = d / (10 / 60) * 0.539957
        if candidate and slow_step and abs(step - slow_step) < 3:
            sog *= float(rng.uniform(0.2, 0.35))
        nl, no = interp(min(step + 1, n_steps - 1))
        cog = math.degrees(math.atan2(no - lon, nl - lat)) % 360
        obs_id = hashlib.md5(f"{vessel['mmsi']}-{ts.isoformat()}".encode()).hexdigest()
        obs.append({
            "id": obs_id,
            "mmsi": vessel["mmsi"],
            "timestamp": ts.isoformat(),
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "sog_knots": round(max(0, sog), 2),
            "cog_deg": round(cog, 1),
            "heading_deg": round(cog + float(rng.uniform(-3, 3)), 1),
            "nav_status": "under_way_engine",
            "data_mode": "simulation",
            "provenance": "synthetic",
            "source": "SYNTHETIC_AIS_GENERATOR_v1",
        })
    return obs

def _env_grid(center_lat: float = SPILL_LAT, center_lon: float = SPILL_LON, current_u: float = CURRENT_U, current_v: float = CURRENT_V, wind_u10: float = WIND_U10, wind_v10: float = WIND_V10, seed: Optional[int] = None):
    rng = get_rng(seed)
    # Expand deterministic simulation environmental grid to the full Arabian Sea domain
    # covering Lakshadweep (10-12 N), Goa (15-16 N), Mumbai (18-20 N), and Gulf of Kutch (22-24 N)
    lats = [round(x, 1) for x in np.arange(10.0, 24.5, 0.5)]
    lons = [round(x, 1) for x in np.arange(68.0, 77.0, 0.5)]
    points = []
    for la in lats:
        for lo in lons:
            # Deterministic hydrodynamic variation anchored to baseline
            u_base = current_u + 0.03 * (la - center_lat) - 0.015 * (lo - center_lon)
            v_base = current_v + 0.02 * (lo - center_lon) + 0.01 * (la - center_lat)
            w_u_base = wind_u10 + 0.15 * (la - center_lat) - 0.08 * (lo - center_lon)
            w_v_base = wind_v10 + 0.10 * (lo - center_lon) + 0.05 * (la - center_lat)
            points.append({
                "lat": la,
                "lon": lo,
                "current_u": round(float(u_base + float(rng.normal(0, 0.015))), 4),
                "current_v": round(float(v_base + float(rng.normal(0, 0.015))), 4),
                "wind_u": round(float(w_u_base + float(rng.normal(0, 0.015))), 4),
                "wind_v": round(float(w_v_base + float(rng.normal(0, 0.015))), 4),
            })
    return {
        "lats": lats,
        "lons": lons,
        "points": points,
        "crs": "EPSG:4326",
        "units": {"current": "m/s", "wind": "m/s"},
    }

def generate_demo_incident(incident_id: str = "OILTRACE-DEMO-001"):
    scen = DEMO_SCENARIOS.get(incident_id, DEMO_SCENARIOS["OILTRACE-DEMO-001"])
    rng = get_rng(scen["seed"])
    now = datetime.now(timezone.utc)
    t0 = scen["acquisition_time"]
    img_id = f"SAR-{incident_id}"

    # 1. Generate realistic synthetic SAR raster with scenario seed and bounds
    synth = generate_synthetic_sar_scene(
        width=256,
        height=256,
        seed=scen["seed"],
        bounds=scen["bounds"],
        scene_id=scen["scene_id"],
        satellite=scen["satellite_name"],
        acquisition_time=t0.isoformat(),
        region_name=scen["region_name"],
    )
    gt_mask = synth["ground_truth_mask"]
    synth_meta = synth["metadata"]

    # 2. Vectorize the actual mask into a true GeoJSON polygon and geodesic metrics
    geom = vectorize_mask(gt_mask, transform=synth_meta["transform"], bounds=synth_meta["bounds"])

    sat_image = {
        "id": img_id,
        "filename": scen["filename"],
        "file_size_bytes": 287443968,
        "format": "GeoTIFF",
        "crs": synth_meta["crs"],
        "resolution_m": synth_meta["resolution_m"],
        "acquisition_time": t0.isoformat(),
        "region_name": scen["region_name"],
        "bounds_geojson": json.dumps({
            "type": "Polygon",
            "coordinates": [scen["region_bounds"]]
        }),
        "channels": 2,
        "width_px": synth_meta["width"],
        "height_px": synth_meta["height"],
        "satellite_name": scen["satellite_name"],
        "data_mode": "simulation",
        "provenance": "synthetic",
        "source": "SYNTHETIC_SAR_GENERATOR",
        "created_at": now.isoformat(),
        "metadata_json": json.dumps({
            "orbit_direction": "descending",
            "polarization": synth_meta["polarization"],
            "seed": scen["seed"],
            "demo_note": f"Deterministic synthetic SAR scene for {scen['incident_name']}",
        }),
    }

    spill = {
        "id": incident_id,
        "satellite_image_id": img_id,
        "incident_name": scen["incident_name"],
        "status": "detected",
        "detected_class": "suspected_oil",
        "detection_confidence": scen["confidence"],
        "spill_polygon_geojson": json.dumps(geom["polygon_geojson"]),
        "centroid_geojson": json.dumps(geom["centroid_geojson"]),
        "bounding_box_geojson": json.dumps({
            "type": "Polygon",
            "coordinates": [[[geom["bounding_box"]["min_lon"], geom["bounding_box"]["min_lat"]],
                             [geom["bounding_box"]["max_lon"], geom["bounding_box"]["min_lat"]],
                             [geom["bounding_box"]["max_lon"], geom["bounding_box"]["max_lat"]],
                             [geom["bounding_box"]["min_lon"], geom["bounding_box"]["max_lat"]],
                             [geom["bounding_box"]["min_lon"], geom["bounding_box"]["min_lat"]]]]
        }),
        "area_km2": geom["area_km2"],
        "perimeter_km": geom["perimeter_km"],
        "length_km": geom["length_km"],
        "width_km": geom["width_km"],
        "orientation_deg": geom["orientation_deg"],
        "compactness": geom["compactness"],
        "detection_time": now.isoformat(),
        "satellite_acquisition_time": t0.isoformat(),
        "data_mode": "simulation",
        "provenance": "synthetic",
        "model_version": "1.0.0-demo",
        "preprocessing_version": "1.2.0",
        "model_threshold": 0.42,
        "region_name": scen["region_name"],
        "severity": "high",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }

    vessels = [{k: v[k] for k in v if not k.startswith("_")} for v in scen["fleet"]]
    for v in vessels:
        v.update({"data_mode": "simulation", "provenance": "synthetic", "created_at": now.isoformat()})

    all_ais = []
    for v in scen["fleet"]:
        all_ais.extend(_ais_track(v, rng, v.get("_candidate", False), origin_lat=scen["origin_lat"], origin_lon=scen["origin_lon"], t0=t0))

    tracks = []
    for v in scen["fleet"]:
        mmsi = v["mmsi"]
        obs = sorted([o for o in all_ais if o["mmsi"] == mmsi], key=lambda x: x["timestamp"])
        if len(obs) >= 2:
            coords = [[o["longitude"], o["latitude"]] for o in obs]
            tracks.append({
                "id": f"TRACK-{incident_id}-{mmsi}",
                "mmsi": mmsi,
                "spill_id": incident_id,
                "track_geojson": json.dumps({"type": "LineString", "coordinates": coords}),
                "start_time": obs[0]["timestamp"],
                "end_time": obs[-1]["timestamp"],
                "point_count": len(coords),
                "data_mode": "simulation",
                "provenance": "synthetic",
            })

    env_data = _env_grid(
        center_lat=scen["spill_lat"],
        center_lon=scen["spill_lon"],
        current_u=scen["current_u"],
        current_v=scen["current_v"],
        wind_u10=scen["wind_u10"],
        wind_v10=scen["wind_v10"],
        seed=scen["seed"]
    )
    env_fields = [
        {
            "id": f"ENV-CURRENT-{incident_id}",
            "spill_id": incident_id,
            "field_type": "current",
            "timestamp": t0.isoformat(),
            "valid_time_start": (t0 - timedelta(hours=24)).isoformat(),
            "valid_time_end": (t0 + timedelta(hours=24)).isoformat(),
            "source": "SYNTHETIC_OCEAN_CURRENT_v1",
            "source_version": "1.0",
            "resolution_deg": 0.083,
            "region_geojson": json.dumps({"type": "Polygon", "coordinates": [scen["region_bounds"]]}),
            "field_data_json": json.dumps({**env_data, "field": "current", "note": f"SYNTHETIC - deterministic simulation for {incident_id}."}),
            "data_mode": "simulation",
            "provenance": "synthetic",
            "created_at": now.isoformat(),
        },
        {
            "id": f"ENV-WIND-{incident_id}",
            "spill_id": incident_id,
            "field_type": "wind",
            "timestamp": t0.isoformat(),
            "valid_time_start": (t0 - timedelta(hours=24)).isoformat(),
            "valid_time_end": (t0 + timedelta(hours=24)).isoformat(),
            "source": "SYNTHETIC_ERA5_v1",
            "source_version": "1.0",
            "resolution_deg": 0.25,
            "region_geojson": json.dumps({"type": "Polygon", "coordinates": [scen["region_bounds"]]}),
            "field_data_json": json.dumps({**env_data, "field": "wind", "note": f"SYNTHETIC - deterministic simulation for {incident_id}."}),
            "data_mode": "simulation",
            "provenance": "synthetic",
            "created_at": now.isoformat(),
        },
    ]

    return {
        "incident_id": incident_id,
        "satellite_image": sat_image,
        "spill": spill,
        "vessels": vessels,
        "ais_observations": all_ais,
        "vessel_tracks": tracks,
        "environmental_fields": env_fields,
        "env_data": env_data,
        "metadata": {
            "seed": scen["seed"],
            "data_mode": "simulation",
            "spill_lat": geom["centroid_lat"],
            "spill_lon": geom["centroid_lon"],
            "t0": t0.isoformat(),
            "candidate_mmsi": scen["candidate_mmsi"],
        },
    }
