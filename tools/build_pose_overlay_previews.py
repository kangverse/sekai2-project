#!/usr/bin/env python3
"""Render compact RGB + ViPE trace previews using the downloaded OSS tool."""

import csv
import json
from pathlib import Path

import av
import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
VIDEOS = ROOT / "assets/videos"
IMAGES = ROOT / "assets/images"
MANIFEST = Path("/mnt/workspace/hk/Acamedic/Sekai2/statistic/sekai_all_final_merged.csv")
SELECTED = ("drone", "walking", "driving", "cycling", "cable-car")
CASE_SOURCE = {
    "walking": "walking-lturn",
    "driving": "driving-loop",
    "cable-car": "cable-car-alpine",
}


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


def draw_pose_hud(image, positions, frame_index):
    """Draw an always-visible, temporally colored bird's-eye trajectory inset."""
    canvas = np.asarray(image).copy()
    height, width = canvas.shape[:2]
    panel_w, panel_h = max(170, width // 3), max(104, height // 3)
    x0, y0 = width - panel_w - 16, 16

    overlay = canvas.copy()
    cv2.rectangle(overlay, (x0, y0), (x0 + panel_w, y0 + panel_h), (8, 18, 25), -1)
    cv2.addWeighted(overlay, 0.78, canvas, 0.22, 0, canvas)
    cv2.rectangle(canvas, (x0, y0), (x0 + panel_w, y0 + panel_h), (238, 243, 241), 1)
    cv2.putText(canvas, "POSE TRACE", (x0 + 10, y0 + 18), cv2.FONT_HERSHEY_SIMPLEX,
                0.45, (245, 248, 247), 1, cv2.LINE_AA)

    ground = positions[:, [0, 2]].astype(np.float32)
    lo, hi = ground.min(axis=0), ground.max(axis=0)
    span = np.maximum(hi - lo, 1e-4)
    margin = 13
    plot_x0, plot_y0 = x0 + margin, y0 + 27
    plot_w, plot_h = panel_w - 2 * margin, panel_h - 37
    scale = min(plot_w / span[0], plot_h / span[1])
    center = (lo + hi) * 0.5
    pts = ground - center
    pts[:, 0] = pts[:, 0] * scale + x0 + panel_w / 2
    pts[:, 1] = -pts[:, 1] * scale + plot_y0 + plot_h / 2
    pts = np.rint(pts).astype(np.int32)

    # Muted full path provides context; colored prefix communicates progress.
    if len(pts) > 1:
        cv2.polylines(canvas, [pts], False, (115, 130, 135), 2, cv2.LINE_AA)
        upto = min(frame_index + 1, len(pts))
        for i in range(1, upto):
            t = i / max(len(pts) - 1, 1)
            color = (int(235 - 125 * t), int(185 + 45 * t), int(55 + 180 * t))
            cv2.line(canvas, tuple(pts[i - 1]), tuple(pts[i]), color, 3, cv2.LINE_AA)
    cv2.circle(canvas, tuple(pts[0]), 5, (255, 255, 255), -1, cv2.LINE_AA)
    current = pts[min(frame_index, len(pts) - 1)]
    cv2.circle(canvas, tuple(current), 7, (15, 210, 255), -1, cv2.LINE_AA)
    cv2.circle(canvas, tuple(current), 8, (255, 255, 255), 1, cv2.LINE_AA)
    return canvas


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
        case = cases[CASE_SOURCE.get(key, key)]; row = manifest[case["clip"]]
        preview = ROOT / case["video"]
        target = VIDEOS / f"pose-overlay-{key}.webm"
        poster = IMAGES / f"pose-overlay-{key}.jpg"
        _, _, fps, count = video_info(preview)
        source = np.load(row["pose_path"])
        poses = source["cam_c2w"] if "cam_c2w" in source else source["data"]
        duration = float(case["pose3d"]["duration"])
        times = float(case["preview_start_s"]) + np.arange(count) / fps
        indices = np.clip(np.rint(times / duration * (len(poses) - 1)).astype(int), 0, len(poses) - 1)
        compact_video(preview, target, poster)
        print(key, target.stat().st_size)


if __name__ == "__main__":
    main()
