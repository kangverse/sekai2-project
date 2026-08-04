#!/usr/bin/env python3
"""Prepare individual panoramic reconstruction cards for the project page."""

import json
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path("/mnt/workspace")
SOURCE = ROOT / "gzh/code/loop_closure_pp/pano_viz"
STILLS = SOURCE / "batch40_stills"
LABELS = SOURCE / "batch40_labels.json"
WEB_ROOT = ROOT / "hk/Acamedic/Sekai2/sekai2_website"
OUT = WEB_ROOT / "assets/images/panoramic-cases"
DATA_OUT = WEB_ROOT / "assets/data/panoramic_cases.json"


def trim_white(image: Image.Image, margin: int = 12) -> Image.Image:
    image = image.convert("RGB")
    diff = ImageChops.difference(image, Image.new("RGB", image.size, "white")).convert("L")
    diff = diff.point(lambda value: 255 if value > 18 else 0)
    box = diff.getbbox()
    if box is None:
        return image
    left, top, right, bottom = box
    return image.crop((max(0, left - margin), max(0, top - margin),
                       min(image.width, right + margin), min(image.height, bottom + margin)))


def split_label(label: str):
    if " (" in label and label.endswith(")"):
        scene, motion = label.rsplit(" (", 1)
        return scene, motion[:-1]
    return label, "reconstruction"


def main():
    entries = json.loads(LABELS.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    output = []
    for index, entry in enumerate(entries, 1):
        source = STILLS / Path(entry["file"]).with_suffix(".png").name
        target = OUT / f"case-{index:02d}.webp"
        image = trim_white(Image.open(source))
        image.thumbnail((1000, 700), Image.Resampling.LANCZOS)
        image.save(target, "WEBP", quality=84, method=6)
        scene, motion = split_label(entry["label"])
        output.append({"image": f"assets/images/panoramic-cases/{target.name}",
                       "scene": scene, "motion": motion})
    DATA_OUT.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Prepared {len(output)} individual web reconstruction cards in {OUT}")


if __name__ == "__main__":
    main()
