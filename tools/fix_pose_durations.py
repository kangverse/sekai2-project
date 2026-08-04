#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Correct every pose3d.duration in cases.json using the real ViPE time base.

ViPE poses are computed at 30 fps (60 fps sources are decimated to 30; 30 fps
sources are kept as-is), and each npz stores contiguous frame indices, so the
trajectory's true time span is  (inds[-1] - inds[0] + 1) / 30.

The previous builder took duration from the LAST CAPTION SEGMENT's end time,
which under-reported several clips by ~3 s (e.g. 117 s for a 120.2 s trajectory)
and made the synchronized marker drift ~3 % fast. Also flags clips whose preview
window falls outside the pose coverage.
"""
import json, csv, numpy as np

POSE_FPS = 30.0
WEB = "/mnt/workspace/hk/Acamedic/Sekai2/sekai2_website"
cases = json.load(open(f"{WEB}/assets/data/cases.json"))
rows = {r["clip_name"]: r for r in csv.DictReader(
        open("/mnt/workspace/hk/Acamedic/Sekai2/statistic/sekai_all_final_merged.csv"))}

print(f"{'case':22s} {'old dur':>8s} {'new dur':>8s} {'drift':>7s}  note")
changed = 0
for key, case in cases.items():
    row = rows.get(case["clip"])
    if not row: continue
    npz = np.load(row["pose_path"])
    pose = npz["data"] if "data" in npz else npz["cam_c2w"]
    pose = np.asarray(pose, float)
    finite = np.isfinite(pose).all(axis=(1, 2))
    inds = npz["inds"] if "inds" in npz else np.arange(len(pose))
    inds = np.asarray(inds)[finite]                 # keep the same rows the builder kept
    dur = float((inds[-1] - inds[0] + 1) / POSE_FPS)
    old = case["pose3d"]["duration"]
    n = case["pose3d"]["num_frames"]
    case["pose3d"]["duration"] = round(dur, 3)
    case["pose3d"]["fps"] = round(n / dur, 6)       # resampled-stream fps
    case["pose3d"]["pose_fps"] = POSE_FPS           # source ViPE rate
    case["pose3d"]["pose_frames"] = int(len(inds))
    drift = (dur - old) / old * 100 if old else 0
    note = ""
    ps = case.get("preview_start_s", 0)
    if ps + 15 > dur + 1:
        note = f"PREVIEW OUTSIDE POSE (starts {ps}s, pose ends {dur:.1f}s)"
    if abs(drift) > 0.5:
        changed += 1; note = (note + " corrected").strip()
    print(f"{key:22s} {old:>8} {dur:>8.1f} {drift:>6.1f}%  {note}")
json.dump(cases, open(f"{WEB}/assets/data/cases.json", "w"),
          ensure_ascii=False, separators=(",", ":"))
print(f"\n{changed} durations materially corrected; cases.json rewritten")
