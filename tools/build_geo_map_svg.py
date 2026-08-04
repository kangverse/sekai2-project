#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build a clickable SVG world map + per-country payload for the website.

Every country that has Sekai2 clips becomes an interactive <path>. Clip counts are
real (analysis/_shared2/country_counts.json). Video previews prefer assets whose
ORIGINAL caption country matches the clicked country ("recorded here"); otherwise a
representative rotation is shown and labelled as such.

Projection: plate carree, lon[-180,180] x lat[-58,84] -> viewBox 0 0 3600 1420
"""
import json, re, os
from collections import Counter
import geopandas as gpd
from shapely.geometry import Polygon, MultiPolygon

SH2 = "/mnt/workspace/hk/Acamedic/Sekai2/analysis/_shared2"
WEB = "/mnt/workspace/hk/Acamedic/Sekai2/sekai2_website"

ALIAS = {"usa":"United States","us":"United States","united states":"United States","america":"United States","uk":"United Kingdom","united kingdom":"United Kingdom","great britain":"United Kingdom","england":"United Kingdom","uae":"United Arab Emirates","united arab emirates":"United Arab Emirates","south korea":"South Korea","czech republic":"Czechia","russia":"Russia","hong kong":"Hong Kong"}
def nc(s):
    s=(s or "").strip()
    if not s or s.lower()=="unknown": return None
    k=re.sub(r"\s+"," ",re.sub(r"[_]+"," ",s)).strip().lower()
    return ALIAS.get(k, re.sub(r"\s+"," ",re.sub(r"[_]+"," ",s)).strip().title())

co=json.load(open(SH2+"/country_counts.json")); cc=Counter()
for ds,d in co.items():
    for k,v in d.items():
        x=nc(k)
        if x: cc[x]+=v
TOTAL=sum(cc.values())

# ---- real country of each website video asset (from its source caption) ----
ASSET_COUNTRY=json.load(open("/tmp/case_countries.json"))
LOCAL={}   # canonical country -> [asset keys]
for key,meta in ASSET_COUNTRY.items():
    c=nc(meta.get("country"))
    if c: LOCAL.setdefault(c,[]).append(key)

# Representative rotation for countries without a locally-shot asset. Grouped by
# continent so the previews at least match the kind of terrain/urban form nearby.
REP_BY_CONT={
 "Europe":      ["walking-curve","escalator","boat","train"],
 "Asia":        ["walking-scurve","static-landscape","cable-car-alpine","escalator"],
 "North America":["driving","walking-lturn","cycling","driving-loop"],
 "South America":["walking-winding","cycling","drone","walking-curve"],
 "Africa":      ["driving","walking-straight","drone-ridge","static-landscape"],
 "Oceania":     ["drone","cycling","boat","drone-ridge"],
 "Seven seas (open ocean)":["boat","drone","static-landscape","train"],
}
FALLBACK=["walking","driving","drone","train"]

GEO2OURS={"United States of America":"United States","United Kingdom":"United Kingdom","South Korea":"South Korea","Czechia":"Czechia","Russia":"Russia","Bosnia and Herz.":"Bosnia and Herzegovina","United Arab Emirates":"United Arab Emirates"}
world=gpd.read_file(SH2+"/world_countries.geojson")
print("geojson columns:", list(world.columns)[:14])

# ---- projection ----
LON0,LON1,LAT0,LAT1=-180.0,180.0,-58.0,84.0
VW,VH=3600.0,1420.0
def px(lon,lat):
    return ((lon-LON0)/(LON1-LON0)*VW, (LAT1-lat)/(LAT1-LAT0)*VH)

def ring_to_d(coords, tol):
    pts=[]
    last=None
    for lon,lat in coords:
        x,y=px(lon,lat)
        p=(round(x,1),round(y,1))
        if p!=last: pts.append(p); last=p
    if len(pts)<3: return ""
    return "M"+" ".join(f"{x},{y}" for x,y in pts)+"Z"

def geom_to_d(geom, tol=0.06):
    g=geom.simplify(tol, preserve_topology=True)
    if g.is_empty: return ""
    polys = g.geoms if isinstance(g,MultiPolygon) else [g]
    out=[]
    for poly in polys:
        if not isinstance(poly,Polygon) or poly.is_empty: continue
        if poly.area < 0.06: continue           # drop specks
        out.append(ring_to_d(poly.exterior.coords, tol))
        for hole in poly.interiors:
            out.append(ring_to_d(hole.coords, tol))
    return "".join(x for x in out if x)

# ---- colors (site palette, log scale) ----
import numpy as np
STOPS=["#dfeee7","#a9d6c9","#7fbfc0","#5b9fbd","#3d6f86","#22414c"]
def lerp(c1,c2,t):
    a=[int(c1[i:i+2],16) for i in (1,3,5)]; b=[int(c2[i:i+2],16) for i in (1,3,5)]
    return "#%02x%02x%02x"%tuple(round(a[i]+(b[i]-a[i])*t) for i in range(3))
def color_for(n, maxlog):
    t=np.log10(n+1)/maxlog
    t=min(max(t,0),1)*(len(STOPS)-1)
    i=min(int(t),len(STOPS)-2)
    return lerp(STOPS[i],STOPS[i+1],t-i)

def val_for(nm):
    alt=GEO2OURS.get(nm,nm)
    return cc.get(alt,0) or cc.get(nm,0)

maxlog=max(np.log10(v+1) for v in cc.values())
CONT_COL = "CONTINENT" if "CONTINENT" in world.columns else ("continent" if "continent" in world.columns else None)

paths=[]; payload={}
for _,row in world.iterrows():
    nm=row["NAME"]; d=geom_to_d(row.geometry)
    if not d: continue
    n=val_for(nm)
    canon=GEO2OURS.get(nm,nm)
    cont=(row[CONT_COL] if CONT_COL else "") or ""
    if n>0:
        fill=color_for(n,maxlog)
        paths.append(f'<path d="{d}" fill="{fill}" class="c on" data-n="{canon}"/>')
        local=LOCAL.get(canon,[])
        vids=(local+[v for v in REP_BY_CONT.get(cont,FALLBACK) if v not in local])[:3]
        payload[canon]={"clips":n,"share":round(n/TOTAL*100,2),"continent":cont,
                        "videos":vids,"local":len(local)>0,
                        "cities":sorted({ASSET_COUNTRY[k].get("city") for k in local
                                         if ASSET_COUNTRY[k].get("city") and ASSET_COUNTRY[k]["city"]!="unknown"})}
    else:
        paths.append(f'<path d="{d}" fill="#e7e2d6" class="c off"/>')

svg=('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
     'preserveAspectRatio="xMidYMid meet" id="geo-svg" role="img" '
     'aria-label="Interactive Sekai2 coverage map">%s</svg>')%(VW,VH,"".join(paths))
open(f"{WEB}/assets/data/world.svg","w").write(svg)
json.dump(payload,open(f"{WEB}/assets/data/geo_countries.json","w"),ensure_ascii=False,indent=0)
print("svg bytes: %.0f KB | interactive countries: %d | total clips: %d"%(len(svg)/1024,len(payload),TOTAL))
print("locally-shot countries:", {k:v for k,v in LOCAL.items()})
print("top:", cc.most_common(8))
