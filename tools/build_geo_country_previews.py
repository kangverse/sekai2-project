#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cut small, genuine per-country demo previews for the interactive coverage map.

For every interactive country on the map, pick up to 3 clips actually recorded
there (diverse camera_motion / source video / city), then cut a 5 s low-bitrate
preview + poster. Writes assets/videos/geo/*.mp4, assets/images/geo/*.jpg and a
geo_countries.json payload carrying the real per-clip metadata.
"""
import csv, json, os, re, subprocess, sys, unicodedata
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed

FF   = "/mnt/workspace/hk/miniconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
ROOT = "/mnt/workspace/shared/datasets/world_model/Video/"
WEB  = "/mnt/workspace/hk/Acamedic/Sekai2/sekai2_website"
VID  = f"{WEB}/assets/videos/geo"
IMG  = f"{WEB}/assets/images/geo"
IDX  = "/tmp/clip_geo_index.csv"
PER_COUNTRY = 3
SECONDS = 5
WIDTH   = 480
FPS     = 12

os.makedirs(VID, exist_ok=True); os.makedirs(IMG, exist_ok=True)

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")

def resolve(vr):
    if not vr or vr.startswith("oss://"): return ""
    p = vr if vr.startswith("/") else ROOT + vr
    return p if os.path.exists(p) else ""

def video_id(clip):
    return clip.rsplit("_", 2)[0] if clip.count("_") >= 2 else clip

def pick(rows):
    """Diverse pick: distinct camera_motion first, then distinct source video."""
    out, seen_motion, seen_vid = [], set(), set()
    rows = sorted(rows, key=lambda r: (r["camera_motion"] == "", r["city"] in ("", "unknown")))
    for want_new_motion in (True, False):
        for r in rows:
            if len(out) >= PER_COUNTRY: return out
            m, v = r["camera_motion"], video_id(r["clip"])
            if want_new_motion and m in seen_motion: continue
            if v in seen_vid: continue
            out.append(r); seen_motion.add(m); seen_vid.add(v)
    for r in rows:                                    # last resort: allow same video
        if len(out) >= PER_COUNTRY: break
        if r not in out: out.append(r)
    return out

def cut(task):
    src, mp4, jpg, start = task
    common = ["-nostdin", "-loglevel", "error", "-y"]
    v = subprocess.run([FF, *common, "-ss", str(start), "-i", src, "-t", str(SECONDS),
                        "-an", "-vf", f"scale={WIDTH}:-2,fps={FPS}", "-c:v", "libx264",
                        "-crf", "32", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart", mp4], capture_output=True, text=True)
    if v.returncode != 0 or not os.path.exists(mp4) or os.path.getsize(mp4) < 2000:
        return (mp4, False, (v.stderr or "")[:120])
    subprocess.run([FF, *common, "-ss", str(start), "-i", src, "-frames:v", "1",
                    "-vf", f"scale={WIDTH}:-2", "-q:v", "4", jpg],
                   capture_output=True, text=True)
    return (mp4, True, os.path.getsize(mp4))

def main():
    geo = json.load(open(f"{WEB}/assets/data/geo_countries.json"))
    rows = list(csv.DictReader(open(IDX)))
    by_country = defaultdict(list)
    for r in rows:
        c = r["country_canon"]
        if c in geo and resolve(r["video_ref"]):
            by_country[c].append(r)

    tasks, payload = [], {}
    for country, meta in geo.items():
        cands = by_country.get(country, [])
        chosen = pick(cands) if cands else []
        vids = []
        for i, r in enumerate(chosen, 1):
            s = slug(country)
            mp4, jpg = f"{VID}/{s}-{i}.mp4", f"{IMG}/{s}-{i}.jpg"
            src = resolve(r["video_ref"])
            tasks.append((src, mp4, jpg, 12 if r["dataset"] == "sekai1" else 30))
            vids.append({"v": f"assets/videos/geo/{s}-{i}.mp4",
                         "p": f"assets/images/geo/{s}-{i}.jpg",
                         "motion": (r["camera_motion"] or "").replace("_", " "),
                         "place": (r["city"] if r["city"] and r["city"] != "unknown" else ""),
                         "scene": (r["location_type"] or "").replace("_", " "),
                         "when": (r["time_of_day"] or "").replace("_", " "),
                         "weather": (r["weather"] or "").replace("_", " "),
                         "dataset": r["dataset"], "clip": r["clip"]})
        payload[country] = {"clips": meta["clips"], "share": meta["share"],
                            "continent": meta["continent"], "videos": vids,
                            "local": bool(vids)}
    print("countries:", len(payload), "| with real local footage:",
          sum(1 for v in payload.values() if v["videos"]),
          "| previews to cut:", len(tasks), flush=True)

    ok = fail = 0
    with ProcessPoolExecutor(max_workers=12) as ex:
        futs = [ex.submit(cut, t) for t in tasks]
        for n, f in enumerate(as_completed(futs), 1):
            mp4, good, info = f.result()
            ok, fail = (ok + 1, fail) if good else (ok, fail + 1)
            if not good: print("  FAIL", os.path.basename(mp4), info, flush=True)
            if n % 40 == 0: print(f"  cut {n}/{len(tasks)}", flush=True)
    print("cut ok:", ok, "failed:", fail, flush=True)

    # drop entries whose file did not materialise
    for c, v in payload.items():
        v["videos"] = [x for x in v["videos"]
                       if os.path.exists(f"{WEB}/{x['v']}") and os.path.getsize(f"{WEB}/{x['v']}") > 2000]
        v["local"] = bool(v["videos"])
    json.dump(payload, open(f"{WEB}/assets/data/geo_countries.json", "w"),
              ensure_ascii=False, indent=0)
    have = sum(1 for v in payload.values() if v["videos"])
    print(f"payload written: {have}/{len(payload)} countries have real footage", flush=True)
    missing = [c for c, v in payload.items() if not v["videos"]]
    print("no footage:", missing, flush=True)
    tot = sum(os.path.getsize(f"{VID}/{f}") for f in os.listdir(VID))
    print("geo video bytes: %.1f MB" % (tot / 1e6), flush=True)

if __name__ == "__main__":
    main()
