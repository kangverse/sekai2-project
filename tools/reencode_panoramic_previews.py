#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Re-encode the panoramic equirectangular previews at a watchable frame rate.

The originals were written at fps=2 (960x480), which is why they looked frozen /
stuttering rather than merely low-res. Re-cut the same 15 s windows at 24 fps,
1280x640 (native 2:1), streaming straight from OSS via a presigned URL.
"""
import json, os, subprocess, sys

FF = "/mnt/workspace/hk/miniconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
WEB = "/mnt/workspace/hk/Acamedic/Sekai2/sekai2_website"
OSS_PREFIX = "oss://mogentest/yongtao/molardata/sekai2/insta360"
OSS_CONFIG = "/mnt/workspace/hk/scripts/.ossutil_dsw.conf"

SPECS = {   # key: (oss relative video path, preview start seconds)
    "panorama-serpentine": ("20260410/蛇形/lei/杭州-学校-蛇形-012.mp4", 45.0),
    "panorama-switchback": ("20260410/蛇形/clx/杭州-宿舍园区-蛇形.mp4", 15.0),
    "panorama-meander":    ("20260408/蛇形/syw/杭州-商场-蛇形-syw-02.mp4", 15.0),
}
SECONDS, W, H, FPS = 15, 1280, 640, 24

def signed_url(key):
    cmd = ["ossutil", "-c", OSS_CONFIG, "-e", "oss-ap-southeast-1.aliyuncs.com",
           "--region", "ap-southeast-1", "presign", f"{OSS_PREFIX}/{key}",
           "--expires-duration", "3h"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"presign failed: {r.stderr[:300]}")
    for line in r.stdout.splitlines():
        if line.strip().startswith("http"): return line.strip()
    raise RuntimeError(f"no url in output: {r.stdout[:300]}")

def main():
    for key, (rel, start) in SPECS.items():
        mp4 = f"{WEB}/assets/videos/{key}.mp4"
        jpg = f"{WEB}/assets/images/{key}.jpg"
        tmp = f"/tmp/{key}.new.mp4"
        print(f"== {key}: presign", flush=True)
        url = signed_url(rel)
        cmd = [FF, "-nostdin", "-loglevel", "error", "-y",
               "-ss", str(start), "-i", url, "-t", str(SECONDS), "-an",
               "-vf", f"scale={W}:{H},fps={FPS}", "-c:v", "libx264",
               "-crf", "30", "-preset", "veryfast", "-pix_fmt", "yuv420p",
               "-movflags", "+faststart", tmp]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        if r.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) < 20000:
            print("  FAILED:", (r.stderr or "")[:400], flush=True); continue
        os.replace(tmp, mp4)
        subprocess.run([FF, "-nostdin", "-loglevel", "error", "-y", "-i", mp4,
                        "-frames:v", "1", "-q:v", "4", jpg], capture_output=True, text=True)
        probe = subprocess.run([FF, "-i", mp4], capture_output=True, text=True).stderr
        line = next((l for l in probe.splitlines() if "Stream" in l), "")
        print(f"  ok {os.path.getsize(mp4)/1e6:.2f} MB |{line.strip()[:110]}", flush=True)

if __name__ == "__main__":
    main()
