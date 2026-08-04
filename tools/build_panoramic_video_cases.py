#!/usr/bin/env python3
"""Build compact equirectangular previews and matching full ViPE trajectories."""
import csv
import json
import subprocess
from fractions import Fraction
from pathlib import Path

import av
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = Path("/mnt/workspace/hk/Acamedic/Sekai2/statistic/sekai_all_final_merged.csv")
OSS_PREFIX = "oss://mogentest/yongtao/molardata/sekai2/insta360"
OSS_CONFIG = "/mnt/workspace/hk/scripts/.ossutil_dsw.conf"
SPECS = {
    "panorama-serpentine": ("杭州-学校-蛇形-012", 45.0, "Campus serpentine", "serpentine"),
    "panorama-switchback": ("杭州-宿舍园区-蛇形", 15.0, "Residential switchback", "switchback"),
    "panorama-meander": ("杭州-商场-蛇形-syw-02", 15.0, "Mall meander", "meander"),
}


def signed_url(key):
    command = ["ossutil", "-c", OSS_CONFIG, "-e", "oss-ap-southeast-1.aliyuncs.com",
               "--region", "ap-southeast-1", "presign", f"{OSS_PREFIX}/{key}",
               "--expires-duration", "2h"]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return next(line.strip() for line in result.stdout.splitlines() if line.startswith("http"))


def render_preview(url, start, video_out, poster_out, seconds=15, fps=2):
    source = av.open(url, options={"rw_timeout": "60000000"})
    stream = source.streams.video[0]; stream.thread_type = "NONE"
    source.seek(int(start / stream.time_base), stream=stream, backward=True)
    output = av.open(str(video_out), "w"); encoder = output.add_stream("libx264", rate=fps)
    encoder.width, encoder.height, encoder.pix_fmt = 960, 480, "yuv420p"
    encoder.options = {"crf": "32", "preset": "veryfast", "movflags": "+faststart"}
    written, next_time = 0, start
    for frame in source.decode(stream):
        timestamp = float(frame.time or 0)
        if timestamp + 1e-3 < next_time: continue
        if timestamp >= start + seconds or written >= seconds * fps: break
        small = frame.reformat(width=960, height=480, format="yuv420p")
        small.pts = written
        small.time_base = Fraction(1, fps)
        if written == 0: small.to_image().save(poster_out, quality=88, optimize=True)
        for packet in encoder.encode(small): output.mux(packet)
        written += 1; next_time = start + written / fps
    for packet in encoder.encode(): output.mux(packet)
    output.close(); source.close()


def pose_payload(path, duration):
    data = np.load(path); pose = data["cam_c2w"] if "cam_c2w" in data else data["data"]
    pose = np.asarray(pose, float); pose = pose[np.isfinite(pose).all(axis=(1, 2))]
    pose = np.einsum("ij,njk->nik", np.linalg.inv(pose[0]), pose)
    pose = pose[np.linspace(0, len(pose)-1, min(480, len(pose))).astype(int)]
    xyz, rotations = pose[:, :3, 3], pose[:, :3, :3]
    forward = rotations[:, :, 2]
    forward /= np.maximum(np.linalg.norm(forward, axis=1, keepdims=True), 1e-8)
    return {"positions": np.round(xyz, 6).tolist(),
            "rotations": np.round(rotations.reshape(-1, 9), 6).tolist(),
            "forward_vectors": np.round(forward, 6).tolist(), "forward_axis": "+Z",
            "num_frames": len(pose), "duration": duration, "fps": len(pose)/duration}


def main():
    rows = {r["clip_name"]: r for r in csv.DictReader(MANIFEST.open())}
    cases_path = ROOT / "assets/data/cases.json"
    cases = json.loads(cases_path.read_text())
    for key, (clip, start, title, motion) in SPECS.items():
        row = rows[clip]; caption = json.loads(Path(row["caption_path"]).read_text())
        duration = float(caption["segments"][-1]["time_range_s"][1])
        relative = caption["video_path"]
        video = ROOT / f"assets/videos/{key}.mp4"; poster = ROOT / f"assets/images/{key}.jpg"
        valid_preview = False
        if video.exists():
            try:
                probe = av.open(str(video))
                valid_preview = bool(probe.duration and float(probe.duration / av.time_base) >= 14.5)
                probe.close()
            except av.AVError:
                valid_preview = False
        if not valid_preview:
            render_preview(signed_url(relative), start, video, poster)
        cases[key] = {"clip": clip, "dataset": "panoramic", "title": title,
                      "motion": motion, "video": f"assets/videos/{key}.mp4",
                      "poster": f"assets/images/{key}.jpg", "preview_start_s": start,
                      "pose3d": pose_payload(row["pose_path"], duration),
                      "overall": caption.get("overall", {}), "segments": []}
        print(key, video.stat().st_size)
    cases_path.write_text(json.dumps(cases, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
