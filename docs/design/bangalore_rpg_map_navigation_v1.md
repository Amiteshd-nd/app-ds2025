# NAMMA OUTBREAK — Map & Navigation System v1.0
> Authentic Bangalore, handcrafted-intimate, not fully open. One source of truth → three views. Fits atomic architecture (ADR-60) and fail-forward (Google-Maps reroute).

## 1. World shape — "pockets anchored to metro stations"
- The city is NOT fully explorable. Each **metro station (or key node) anchors ONE explorable pocket**: a real Bangalore stretch, traced from Google Maps for authenticity, **~100 m radius, often a semicircle** — the actual famous strip where people walk (eateries, commercial street, landmarks).
- Example pockets: MG Road + Brigade Road corner · Commercial Street lane · Cubbon Park paths · Church Street (guitar shop) · Whitefield/Kadugodi PG belt · Majestic bus stand · Indiranagar 100ft stretch · Malleswaram 8th Cross market · Jayanagar 4th Block.
- Built **phase by phase**: one pocket per phase, audited, then next. Not all at once.
- Beyond the pocket edge = soft boundary (barricade, closed shutter, "under construction", crowd) — diegetic, never an invisible wall; ties to conditions/City Pulse.
- Data: each pocket = a district organism (`districts.json`) with `realworld: { anchor_node, road_trace_ref, shape: "semicircle", radius_m: 100 }`. The Tiled map reproduces those real road shapes at 32px grid.

## 2. Three views, ONE source of truth
| View | What | Where |
|---|---|---|
| **A. World (playable)** | the pocket you walk in, real roads, eateries, landmarks | WorldScene + Tiled map |
| **B. Phone Maps app** | realistic Bangalore layout (recognisable road shapes), district pockets as reachable areas, metro lines, YOUR quest destination marker, locked stations = padlock, "Rerouting…" toast on stray/fail; Act 4 = infected hatched overlay | PhoneScene → maps panel |
| **C. GTA-style minimap** | always-on HUD corner: immediate pocket, player heading arrow, nearby quest/NPC markers, exits, N indicator | HUD organism |
All three **render from the same data**: `districts.json` (pockets) + `metro.json` (lines/nodes) + live quest target + `stability`. Add a pocket once → it appears in A, B and C automatically. No map drawn twice.

## 3. Navigation / fail-forward
- Quest sets a `destination` (district + spawn). B and C show the marker + suggested route (metro/bus/walk/scooter).
- Stray or fail → **recalculate to the SAME destination via a costlier route**; "Rerouting…" toast (Google-Maps homage + funny). Never a dead end. (ADR fail-forward)
- Locked station tap → "Finish the challenges in [area] to unlock [station]." (existing gating)
- Fast travel: unlocked metro nodes + earned auto-stands (ADR). Fuel/fare gated.

## 4. Act 4 degradation (one rule, ADR-27)
Maps app + minimap desaturate; fallen districts hatched/corrupted; UV safe zones glow purple; metro nodes show open/shut; "server busy" when network dies → map freezes to last cached state. Driven by `stability`, no new art.

## 5. Build pipeline per pocket (phase gate each)
1. Pick node → pull Google Maps road trace (reference only, not copied art).
2. Define `realworld` block + Tiled map of the real strip at 32px.
3. Place eateries/landmarks/NPCs/City Pulse slots (atomic molecules).
4. Register district; map B & C auto-update. 5. Validate (reachable, bounded diegetically). 6. Audit → next pocket.
Legal: trace road shapes/names for authenticity; **no Google map tiles/screenshots shipped**; brands parodied.
