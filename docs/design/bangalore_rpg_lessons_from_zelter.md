# NAMMA OUTBREAK — Lessons from Zelter (anti-patterns to avoid) v1.0
> Source: user note 2026-10-11 on why Zelter (our visual reference) struggled after its 2020 Steam Early Access launch.

| Zelter mistake | Our rule | Already supported by |
|---|---|---|
| **Crafting took too long** | Recipes craft in ≤ 3 s, ingredients findable within one district; only 4 recipes (ADR-14/§7 Act 4 doc) | ADR-14, Act 4 §7 |
| **Hordes instantly destroyed bases** | No instant base loss. A base falls only when its district's `stability` drops — **warned 1–2 in-game days ahead** (News, Raju, UV lamp flicker). Relocation is a planned move, not a wipe. Generator-off nights are scripted once, survivable | ADR-20, ADR-33 |
| **Zombies soaked immense ammo** | No bullet sponges. Melee stuns (2 s), **Pulse Gun = one shot, one kill**, 20 charges. Scarcity comes from charges, not HP | ADR-48, Act 4 §8 |
| **Trailer showed features not in the build** | **Trailer & store page show only what is in the shipped build.** Every trailer shot is captured in-engine from the release candidate | — (new ADR-53) |
| **Early Access with an un-fun core** | Never ship publicly before **M0 + vertical slice are fun in playtests**. First public release = free demo (Acts 0–1) or a complete Acts 0–2, with an honest roadmap | Engagement charter §5 step 6 |
| **Overhauled direction multiple times post-launch, alienating players** | **Design pillars freeze at first public release.** Before launch, pivots are fine (we've done one). After launch, changes are additive only; any pillar change needs a new ADR + player communication | Working agreement, ADR log |

## Design pillars (freeze candidates — confirm before first public release)
1. Real Bangalore, lived-in: money, housing, transit, language, weather.
2. Slow burn: a life-sim that turns into survival; the turn is earned.
3. Light combat: tension and escape, not killing.
4. Escapable but never comfortable.
5. Fail forward / reroute: wrong turns cost, never dead-end. (pending user yes/no on mechanics)

## ⚠️ Drift check raised (working agreement)
Story v1 premise: *"trailer shows apocalypse, game doesn't early."* Under the Zelter lesson this risks the **reverse bait-and-switch**: buyers expecting zombies get two acts of PG-hunting.
**Proposal (ADR-53):** keep the apocalypse in the trailer, but make it honest about structure — open on real Act 0–2 footage (airport, chai, PG, Cubbon), then the turn, then Act 4. Store page states plainly: *"A slow-burn story: you'll live in Bangalore before you survive it."* User to choose: keep original trailer idea / adopt this.
