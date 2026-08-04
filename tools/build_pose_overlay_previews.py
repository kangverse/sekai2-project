#!/usr/bin/env python3
"""Render compact RGB + ViPE trace previews using the downloaded OSS tool."""

import csv
import json
import math
import subprocess
import tempfile
from pathlib import Path

import av
import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
VIDEOS = ROOT / "assets/videos"
IMAGES = ROOT / "assets/images"
MANIFEST = Path("/mnt/workspace/hk/Acamedic/Sekai2/statistic/sekai_all_final_merged.csv")
OVERLAY_TOOL = Path("/mnt/workspace/hk/code/sekai_filter_pose_overlay/overlay_cam_trace.py")
SELECTED = ("drone", "walking", "driving", "cycling", "boat")


def video_info(path: Path):
    container = av.open(str(path))
    stream = container.streams.video[0]
    info = (stream.codec_context.width, stream.codec_context.height,
            float(stream.average_rate), stream.frames)
    if not info[3]:
        info = (*info[:3], sum(1 for _ in container.decode(stream)))
    container.close()
    return info


def make_mjpeg_input(source: Path, target: Path):
    container = av.open(str(source))
    stream = container.streams.video[0]
    fps = float(stream.average_rate)
    width, height = stream.codec_context.width, stream.codec_context.height
    writer = cv2.VideoWriter(str(target), cv2.VideoWriter_fourcc(*"MJPG"), fps, (width, height))
    count = 0
    for frame in container.decode(stream):
        writer.write(frame.to_ndarray(format="bgr24"))
        count += 1
    writer.release()
    container.close()
    return width, height, fps, count


def compact_video(source: Path, target: Path, poster: Path):
    inp = av.open(str(source)); stream = inp.streams.video[0]
    rate = stream.average_rate
    out = av.open(str(target), "w"); encoder = out.add_stream("libvpx-vp9", rate=rate)
    encoder.width, encoder.height, encoder.pix_fmt = 640, 360, "yuv420p"
    encoder.bit_rate = 0
    encoder.options = {"crf": "34", "deadline": "good", "cpu-used": "2"}
    written = 0
    for frame in inp.decode(stream):
        image = frame.to_image().resize((640, 360))
        if written == 75:
            image.save(poster, quality=88, optimize=True)
        encoded = av.VideoFrame.from_image(image); encoded.pts = written
        for packet in encoder.encode(encoded): out.mux(packet)
        written += 1
    for packet in encoder.encode(): out.mux(packet)
    out.close(); inp.close()


def main():
    cases = json.loads((ROOT / "assets/data/cases.json").read_text())
    manifest = {row["clip_name"]: row for row in csv.DictReader(MANIFEST.open())}
    for key in SELECTED:
        case = cases[key]; row = manifest[case["clip"]]
        preview = VIDEOS / f"{key}.mp4"
        target = VIDEOS / f"pose-overlay-{key}.webm"
        poster = IMAGES / f"pose-overlay-{key}.jpg"
        with tempfile.TemporaryDirectory(prefix=f"sekai2-overlay-{key}-") as tmp_name:
            tmp = Path(tmp_name)
            mjpeg = tmp / "preview.avi"
            width, height, fps, count = make_mjpeg_input(preview, mjpeg)
            source = np.load(row["pose_path"])
            poses = source["cam_c2w"] if "cam_c2w" in source else source["data"]
            duration = float(case["pose3d"]["duration"])
            times = float(case["preview_start_s"]) + np.arange(count) / fps
            indices = np.clip(np.rint(times / duration * (len(poses) - 1)).astype(int), 0, len(poses) - 1)
            focal = 0.5 * width / math.tan(math.radians(70) / 2)
            intrinsic = np.array([[focal, 0, width / 2], [0, focal, height / 2], [0, 0, 1.]])
            enriched = tmp / "pose_with_intrinsics.npz"
            np.savez(enriched, cam_c2w=poses[indices], intrinsics=np.repeat(intrinsic[None], count, axis=0))
            raw = tmp / "overlay.mp4"
            subprocess.run([
                "python", str(OVERLAY_TOOL), "--npz", str(enriched), "--video", str(mjpeg),
                "--output", str(raw), "--distance", "1.0", "--square-size", "0",
                "--thickness", "4", "--encoder", "ffmpeg",
            ], check=True)
            compact_video(raw, target, poster)
        print(key, target.stat().st_size)


if __name__ == "__main__":
    main()
