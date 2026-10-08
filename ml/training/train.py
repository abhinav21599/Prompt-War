import os,sys,json,time
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

root_dir = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(root_dir / "backend"))

from backend.app.detection.model import UNetResNet34
from ml.dataset.dataset import ZenodoSAROilSpillDataset, SyntheticSAROilSpillDataset

class BCEDiceLoss(nn.Module):
    def __init__(self, bce_weight: float = 0.5, smooth: float = 1e-5):
        super().__init__()
        self.bce_weight = bce_weight
        self.smooth = smooth
        self.bce = nn.BCEWithLogitsLoss()

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        bce_loss = self.bce(logits, targets)
        probs = torch.sigmoid(logits)
        intersection = (probs * targets).sum(dim=(2, 3))
        union = probs.sum(dim=(2, 3)) + targets.sum(dim=(2, 3))
        dice_loss = 1.0 - (2.0 * intersection + self.smooth) / (union + self.smooth)
        return self.bce_weight * bce_loss + (1.0 - self.bce_weight) * dice_loss.mean()

def compute_metrics(probs: np.ndarray, targets: np.ndarray, threshold: float = 0.42) -> dict:
    preds = (probs >= threshold).astype(np.uint8)
    targets = targets.astype(np.uint8)

    tp = int(np.sum((preds == 1) & (targets == 1)))
    fp = int(np.sum((preds == 1) & (targets == 0)))
    fn = int(np.sum((preds == 0) & (targets == 1)))
    tn = int(np.sum((preds == 0) & (targets == 0)))

    precision = tp / (tp + fp + 1e-7)
    recall = tp / (tp + fn + 1e-7)
    f1 = 2 * precision * recall / (precision + recall + 1e-7)
    iou = tp / (tp + fp + fn + 1e-7)
    specificity = tn / (tn + fp + 1e-7)
    fpr = fp / (fp + tn + 1e-7)

    return {
        "iou": round(float(iou), 4),
        "dice_f1": round(float(f1), 4),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "specificity": round(float(specificity), 4),
        "false_positive_rate": round(float(fpr), 4),
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "true_negatives": tn,
    }

