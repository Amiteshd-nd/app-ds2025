# NAMMA OUTBREAK — "City Pulse": Live Events, Moment Marketing & Sponsors v1.0
> The X-factor. A living Bangalore that reacts to the real city — safely, optionally, and without touching core architecture, story, or balance.
> Principles obeyed: fail-forward/non-forced (Google Maps reroute), anti-Zelter (cosmetic only, no bait), no pay-to-win (ADR-43), blur-the-line (no real names/sides).

## 1. What it is
Each district has a few **event slots** (a shop front, a corner, a wall, a crowd point). An **event** switches a slot on for a date range using **art we already have** + 1–2 dialogue lines. The shipped game knows nothing; events arrive over the network like a weekly newspaper the PWA downloads. **Never generated live in front of the player. Never forced** — it lives in one corner of one district for a limited time; only players who wander there find it. Discovery = reward + marketing.

## 2. Three uses of the same system
| Use | Example | Rule |
|---|---|---|
| **Moment marketing** | Real protest trending → a crowd with **blank placards** at a junction for that week; water crisis → tanker queue; festival → lights + free-sweets NPC | Depict the *shape*, never name a real shop/person/political side (ADR-55) |
| **Sponsors** | A food-delivery offer banner on a wall players actually pass | **Cosmetic background only, labelled ad space, no gameplay effect** (ADR-43). Act 4: banner half-torn, faded (ADR-56) |
| **Live ops / seasonal** | Diwali skin week, a limited City Moment, a survivor-letter event | Opt-in surprise, time-boxed |

## 3. Architecture (data-driven, zero core change)
data/city_pulse/
  slots.json            # per district: slot id, position, allowed event types, art anchor
  events/2026-W41.json  # weekly bundle: [{slot, type, art_ref, dialogue, start, end, blur:true}]
  sponsors/active.json  # [{brand, asset, slots[], start, end, labelled:true}]
- `CityPulseSystem` loads the current bundle on scene enter, lights up matching slots with existing atlas art, binds optional dialogue/trigger. Expired = slot reverts.
- Events are **additive overlays** on a district — same machinery as `_ruined` tint and `conditions.json`. No new scene code.
- Offline-first: last bundle cached; no network = base city. Validator: every `art_ref` exists; every slot is a real Tiled object; no event blocks a quest path.
- Moderation: all bundles **human-approved before publish**; a kill-switch flag blanks all City Pulse instantly.

## 4. Safety / legal (hard rules)
1. Blur-the-line: no real brand/person/victim/political party named or identifiably depicted in *event* content (ADR-55). Sponsors are the only real names, only in labelled paid slots.
2. Sponsor ads cosmetic, clearly ads, never affect stats/survival/progression; decay in Act 4.
3. Player tracking for ad placement: privacy-light, consented, aggregate heatmaps only (no PII); disclosed; affects rating — open decision.
4. Events never force the player and never dead-end a quest.

## 5. Why it grows the game
Freshness without new builds · built-in marketing ("they added the UB City thing in a week") · a real revenue line that respects the player · reuses existing art, near-zero art cost per event.
