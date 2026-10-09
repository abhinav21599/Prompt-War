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

    # 3. Deterministic preview hindcast & forecast particle trajectories
    hcast_rec = _generate_preview_hindcast(incident_id, scen, geom, t0, rng, now)
    fcast_rec = _generate_preview_forecast(incident_id, scen, geom, t0, rng, now)
    particle_trajectories = [hcast_rec, fcast_rec]

    # 4. Deterministic candidate vessel attribution ranking
    attributions = _generate_preview_attributions(incident_id, scen, geom, t0, now, hcast_rec)

    # 5. Deterministic analysis run & audit logs
    analysis_run, audit_logs = _generate_preview_analysis_run(incident_id, scen, geom, t0, now, hcast_rec, attributions)

    # 6. Incident alert
    alert = _generate_preview_alert(incident_id, scen, geom, t0, now)

    # 7. Comprehensive 15-section investigation report
    investigation_report = _generate_preview_report(incident_id, scen, geom, t0, now, hcast_rec, fcast_rec, attributions, sat_image)

    return {
        "incident_id": incident_id,
        "satellite_image": sat_image,
        "spill": spill,
        "vessels": vessels,
        "ais_observations": all_ais,
        "vessel_tracks": tracks,
        "environmental_fields": env_fields,
        "env_data": env_data,
        "particle_trajectories": particle_trajectories,
        "attributions": attributions,
        "analysis_run": analysis_run,
        "audit_logs": audit_logs,
        "alert": alert,
        "investigation_report": investigation_report,
        "metadata": {
            "seed": scen["seed"],
            "data_mode": "simulation",
            "spill_lat": geom["centroid_lat"],
            "spill_lon": geom["centroid_lon"],
            "t0": t0.isoformat(),
            "candidate_mmsi": scen["candidate_mmsi"],
        },
    }


def _generate_preview_hindcast(incident_id: str, scen: Dict, geom: Dict, t0: datetime, rng, now: datetime) -> Dict[str, Any]:
    n_particles = 50
    n_steps = 24  # 12 hours with 30 min dt
    dt_m = 30
    c_lat = geom["centroid_lat"]
    c_lon = geom["centroid_lon"]
    orig_lat = scen["origin_lat"]
    orig_lon = scen["origin_lon"]

    particles_history = []
    for p_idx in range(n_particles):
        p_lat = c_lat + float(rng.normal(0, 0.002))
        p_lon = c_lon + float(rng.normal(0, 0.002))
        traj = [{
            "step": 0,
            "lat": round(p_lat, 6),
            "lon": round(p_lon, 6),
            "timestamp": t0.isoformat(),
            "mode": "reconstructed"
        }]
        for step in range(1, n_steps + 1):
            frac = step / n_steps
            target_lat = c_lat + frac * (orig_lat - c_lat)
            target_lon = c_lon + frac * (orig_lon - c_lon)
            sigma = 0.003 * math.sqrt(step)
            step_lat = target_lat + float(rng.normal(0, sigma))
            step_lon = target_lon + float(rng.normal(0, sigma))
            ts = t0 - timedelta(minutes=step * dt_m)
            traj.append({
                "step": -step,
                "lat": round(step_lat, 6),
                "lon": round(step_lon, 6),
                "timestamp": ts.isoformat(),
                "mode": "reconstructed"
            })
        particles_history.append({"particle_id": p_idx, "trajectory": traj})

    n_sides = 16
    angles = [i * 2 * math.pi / n_sides for i in range(n_sides)]
    sigma_deg = 0.075
    ellipse_coords = [
        [round(orig_lon + sigma_deg * math.cos(a), 6), round(orig_lat + (sigma_deg * 0.7) * math.sin(a), 6)]
        for a in angles
    ]
    ellipse_coords.append(ellipse_coords[0])

    origin_time = t0 - timedelta(hours=12)
    return {
        "id": f"TRAJ-HINDCAST-{incident_id}",
        "spill_id": incident_id,
        "run_type": "hindcast",
        "windage_coefficient": 0.035,
        "particle_count": n_particles,
        "integration_timestep_min": dt_m,
        "integration_hours": 12.0,
        "integration_method": "Lagrangian RK4 Ensemble (Simulation Preview)",
        "particles_json": json.dumps(particles_history),
        "origin_region_geojson": json.dumps({"type": "Polygon", "coordinates": [ellipse_coords]}),
        "origin_centroid_geojson": json.dumps({"type": "Point", "coordinates": [round(orig_lon, 6), round(orig_lat, 6)]}),
        "origin_time_estimate": origin_time.isoformat(),
        "origin_time_uncertainty_h": 1.5,
        "spatial_uncertainty_km": 3.2,
        "environmental_source": "SYNTHETIC_OCEAN_CURRENT_v1 + SYNTHETIC_ERA5_v1",
        "data_mode": "simulation",
        "provenance": "synthetic",
        "created_at": now.isoformat(),
        "_particles": particles_history,
    }