def train_zenodo_model(
    epochs: int = 5,
    batch_size: int = 4,
    lr: float = 1e-3,
    threshold: float = 0.42,
    save_path: str = "models/oiltrace_unet_v1.pt",
    metrics_path: str = "ml/checkpoints/metrics.json",
    seed: int = 26143,
) -> dict:
    torch.manual_seed(seed)
    np.random.seed(seed)
    device = torch.device("cpu")

    train_ds = ZenodoSAROilSpillDataset(split="train", augment=True)
    val_ds = ZenodoSAROilSpillDataset(split="val", augment=False)
    test_ds = ZenodoSAROilSpillDataset(split="test", augment=False)

    if len(train_ds) == 0:
        print("[ML TRAIN] Zenodo dataset not found on disk. Setting up reference patches...")
        from scripts.setup_zenodo_dataset import setup_zenodo_dataset
        setup_zenodo_dataset()
        train_ds = ZenodoSAROilSpillDataset(split="train", augment=True)
        val_ds = ZenodoSAROilSpillDataset(split="val", augment=False)
        test_ds = ZenodoSAROilSpillDataset(split="test", augment=False)

    print(f"[ML TRAIN] Loaded Zenodo dataset: {len(train_ds)} train, {len(val_ds)} val, {len(test_ds)} test.", flush=True)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False)

    # 2 channels: VV and VH polarizations
    model = UNetResNet34(in_channels=2, num_classes=1).to(device)
    criterion = BCEDiceLoss(bce_weight=0.5)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)

    t0 = time.time()
    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for sar, masks, _ in train_loader:
            sar, masks = sar.to(device), masks.to(device)
            optimizer.zero_grad()
            logits = model(sar)
            loss = criterion(logits, masks)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * sar.size(0)
        train_loss /= len(train_ds)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for sar, masks, _ in val_loader:
                sar, masks = sar.to(device), masks.to(device)
                logits = model(sar)
                val_loss += criterion(logits, masks).item() * sar.size(0)
        val_loss /= len(val_ds)
        print(f"Epoch {epoch}/{epochs} | Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f}", flush=True)

    elapsed_s = round(time.time() - t0, 2)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    torch.save(model.state_dict(), save_path)
    print(f"[ML TRAIN] Checkpoint successfully saved to {save_path}", flush=True)

    # Isolated Official Test Set Evaluation
    model.eval()
    test_probs = []
    test_targets = []
    class_eval = {"oil": {"probs": [], "targets": []},
                  "lookalike": {"probs": [], "targets": []},
                  "no_oil": {"probs": [], "targets": []}}

    with torch.no_grad():
        for sar, masks, class_names in test_loader:
            sar = sar.to(device)
            probs = model.predict_probability(sar).cpu().numpy()
            targets = masks.numpy()
            test_probs.append(probs)
            test_targets.append(targets)

            for b in range(sar.size(0)):
                c = class_names[b]
                if c in class_eval:
                    class_eval[c]["probs"].append(probs[b:b+1])
                    class_eval[c]["targets"].append(targets[b:b+1])

    all_test_probs = np.concatenate(test_probs, axis=0)
    all_test_targets = np.concatenate(test_targets, axis=0)

    overall_metrics = compute_metrics(all_test_probs, all_test_targets, threshold=threshold)

    # Class-specific evaluation
    oil_p = np.concatenate(class_eval["oil"]["probs"], axis=0)
    oil_t = np.concatenate(class_eval["oil"]["targets"], axis=0)
    oil_metrics = compute_metrics(oil_p, oil_t, threshold=threshold)

    la_p = np.concatenate(class_eval["lookalike"]["probs"], axis=0)
    la_t = np.concatenate(class_eval["lookalike"]["targets"], axis=0)
    la_metrics = compute_metrics(la_p, la_t, threshold=threshold)

    no_p = np.concatenate(class_eval["no_oil"]["probs"], axis=0)
    no_t = np.concatenate(class_eval["no_oil"]["targets"], axis=0)
    no_metrics = compute_metrics(no_p, no_t, threshold=threshold)

    evaluation_report = {
        "dataset": "Zenodo Sentinel-1 SAR Oil Spill Dataset (DOIs: 10.5281/zenodo.8346860, 8253899, 13761290)",
        "architecture": "Dual-Pol VV/VH U-Net (ResNet-34 Encoder)",
        "in_channels": 2,
        "overall_test": overall_metrics,
        "oil_spill_class": {
            "test_samples": len(class_eval["oil"]["probs"]),
            "iou": oil_metrics["iou"],
            "dice_f1": oil_metrics["dice_f1"],
            "recall": oil_metrics["recall"],
            "precision": oil_metrics["precision"],
        },
        "lookalike_class": {
            "test_samples": len(class_eval["lookalike"]["probs"]),
            "false_positive_rate": la_metrics["false_positive_rate"],
            "specificity": la_metrics["specificity"],
        },
        "no_oil_clean_sea_class": {
            "test_samples": len(class_eval["no_oil"]["probs"]),
            "false_positive_rate": no_metrics["false_positive_rate"],
            "specificity": no_metrics["specificity"],
        },
        "training_time_s": elapsed_s,
        "epochs": epochs,
        "train_samples": len(train_ds),
        "val_samples": len(val_ds),
        "test_samples": len(test_ds),
        "seed": seed,
        "threshold": threshold,
        "checkpoint_file": save_path,
    }

    os.makedirs(os.path.dirname(metrics_path), exist_ok=True)
    with open(metrics_path, "w") as f:
        json.dump(evaluation_report, f, indent=2)

    # Also update demo checkpoint file so existing loaders find it
    demo_save_path = "models/oiltrace_demo_unet.pt"
    if save_path != demo_save_path:
        torch.save(model.state_dict(), demo_save_path)

    print(f"[ML EVALUATION] Saved genuine metrics report to {metrics_path}")
    print(f"[ML EVALUATION] Overall Test IoU: {overall_metrics['iou']} | Dice F1: {overall_metrics['dice_f1']} | Recall: {overall_metrics['recall']}")
    return evaluation_report

if __name__ == "__main__":
    train_zenodo_model(epochs=3)
