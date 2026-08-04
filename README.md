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

The current page includes ten compact previews selected from the release, two video--pose--caption case studies, two panoramic reconstruction galleries, and a geographic map with representative examples. See `assets/MEDIA_MANIFEST.md` for exact provenance. Paper URL, author list, final release links, and access policy remain placeholders.

The per-clip case modal contains a static adaptation of the Three.js pose visualization from `/mnt/workspace/gyt/code/world-model-viewer`. Backend indexing, authentication, comments, video proxying, and email functionality are intentionally excluded; GitHub Pages receives only precomputed trajectories for the selected showcase clips.

Regenerate the web media with:

```bash
python tools/build_media.py
```

## GitHub Pages

The directory can be pushed as the root of a repository such as `kangverse/Sekai2`. Enable GitHub Pages for the repository root. No build action is required.
