# NAMMA OUTBREAK — SCENE TEMPLATE (the one recipe every scene follows) v1.0
> Every scene — airport to Lalbagh — is an instance of THIS. Copy, fill, validate, build. No engine changes per scene. Acts 0–1 are worked examples; Acts 2–4 are stubs to co-author in Claude Code.

## A. What a "scene component" is (3 artefacts + optional cutscene)
1. `data/scenes/<scene_id>.json`  — the scene component (schema §B)
2. `maps/<map_key>.json`          — Tiled map (layers: ground, ground_detail, props_below, collision, props_above, npc_spawn, pulse_slots)
3. quest + dialogue               — `data/quests/<quest_id>.json`, `data/dialogue/<id>.yarn`
4. (optional) `data/cutscenes/<id>.json` for scripted beats

## B. Scene component schema (fill every field; leave `TODO` in stubs)
{
  "id": "",                     // e.g. "act0_arrivals"
  "district": "",               // districts.json id (WorldScene loads this)
  "act": 0,                     // 0..4
  "title": "",                  // human label
  "time": "06:10 morning_haze", // feeds TimeSystem tint
  "player_goal": "",            // what the player is told to do
  "design_goal": "",            // what this teaches / plants (name the mechanic reveal #)
  "pacing": ["Calm","Curious","Engaged","Tense","Reward"], // ADR-24, order of beats
  "entry": { "from": "", "spawn": "" },
  "cast": [ { "npc": "npc_id", "tier": 1, "spawn": "obj", "schedule": "", "role": "" } ],
  "objects": [ { "id": "", "at": "obj", "requires": "item_id|null" } ],
  "quests": [ "quest_id" ],
  "beats": [                    // the scene, frame by frame (from story script)
    { "id": "F1", "pacing":"Calm", "what":"", "interact":"E/A/tap", "reward":"", "flag":"", "reroute":"" }
  ],
  "economy": [ { "trigger":"", "spend":0, "canAfford":true } ], // ADR money sinks
  "conditions": [ ],            // live city conditions in play (rain, construction...)
  "pulse_slots": [ ],          // City Pulse event slots available here
  "exits": [ { "zone":"", "to":"district_id", "spawn":"", "transit":"walk|bus|metro|scooter" } ],
  "save_flags": [ ],
  "assets_needed": [ ],         // tiles/sprites for art pipeline backlog
  "acceptance": [ ]             // what "done" means for the audit gate
}

## C. Build steps (identical every scene)
1. Fill the schema from the matching story beats (story_script_v1).
2. Draft the Tiled map from `assets_needed`; snap to 32×32; doors 32×48.
3. Author quest (type: help|social|deliver|investigate|collect|chase|combat-lite) + dialogue.
4. Register district in `districts.json`; wire exits/triggers; add money sinks.
5. Run validator (grid, reachability, asset refs, pulse slots). 6. Playtest the beats. 7. **AUDIT GATE** → record corrections → next scene.

## D. Fail-forward rule (every beat)
No beat is a dead end. Each failing beat sets `reroute`: a costlier path to the SAME destination (miss bus → pricier auto; fail negotiation → worse PG; faint → healthcare centre). (Google-Maps principle.)

## E. Worked examples vs stubs
- `data/scenes/act0_arrivals.json`, `act0_hotel.json`, `act0_pg_hunt.json`, `act1_monday.json`, `act1_intern.json`, `act1_not_working.json`, `act1_ambedkar_nagar.json`, `act1_bus_town.json`, `act1_cubbon.json` → FULLY FILLED from story_script_v1.
- `act2_*`, `act3_*`, `act4_*` → STUBS: id/district/act/title + `"status":"STUB"` + TODOs, co-authored with the user. Beats/cast pulled from story_script_v1 Acts 2–4 + act4_systems_and_cast_v1 when the user is ready.

## F. Checklist to turn the whole story into scenes (driver uses this)
Act 0: arrivals · hotel · pg_hunt. Act 1: monday · intern · not_working · ambedkar_nagar · bus_town · cubbon. Act 2 (stubs): salary_scooter · metro_opens · ravi_breakdown · ikea · dating_app · breadcrumbs · one_night(fade). Act 3 (stubs): fever · accident · ward · corridor_flashback · wake_lockdown. Act 4 (stubs): day1_plates · first_run · survival_job · base_chain(hill→darshini→cubbon→palace→lalbagh) · pulse_gun_runs · ravi · ending(evacuate|hold|groundzero).
