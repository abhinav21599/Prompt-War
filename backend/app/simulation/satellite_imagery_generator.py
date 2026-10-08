import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import scipy.ndimage

def _render_sar_scene(
    prefix: str,
    output_dir: str,
    title_header: str,
    title_footer: str,
    coords_text: str,
    cx: int,
    cy: int,
    angle_deg: float,
    major_axis: float,
    minor_axis: float,
    ship_targets: list,
    has_spill: bool,
    seed: int,
    spill_label: str = "SLICK CENTROID",
    class_label: str = "CRUDE OIL SLICK",
    conf_pct: float = 94.2
):
    comp_path = os.path.join(output_dir, f"{prefix}_composite.png")
    sar_path = os.path.join(output_dir, f"{prefix}_sar.png")
    tif_path = os.path.join(output_dir, f"{prefix}.tif")
    if os.path.exists(comp_path) and os.path.exists(sar_path) and os.path.exists(tif_path):
        return

    rng = np.random.default_rng(seed)
    width, height = 800, 600

    # 1. Base Ocean Surface Backscatter
    x = np.linspace(0, 10 * np.pi, width)
    y = np.linspace(0, 7.5 * np.pi, height)
    xx, yy = np.meshgrid(x, y)
    
    swell = np.sin(xx * 0.8 + yy * 0.4) * 0.15 + np.sin(xx * 0.3 - yy * 0.6) * 0.1
    speckle = rng.gamma(shape=4.0, scale=0.25, size=(height, width))
    ocean_base = (0.55 + swell) * speckle
    ocean_base = np.clip(ocean_base, 0.05, 1.2)

    damping_mask = np.zeros((height, width), dtype=float)

    if has_spill:
        angle = np.radians(angle_deg)
        cos_a, sin_a = np.cos(angle), np.sin(angle)
        
        xr = (xx - (cx / width * 10 * np.pi)) * cos_a + (yy - (cy / height * 7.5 * np.pi)) * sin_a
        yr = -(xx - (cx / width * 10 * np.pi)) * sin_a + (yy - (cy / height * 7.5 * np.pi)) * cos_a

        dist = (xr / major_axis) ** 2 + (yr / minor_axis) ** 2
        edge_noise = scipy.ndimage.gaussian_filter(rng.normal(0, 0.25, (height, width)), sigma=5.0)
        slick_core = (dist + edge_noise) < 1.0
        damping_mask = scipy.ndimage.gaussian_filter(slick_core.astype(float), sigma=4.0)

    damping_factor = 1.0 - (0.78 * damping_mask)
    sar_intensity = ocean_base * damping_factor

    # Ship / Platform Point Targets (Corner reflectors)
    for target in ship_targets:
        tx, ty = target["x"], target["y"]
        intensity_boost = target.get("boost", 2.5)
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                if 0 <= ty + dy < height and 0 <= tx + dx < width:
                    sar_intensity[ty + dy, tx + dx] += intensity_boost * np.exp(-(dx**2 + dy**2) / 2.0)

    # 1. Raw SAR
    sar_raw_u8 = np.clip(sar_intensity * 180, 0, 255).astype(np.uint8)
    raw_img = Image.fromarray(sar_raw_u8, mode='L')
    raw_img.save(os.path.join(output_dir, f"{prefix}_sar_raw.png"))

    # 2. Calibrated Sigma0 (dB) Speckle-Filtered
    filtered = scipy.ndimage.gaussian_filter(sar_intensity, sigma=1.2)
    sigma0_db = 10.0 * np.log10(np.maximum(filtered, 1e-5))
    db_min, db_max = -30.0, -8.0
    db_norm = np.clip((sigma0_db - db_min) / (db_max - db_min), 0.0, 1.0)
    
    calib_rgb = np.zeros((height, width, 3), dtype=np.uint8)
    calib_rgb[:, :, 0] = (db_norm * 40).astype(np.uint8)
    calib_rgb[:, :, 1] = (db_norm * 140 + 20).astype(np.uint8)
    calib_rgb[:, :, 2] = (db_norm * 190 + 35).astype(np.uint8)
    calib_img = Image.fromarray(calib_rgb, mode='RGB')
    calib_img.save(os.path.join(output_dir, f"{prefix}_sar_calibrated.png"))

    # 3. Detection Segmentation Mask
    mask_binary = (damping_mask > 0.45).astype(np.uint8) * 255
    mask_img = Image.fromarray(mask_binary, mode='L')
    mask_img.save(os.path.join(output_dir, f"{prefix}_detection_mask.png"))

    # 4. Composite Analytical View
    composite = calib_img.convert("RGBA")
    draw = ImageDraw.Draw(composite)

    if has_spill:
        detected_pixels = damping_mask > 0.45
        if np.any(detected_pixels):
            amber_overlay = np.zeros((height, width, 4), dtype=np.uint8)
            amber_overlay[detected_pixels] = [245, 158, 11, 90]
            amber_img = Image.fromarray(amber_overlay, mode='RGBA')
            composite = Image.alpha_composite(composite, amber_img)
            draw = ImageDraw.Draw(composite)

            min_y, min_x = np.min(np.where(detected_pixels)[0]), np.min(np.where(detected_pixels)[1])
            max_y, max_x = np.max(np.where(detected_pixels)[0]), np.max(np.where(detected_pixels)[1])
            draw.rectangle([min_x - 5, min_y - 5, max_x + 5, max_y + 5], outline="#FFB020", width=2)

            draw.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill="#F97316", outline="#FFFFFF", width=2)
            draw.line([cx - 15, cy, cx + 15, cy], fill="#FFFFFF", width=2)
            draw.line([cx, cy - 15, cx, cy + 15], fill="#FFFFFF", width=2)
            draw.text((cx + 12, cy - 12), f"{spill_label} ({coords_text})", fill="#FFB020")

    for target in ship_targets:
        tx, ty = target["x"], target["y"]
        lbl = target.get("label", "TARGET")
        col = target.get("color", "#00E5FF")
        draw.rectangle([tx - 10, ty - 10, tx + 10, ty + 10], outline=col, width=2)
        draw.text((tx + 14, ty - 7), lbl, fill=col)

    # Scale bar
    draw.line([40, 560, 140, 560], fill="#FFFFFF", width=3)
    draw.text((40, 542), "5 km (Scale: 10m/px)", fill="#FFFFFF")

    # Metadata Header & Footer
    draw.rectangle([0, 0, width, 24], fill=(13, 23, 38, 220))
    draw.text((10, 5), title_header, fill="#A7B0BA")
    
    draw.rectangle([0, height - 22, width, height], fill=(13, 23, 38, 220))
    draw.text((10, height - 17), title_footer, fill="#10B981" if has_spill else "#94A3B8")

    composite.convert("RGB").save(os.path.join(output_dir, f"{prefix}_composite.png"))

    # GeoTIFF raster
    tif_16 = (sar_intensity * 30000).astype(np.uint16)
    tif_img = Image.fromarray(tif_16)
    tif_img.save(os.path.join(output_dir, f"{prefix}.tif"))


