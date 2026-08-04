# Website media manifest

The website uses compact, silent previews derived from released clips. Gallery cards use short loops; synchronized RGB--pose studies use 15-second windows. The full source clips and annotations remain in the Sekai2 data workspace.

| Website label | Dataset | Clip | Preview start |
|---|---|---|---:|
| Walking | Sekai-2 new | `T5JzYSlRFNU_0109890_0111340` | 20 s |
| Driving | Sekai-2 new | `jpRw1xbePTU_0027090_0030690` | 46 s |
| Train | Sekai-2 new | `1n6580aSnE4_0185035_0188635` | 48 s |
| Drone | Sekai-2 new | `7qs9ceYnECM_0285422_0289022` | 48 s |
| Cycling | Sekai-2 new | `CFInei-cCPU_0030301_0033901` | 48 s |
| Boat | Sekai-2 new | `0_nzpk0yHro_0157943_0160290` | 30 s |
| Cable car | Sekai-2 new | `facDr2lTAUM_0031277_0033090` | 22 s |
| Escalator | Sekai-2 new | `JB1ss-iFXQ0_0023490_0027090` | 52 s |
| Skiing | Sekai-2 new | `KbSiM37kfP4_0045090_0048690` | 50 s |
| Static/pan | Sekai-2 new | `QKc6v0HZtw0_0002376_0004647` | 30 s |

The long-horizon carousel uses three complete 120-second clips selected independently from the modality gallery: `Ps8ETd-J2yk_0009090_0012690` (city driving), `3mLJCi5pRYM_0435866_0439466` (mountain drone), and `-60T8t6q5tE_0056868_0060468` (covered-arcade walking).

The native 360-degree studies use three 15-second equirectangular windows from `杭州-学校-蛇形-012` (45 s), `杭州-宿舍园区-蛇形` (15 s), and `杭州-商场-蛇形-syw-02` (15 s). Their synchronized web trajectories retain the complete source path while the moving marker is mapped by source timestamp.

Caption case studies are web derivatives of cases 09 and 14 in `analysis/59_diverse_trajectory_cases`. Panoramic reconstruction galleries are web derivatives of the two appendix galleries in `analysis/60_panoramic_full_accumulation_case_study`. The geographic composite preserves the country-level map from `analysis/27_geographic_map` and overlays representative preview frames; the web title intentionally omits a country count until the final paper statistics are frozen.