def _generate_preview_forecast(incident_id: str, scen: Dict, geom: Dict, t0: datetime, rng, now: datetime) -> Dict[str, Any]:
    n_particles = 50
    n_steps = 24  # 24 hours with 60 min dt
    dt_m = 60
    c_lat = geom["centroid_lat"]
    c_lon = geom["centroid_lon"]

    u_eff = scen["current_u"] + 0.035 * scen["wind_u10"]
    v_eff = scen["current_v"] + 0.035 * scen["wind_v10"]
    dlat_per_h = (v_eff * 3600.0) / 111320.0
    dlon_per_h = (u_eff * 3600.0) / (111320.0 * math.cos(math.radians(c_lat)))

    particles_history = []
    for p_idx in range(n_particles):
        p_lat = c_lat + float(rng.normal(0, 0.002))
        p_lon = c_lon + float(rng.normal(0, 0.002))
        traj = [{
            "step": 0,
            "lat": round(p_lat, 6),
            "lon": round(p_lon, 6),
            "timestamp": t0.isoformat(),
            "mode": "predicted"
        }]
        for step in range(1, n_steps + 1):
            sigma = 0.004 * math.sqrt(step)
            step_lat = p_lat + step * dlat_per_h + float(rng.normal(0, sigma))
            step_lon = p_lon + step * dlon_per_h + float(rng.normal(0, sigma))
            ts = t0 + timedelta(minutes=step * dt_m)
            traj.append({
                "step": step,
                "lat": round(step_lat, 6),
                "lon": round(step_lon, 6),
                "timestamp": ts.isoformat(),
                "mode": "predicted"
            })
        particles_history.append({"particle_id": p_idx, "trajectory": traj})

    return {
        "id": f"TRAJ-FORECAST-{incident_id}",
        "spill_id": incident_id,
        "run_type": "forecast",
        "windage_coefficient": 0.035,
        "particle_count": n_particles,
        "integration_timestep_min": dt_m,
        "integration_hours": 24.0,
        "integration_method": "Lagrangian RK4 Ensemble (Simulation Preview)",
        "particles_json": json.dumps(particles_history),
        "origin_region_geojson": None,
        "origin_centroid_geojson": None,
        "origin_time_estimate": None,
        "origin_time_uncertainty_h": None,
        "spatial_uncertainty_km": 4.5,
        "environmental_source": "SYNTHETIC_OCEAN_CURRENT_v1 + SYNTHETIC_ERA5_v1",
        "data_mode": "simulation",
        "provenance": "synthetic",
        "created_at": now.isoformat(),
        "_particles": particles_history,
    }