def generate_mock_satellite_scenes(output_dir: str = "./data/satellite_scenes"):
    """
    Generates realistic Sentinel-1 C-band Synthetic Aperture Radar (SAR) imagery
    for all 4 real geographic scenes in the platform.
    """
    os.makedirs(output_dir, exist_ok=True)

    # Scene 1: Goa Offshore (Demo spill)
    _render_sar_scene(
        prefix="S1A_IW_GRDH_1SDV_20240315T060000",
        output_dir=output_dir,
        title_header="SENTINEL-1A SAR • C-BAND IW VV+VH • PASS: DESCENDING • ACQ: 2024-03-15 06:00:00 UTC",
        title_footer="CRS: EPSG:4326 • REGION: GOA OFFSHORE • CLASS: CRUDE OIL SLICK (CONF: 94.2%)",
        coords_text="15.42°N, 72.68°E",
        cx=420,
        cy=310,
        angle_deg=38.4,
        major_axis=4.2,
        minor_axis=1.2,
        ship_targets=[
            {"x": 280, "y": 220, "label": "TARGET 1: MT GULF PHOENIX (AIS)", "color": "#EF4444", "boost": 2.8},
            {"x": 650, "y": 140, "label": "COMMERCIAL CARGO", "color": "#00E5FF", "boost": 2.0},
        ],
        has_spill=True,
        seed=26143,
        spill_label="SLICK CENTROID",
        class_label="CRUDE OIL SLICK",
        conf_pct=94.2
    )

    # Scene 2: Mumbai High (Clean baseline)
    _render_sar_scene(
        prefix="S1B_IW_GRDH_1SDV_20240310T053000",
        output_dir=output_dir,
        title_header="SENTINEL-1B SAR • C-BAND IW VV+VH • PASS: ASCENDING • ACQ: 2024-03-10 05:30:00 UTC",
        title_footer="CRS: EPSG:4326 • REGION: MUMBAI HIGH • STATUS: NO ANOMALY DETECTED (CLEAN SEA)",
        coords_text="19.10°N, 71.95°E",
        cx=400,
        cy=300,
        angle_deg=0.0,
        major_axis=1.0,
        minor_axis=1.0,
        ship_targets=[
            {"x": 310, "y": 240, "label": "OFFSHORE RIG PLATFORM A", "color": "#94A3B8", "boost": 3.2},
            {"x": 530, "y": 370, "label": "SUPPLY TENDER VESSEL", "color": "#00E5FF", "boost": 2.2},
        ],
        has_spill=False,
        seed=48192,
        spill_label="BASELINE STATION",
        class_label="CLEAN OCEAN WATER",
        conf_pct=2.1
    )

    # Scene 3: Gulf of Kutch (Tanker Fairway)
    _render_sar_scene(
        prefix="S1A_IW_GRDH_1SDV_20240318T054500",
        output_dir=output_dir,
        title_header="SENTINEL-1A SAR • C-BAND IW VV+VH • PASS: DESCENDING • ACQ: 2024-03-18 05:45:00 UTC",
        title_footer="CRS: EPSG:4326 • REGION: GULF OF KUTCH • CLASS: BUNKER HEAVY FUEL OIL (CONF: 91.8%)",
        coords_text="22.45°N, 69.30°E",
        cx=380,
        cy=270,
        angle_deg=62.0,
        major_axis=5.1,
        minor_axis=1.8,
        ship_targets=[
            {"x": 220, "y": 180, "label": "VLCC AL-MARWAH (ANCHORED)", "color": "#F59E0B", "boost": 3.0},
            {"x": 580, "y": 420, "label": "KUTCH PILOT CUTTER", "color": "#00E5FF", "boost": 1.9},
        ],
        has_spill=True,
        seed=10924,
        spill_label="KUTCH FAIRWAY SLICK",
        class_label="HEAVY FUEL OIL",
        conf_pct=91.8
    )

    # Scene 4: Lakshadweep Sea Passage
    _render_sar_scene(
        prefix="S1C_IW_GRDH_1SDV_20240322T061500",
        output_dir=output_dir,
        title_header="SENTINEL-1C SAR • C-BAND IW VV+VH • PASS: ASCENDING • ACQ: 2024-03-22 06:15:00 UTC",
        title_footer="CRS: EPSG:4326 • REGION: LAKSHADWEEP SEA • CLASS: CRUDE OIL SHEEN / SLICK (CONF: 88.5%)",
        coords_text="10.80°N, 72.45°E",
        cx=450,
        cy=330,
        angle_deg=115.0,
        major_axis=4.8,
        minor_axis=1.4,
        ship_targets=[
            {"x": 340, "y": 260, "label": "REEFER CARRIER PACIFIC", "color": "#00E5FF", "boost": 2.4},
            {"x": 610, "y": 390, "label": "COASTAL TANKER SURYA", "color": "#EF4444", "boost": 2.7},
        ],
        has_spill=True,
        seed=77123,
        spill_label="PASSAGE DRIFT SLICK",
        class_label="CRUDE OIL SHEEN",
        conf_pct=88.5
    )

    print(f"[SCENE GENERATOR] Generated 4 distinct real satellite scenes at {output_dir}")

if __name__ == "__main__":
    generate_mock_satellite_scenes()
