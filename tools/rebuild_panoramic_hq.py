#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Re-cut the three panoramic previews at the highest resolution the page can use.

Two constraints shape this script:

  * ffmpeg segfaults on HTTPS in this environment (exit 139, empty stderr), so the masters
    cannot be seeked over the network the way the earlier build did.
  * The masters are 3.6-11.3 GB 8K equirectangular files whose `moov` index sits at the END
    (box order is ftyp/free/mdat), so a partial head download is not a valid MP4, and
    fetching all three in full would move 25.7 GB at the ~6 MB/s this link sustains.

Each master is therefore materialised as a SPARSE local file of the true length, into which
only two ranges are fetched with curl: the tail carrying `moov`, and a head slice large
enough to contain the window. ffmpeg reads the index, seeks to sample offsets that fall
inside the head slice, and never touches the unwritten middle -- roughly 1.3 GB of transfer
per file instead of 11 GB.

Target 2560x1280: the panoramic pane is at most ~1200 CSS px wide, so this covers a 2x
display and anything beyond it is invisible. Equirectangular frames are detail-dense, which
is where the bitrate goes.

Supersedes reencode_panoramic_previews.py (1280x640 / CRF 30, streamed over HTTPS).
"""
import os, re, shutil, subprocess, sys

FF = "/mnt/workspace/hk/miniconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OSS_PREFIX = "oss://mogentest/yongtao/molardata/sekai2/insta360"
OSS_CONFIG = "/mnt/workspace/hk/scripts/.ossutil_dsw.conf"
SCRATCH = "/tmp"

SPECS = {   # key: (oss relative path, start seconds)  -- the windows the site already shows
    "panorama-meander":    ("20260408/蛇形/syw/杭州-商场-蛇形-syw-02.mp4", 15.0),
    "panorama-serpentine": ("20260410/蛇形/lei/杭州-学校-蛇形-012.mp4", 45.0),
    "panorama-switchback": ("20260410/蛇形/clx/杭州-宿舍园区-蛇形.mp4", 15.0),
}
SECONDS, W, H, FPS, CRF = 15, 2560, 1280, 30, "20"
TAIL = 192 * 1024 * 1024          # enough for the moov of a long 8K take
HEAD_PAD = 1.8                    # multiple of the estimated window offset to fetch


def signed_url(key):
    r = subprocess.run(["ossutil", "-c", OSS_CONFIG, "-e", "oss-ap-southeast-1.aliyuncs.com",
                        "--region", "ap-southeast-1", "presign", f"{OSS_PREFIX}/{key}",
                        "--expires-duration", "6h"], capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if line.strip().startswith("http"):
            return line.strip()
    raise RuntimeError(f"presign failed: {(r.stderr or r.stdout)[:300]}")


def remote_size(url):
    """Total length from a 1-byte ranged GET: the URL is signed for GET, so a HEAD request
    comes back 403 and its error body reads as a tiny content-length."""
    r = subprocess.run(["curl", "-s", "-r", "0-0", "-D", "-", "-o", "/dev/null", url],
                       capture_output=True, text=True)
    m = re.search(r"[Cc]ontent-[Rr]ange:\s*bytes\s+\d+-\d+/(\d+)", r.stdout)
    if not m:
        raise RuntimeError(f"no content-range in: {r.stdout[:200]}")
    return int(m.group(1))


def fetch_range(url, start, end, path, seek):
    """curl a byte range straight into `path` at `seek`, leaving the rest of it sparse."""
    with open(path, "r+b") as f:
        f.seek(seek)
        p = subprocess.Popen(["curl", "-s", "-r", f"{start}-{end}", url], stdout=subprocess.PIPE)
        while True:
            chunk = p.stdout.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
        p.wait()


def duration_of(path):
    out = subprocess.run([FF, "-i", path], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    return 3600 * int(m.group(1)) + 60 * int(m.group(2)) + float(m.group(3)) if m else 0.0


def build(key):
    rel, start = SPECS[key]
    mp4 = f"{WEB}/assets/videos/{key}.mp4"
    jpg = f"{WEB}/assets/images/{key}.jpg"
    local = f"{SCRATCH}/{key}.sparse.mp4"
    tmp = f"{SCRATCH}/{key}.hq.mp4"
    url = signed_url(rel)
    size = remote_size(url)
    print(f"== {key}: master {size/1e9:.1f} GB", flush=True)

    if os.path.exists(local):
        os.remove(local)
    with open(local, "wb") as f:                      # sparse: no blocks used yet
        f.truncate(size)
    # order matters: ffmpeg parses ftyp at offset 0 first, so a file that is still sparse
    # zeros at the front is rejected before it ever looks for moov at the end
    STUB = 8 << 20
    fetch_range(url, 0, STUB - 1, local, 0)                         # ftyp + the mdat header
    fetch_range(url, size - TAIL, size - 1, local, size - TAIL)     # the moov index
    dur = duration_of(local)
    if not dur:
        print("  FAILED: could not read the index", flush=True)
        return
    # bytes run roughly proportional to time in these captures; pad generously
    head = min(size, int(size * (start + SECONDS) / dur * HEAD_PAD) + (64 << 20))
    print(f"  duration {dur/60:.1f} min -> head slice {head/1e9:.2f} GB", flush=True)
    if head > STUB:
        fetch_range(url, STUB, head - 1, local, STUB)

    cmd = [FF, "-nostdin", "-loglevel", "error", "-y", "-ss", str(start), "-i", local,
           "-t", str(SECONDS), "-an", "-vf", f"scale={W}:{H}:flags=lanczos,fps={FPS}",
           "-c:v", "libx264", "-crf", CRF, "-preset", "slow", "-profile:v", "high",
           "-pix_fmt", "yuv420p", "-g", "60", "-movflags", "+faststart", tmp]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
    if r.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) < 50000:
        print("  FAILED:", (r.stderr or f"exit {r.returncode}")[:300], flush=True)
    else:
        shutil.move(tmp, mp4)   # /tmp and the repo are different devices
        subprocess.run([FF, "-nostdin", "-loglevel", "error", "-y", "-i", mp4,
                        "-frames:v", "1", "-q:v", "2", jpg], capture_output=True, text=True)
        probe = subprocess.run([FF, "-i", mp4], capture_output=True, text=True).stderr
        line = next((l for l in probe.splitlines() if "Stream #0:0" in l), "")
        print(f"  ok {os.path.getsize(mp4)/1e6:.1f} MB | {line.strip()[:120]}", flush=True)
    if os.path.exists(local):
        os.remove(local)


if __name__ == "__main__":
    for k in (sys.argv[1:] or list(SPECS)):
        try:
            build(k)
        except Exception as e:
            print(f"  ERROR {k}: {e}", flush=True)
