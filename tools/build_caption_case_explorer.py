#!/usr/bin/env python3
"""Build component-level web data for all 20 trajectory caption cases."""

import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ANALYSIS = Path("/mnt/workspace/hk/Acamedic/Sekai2/analysis/59_diverse_trajectory_cases")
SELECTION = ANALYSIS / "results/selected_cases.csv"
MANIFEST = Path("/mnt/workspace/hk/Acamedic/Sekai2/statistic/sekai_all_final_merged.csv")
FRAME_OUT = ROOT / "assets/images/caption-cases"
DATA_OUT = ROOT / "assets/data/caption_cases.json"
COLORS = ["#315B7D", "#438C8C", "#6DAA72", "#D49A45", "#C7674F", "#7C5AA6"]


def crop_figure_frames(case_id: str, shape: str):
    slug = shape.replace(" ", "-").replace("--", "-")
    source = ANALYSIS / "figures" / f"case-{case_id}-{slug}.png"
    image = Image.open(source).convert("RGB")
    width = image.width
    # The source renderer uses a stable 12-column frame row. Crop only the
    # decoded RGB interiors; timestamps, borders, plots, and PDF layout are excluded.
    x_starts = [0.044, 0.205, 0.368, 0.531, 0.694, 0.857]
    y0, frame_w = 0.062, 0.135
    frame_h = frame_w * width * 9 / 16 / image.height
    outputs = []
    for index, x0 in enumerate(x_starts):
        crop = image.crop((round(x0 * width), round(y0 * image.height),
                           round((x0 + frame_w) * width), round((y0 + frame_h) * image.height)))
        crop = crop.resize((480, 270), Image.Resampling.LANCZOS)
        target = FRAME_OUT / f"case-{case_id}-frame-{index + 1}.webp"
        crop.save(target, "WEBP", quality=84, method=6)
        outputs.append(f"assets/images/caption-cases/{target.name}")
    return outputs


def main():
    FRAME_OUT.mkdir(parents=True, exist_ok=True)
    selections = list(csv.DictReader(SELECTION.open()))
    manifest = {row["clip_name"]: row for row in csv.DictReader(MANIFEST.open())}
    cases = []
    for case in selections:
        row = manifest[case["clip"]]
        annotation = json.loads(Path(row["caption_path"]).read_text(encoding="utf-8"))
        overall, source_segments = annotation["overall"], annotation["segments"]
        source_duration = float(source_segments[-1]["time_range_s"][1])
        window_start = float(case["window_start_s"] or 0)
        duration = min(float(case["window_duration_s"] or source_duration), source_duration - window_start)
        window_end = window_start + duration
        segments = []
        for segment in source_segments:
            start, end = map(float, segment["time_range_s"])
            if end <= window_start or start >= window_end:
                continue
            segments.append({
                "time": [round(max(start, window_start) - window_start, 1),
                         round(min(end, window_end) - window_start, 1)],
                "text": segment.get("short_prompt") or segment.get("description", ""),
                "path": segment.get("camera_path", ""),
            })
        pose_npz = np.load(row["pose_path"])
        poses = pose_npz["cam_c2w"] if "cam_c2w" in pose_npz else pose_npz["data"]
        begin = int(window_start / source_duration * len(poses))
        finish = int(window_end / source_duration * len(poses))
        xyz = np.asarray(poses[begin:max(begin + 2, finish), :3, 3], float)
        xyz = xyz[np.isfinite(xyz).all(1)]
        xyz -= xyz[0]
        xyz = xyz[np.linspace(0, len(xyz) - 1, min(260, len(xyz))).astype(int)]
        xz = xyz[:, [0, 2]]
        low, span = xz.min(0), np.ptp(xz, axis=0)
        scale = max(float(span.max()), 1e-8)
        normalized = (xz - low) / scale
        normalized[:, 1] = 1 - normalized[:, 1]
        sample_times = np.linspace(max(2, duration * .025), duration - max(2, duration * .025), 6)
        cases.append({
            "id": case["case_id"], "dataset": case["dataset"], "shape": case["shape"],
            "clip": case["clip"], "duration": duration,
            "frames": crop_figure_frames(case["case_id"], case["shape"]),
            "frame_times": np.rint(sample_times).astype(int).tolist(),
            "trajectory": np.round(normalized, 5).tolist(),
            "attributes": {key: overall.get(key, "") for key in
                           ("camera_motion", "location_type", "weather", "camera_perspective")},
            "overall": {key: overall.get(key, "") for key in
                        ("subject_motion", "environment_motion", "static_scene",
                         "camera_description", "full_prompt")},
            "segments": segments,
            "colors": COLORS[:len(segments)],
        })
    DATA_OUT.write_text(json.dumps(cases, ensure_ascii=False), encoding="utf-8")
    print(f"Built {len(cases)} HTML caption cases and {len(cases) * 6} frame assets")


if __name__ == "__main__":
    main()
