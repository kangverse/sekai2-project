# Sekai2 Project Page

Static, dependency-free project-page scaffold designed for GitHub Pages.

## Preview

```bash
cd /mnt/workspace/hk/Acamedic/Sekai2/sekai2_website
python -m http.server 8080
```

Open `http://localhost:8080`.

## Content map

- Hero: mixed data-type video wall.
- Metrics: release-scale headline statistics.
- Explore: filterable Drone / Walking / Driving / Train / Boat / Cable Car / Static / Panoramic cards.
- Long horizon: interactive 120-second timeline.
- Structured annotations: global fields plus temporal segments.
- Camera trajectories: interactive motion-shape visualization.
- Panoramic: loop-aware and reconstruction-oriented capture.
- Sources: Sekai-1, Sekai-2 New, and Panoramic.
- Access: paper, code, and dataset buttons.

The current page includes a filterable collection of compact previews, twenty component-level video--pose--caption case studies, forty individually rendered panoramic reconstruction cards, and a geographic map with representative examples. See `assets/MEDIA_MANIFEST.md` for exact provenance. Paper URL, author list, final release links, and access policy remain placeholders.

The per-clip case modal contains a static adaptation of the Three.js pose visualization from `/mnt/workspace/gyt/code/world-model-viewer`. Backend indexing, authentication, comments, video proxying, and email functionality are intentionally excluded; GitHub Pages receives only precomputed trajectories for the selected showcase clips.

The synchronized RGB pose-trace previews use the OSS `sekai_filter` camera-trace tool, downloaded to `/mnt/workspace/hk/code/sekai_filter_pose_overlay`. Rebuild the five web previews with:

```bash
python tools/build_pose_overlay_previews.py
```

The preview projection uses a display-only pinhole model inferred from the video resolution and a fixed 70-degree field of view because the ViPE NPZ files contain extrinsics but not camera intrinsics. It does not modify the released trajectories or pose-quality statistics.

Regenerate the web media with:

```bash
python tools/build_media.py
python tools/build_caption_case_explorer.py
python tools/build_panoramic_gallery.py
```

## GitHub Pages

The directory can be pushed as the root of a repository such as `kangverse/Sekai2`. Enable GitHub Pages for the repository root. No build action is required.
