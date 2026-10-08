import os
import time
from typing import Dict, Any, Optional
import numpy as np
import torch
from app.detection.model import UNetResNet34

class MLInferenceEngine:
    """
    Inference Engine for PyTorch U-Net with ResNet-34 Encoder.
    Strictly runs CPU inference with batch size 1, torch.no_grad(), and eval mode.
    Supports single-channel (VV) and dual-channel (VV+VH) Sentinel-1 checkpoints.
    """
    def __init__(self, checkpoint_path: Optional[str] = None, threshold: float = 0.42):
        self.threshold = threshold
        self.checkpoint_path = checkpoint_path
        self.device = torch.device("cpu")
        self.loaded_checkpoint = False
        self.in_channels = 2

        if checkpoint_path and os.path.exists(checkpoint_path):
            try:
                state_dict = torch.load(checkpoint_path, map_location=self.device)
                conv_w = state_dict.get("encoder.conv1.weight") if "encoder.conv1.weight" in state_dict else state_dict.get("conv1.weight")
                if conv_w is not None:
                    self.in_channels = conv_w.shape[1]
                self.model = UNetResNet34(in_channels=self.in_channels, num_classes=1).to(self.device)
                self.model.load_state_dict(state_dict)
                self.loaded_checkpoint = True
                print(f"[ML INFERENCE] Loaded checkpoint: {checkpoint_path} (in_channels={self.in_channels})")
            except Exception as e:
                print(f"[ML INFERENCE ERROR] Failed to load checkpoint {checkpoint_path}: {e}")
                self.model = UNetResNet34(in_channels=1, num_classes=1).to(self.device)
        else:
            self.model = UNetResNet34(in_channels=1, num_classes=1).to(self.device)

        self.model.eval()

    def predict(
        self,
        normalized_array: np.ndarray,
        scene_id: str = "OILTRACE-DEMO-001",
        data_mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Runs neural network segmentation on a 2D or 3D normalized SAR array [-1, 1].
        """
        t_start = time.perf_counter()
        
        if normalized_array.ndim == 2:
            h, w = normalized_array.shape
            if self.in_channels == 2:
                # Synthesize cross-polarization VH channel using cross-pol ratio (~ -7.5 dB)
                vh_synth = np.clip(normalized_array - 0.22, -1.0, 1.0)
                input_arr = np.stack([normalized_array, vh_synth], axis=0) # [2, H, W]
            else:
                input_arr = np.expand_dims(normalized_array, axis=0) # [1, H, W]
        elif normalized_array.ndim == 3:
            c, h, w = normalized_array.shape
            if self.in_channels == 1 and c > 1:
                input_arr = normalized_array[:1]
            elif self.in_channels == 2 and c == 1:
                vh_synth = np.clip(normalized_array[0] - 0.22, -1.0, 1.0)
                input_arr = np.stack([normalized_array[0], vh_synth], axis=0)
            else:
                input_arr = normalized_array
        else:
            raise ValueError(f"Invalid input shape: {normalized_array.shape}")

        tensor = torch.from_numpy(input_arr.astype(np.float32)).unsqueeze(0).to(self.device)

        with torch.no_grad():
            prob_tensor = self.model.predict_probability(tensor)
            prob_map = prob_tensor.squeeze().cpu().numpy()

        mask = (prob_map >= self.threshold).astype(np.uint8)
        oil_pixel_count = int(np.sum(mask))

        if oil_pixel_count > 0:
            confidence = float(np.mean(prob_map[mask == 1]))
        else:
            confidence = float(np.max(prob_map)) if prob_map.size > 0 else 0.0

        elapsed_ms = round((time.perf_counter() - t_start) * 1000, 2)
        out_mode = data_mode if data_mode is not None else ("real" if self.loaded_checkpoint else "simulation")
        out_prov = "observed" if out_mode == "real" else "synthetic"

        return {
            "mask": mask,
            "probability_map": prob_map,
            "confidence": round(confidence, 4),
            "class_probabilities": {
                "sea": round(1.0 - confidence, 4),
                "oil": round(confidence, 4),
                "look_alike": 0.0,
            },
            "threshold": self.threshold,
            "model_name": "UNet-ResNet34",
            "model_version": "1.0.0-trained" if self.loaded_checkpoint else "1.0.0-untrained",
            "is_ai_model": True,
            "input_scene_id": scene_id,
            "data_mode": out_mode,
            "provenance": out_prov,
            "inference_time_ms": elapsed_ms,
            "height": h,
            "width": w,
            "oil_pixel_count": oil_pixel_count,
        }

