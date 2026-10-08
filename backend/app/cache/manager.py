import time
import hashlib
import json
from typing import Any, Optional, Dict

class CacheManager:
    """
    In-memory and file-backed caching manager for spatial and temporal queries.
    Prevents repeated API querying for unchanged bounding boxes and time ranges.
    """
    def __init__(self, default_ttl_seconds: int = 3600):
        self._store: Dict[str, Dict[str, Any]] = {}
        self.default_ttl = default_ttl_seconds

    def _generate_key(self, prefix: str, params: Dict[str, Any]) -> str:
        serialized = json.dumps(params, sort_keys=True, default=str)
        hash_digest = hashlib.sha256(serialized.encode()).hexdigest()[:16]
        return f"{prefix}:{hash_digest}"

    def get(self, prefix: str, params: Dict[str, Any]) -> Optional[Any]:
        key = self._generate_key(prefix, params)
        item = self._store.get(key)
        if not item:
            return None
        if time.time() > item["expires_at"]:
            del self._store[key]
            return None
        return item["data"]

    def set(self, prefix: str, params: Dict[str, Any], data: Any, ttl_seconds: Optional[int] = None) -> None:
        key = self._generate_key(prefix, params)
        ttl = ttl_seconds if ttl_seconds is not None else self.default_ttl
        self._store[key] = {
            "data": data,
            "expires_at": time.time() + ttl,
            "created_at": time.time(),
        }

    def clear(self) -> None:
        self._store.clear()

cache = CacheManager()
