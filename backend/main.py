import os
import sys
from pathlib import Path
import uvicorn

# Ensure the backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("ENVIRONMENT", "production").lower() != "production" and os.getenv("RELOAD", "false").lower() in ("true", "1")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=reload)
