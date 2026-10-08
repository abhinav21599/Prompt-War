import os
import sys
import json
from pathlib import Path
import numpy as np
import torch
from torch.utils.data import DataLoader

root_dir = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(root_dir / "backend"))

from backend.app.detection.model import UNetResNet34
from ml.dataset.dataset import ZenodoSAROilSpillDataset
from ml.training.train import compute_metrics

def evaluate_model(
    checkpoint_path: str = "models/oiltrace_unet_v1.pt",
    threshold: float = 0.42,
) -> dict:
    device = torch.device("cpu")
    if not os.path.exists(checkpoint_path):
        fallback = "models/oiltrace_demo_unet.pt"
        if os.path.exists(fallback):
            checkpoint_path = fallback
        else:
            raise FileNotFoundError(f"Checkpoint not found at {checkpoint_path}")

    # Inspect checkpoint in_channels
    state_dict = torch.load(checkpoint_path, map_location=device)
    conv_w = state_dict.get("encoder.conv1.weight") if "encoder.conv1.weight" in state_dict else state_dict.get("conv1.weight")
    in_channels = conv_w.shape[1] if conv_w is not None else 2

    model = UNetResNet34(in_channels=in_channels, num_classes=1).to(device)
    model.load_state_dict(state_dict)
    model.eval()

    test_ds = ZenodoSAROilSpillDataset(split="test", augment=False)
    if len(test_ds) == 0:
        raise ValueError("Zenodo test set is empty. Run scripts/setup_zenodo_dataset.py first.")

    test_loader = DataLoader(test_ds, batch_size=4, shuffle=False)

    all_probs = []
    all_targets = []
    class_results = {"oil": [], "lookalike": [], "no_oil": []}

    with torch.no_grad():
        for sar, masks, class_names in test_loader:
            if in_channels == 1 and sar.shape[1] > 1:
                sar = sar[:, :1]
            probs = model.predict_probability(sar).cpu().numpy()
            targets = masks.numpy()
            all_probs.append(probs)
            all_targets.append(targets)

            for idx, c in enumerate(class_names):
                if c in class_results:
                    class_results[c].append((probs[idx], targets[idx]))

    all_probs = np.concatenate(all_probs, axis=0)
    all_targets = np.concatenate(all_targets, axis=0)
    metrics = compute_metrics(all_probs, all_targets, threshold=threshold)
    metrics["test_samples"] = len(test_ds)
    metrics["checkpoint_path"] = checkpoint_path
    metrics["in_channels"] = in_channels
    metrics["threshold"] = threshold

    print(f"[ML EVALUATION] Checkpoint: {checkpoint_path} (in_channels={in_channels})")
    print(f"[ML EVALUATION] Overall Test Samples: {len(test_ds)}")
    print(f"[ML EVALUATION] IoU: {metrics['iou']} | Dice F1: {metrics['dice_f1']} | Precision: {metrics['precision']} | Recall: {metrics['recall']}")
    print(f"[ML EVALUATION] Specificity: {metrics['specificity']} | FPR: {metrics['false_positive_rate']}")

    return metrics

if __name__ == "__main__":
    evaluate_model()
