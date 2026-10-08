import os
import sys
import time
import logging
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.config import settings
from app.services.alert_service import alert_service
from app.database.engine import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("oiltrace.worker")

def main():
    logger.info("[WORKER STARTUP] Starting OilTrace AI Background Alert Worker...")
    init_db()

    poll_interval = int(os.getenv("ALERT_POLL_INTERVAL_SECONDS", str(getattr(settings, "alert_poll_interval_seconds", 300))))
    data_mode = os.getenv("DATA_MODE", getattr(settings, "default_data_mode", "real"))

    logger.info(f"[WORKER] Configured data_mode={data_mode}, poll_interval={poll_interval}s")

    try:
        while True:
            try:
                logger.info("[WORKER] Polling AOI for candidate oil spill alerts...")
                alerts = alert_service.poll_aoi_for_alerts(data_mode=data_mode)
                logger.info(f"[WORKER] Poll completed. New alerts generated: {len(alerts)}")
            except Exception as poll_err:
                logger.error(f"[WORKER ERROR] Error during alert polling: {poll_err}")

            time.sleep(poll_interval)
    except KeyboardInterrupt:
        logger.info("[WORKER SHUTDOWN] Background Alert Worker stopped cleanly.")

if __name__ == "__main__":
    main()
