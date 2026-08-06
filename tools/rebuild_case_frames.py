#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Re-extract the caption-case frame strip from the source videos.

build_caption_case_explorer.py did not decode video at all: `crop_figure_frames` cut the
six thumbnails out of the rendered case-study figure, so each one carried a sliver of the
figure's own caption text along its top edge and had already been through the figure's
rasterisation. The timestamps were right, the pixels were second-hand.

This decodes the same `frame_times` straight from the clip, at 1280x720 (the source
resolution for perspective clips) and 1600x800 for equirectangular panoramas, and writes
WEBP at quality 90 - the strip is displayed three or six across, so the old 480x270 was
already soft on a 2x screen.

Panoramic masters live in object storage and ffmpeg segfaults on HTTPS here, so those five
cases reuse the sparse-file trick from rebuild_panoramic_hq.py: fetch only the moov tail
plus a head slice, then decode locally.

  python tools/rebuild_case_frames.py            # every case that resolves locally
  python tools/rebuild_case_frames.py --pano     # include the panoramic ones (slow)
"""
import argparse, csv, json, os, re, subprocess, sys

FF = "/mnt/workspace/hk/miniconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = "/mnt/workspace/shared/datasets/world_model/Video/"
MANIFEST = "/mnt/workspace/hk/Acamedic/Sekai2/statistic/sekai_all_final_merged.csv"
OUT = f"{WEB}/assets/images/caption-cases"
W_PERSP, W_PANO, QUALITY = 1280, 1600, "90"

_man = None


def manifest():
    global _man
    if _man is None:
        _man = {r["clip_name"]: r for r in csv.DictReader(open(MANIFEST))}
    return _man


def resolve(clip):
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


def grab(src, seconds, dst, width):
    r = subprocess.run([FF, "-nostdin", "-loglevel", "error", "-y", "-ss", str(seconds),
                        "-i", src, "-frames:v", "1",
                        "-vf", f"scale={width}:-2:flags=lanczos",
                        "-c:v", "libwebp", "-quality", QUALITY, dst],
                       capture_output=True, text=True)
    return r.returncode == 0 and os.path.exists(dst) and os.path.getsize(dst) > 2000


def pano_source(clip):
    """Materialise a panoramic master as a sparse local file (see rebuild_panoramic_hq)."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from rebuild_panoramic_hq import signed_url, remote_size, fetch_range, duration_of
    cap = manifest()[clip].get("caption_path")
    rel = json.load(open(cap))["video_path"]
    # NOTE: the caller must delete this when done. Keeping them cached filled a 30 GB /tmp
    # after four masters (37.5 GB of head slices) and the fifth case died on ENOSPC.
    local = f"/tmp/case-{re.sub(r'[^A-Za-z0-9]', '_', clip)}.sparse.mp4"
    if os.path.exists(local) and os.path.getsize(local) > 0:
        return local
    url = signed_url(rel)
    size = remote_size(url)
    with open(local, "wb") as f:
        f.truncate(size)
    STUB = 8 << 20
    fetch_range(url, 0, STUB - 1, local, 0)
    fetch_range(url, size - (192 << 20), size - 1, local, size - (192 << 20))
    dur = duration_of(local)
    if not dur:
        return None
    head = min(size, int(size * 130 / dur * 1.8) + (64 << 20))     # frames run to t=117 s
    print(f"    master {size/1e9:.1f} GB, {dur/60:.1f} min -> head {head/1e9:.2f} GB", flush=True)
    if head > STUB:
        fetch_range(url, STUB, head - 1, local, STUB)
    return local


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pano", action="store_true", help="also rebuild the panoramic cases")
    a = ap.parse_args()
    data = json.load(open(f"{WEB}/assets/data/caption_cases.json"))
    cases = data if isinstance(data, list) else list(data.values())
    os.makedirs(OUT, exist_ok=True)
    ok = skipped = failed = 0
    for c in cases:
        pano = c["dataset"] == "panoramic"
        if pano and not a.pano:
            skipped += 1
            continue
        src = resolve(c["clip"])
        if not src and pano:
            print(f"== case {c['id']} (panoramic): fetching master", flush=True)
            src = pano_source(c["clip"])
        if not src:
            print(f"  case {c['id']}: no source", flush=True)
            failed += 1
            continue
        width = W_PANO if pano else W_PERSP
        for path, t in zip(c["frames"], c["frame_times"]):
            dst = f"{WEB}/{path}"
            if grab(src, t, dst, width):
                ok += 1
            else:
                print(f"  case {c['id']} t={t}s FAILED", flush=True)
                failed += 1
        print(f"  case {c['id']} done ({c['dataset']})", flush=True)
        if pano and src and src.startswith("/tmp/") and os.path.exists(src):
            os.remove(src)          # a sparse master is 4-6 GB; do not accumulate them
    print(f"frames written: {ok} | failed: {failed} | cases skipped: {skipped}", flush=True)


if __name__ == "__main__":
    main()
