#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Repair pass: fill every country slot that failed in the first cut.

The failures were all `-ss 30` landing past the end of a short clip, so probe each
source's real duration and pick a start inside it. Also sweeps in fresh candidate
clips for countries still short of 3 previews, and deletes truncated leftovers.
"""
import csv, json, os, re, subprocess, unicodedata
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed

FF   = "/mnt/workspace/hk/miniconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
ROOT = "/mnt/workspace/shared/datasets/world_model/Video/"
WEB  = "/mnt/workspace/hk/Acamedic/Sekai2/sekai2_website"
VID, IMG = f"{WEB}/assets/videos/geo", f"{WEB}/assets/images/geo"
WANT, SECONDS, WIDTH, FPS = 3, 5, 480, 12

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")

def resolve(vr):
    if not vr or vr.startswith("oss://"): return ""
    p = vr if vr.startswith("/") else ROOT + vr
    return p if os.path.exists(p) else ""

def duration(path):
    out = subprocess.run([FF, "-i", path], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    if not m: return 0.0
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))

def cut(task):
    src, mp4, jpg = task
    dur = duration(src)
    if dur < 1.2: return (mp4, False, f"unreadable/short dur={dur}")
    length = min(SECONDS, max(1.0, dur - 0.3))
    start = 0.0 if dur <= length + 1.0 else min(max(dur * 0.2, 1.0), dur - length - 0.3)
    base = ["-nostdin", "-loglevel", "error", "-y"]
    r = subprocess.run([FF, *base, "-ss", f"{start:.2f}", "-i", src, "-t", f"{length:.2f}",
                        "-an", "-vf", f"scale={WIDTH}:-2,fps={FPS}", "-c:v", "libx264",
                        "-crf", "32", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart", mp4], capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(mp4) or os.path.getsize(mp4) < 2000:
        return (mp4, False, f"dur={dur:.1f} start={start:.1f} {(r.stderr or '')[:90]}")
    subprocess.run([FF, *base, "-ss", f"{start:.2f}", "-i", src, "-frames:v", "1",
                    "-vf", f"scale={WIDTH}:-2", "-q:v", "4", jpg], capture_output=True, text=True)
    return (mp4, True, os.path.getsize(mp4))

def meta_of(r):
    return {"motion": (r["camera_motion"] or "").replace("_", " "),
            "place": (r["city"] if r["city"] and r["city"] != "unknown" else ""),
            "scene": (r["location_type"] or "").replace("_", " "),
            "when": (r["time_of_day"] or "").replace("_", " "),
            "weather": (r["weather"] or "").replace("_", " "),
            "dataset": r["dataset"], "clip": r["clip"]}

def main():
    payload = json.load(open(f"{WEB}/assets/data/geo_countries.json"))
    rows = list(csv.DictReader(open("/tmp/clip_geo_index.csv")))
    by_country = defaultdict(list)
    for r in rows:
        if r["country_canon"] in payload and resolve(r["video_ref"]):
            by_country[r["country_canon"]].append(r)

    # scrub truncated leftovers from the first pass
    removed = 0
    for d in (VID, IMG):
        for f in os.listdir(d):
            p = os.path.join(d, f)
            if os.path.getsize(p) < 2000: os.remove(p); removed += 1
    print("removed", removed, "truncated leftovers", flush=True)

    tasks, plan = [], {}
    for country, item in payload.items():
        have = {v["clip"] for v in item["videos"]}
        need = WANT - len(item["videos"])
        if need <= 0: continue
        used_vid = {v["clip"].rsplit("_", 2)[0] for v in item["videos"]}
        used_motion = {v["motion"] for v in item["videos"]}
        cands = [r for r in by_country.get(country, []) if r["clip"] not in have]
        # prefer unseen source video and unseen motion type
        cands.sort(key=lambda r: (r["clip"].rsplit("_", 2)[0] in used_vid,
                                  (r["camera_motion"] or "").replace("_", " ") in used_motion,
                                  r["city"] in ("", "unknown")))
        s = slug(country)
        taken = {os.path.basename(v["v"]) for v in item["videos"]}
        idx, added = 1, []
        for r in cands:
            if len(added) >= need: break
            while f"{s}-{idx}.mp4" in taken: idx += 1
            mp4, jpg = f"{VID}/{s}-{idx}.mp4", f"{IMG}/{s}-{idx}.jpg"
            taken.add(f"{s}-{idx}.mp4")
            tasks.append((resolve(r["video_ref"]), mp4, jpg))
            e = meta_of(r); e["v"] = f"assets/videos/geo/{s}-{idx}.mp4"; e["p"] = f"assets/images/geo/{s}-{idx}.jpg"
            added.append(e)
        plan[country] = added
    print("repair tasks:", len(tasks), "across", len(plan), "countries", flush=True)

    ok = {}
    with ProcessPoolExecutor(max_workers=12) as ex:
        futs = [ex.submit(cut, t) for t in tasks]
        for n, f in enumerate(as_completed(futs), 1):
            mp4, good, info = f.result()
            ok[mp4] = good
            if not good: print("  still failing:", os.path.basename(mp4), info, flush=True)
            if n % 30 == 0: print(f"  {n}/{len(tasks)}", flush=True)

    for country, added in plan.items():
        for e in added:
            full = f"{WEB}/{e['v']}"
            if os.path.exists(full) and os.path.getsize(full) > 2000:
                payload[country]["videos"].append(e)
        payload[country]["local"] = bool(payload[country]["videos"])
    json.dump(payload, open(f"{WEB}/assets/data/geo_countries.json", "w"),
              ensure_ascii=False, indent=0)

    counts = [len(v["videos"]) for v in payload.values()]
    print("\ncountries:", len(payload),
          "| with footage:", sum(1 for c in counts if c),
          "| with 3:", sum(1 for c in counts if c >= 3),
          "| with 0:", sum(1 for c in counts if c == 0), flush=True)
    print("still empty:", [c for c, v in payload.items() if not v["videos"]], flush=True)
    tot = sum(os.path.getsize(f"{VID}/{f}") for f in os.listdir(VID))
    print("geo videos: %d files, %.1f MB" % (len(os.listdir(VID)), tot / 1e6), flush=True)

if __name__ == "__main__":
    main()
