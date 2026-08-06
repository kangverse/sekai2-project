# Site build & verification tools

Run order when rebuilding media/data:

| script | what it does |
|---|---|
| `build_media.py` | cuts the per-motion preview clips + posters and writes `assets/data/cases.json` (pose duration comes from the pose npz at **30 fps** — see below) |
| `build_pose_overlay_previews.py` | renders the `pose-overlay-*.webm` RGB previews |
| `build_caption_case_explorer.py` | writes `assets/data/caption_cases.json` + frame stills |
| `build_panoramic_video_cases.py` | equirectangular previews (24 fps / 1280x640) + panoramic trajectories |
| `build_panoramic_gallery.py` | reconstruction gallery images + `panoramic_cases.json` |
| `build_geo_clip_index.py` | full caption scan -> `/tmp/clip_geo_index.csv` (per-clip country/city/motion) |
| `build_geo_map_svg.py` | clickable `assets/data/world.svg` + `geo_countries.json` |
| `build_geo_country_previews.py` | per-country demo previews from clips recorded in that country |
| `build_geo_country_previews_repair.py` | retries slots the first pass failed (short clips) |
| `fix_pose_durations.py` | recomputes `pose3d.duration` in `cases.json` from the npz time base |
| `reencode_panoramic_previews.py` | re-cuts the 360 previews from the 8K OSS sources |

## Pose time base (important)

ViPE poses are at **30 fps**: 60 fps sources are decimated to 30 fps first, 30 fps
sources are used as-is. `inds` in each npz are contiguous indices in that base, so

    duration = (inds[-1] - inds[0] + 1) / 30

Do **not** use the last caption segment's `time_range_s` end as the duration — it
under-reports many clips (e.g. 117 s for a 120.2 s trajectory) and drifts the
synchronized marker ~3 % fast. Some clips also have pose covering only part of the
clip, so check coverage before mapping a video timestamp to a pose index.

## Cache busting

`index.html` references `styles.css`, `trajectory-viewer.css`, `script.js`, the vendor
scripts **and `assets/images/dataset-composition.jpg`** with a `?v=<build>` stamp. The
hero image is replaced in place, so an unversioned URL leaves visitors on the previous
render for up to the 600 s max-age — version it whenever the figure is rebuilt. GitHub Pages serves these with
`cache-control: max-age=600` and no fingerprint, so **bump the stamp whenever you
change JS/CSS** or browsers will pair a stale script with new markup (which silently
kills every section below the failure point). Re-stamp with:

    python3 - <<'EOF'
    import re,time
    p='index.html'; s=open(p).read(); stamp=time.strftime('%Y%m%d%H%M')
    s=re.sub(r'(href|src)="((?:styles\.css|trajectory-viewer\.css|script\.js|assets/vendor/[A-Za-z0-9_.\-]+\.js|assets/images/dataset-composition\.jpg))(\?v=[0-9]+)?"',
             lambda m:f'{m.group(1)}="{m.group(2)}?v={stamp}"',s)
    open(p,'w').write(s); print(stamp)
    EOF

## Verify before declaring done

`tools/test_page.js` loads the page in jsdom, runs the real `script.js` against the
real data files, and asserts that every section populates (Explore rows sum to 12
columns, the map injects 98 interactive countries, annotation/trajectory/panoramic/
caption sections fill, no long-horizon leftovers).

    npm install jsdom
    node tools/test_page.js local                                  # working tree
    node tools/test_page.js https://kangverse.github.io/sekai2-project   # published site

Run the published-site check after every push — a green local tree does not prove the
deployed page works.

## Re-encoding the site videos (`reencode_hq.py`)

The first build shipped case previews at 640x360 / 15 fps / **CRF 30** and per-country map
previews at 480x270 / 12 fps / **CRF 32**, from sources that are natively 1280x720 / 30 fps
at ~4 Mb/s. CRF 30-32 is far past the point where H.264 stays visually transparent, so the
softness was in the encode: re-compressing the published files cannot recover it, and every
asset has to be cut again from its source.

```bash
python tools/reencode_hq.py --what all --workers 10   # cases + map previews
python tools/reencode_hq.py --what geo --repair       # only missing/undersized outputs
```

Two ladders, because the display sizes differ by an order of magnitude:

| asset | ladder | why |
|---|---|---|
| case previews | native 1280x720, native fps, CRF 22 | fill a card and the modal |
| map previews | 640x360, 24 fps, CRF 24 | shown 2-3 at a time in a 250-304 px popup, ~140 px each |

Encoding the map previews at native 720p was tried and cost **276 MB against 165 MB** with
no difference visible at the size they are displayed; the gain over the old files comes from
bitrate (~8x), not resolution.

Sources are resolved by clip name through `statistic/sekai_all_final_merged.csv`, and start
offsets come from the published payloads (`cases.json` carries `preview_start_s`; map
previews use the 12 s / 30 s rule of `build_geo_country_previews.py`), so a re-encode shows
the same moment as the file it replaces. Two caveats:

- **Some static-supplement clips are shorter than the 30 s cut point.** Seeking past the end
  silently writes an empty file - that is how 35 previews shipped broken the first time. The
  script clamps `start` to `duration - seconds`; `--repair` finds any that slipped through
  (outputs under 20 KB).
- **The three panoramic previews are skipped**: their 8K masters live in object storage, not
  on disk. Re-cutting them means downloading through `ossutil` first.
