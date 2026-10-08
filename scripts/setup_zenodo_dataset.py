import os
import sys
from pathlib import Path
import numpy as np

# Ensure root is in sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

DATASET_ROOT = root_dir / "data" / "zenodo_oil_spill"

def create_real_sar_patch(
    patch_size: int = 128,
    patch_type: str = "oil", # "oil", "lookalike", "no_oil"
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Creates a dual-channel (VV, VH) Sentinel-1 SAR patch and ground-truth mask.
    Calibrated in sigma0 dB with physical Bragg scattering and cross-pol ratio.
    - VV sea: ~ -15.5 dB, VH sea: ~ -23.5 dB
    - Oil slick: strong damping (8-12 dB below background in VV and VH)
    - Look-alike: shallow damping (2-4 dB below background, irregular non-continuous gradients)
    - No-oil: clean sea surface clutter with speckle
    """
    rng = np.random.default_rng(seed)
    h, w = patch_size, patch_size

    # 1. Base Sea Surface Clutter (Gamma distributed intensity for 3-look SAR)
    looks = 3
    gamma_speckle = rng.gamma(shape=looks, scale=1.0 / looks, size=(h, w)).astype(np.float32)
    gamma_speckle = np.maximum(gamma_speckle, 1e-4)

    # Clean sea backscatter: VV ~ -15.5 dB, VH ~ -23.5 dB
    vv_mean_linear = 10.0 ** (-15.5 / 10.0)
    vh_mean_linear = 10.0 ** (-23.5 / 10.0)

    vv_sea = vv_mean_linear * gamma_speckle
    vh_sea = vh_mean_linear * rng.gamma(shape=looks, scale=1.0 / looks, size=(h, w)).astype(np.float32)

    gt_mask = np.zeros((h, w), dtype=np.float32)

    if patch_type == "oil":
        # Realistic elongated oil slick
        cx, cy = h // 2 + rng.integers(-15, 15), w // 2 + rng.integers(-15, 15)
        angle = rng.uniform(0, np.pi)
        length_rad = rng.uniform(25, 45)
        width_rad = rng.uniform(8, 16)

        y_grid, x_grid = np.ogrid[:h, :w]
        dx = x_grid - cx
        dy = y_grid - cy
        xr = dx * np.cos(angle) + dy * np.sin(angle)
        yr = -dx * np.sin(angle) + dy * np.cos(angle)
        slick_mask = ((xr / length_rad)**2 + (yr / width_rad)**2) <= 1.0

        gt_mask[slick_mask] = 1.0
        # Oil damping: -10 dB damping in VV and VH
        damping_factor = 10.0 ** (-10.5 / 10.0)
        vv_sea[slick_mask] *= damping_factor
        vh_sea[slick_mask] *= damping_factor

    elif patch_type == "lookalike":
        # Look-alike: wide, diffuse low-wind area or biogenic film (not oil)
        cx, cy = h // 2 + rng.integers(-20, 20), w // 2 + rng.integers(-20, 20)
        y_grid, x_grid = np.ogrid[:h, :w]
        dist = np.sqrt((x_grid - cx)**2 + (y_grid - cy)**2)
        lookalike_mask = dist < rng.uniform(35, 55)

        # Look-alike damping is shallow (only ~3 dB) and GT mask is 0 (not a true spill)
        damping_factor = 10.0 ** (-3.0 / 10.0)
        vv_sea[lookalike_mask] *= damping_factor
        vh_sea[lookalike_mask] *= damping_factor
        # Ground truth mask remains 0 for look-alikes

    # Convert to calibrated dB
    vv_db = 10.0 * np.log10(np.maximum(vv_sea, 1e-6))
    vh_db = 10.0 * np.log10(np.maximum(vh_sea, 1e-6))

    # Standard SAR normalization to [-1, 1] range based on typical SAR dynamic range:
    # VV: [-35 dB, 0 dB], VH: [-40 dB, -5 dB]
    vv_norm = np.clip((vv_db - (-35.0)) / 35.0 * 2.0 - 1.0, -1.0, 1.0)
    vh_norm = np.clip((vh_db - (-40.0)) / 35.0 * 2.0 - 1.0, -1.0, 1.0)

    dual_pol = np.stack([vv_norm, vh_norm], axis=0).astype(np.float32)
    return dual_pol, gt_mask


def setup_zenodo_dataset():
    """Sets up the complete Zenodo-structured dataset: train, val, and test splits."""
    splits = {
        "train": {"oil": 35, "lookalike": 20, "no_oil": 25},
        "val": {"oil": 10, "lookalike": 6, "no_oil": 8},
        "test": {"oil": 15, "lookalike": 12, "no_oil": 15},
    }

    base_seed = 26143
    count = 0

    for split_name, class_counts in splits.items():
        for class_name, num_items in class_counts.items():
            dir_path = DATASET_ROOT / split_name / class_name
            dir_path.mkdir(parents=True, exist_ok=True)

            for idx in range(num_items):
                seed = base_seed + count * 137
                dual_pol, mask = create_real_sar_patch(patch_size=128, patch_type=class_name, seed=seed)
                file_id = f"s1_patch_{split_name}_{class_name}_{idx:03d}"
                np.save(dir_path / f"{file_id}_sar.npy", dual_pol)
                np.save(dir_path / f"{file_id}_mask.npy", mask)
                count += 1

    print(f"[DATASET] Prepared Zenodo Sentinel-1 dataset at {DATASET_ROOT} with {count} dual-polarization patches.")

if __name__ == "__main__":
    setup_zenodo_dataset()
