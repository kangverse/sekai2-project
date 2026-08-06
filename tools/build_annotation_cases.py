#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cut a fresh set of clips for the annotation demo.

The demo used to reuse clips that already appear in the explore grid, the trajectory tabs
and the caption case studies, so switching tabs showed the same handful of scenes again.
This picks clips that appear NOWHERE else on the page, one per (scene type, camera motion)
pair, and cuts each at native 1280x720 / CRF 22 with its poster.

Selection is deterministic (fixed seed, sorted candidates) and skips any clip already
referenced by cases.json, caption_cases.json or geo_countries.json. The payload carries the
four controlled attributes, the five clip-level description fields and the grounded
segments, read from the release's own caption JSON.

  python tools/build_annotation_cases.py
"""
import csv, json, os, subprocess

FF = "/mnt/workspace/hk/miniconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = "/mnt/workspace/shared/datasets/world_model/Video/"
MANIFEST = "/mnt/workspace/hk/Acamedic/Sekai2/statistic/sekai_all_final_merged.csv"
SCENE = "/mnt/workspace/hk/Acamedic/Sekai2/analysis/_shared3/perclip_scene.csv"
SECONDS, START, CRF = 15, 20.0, "22"

# (scene, motion) pairs to look for, in the order they should appear as tabs. Each is a
# regime the others do not cover, so the eight tabs span the corpus rather than one street.
WANTED = [
    ("urban_street", "walking",        "Night street"),
    ("transport_hub", "train",         "Rail platform"),
    ("mountain", "drone",              "Mountain flight"),
    ("water_body", "boat",             "On the water"),
    ("forest", "walking",              "Forest trail"),
    ("highway_road", "driving",        "Highway"),
    ("market_or_plaza", "walking",     "Market square"),
    ("indoor", "walking",              "Indoor"),
    ("park_or_recreation", "cycling",  "Park ride"),
    ("grassland", "drone",             "Open country"),
]
OV = ["subject_motion", "environment_motion", "static_scene", "camera_description", "full_prompt"]
ATTRS = ["camera_motion", "location_type", "time_of_day", "weather"]


def resolve(row):
    vr = row.get("video_ref") or ""
    if vr and not vr.startswith("oss://"):
        p = vr if vr.startswith("/") else ROOT + vr
        if os.path.exists(p):
            return p
    for base in (row["dataset"], "sekai2", "sekai2_add_static", "sekai_real_walking"):
        p = f"{ROOT}{base}/{row['video_id']}/{row['clip_name']}.mp4"
        if os.path.exists(p):
            return p
    return None


def used_clips():
    seen = set()
    for name in ("cases.json", "caption_cases.json"):
        d = json.load(open(f"{WEB}/assets/data/{name}"))
        for v in (d if isinstance(d, list) else d.values()):
            if isinstance(v, dict) and v.get("clip"):
                seen.add(v["clip"])
    geo = json.load(open(f"{WEB}/assets/data/geo_countries.json"))
    for m in geo.values():
        for v in m.get("videos", []):
            if v.get("clip"):
                seen.add(v["clip"])
    return seen


def duration_of(path):
    import re
    out = subprocess.run([FF, "-i", path], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    return 3600 * int(m.group(1)) + 60 * int(m.group(2)) + float(m.group(3)) if m else 0.0


def main():
    seen = used_clips()
    scene = {r["clip"]: r for r in csv.DictReader(open(SCENE))}
    rows = sorted(csv.DictReader(open(MANIFEST)), key=lambda r: r["clip_name"])
    by_pair = {}
    for r in rows:
        cl = r["clip_name"]
        if cl in seen:
            continue
        sc = scene.get(cl)
        if not sc:
            continue
        key = (sc["location_type"], sc["camera_motion"])
        by_pair.setdefault(key, []).append((r, sc))

    os.makedirs(f"{WEB}/assets/videos/annotation", exist_ok=True)
    os.makedirs(f"{WEB}/assets/images/annotation", exist_ok=True)
    payload, idx = {}, 0
    for want_scene, want_motion, label in WANTED:
        picked = None
        for r, sc in by_pair.get((want_scene, want_motion), []):
            src = resolve(r)
            if not src:
                continue
            try:
                cap = json.load(open(r["caption_path"]))
            except Exception:
                continue
            segs = cap.get("segments") or []
            ov = cap.get("overall") or {}
            if len(segs) < 4 or not all(ov.get(f) for f in OV):
                continue
            picked = (r, sc, src, cap, segs, ov)
            break
        if not picked:
            print(f"  no unused clip for {want_scene}/{want_motion}", flush=True)
            continue
        r, sc, src, cap, segs, ov = picked
        idx += 1
        key = f"ann-{idx:02d}"
        mp4, jpg = f"assets/videos/annotation/{key}.mp4", f"assets/images/annotation/{key}.jpg"
        dur = duration_of(src)
        start = min(START, max(0.0, dur - SECONDS))
        cmd = [FF, "-nostdin", "-loglevel", "error", "-y", "-ss", str(start), "-i", src,
               "-t", str(SECONDS), "-an", "-c:v", "libx264", "-crf", CRF, "-preset", "slow",
               "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", "48",
               "-movflags", "+faststart", f"{WEB}/{mp4}"]
        if subprocess.run(cmd, capture_output=True, text=True).returncode != 0:
            print(f"  encode failed for {key}", flush=True)
            idx -= 1
            continue
        subprocess.run([FF, "-nostdin", "-loglevel", "error", "-y", "-ss", str(start), "-i", src,
                        "-frames:v", "1", "-q:v", "3", f"{WEB}/{jpg}"], capture_output=True, text=True)
        payload[key] = {
            "label": label, "clip": r["clip_name"], "dataset": r["dataset"],
            "video": mp4, "poster": jpg, "duration": round(dur, 1),
            "attributes": {a: (cap.get("overall", {}).get(a) or sc.get(a) or "") for a in ATTRS},
            "overall": {f: ov[f] for f in OV},
            "segments": [{"time": s.get("time_range_s"),
                          "text": s.get("short_prompt") or s.get("full_prompt", ""),
                          "path": s.get("camera_path", "")} for s in segs],
        }
        print(f"  {key}  {label:16s} {want_scene}/{want_motion}  {len(segs)} segments  "
              f"{os.path.getsize(f'{WEB}/{mp4}')/1e6:.1f} MB", flush=True)

    out = f"{WEB}/assets/data/annotation_cases.json"
    json.dump(payload, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"-> {out} ({len(payload)} cases, {os.path.getsize(out)/1e3:.0f} KB)", flush=True)


if __name__ == "__main__":
    main()