def _generate_preview_attributions(incident_id: str, scen: Dict, geom: Dict, t0: datetime, now: datetime, hindcast_data: Dict) -> List[Dict[str, Any]]:
    fleet = scen["fleet"]
    cand_mmsi = scen["candidate_mmsi"]
    weights = settings.attribution_weights

    attributions = []
    cand_v = next((v for v in fleet if v["mmsi"] == cand_mmsi), fleet[0])
    cand_attr = {
        "id": f"ATTR-{incident_id}-{cand_v['mmsi']}",
        "spill_id": incident_id,
        "mmsi": cand_v["mmsi"],
        "rank": 1,
        "distance_km": 0.42,
        "time_delta_h": 0.25,
        "track_overlap_score": 0.94,
        "heading_compat_score": 0.92,
        "ais_continuity_score": 0.65,
        "norm_proximity": 0.95,
        "norm_temporal": 0.94,
        "norm_trajectory": 0.92,
        "norm_heading": 0.91,
        "norm_continuity": 0.68,
        "weight_proximity": weights.get("proximity", 0.35),
        "weight_temporal": weights.get("temporal", 0.25),
        "weight_trajectory": weights.get("trajectory", 0.20),
        "weight_heading": weights.get("heading", 0.10),
        "weight_continuity": weights.get("continuity", 0.10),
        "evidence_score": 0.892,
        "data_confidence": 0.940,
        "final_score": 0.838,
        "behaviour_observations_json": json.dumps([
            f"AIS reporting gap of 50 minutes observed during transit through {scen['region_name']}.",
            "Vessel speed dropped from 14.2 kn to 4.1 kn within 1.2 km of reconstructed release origin.",
            "Course deviation of 28° recorded coincident with estimated discharge window."
        ]),
        "ais_gap_detected": 1,
        "ais_gap_duration_min": 50.0,
        "slowdown_observed": 1,
        "course_change_observed": 1,
        "ais_coverage_pct": 88.5,
        "spatial_radius_km": 25.0,
        "temporal_window_h": 24.0,
        "data_mode": "simulation",
        "provenance": "synthetic",
        "created_at": now.isoformat(),
    }
    attributions.append(cand_attr)

    other_vessels = [v for v in fleet if v["mmsi"] != cand_mmsi]
    preset_scores = [
        (18.4, 3.2, 0.45, 0.52, 0.95, 0.42, 0.88, 0.370),
        (26.1, 5.8, 0.28, 0.38, 0.98, 0.29, 0.85, 0.246),
        (34.8, 8.4, 0.15, 0.25, 0.92, 0.18, 0.82, 0.148),
        (42.5, 11.2, 0.08, 0.15, 0.90, 0.11, 0.80, 0.088),
    ]
    for idx, v in enumerate(other_vessels):
        r = idx + 2
        sc = preset_scores[idx % len(preset_scores)]
        dist_km, dt_h, traj_s, head_s, cont_s, evid_s, conf_s, fin_s = sc
        attr = {
            "id": f"ATTR-{incident_id}-{v['mmsi']}",
            "spill_id": incident_id,
            "mmsi": v["mmsi"],
            "rank": r,
            "distance_km": dist_km,
            "time_delta_h": dt_h,
            "track_overlap_score": traj_s,
            "heading_compat_score": head_s,
            "ais_continuity_score": cont_s,
            "norm_proximity": round(max(0.0, 1.0 - dist_km / 50.0), 4),
            "norm_temporal": round(max(0.0, 1.0 - dt_h / 24.0), 4),
            "norm_trajectory": traj_s,
            "norm_heading": head_s,
            "norm_continuity": cont_s,
            "weight_proximity": weights.get("proximity", 0.35),
            "weight_temporal": weights.get("temporal", 0.25),
            "weight_trajectory": weights.get("trajectory", 0.20),
            "weight_heading": weights.get("heading", 0.10),
            "weight_continuity": weights.get("continuity", 0.10),
            "evidence_score": evid_s,
            "data_confidence": conf_s,
            "final_score": fin_s,
            "behaviour_observations_json": json.dumps([
                "Continuous AIS transmission with standard operating speed profile.",
                "Transit corridor remained outside primary reconstructed release envelope."
            ]),
            "ais_gap_detected": 0,
            "ais_gap_duration_min": 0.0,
            "slowdown_observed": 0,
            "course_change_observed": 0,
            "ais_coverage_pct": 98.2,
            "spatial_radius_km": 50.0,
            "temporal_window_h": 24.0,
            "data_mode": "simulation",
            "provenance": "synthetic",
            "created_at": now.isoformat(),
        }
        attributions.append(attr)
    return attributions


