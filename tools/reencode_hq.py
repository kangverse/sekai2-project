#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Re-encode every site video at high quality, from the original sources.

The first build traded far too much quality for size: case previews were written at
640x360 / 15 fps / CRF 30 and the per-country map previews at 480x270 / 12 fps / CRF 32,
from sources that are natively 1280x720 / 30 fps at ~4 Mb/s. CRF 30-32 is well past the
point where H.264 stops being visually transparent, so the loss was in the encode, not in
the resolution alone; nothing can be recovered by re-compressing the published files, and
every asset therefore has to be cut again from its source.

  case previews   native 1280x720 / native fps / CRF 22
  map previews    640x360 / 24 fps / CRF 21

The two ladders differ because the display sizes do. Case previews fill a card and a modal,
so they keep the source resolution. Map previews live in a 250-304 px popup that shows two
or three of them side by side, i.e. about 140 px each; encoding those at 720p produced
2.2 MB thumbnails (621 MB in total) for no visible gain. Their old softness came from CRF
32 at ~110 kb/s, not from the 480 px width, so the fix is bitrate: 640x360 at CRF 21 is
roughly eight times the old bitrate and visually transparent at the size shown; CRF 21 was
tried first and cost 276 MB against 165 MB for no difference visible at 140 px.

Sources are resolved by clip name through the release manifest, so the same clip that the
site already advertises is the one re-cut; start offsets are read from the existing
payloads (cases.json carries `preview_start_s`, the map previews use the 12 s / 30 s rule
of build_geo_country_previews.py) so the new file shows the same moment as the old one.
Panoramic previews are skipped: their 8K masters live in object storage, not on disk.

  python tools/reencode_hq.py --what cases
  python tools/reencode_hq.py --what geo --workers 12
"""
import argparse, csv, json, os, re, subprocess, sys
from concurrent.futures import ProcessPoolExecutor, as_completed

FF = "/mnt/workspace/hk/miniconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
ROOT = "/mnt/workspace/shared/datasets/world_model/Video/"
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = "/mnt/workspace/hk/Acamedic/Sekai2/statistic/sekai_all_final_merged.csv"

CASE = dict(width=None, fps=None, crf="22", preset="slow")   # None = keep the source's
GEO  = dict(width=640, fps=24, crf="24", preset="slow")

_man = None


def manifest():
    global _man
    if _man is None:
        _man = {r["clip_name"]: r for r in csv.DictReader(open(MANIFEST))}
    return _man


def resolve(clip):
    """Local path of a clip's source video, or None when it only exists in object storage."""
    r = manifest().get(clip)
    if not r:
        return None
    vr = r.get("video_ref") or ""
    if vr and not vr.startswith("oss://"):
        p = vr if vr.startswith("/") else ROOT + vr
        if os.path.exists(p):
            return p
    for base in (r["dataset"], "sekai2", "sekai2_add_static", "sekai_real_walking"):
        p = f"{ROOT}{base}/{r['video_id']}/{clip}.mp4"
        if os.path.exists(p):
            return p
    return None


def probe(path):
    out = subprocess.run([FF, "-i", path], capture_output=True, text=True).stderr
    d = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    s = re.search(r", (\d+)x(\d+)", out)
    f = re.search(r", ([\d.]+) (?:fps|tbr)", out)
    return (float(d.group(3)) + 60 * int(d.group(2)) + 3600 * int(d.group(1)) if d else 0.0,
            (int(s.group(1)), int(s.group(2))) if s else (0, 0),
            float(f.group(1)) if f else 0.0)


def encode(job):
    src, dst, poster, start, seconds, prof = job
    # Some static-supplement clips are shorter than the nominal 30 s cut point, and seeking
    # past the end silently produces an empty file (the first build shipped a few of these).
    dur = probe(src)[0]
    if dur and start + seconds > dur:
        start = max(0.0, dur - seconds)
    vf = []
    if prof["width"]:
        vf.append(f"scale={prof['width']}:-2:flags=lanczos")
    if prof["fps"]:
        vf.append(f"fps={prof['fps']}")
    common = ["-nostdin", "-loglevel", "error", "-y"]
    cmd = [FF, *common, "-ss", str(start), "-i", src, "-t", str(seconds), "-an"]
    if vf:
        cmd += ["-vf", ",".join(vf)]
    cmd += ["-c:v", "libx264", "-crf", prof["crf"], "-preset", prof["preset"],
            "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", "48",
            "-movflags", "+faststart", dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(dst) or os.path.getsize(dst) < 4000:
        return (dst, False, (r.stderr or "")[:160])
    if poster:                                    # keep the poster in step with the video
        pf = ["-vf", ",".join(vf + ["scale=iw:ih"])] if vf else []
        subprocess.run([FF, *common, "-ss", str(start), "-i", src, "-frames:v", "1",
                        *pf, "-q:v", "3", poster], capture_output=True, text=True)
    return (dst, True, os.path.getsize(dst))


def jobs_cases():
    cases = json.load(open(f"{WEB}/assets/data/cases.json"))
    out, skipped = [], []
    for name, c in cases.items():
        src = resolve(c["clip"])
        dst = f"{WEB}/{c['video']}"
        if not src:
            skipped.append((name, c["clip"]))
            continue
        seconds = probe(dst)[0] or 15.0            # preserve the published duration
        out.append((src, dst, f"{WEB}/{c['poster']}", float(c.get("preview_start_s", 0)),
                    round(seconds, 3), CASE))
    for n, cl in skipped:
        print(f"  skip {n}: source not on disk ({cl})", flush=True)
    return out


def jobs_geo():
    geo = json.load(open(f"{WEB}/assets/data/geo_countries.json"))
    out = []
    for country, meta in geo.items():
        for v in meta.get("videos", []):
            clip = v.get("clip")
            if not clip:
                continue
            src = resolve(clip)
            if not src:
                print(f"  skip {v['v']}: no local source", flush=True)
                continue
            # same rule as build_geo_country_previews.py, so the cut point is unchanged
            start = 12 if v.get("dataset") == "sekai1" else 30
            out.append((src, f"{WEB}/{v['v']}", f"{WEB}/{v['p']}", start, 5, GEO))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--what", choices=("cases", "geo", "all"), default="all")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--repair", action="store_true",
                    help="only redo outputs that are missing or implausibly small")
    a = ap.parse_args()
    jobs = []
    if a.what in ("cases", "all"):
        jobs += jobs_cases()
    if a.what in ("geo", "all"):
        jobs += jobs_geo()
    if a.repair:
        jobs = [j for j in jobs
                if not os.path.exists(j[1]) or os.path.getsize(j[1]) < 20000]
        print(f"repair mode: {len(jobs)} outputs missing or too small", flush=True)
    before = sum(os.path.getsize(j[1]) for j in jobs if os.path.exists(j[1]))
    print(f"re-encoding {len(jobs)} files ({before/1e6:.1f} MB today)", flush=True)
    ok = fail = 0
    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        futs = [ex.submit(encode, j) for j in jobs]
        for n, f in enumerate(as_completed(futs), 1):
            dst, good, info = f.result()
            ok, fail = (ok + 1, fail) if good else (ok, fail + 1)
            if not good:
                print("  FAIL", os.path.basename(dst), info, flush=True)
            if n % 25 == 0:
                print(f"  {n}/{len(jobs)}", flush=True)
    after = sum(os.path.getsize(j[1]) for j in jobs if os.path.exists(j[1]))
    print(f"done: {ok} ok, {fail} failed | {before/1e6:.1f} MB -> {after/1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    main()
