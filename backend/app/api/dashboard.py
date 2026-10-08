from fastapi import APIRouter
from app.database.engine import get_connection, row_to_dict, row_get, parse_json

router = APIRouter(prefix='/api/dashboard', tags=['dashboard'])

@router.get('/stats')
def get_stats():
    conn = get_connection()
    try:
        spills = conn.execute('SELECT * FROM oil_spills').fetchall()
        vc = conn.execute('SELECT COUNT(*) as c FROM vessels').fetchone()
        v_count = row_get(vc, 'c', row_get(vc, 0, 0))
        high = [s for s in spills if row_to_dict(s).get('severity') in ('high','critical')]
        incidents = []
        for s in spills:
            d = row_to_dict(s)
            for f in ["spill_polygon_geojson", "centroid_geojson", "bounding_box_geojson"]:
                d[f] = parse_json(d.get(f))
            incidents.append(d)
        return {
            'active_incidents': len(spills),
            'analyzed_scenes': len(spills),
            'analyzed_vessels': v_count,
            'high_priority_cases': len(high),
            'incidents': incidents,
        }
    finally:
        conn.close()