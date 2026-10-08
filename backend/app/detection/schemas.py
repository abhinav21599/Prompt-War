from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

class ProvenanceMetadata(BaseModel):
    data_mode: str = Field(..., description="simulation, real-cached, or real-live")
    source: str = Field(..., description="Originating data source identifier")
    model_name: str = Field(..., description="Name of detector or model used")
    model_version: str = Field(..., description="Semantic version of model")
    is_ai_model: bool = Field(..., description="True if trained deep learning, False if classical/demo")
    processing_timestamp: str = Field(..., description="ISO 8601 processing time")
    seed: Optional[int] = Field(None, description="Random seed if simulation")
    input_scene_id: str = Field(..., description="Identifier of source SAR scene")

class DetectionResult(BaseModel):
    mask: List[List[int]] = Field(..., description="Binary 2D segmentation mask (0=sea, 1=oil)")
    probability_map: Optional[List[List[float]]] = Field(None, description="Pixel-level oil probability [0, 1]")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Mean detection confidence over detected slick")
    class_probabilities: Dict[str, float] = Field(default_factory=dict, description="Estimated class probabilities")
    threshold: float = Field(0.42, description="Decision boundary threshold")
    model_name: str = Field(..., description="Model identifier")
    model_version: str = Field(..., description="Model version")
    is_ai_model: bool = Field(..., description="Whether deep learning model was used")
    input_scene_id: str = Field(..., description="Input scene identifier")
    data_mode: str = Field("simulation", description="Data mode")
    provenance: str = Field("synthetic", description="Data provenance")
    inference_time_ms: float = Field(..., description="Execution time in milliseconds")
    height: int = Field(..., description="Height in pixels")
    width: int = Field(..., description="Width in pixels")
    oil_pixel_count: int = Field(..., description="Count of detected oil pixels")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Geospatial and sensor metadata")
