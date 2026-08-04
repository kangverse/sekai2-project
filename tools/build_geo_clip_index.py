#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Full scan of the final manifest's caption JSONs -> per-clip geography index.

Writes /tmp/clip_geo_index.csv with:
  dataset, clip, country_raw, country_canon, city, camera_motion, location_type,
  weather, time_of_day, video_ref, has_video
Used to pick genuine per-country demo clips for the website map.
"""
import csv, json, os, sys, re
from multiprocessing import Pool

MAN = "/mnt/workspace/hk/Acamedic/Sekai2/statistic/sekai_all_final_merged.csv"
OUT = "/tmp/clip_geo_index.csv"

ALIAS = {"usa":"United States","us":"United States","united states":"United States","america":"United States","uk":"United Kingdom","united kingdom":"United Kingdom","great britain":"United Kingdom","england":"United Kingdom","uae":"United Arab Emirates","united arab emirates":"United Arab Emirates","south korea":"South Korea","czech republic":"Czechia","russia":"Russia","hong kong":"Hong Kong"}
def canon(s):
    s=(s or "").strip()
    if not s or s.lower()=="unknown": return ""
    k=re.sub(r"\s+"," ",re.sub(r"[_]+"," ",s)).strip().lower()
    return ALIAS.get(k, re.sub(r"\s+"," ",re.sub(r"[_]+"," ",s)).strip().title())

def job(row):
    cp=row.get("caption_path") or ""
    try:
        ov=json.load(open(cp)).get("overall",{}) or {}
    except Exception:
        return None
    vr=row.get("video_ref") or ""
    return (row["dataset"], row["clip_name"], ov.get("country") or "",
            canon(ov.get("country")), ov.get("city") or "",
            ov.get("camera_motion") or "", ov.get("location_type") or "",
            ov.get("weather") or "", ov.get("time_of_day") or "",
            vr, "1" if vr and os.path.exists(vr) else "0")

if __name__ == "__main__":
    rows=list(csv.DictReader(open(MAN)))
    print("clips to scan:", len(rows), flush=True)
    n=0
    with open(OUT,"w",newline="") as f:
        w=csv.writer(f)
        w.writerow(["dataset","clip","country_raw","country_canon","city",
                    "camera_motion","location_type","weather","time_of_day",
                    "video_ref","has_video"])
        with Pool(32) as p:
            for res in p.imap_unordered(job, rows, chunksize=200):
                n+=1
                if res: w.writerow(res)
                if n % 10000 == 0: print("scanned", n, flush=True)
    print("done. wrote", OUT, flush=True)
