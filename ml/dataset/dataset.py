import os
from pathlib import Path
from typing import Tuple, List, Optional
import numpy as np
import torch
from torch.utils.data import Dataset
from backend.app.simulation.synthetic_scene import generate_synthetic_sar_scene

DATASET_ROOT = Path(__file__).resolve().parent.parent.parent / "data" / "zenodo_oil_spill"

class ZenodoSAROilSpillDataset(Dataset):
    """
    Zenodo Sentinel-1 SAR Oil Spill Dataset loader.
    Supports official dual-channel (VV, VH) polarization,
    and distinct classes: Oil Spill, Look-alike, and No-Oil (Clean Sea).
    Strictly isolated train / val / test splits.
    """
    def __init__(
        self,
        split: str = "train",
        dataset_root: Optional[Path] = None,
        classes: Optional[List[str]] = None,
        augment: bool = False,
    ):
        self.split = split
        self.root = Path(dataset_root or DATASET_ROOT) / split
        self.classes = classes or ["oil", "lookalike", "no_oil"]
        self.augment = augment
        self.samples: List[Tuple[Path, Path, str]] = []
        self._load_file_list()

    def _load_file_list(self):
        if not self.root.exists():
            return
        for cls_name in self.classes:
            cls_dir = self.root / cls_name
            if not cls_dir.exists():
                continue
            sar_files = sorted(list(cls_dir.glob("*_sar.npy")))
            for sar_p in sar_files:
                mask_p = sar_p.parent / sar_p.name.replace("_sar.npy", "_mask.npy")
                if mask_p.exists():
                    self.samples.append((sar_p, mask_p, cls_name))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor, str]:
        sar_path, mask_path, cls_name = self.samples[idx]
        sar = np.load(sar_path).astype(np.float32) # [2, H, W]
        mask = np.load(mask_path).astype(np.float32) # [H, W]

        if self.augment and self.split == "train":
            rng = np.random.default_rng()
            if rng.random() > 0.5:
                sar = np.flip(sar, axis=2).copy()
                mask = np.flip(mask, axis=1).copy()
            if rng.random() > 0.5:
                sar = np.flip(sar, axis=1).copy()
                mask = np.flip(mask, axis=0).copy()

        sar_tensor = torch.from_numpy(sar)
        mask_tensor = torch.from_numpy(mask).unsqueeze(0) # [1, H, W]

        return sar_tensor, mask_tensor, cls_name


class SyntheticSAROilSpillDataset(Dataset):
    """
    Synthetic Sentinel-1 SAR Oil Spill Dataset for backward compatibility and simulation testing.
    """
    def __init__(self, num_samples: int = 50, patch_size: int = 256, base_seed: int = 26143, augment: bool = True):
        self.num_samples = num_samples
        self.patch_size = patch_size
        self.base_seed = base_seed
        self.augment = augment
        self.samples: List[Tuple[np.ndarray, np.ndarray]] = []
        self._generate_samples()

    def _generate_samples(self):
        for idx in range(self.num_samples):
            seed = self.base_seed + idx * 17
            scene = generate_synthetic_sar_scene(
                width=self.patch_size,
                height=self.patch_size,
                seed=seed,
            )
            norm_sar = scene["normalized"]
            gt_mask = scene["ground_truth_mask"]
            self.samples.append((norm_sar, gt_mask))

    def __len__(self) -> int:
        return self.num_samples

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        sar, mask = self.samples[idx]
        sar = sar.copy()
        mask = mask.copy()

        if self.augment:
            rng = np.random.default_rng(self.base_seed + idx * 31)
            if rng.random() > 0.5:
                sar = np.fliplr(sar)
                mask = np.fliplr(mask)
            if rng.random() > 0.5:
                sar = np.flipud(sar)
                mask = np.flipud(mask)

        sar_tensor = torch.from_numpy(sar.astype(np.float32)).unsqueeze(0)
        mask_tensor = torch.from_numpy(mask.astype(np.float32)).unsqueeze(0)

        return sar_tensor, mask_tensor
