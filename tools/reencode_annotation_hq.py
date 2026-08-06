#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Re-encode the annotation-demo clips at visually transparent quality.

build_annotation_cases.py cut them at CRF 22, the same setting as the case previews. That
is fine for a 260 px card but the annotation panel shows the video ~600 px wide, and the
sources are HEVC at ~4.4 Mb/s: transcoding to H.264 at CRF 22 costs roughly 3% of the
frame's high-frequency energy (mean |gradient| 7.61 vs the source's 7.82 on ann-01), which
is exactly the softness that shows up on foliage and distant signage.

CRF 17 lands at 7.80 - within 0.3% of the source - for about twice the bytes. Stream copy
would be free and lossless but the masters are HEVC, which Chrome and Firefox will not
play in MP4, so a re-encode is unavoidable; the only question is how much of it to keep.

Only the selected tab's video is ever fetched (script.js swaps video.src), so the cost is
~14 MB per tab switch rather than the whole set.

  python tools/reencode_annotation_hq.py
"""
import csv, json, os, shutil, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_annotation_cases import FF, MANIFEST, SECONDS, START, duration_of, resolve

WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRF, PRESET = "17", "slow"
TMP = "/tmp/ann-hq"


def main():
    man = {r["clip_name"]: r for r in csv.DictReader(open(MANIFEST))}
    cases = json.load(open(f"{WEB}/assets/data/annotation_cases.json"))
    os.makedirs(TMP, exist_ok=True)
    before = after = 0
    for key, item in cases.items():
        src = resolve(man[item["clip"]])
        if not src:
            print(f"  {key}: source missing", flush=True)
            continue
        dst, poster = f"{WEB}/{item['video']}", f"{WEB}/{item['poster']}"
        # Same cut as the original build, so the payload's timings still line up.
        start = min(START, max(0.0, duration_of(src) - SECONDS))
        tmp = f"{TMP}/{key}.mp4"
        cmd = [FF, "-nostdin", "-loglevel", "error", "-y", "-ss", str(start), "-i", src,
               "-t", str(SECONDS), "-an", "-c:v", "libx264", "-crf", CRF, "-preset", PRESET,
               "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", "48",
               "-movflags", "+faststart", tmp]
        if subprocess.run(cmd, capture_output=True, text=True).returncode != 0:
            print(f"  {key}: encode failed", flush=True)
            continue
        old = os.path.getsize(dst) if os.path.exists(dst) else 0
        shutil.move(tmp, dst)                      # /tmp and the repo are different devices
        subprocess.run([FF, "-nostdin", "-loglevel", "error", "-y", "-ss", str(start),
                        "-i", src, "-frames:v", "1", "-q:v", "2", poster],
                       capture_output=True, text=True)
        before, after = before + old, after + os.path.getsize(dst)
        print(f"  {key}  {old/1e6:5.1f} -> {os.path.getsize(dst)/1e6:5.1f} MB", flush=True)
    print(f"total {before/1e6:.0f} -> {after/1e6:.0f} MB", flush=True)
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    main()
