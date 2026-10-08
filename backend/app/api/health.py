import os
from fastapi import APIRouter
from datetime import datetime, timezone
from app.database.engine import get_connection
from app.config import settings

router = APIRouter(prefix='/api', tags=['health'])

def check_db():
    try:
        conn = get_connection()
        conn.execute('SELECT 1')
        conn.close()
        return 'online'
    except Exception:
        return 'unavailable'

@router.get('/health')
def health_check():
    db_status = check_db()
    model_path = getattr(settings, "model_path", "models/oiltrace_demo_unet.pt")
    has_model = bool(model_path and os.path.exists(model_path))

    data_mode = os.getenv("DATA_MODE", "simulation").lower()
    has_copernicus = bool(os.getenv("COPERNICUS_API_KEY") or os.getenv("COPERNICUS_CDS_KEY"))
    has_ais_api = bool(os.getenv("AIS_API_KEY"))

    if data_mode == "simulation":
        detection_status = "precomputed_demo"
        environment_status = "synthetic"
        ais_status = "synthetic"
    else:
        detection_status = "online" if has_model else "unavailable"
        environment_status = "operational" if has_copernicus else "unavailable"
        ais_status = "operational" if has_ais_api else "unavailable"

    return {
        'status': 'healthy' if db_status == 'online' else 'degraded',
        'version': '1.2.0',
        'data_mode': data_mode,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'services': {
            'database': db_status,
            'detection': detection_status,
            'environment': environment_status,
            'AIS': ais_status,
            'drift': 'online',
            'attribution': 'online',
            'report_engine': 'online',
            'map_engine': 'online',
        }
    }