def _generate_preview_analysis_run(incident_id: str, scen: Dict, geom: Dict, t0: datetime, now: datetime, hindcast_data: Dict, attributions: List[Dict]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    run_id = f"RUN-{incident_id}"
    weights = settings.attribution_weights
    started_at = (t0 + timedelta(minutes=15)).isoformat()
    completed_at = (t0 + timedelta(minutes=18)).isoformat()

    run = {
        "id": run_id,
        "spill_id": incident_id,
        "run_type": "investigation_pipeline",
        "status": "completed",
        "data_mode": "simulation",
        "satellite_scene_id": scen["scene_id"],
        "satellite_source": "Sentinel-1 SAR",
        "capture_timestamp": t0.isoformat(),
        "model_version": "1.0.0-demo",
        "preprocessing_version": "1.2.0",
        "model_threshold": 0.42,
        "environment_source": "CMEMS Surface Hydrodynamics & ERA5 Atmospheric Winds",
        "environment_time_range_start": (t0 - timedelta(hours=24)).isoformat(),
        "environment_time_range_end": (t0 + timedelta(hours=24)).isoformat(),
        "windage_coefficient": 0.035,
        "particle_count": 50,
        "integration_timestep_min": 15,
        "hindcast_hours": 12.0,
        "forecast_hours": 24.0,
        "ais_source": "Synthetic AIS Stream",
        "ais_coverage_pct": 96.4,
        "scoring_config_json": json.dumps(weights),
        "error_message": None,
        "started_at": started_at,
        "completed_at": completed_at,
        "report_version": "1.0",
    }

    events = [
        {"event_type": "scene_ingested", "event_data": {"scene_id": scen["scene_id"], "region": scen["region_name"]}},
        {"event_type": "preprocessing_completed", "event_data": {"calibration": "sigma0", "speckle_filter": "Lee-Enhanced 5x5"}},
        {"event_type": "detection_completed", "event_data": {"confidence": scen["confidence"], "class": "suspected_oil"}},
        {"event_type": "geometry_completed", "event_data": {"area_km2": geom["area_km2"], "perimeter_km": geom["perimeter_km"]}},
        {"event_type": "environment_fetched", "event_data": {"source": "SYNTHETIC_OCEAN_CURRENT_v1", "resolution_deg": 0.083}},
        {"event_type": "hindcast_completed", "event_data": {"particles": 50, "origin_lat": scen["origin_lat"], "origin_lon": scen["origin_lon"]}},
        {"event_type": "ais_correlated", "event_data": {"vessels_screened": len(scen["fleet"]), "candidates_passed": len(attributions)}},
        {"event_type": "attribution_completed", "event_data": {"top_candidate_mmsi": scen["candidate_mmsi"], "score": 0.838}},
        {"event_type": "forecast_completed", "event_data": {"horizon_hours": 24.0, "particles": 50}},
        {"event_type": "report_generated", "event_data": {"report_version": "1.0", "sections_count": 15}},
    ]

    audit_logs = []
    for idx, ev in enumerate(events):
        ev_time = (t0 + timedelta(minutes=15 + idx * 0.3)).isoformat()
        audit_logs.append({
            "id": f"AUD-{incident_id}-{idx+1:02d}",
            "analysis_run_id": run_id,
            "event_type": ev["event_type"],
            "event_data_json": json.dumps(ev["event_data"]),
            "timestamp": ev_time,
        })

    return run, audit_logs


def _generate_preview_alert(incident_id: str, scen: Dict, geom: Dict, t0: datetime, now: datetime) -> Dict[str, Any]:
    return {
        "id": f"ALT-{incident_id}",
        "spill_id": incident_id,
        "scene_id": scen["scene_id"],
        "title": f"High-Confidence Slick Detected — {scen['region_name']}",
        "incident_name": scen["incident_name"],
        "alert_time": t0.isoformat(),
        "acquisition_time": t0.isoformat(),
        "satellite_name": scen["satellite_name"],
        "severity": "high",
        "status": "active",
        "confidence": scen["confidence"],
        "detection_confidence": scen["confidence"],
        "area_km2": geom["area_km2"],
        "source_scene": scen["scene_id"],
        "location_geojson": json.dumps(geom["centroid_geojson"]),
        "centroid_geojson": json.dumps(geom["centroid_geojson"]),
        "polygon_geojson": json.dumps(geom["polygon_geojson"]),
        "model_version": "1.0.0-demo",
        "data_mode": "simulation",
        "provenance": "synthetic",
        "pipeline_run_id": f"RUN-{incident_id}",
        "investigation_spill_id": incident_id,
        "acknowledged_at": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }


def _generate_preview_report(
    incident_id: str,
    scen: Dict,
    geom: Dict,
    t0: datetime,
    now: datetime,
    hindcast_data: Dict,
    forecast_data: Dict,
    attributions: List[Dict],
    sat_image: Dict
) -> Dict[str, Any]:
    cand_v = next((v for v in scen["fleet"] if v["mmsi"] == scen["candidate_mmsi"]), scen["fleet"][0])
    now_str = now.strftime("%Y-%m-%d %H:%M:%S UTC")
    report_id = f"RPT-{incident_id}-OFFICIAL"

    sections = {
        "1_incident_overview": {
            "title": "1. Incident Overview",
            "incident_id": incident_id,
            "incident_name": scen["incident_name"],
            "region": scen["region_name"],
            "severity": "HIGH",
            "status": "analyzed",
            "observation_time": t0.isoformat(),
        },
        "2_data_provenance": {
            "title": "2. Data Provenance & Mode Flag",
            "data_mode": "SIMULATION (SYNTHETIC)",
            "is_simulation": True,
            "provenance": "synthetic",
            "environmental_source": "SYNTHETIC_HYDRODYNAMICS_v1 + SYNTHETIC_ERA5_v1",
            "seed": scen["seed"],
            "pipeline_version": "1.0.0",
        },
        "3_satellite_detection": {
            "title": "3. Satellite SAR Detection",
            "scene_id": sat_image["id"],
            "satellite_name": sat_image["satellite_name"],
            "instrument": "C-SAR (5.405 GHz)",
            "acquisition_time": sat_image["acquisition_time"],
            "crs": sat_image["crs"],
            "resolution_m": sat_image["resolution_m"],
            "model_version": "1.0.0-demo",
            "detection_confidence": scen["confidence"],
            "detection_threshold": 0.42,
            "preprocessing_version": "1.2.0",
        },
        "4_spill_geometry": {
            "title": "4. Spill Geometry & Dimensions",
            "area_km2": geom["area_km2"],
            "perimeter_km": geom["perimeter_km"],
            "length_km": geom["length_km"],
            "width_km": geom["width_km"],
            "orientation_deg": geom["orientation_deg"],
            "compactness": geom["compactness"],
            "projection": "EPSG:6933 (Equal-Area Cylindrical)",
        },
        "5_environmental_conditions": {
            "title": "5. Environmental Conditions & Forcing",
            "current_source": "SYNTHETIC_OCEAN_CURRENT_v1",
            "wind_source": "SYNTHETIC_ERA5_v1",
            "mean_current_speed_ms": round(math.sqrt(scen["current_u"]**2 + scen["current_v"]**2), 3),
            "mean_wind_speed_ms": round(math.sqrt(scen["wind_u10"]**2 + scen["wind_v10"]**2), 2),
            "windage_coefficient": 0.035,
            "forcing_formula": "V_particle = V_current + 0.035 * V_wind + StochasticWalk",
        },
        "6_lagrangian_hindcast": {
            "title": "6. Lagrangian Hindcast Reconstruction",
            "particle_count": 50,
            "integration_hours": 12.0,
            "timestep_min": 15,
            "integration_method": "RK4 (4th-Order Runge-Kutta Simulation Preview)",
            "status": "complete",
        },
        "7_origin_estimate": {
            "title": "7. Estimated Origin Region & Window",
            "estimated_spill_time": hindcast_data["origin_time_estimate"],
            "temporal_uncertainty_h": hindcast_data["origin_time_uncertainty_h"],
            "spatial_uncertainty_km": hindcast_data["spatial_uncertainty_km"],
            "centroid_geojson": json.loads(hindcast_data["origin_centroid_geojson"]),
            "origin_region_geojson": json.loads(hindcast_data["origin_region_geojson"]),
        },
        "8_ais_screening_summary": {
            "title": "8. AIS Traffic Screening Summary",
            "total_vessels_detected": len(scen["fleet"]),
            "spatial_candidates_count": len(attributions),
            "temporal_candidates_count": len(attributions),
            "trajectory_candidates_count": len(attributions),
            "screening_radius_km": 50.0,
            "temporal_window_h": 24.0,
        },
        "9_candidate_vessel_roster": {
            "title": "9. Candidate Vessel Roster",
            "candidates": [
                {
                    "rank": a["rank"],
                    "vessel_name": next((v["vessel_name"] for v in scen["fleet"] if v["mmsi"] == a["mmsi"]), "Unknown"),
                    "mmsi": a["mmsi"],
                    "vessel_type": next((v["vessel_type"] for v in scen["fleet"] if v["mmsi"] == a["mmsi"]), "tanker"),
                    "flag": next((v.get("flag", "IN") for v in scen["fleet"] if v["mmsi"] == a["mmsi"]), "IN"),
                    "distance_km": a["distance_km"],
                    "evidence_score": a["evidence_score"],
                    "data_confidence": a["data_confidence"],
                    "final_score": a["final_score"],
                }
                for a in attributions
            ],
        },
        "10_attribution_evidence": {
            "title": "10. Attribution Evidence & Feature Breakdown",
            "scoring_methodology": "Weighted Evidential Model: Proximity (35%), Temporal (25%), Trajectory (20%), Heading (10%), Continuity (10%)",
            "top_candidate": {
                "mmsi": cand_v["mmsi"],
                "vessel_name": cand_v["vessel_name"],
                "final_score": attributions[0]["final_score"],
                "evidence_score": attributions[0]["evidence_score"],
                "observations": json.loads(attributions[0]["behaviour_observations_json"]),
            },
        },
        "11_forward_forecast": {
            "title": "11. Forward Dispersion Forecast",
            "forecast_hours": 24.0,
            "particle_count": 50,
            "projected_drift_heading": "North-East",
            "threat_status": "Coastal monitoring active",
        },
        "12_uncertainty_quantification": {
            "title": "12. Uncertainty Quantification",
            "spatial_confidence_radius_km": 3.2,
            "temporal_window_hours": 1.5,
            "model_confidence_level": "94.0%",
            "methodology": "Monte Carlo Particle Dispersion Ensemble",
        },
        "13_limitations": {
            "title": "13. Methodological Limitations",
            "notes": [
                "Synthetic simulation data demonstration record.",
                "SAR backscatter damping may be influenced by natural biogenic slicks or low-wind areas.",
                "Correlation ranking constitutes statistical investigative evidence, not judicial proof of liability.",
            ],
        },
        "14_reproducibility": {
            "title": "14. Reproducibility & Cryptographic Provenance",
            "scenario_seed": scen["seed"],
            "sha256_checksum": hashlib.sha256(f"{incident_id}-{scen['seed']}-{sat_image['id']}".encode()).hexdigest(),
            "deterministic": True,
        },
        "15_disclaimer": {
            "title": "15. Legal & Forensic Disclaimer",
            "text": "This report is generated by OILTRACE AI for maritime intelligence, initial response coordination, and forensic triage. Final legal attribution requires authenticated physical sampling and statutory flag state inspection.",
        },
    }

    rows_html = "".join([
        f"""<tr>
          <td>{c['rank']}</td>
          <td>{c['vessel_name']}</td>
          <td>{c['vessel_type']}</td>
          <td>{c['mmsi']}</td>
          <td>{c['distance_km']} km</td>
          <td>{c['evidence_score']}</td>
          <td>{c['data_confidence']}</td>
          <td><strong>{c['final_score']}</strong></td>
        </tr>"""
        for c in sections["9_candidate_vessel_roster"]["candidates"]
    ])

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>OILTRACE AI — Investigation Dossier {incident_id}</title>
<style>
body{{font-family:'IBM Plex Mono',monospace;background:#0B0F14;color:#E6EAEE;margin:0;padding:32px;line-height:1.5;}}
h1{{color:#3FA7D6;font-size:22px;margin-bottom:4px;letter-spacing:-0.5px;}}
h2{{color:#A7B0BA;font-size:14px;border-bottom:1px solid #232B34;padding-bottom:6px;margin-top:28px;text-transform:uppercase;letter-spacing:0.5px;}}
.badge{{display:inline-block;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:600;}}
.sim{{background:#2D2416;color:#C8A45D;border:1px solid #C8A45D;}}
.meta{{color:#7F8A96;font-size:12px;margin-bottom:20px;}}
table{{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}}
th{{text-align:left;padding:8px;background:#151B22;color:#A7B0BA;border-bottom:1px solid #232B34;}}
td{{padding:8px;border-bottom:1px solid #19212A;color:#E6EAEE;}} tr:hover td{{background:#19212A;}}
.section{{background:#151B22;border:1px solid #232B34;border-radius:4px;padding:14px;margin-bottom:12px;}}
.kv{{display:grid;grid-template-columns:220px 1fr;gap:4px 16px;}} .k{{color:#7F8A96;font-size:12px;}} .v{{color:#E6EAEE;font-size:12px;font-weight:500;}}
.warning{{background:#1A1408;border:1px solid #C9A24E;border-radius:4px;padding:12px;color:#C9A24E;font-size:12px;margin-bottom:20px;}}
.footer{{color:#59636E;font-size:11px;margin-top:40px;border-top:1px solid #232B34;padding-top:16px;}}
</style></head>
<body>
<h1>OILTRACE AI &mdash; Maritime Evidence Dossier</h1>
<div class="meta">Dossier ID: {report_id} &nbsp;|&nbsp; Incident: {incident_id} &nbsp;|&nbsp; Generated: {now_str} &nbsp;|&nbsp; <span class="badge sim">SIMULATION PREVIEW</span></div>

<div class="warning">
  <strong>LEGAL DISCLAIMER &amp; LIMITATION:</strong> This dossier is generated from deterministic synthetic simulation records (Demo Mode).
  Correlation ranking represents statistical evidential correlation and does not constitute judicial attribution or legal liability.
</div>

<h2>1. Incident Overview</h2>
<div class="section"><div class="kv">
  <span class="k">Incident ID</span><span class="v">{incident_id}</span>
  <span class="k">Incident Name</span><span class="v">{scen["incident_name"]}</span>
  <span class="k">Operational Sector</span><span class="v">{scen["region_name"]}</span>
  <span class="k">Observation Time</span><span class="v">{t0.isoformat()}</span>
  <span class="k">Severity</span><span class="v">HIGH</span>
  <span class="k">Data Mode</span><span class="v">SIMULATION (Synthetic Scenario)</span>
</div></div>

<h2>2. Satellite SAR Detection &amp; Characterization</h2>
<div class="section"><div class="kv">
  <span class="k">Scene ID</span><span class="v">{sat_image["id"]}</span>
  <span class="k">Satellite Sensor</span><span class="v">{sat_image["satellite_name"]} (C-Band SAR)</span>
  <span class="k">Spill Sfc Area</span><span class="v">{geom["area_km2"]:.3f} km&sup2;</span>
  <span class="k">Perimeter / Length</span><span class="v">{geom["perimeter_km"]:.2f} km / {geom["length_km"]:.2f} km</span>
  <span class="k">Detection Confidence</span><span class="v">{scen["confidence"] * 100:.1f}%</span>
  <span class="k">Centroid Coordinates</span><span class="v">{geom["centroid_lat"]:.5f}&deg;N, {geom["centroid_lon"]:.5f}&deg;E</span>
</div></div>

<h2>3. Reverse Lagrangian Hindcast (Origin Estimate)</h2>
<div class="section"><div class="kv">
  <span class="k">Estimated Release Time</span><span class="v">{hindcast_data["origin_time_estimate"]}</span>
  <span class="k">Origin Coordinates</span><span class="v">{scen["origin_lat"]:.5f}&deg;N, {scen["origin_lon"]:.5f}&deg;E</span>
  <span class="k">Spatial Uncertainty</span><span class="v">&plusmn;{hindcast_data["spatial_uncertainty_km"]} km</span>
  <span class="k">Temporal Uncertainty</span><span class="v">&plusmn;{hindcast_data["origin_time_uncertainty_h"]} h</span>
  <span class="k">Integration Method</span><span class="v">Lagrangian RK4 Ensemble (50 particles)</span>
</div></div>

<h2>4. Candidate Vessel Correlation &amp; Attribution Ranking</h2>
<div class="section">
<table>
  <thead><tr><th>Rank</th><th>Vessel Name</th><th>Type</th><th>MMSI</th><th>Distance to Origin</th><th>Evidence Score</th><th>Data Confidence</th><th>Final Score</th></tr></thead>
  <tbody>{rows_html}</tbody>
</table>
</div>

<h2>5. Primary Suspect Forensic Evidence Breakdown</h2>
<div class="section">
  <div class="kv" style="margin-bottom:8px;">
    <span class="k">Vessel Name / MMSI</span><span class="v">{cand_v["vessel_name"]} ({cand_v["mmsi"]})</span>
    <span class="k">Flag State / IMO</span><span class="v">{cand_v.get("flag","IN")} / IMO {cand_v["imo"]}</span>
    <span class="k">Attribution Confidence</span><span class="v">{attributions[0]["final_score"] * 100:.1f}% (Rank #1)</span>
  </div>
  <ul style="color:#A7B0BA;font-size:12px;margin:8px 0 0 16px;padding:0;">
    <li>AIS transmission gap of 50 minutes during transit through {scen["region_name"]}.</li>
    <li>Speed reduction from 14.2 kn to 4.1 kn within 1.2 km of reconstructed release origin.</li>
    <li>Course deviation of 28&deg; recorded coincident with estimated discharge window.</li>
  </ul>
</div>

<h2>6. Methodological Limitations &amp; Provenance</h2>
<div class="section"><div class="kv">
  <span class="k">Analysis Seed</span><span class="v">{scen["seed"]}</span>
  <span class="k">Cryptographic Checksum</span><span class="v">{hashlib.sha256(f"{incident_id}-{scen['seed']}".encode()).hexdigest()[:24]}...</span>
  <span class="k">Deterministic Preview</span><span class="v">Yes &mdash; reproducible on fixed scenario seeds</span>
</div></div>

<div class="footer">
  OILTRACE AI | National Maritime Intelligence Directorate | Satellite-Based Marine Oil Spill Detection
  <br>Official Evidence Dossier &bull; Generated for Technical &amp; Operational Evaluation
</div>
</body></html>"""

    return {
        "id": report_id,
        "spill_id": incident_id,
        "report_version": "1.0",
        "status": "complete",
        "report_html": html,
        "report_pdf_path": None,
        "sections_json": json.dumps(sections),
        "generated_at": now.isoformat(),
        "created_at": now.isoformat(),
    }
