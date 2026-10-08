from fastapi import APIRouter, HTTPException, Query
from app.api.spills import get_digital_twin_state

router = APIRouter(prefix="/api/digital-twin", tags=["digital-twin"])

@router.get("/{spill_id}")
def get_twin_state(spill_id: str, offset_hours: float = Query(0.0)):
    return get_digital_twin_state(spill_id, offset_hours)
