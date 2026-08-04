#!/usr/bin/env python3
"""Build compact GitHub-Pages media from selected Sekai2 release clips."""
from pathlib import Path
import av
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
VIDEO_OUT = ROOT / "assets" / "videos"
IMAGE_OUT = ROOT / "assets" / "images"
VIDEO_OUT.mkdir(parents=True, exist_ok=True)
IMAGE_OUT.mkdir(parents=True, exist_ok=True)

VIDEO_ROOT = Path("/mnt/workspace/shared/datasets/world_model/Video/sekai2")
CLIPS = [
    ("walking", "T5JzYSlRFNU/T5JzYSlRFNU_0109890_0111340.mp4", 20),
    ("driving", "jpRw1xbePTU/jpRw1xbePTU_0027090_0030690.mp4", 46),
    ("train", "1n6580aSnE4/1n6580aSnE4_0185035_0188635.mp4", 48),
    ("drone", "7qs9ceYnECM/7qs9ceYnECM_0285422_0289022.mp4", 48),
    ("cycling", "CFInei-cCPU/CFInei-cCPU_0030301_0033901.mp4", 48),
    ("boat", "0_nzpk0yHro/0_nzpk0yHro_0157943_0160290.mp4", 30),
    ("cable-car", "facDr2lTAUM/facDr2lTAUM_0031277_0033090.mp4", 22),
    ("escalator", "JB1ss-iFXQ0/JB1ss-iFXQ0_0023490_0027090.mp4", 52),
    ("skiing", "KbSiM37kfP4/KbSiM37kfP4_0045090_0048690.mp4", 50),
    ("static-pan", "QKc6v0HZtw0/QKc6v0HZtw0_0002376_0004647.mp4", 30),
]


def resize(frame, width=640):
    image = frame.to_image()
    height = round(image.height * width / image.width / 2) * 2
    return image.resize((width, height), Image.Resampling.LANCZOS)


def make_preview(name, relative, start, seconds=8, fps=15):
    source = VIDEO_ROOT / relative
    target = VIDEO_OUT / f"{name}.mp4"
    poster = IMAGE_OUT / f"{name}.jpg"
    if target.exists() and poster.exists():
        return
    inp = av.open(str(source))
    stream = inp.streams.video[0]
    inp.seek(int(start / stream.time_base), stream=stream, backward=True)
    output = av.open(str(target), "w")
    out = output.add_stream("libx264", rate=fps)
    out.width, out.height = 640, 360
    out.pix_fmt = "yuv420p"
    out.options = {"crf": "30", "preset": "slow", "movflags": "+faststart"}
    next_time, written = start, 0
    for frame in inp.decode(stream):
        timestamp = float(frame.time or 0)
        if timestamp + 1e-3 < next_time:
            continue
        if timestamp >= start + seconds or written >= seconds * fps:
            break
        image = resize(frame).crop((0, 0, 640, 360))
        if written == 0:
            image.save(poster, quality=86, optimize=True)
        encoded = av.VideoFrame.from_image(image)
        encoded.pts = written
        for packet in out.encode(encoded):
            output.mux(packet)
        written += 1
        next_time = start + written / fps
    for packet in out.encode():
        output.mux(packet)
    output.close()
    inp.close()
    print(name, written, target.stat().st_size)


def compact_image(source, target, width=1500, quality=84):
    image = Image.open(source).convert("RGB")
    height = round(image.height * width / image.width)
    image.resize((width, height), Image.Resampling.LANCZOS).save(
        target, quality=quality, optimize=True, progressive=True
    )
    print(target.name, target.stat().st_size)


for item in CLIPS:
    make_preview(*item)

ANALYSIS = Path("/mnt/workspace/hk/Acamedic/Sekai2/analysis")
compact_image(
    ANALYSIS / "59_diverse_trajectory_cases/figures/case-09-vertical-flight.png",
    IMAGE_OUT / "caption-case-drone.jpg",
)
compact_image(
    ANALYSIS / "59_diverse_trajectory_cases/figures/case-14-winding-traversal.png",
    IMAGE_OUT / "caption-case-walking.jpg",
)
compact_image(
    ANALYSIS / "60_panoramic_full_accumulation_case_study/figures/panoramic_full_accumulation_gallery_part1.png",
    IMAGE_OUT / "panoramic-reconstruction-1.jpg",
)
compact_image(
    ANALYSIS / "60_panoramic_full_accumulation_case_study/figures/panoramic_full_accumulation_gallery_part2.png",
    IMAGE_OUT / "panoramic-reconstruction-2.jpg",
)


def geographic_demo_map():
    source = ANALYSIS / "27_geographic_map/figures/world_map.png"
    base = Image.open(source).convert("RGB")
    base.thumbnail((1900, 950), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", base.size, "white")
    canvas.paste(base, (0, 0))
    draw = ImageDraw.Draw(canvas)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    bold_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font = ImageFont.truetype(font_path, 16)
    bold = ImageFont.truetype(bold_path, 17)
    title_font = ImageFont.truetype(bold_path, 31)
    # The archived map says 115 countries while the current release table says
    # 113. Keep this web derivative version-neutral until the final paper freezes.
    draw.rectangle((350, 0, 1400, 65), fill="white")
    draw.text((875, 28), "Geographic coverage of Sekai2", font=title_font,
              fill=(12, 34, 39), anchor="mm")
    # Cards occupy ocean/Antarctic whitespace and intentionally leave land visible.
    cards = [
        ("driving", "DRIVING", (55, 315), (375, 330)),
        ("boat", "BOAT", (1450, 390), (1050, 385)),
        ("walking", "WALKING", (180, 690), (470, 430)),
        ("train", "TRAIN", (510, 700), (890, 270)),
        ("drone", "DRONE", (840, 705), (1190, 360)),
        ("cycling", "CYCLING", (1170, 700), (260, 400)),
        ("skiing", "SKIING", (1500, 680), (890, 570)),
    ]
    for name, label, (x, y), (tx, ty) in cards:
        poster = Image.open(IMAGE_OUT / f"{name}.jpg").convert("RGB")
        poster = poster.resize((250, 141), Image.Resampling.LANCZOS)
        draw.line((tx, ty, x + 125, y + 70), fill=(55, 104, 112), width=2)
        draw.ellipse((tx - 5, ty - 5, tx + 5, ty + 5), fill=(230, 144, 87))
        draw.rounded_rectangle((x - 7, y - 7, x + 257, y + 177), 12,
                               fill="white", outline=(35, 78, 84), width=2)
        canvas.paste(poster, (x, y))
        draw.text((x + 10, y + 146), label, font=bold, fill=(20, 52, 55))
        draw.text((x + 240, y + 147), "▶", font=font, anchor="ra",
                  fill=(38, 124, 114))
    canvas.save(IMAGE_OUT / "geographic-demo-map.jpg", quality=88,
                optimize=True, progressive=True)
    print("geographic-demo-map.jpg",
          (IMAGE_OUT / "geographic-demo-map.jpg").stat().st_size)


geographic_demo_map()
