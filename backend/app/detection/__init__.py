from app.detection.detector import SpillDetector
from app.detection.fallback import DemoThresholdDetector
from app.detection.schemas import DetectionResult, ProvenanceMetadata

try:
    from app.detection.model import UNetResNet34
except ImportError:
    UNetResNet34 = None

__all__ = ["SpillDetector", "DemoThresholdDetector", "UNetResNet34", "DetectionResult", "ProvenanceMetadata"]
