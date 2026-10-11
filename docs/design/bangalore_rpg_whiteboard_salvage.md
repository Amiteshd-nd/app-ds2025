# NAMMA OUTBREAK — Salvage from Early Whiteboard (2026-10-11)
> Source: user's pre-session whiteboard (Grey Syndicate era). Villain/5-act structure is SUPERSEDED (see ADR-03, story v1). Everything below is what still earns its place. Nothing existing is overwritten.

## 1. Keep as-is → already covered
| Whiteboard item | Already covered by |
|---|---|
| Survival stress, limited resources | Profile & Stats §3 (gentle→harsh) |
| Mystery / hidden truth behind city | Story v1 Act 2–3 (HIVR, Reels fever clips); virus replaces Syndicate |
| Bangalore daily life, not grinding | Story v1 Acts 1–2 |
| Light combat → tension not focus | Components §8 (shove + run), ADR-14 |
| Explore → find NPC → mission → points → item/clue | Core loop (Components §1) |
| Complete missions → unlock zone → new story layer | Metro gating (Components §4) |
| Trust level (NPCs) | ReputationManager |
| Spend on food / travel / gear / access | Economy (Components §7) |

## 2. New — adopt
### 2.1 Mission taxonomy (reusable quest templates → `quests/*.json` gets `type`)
| Type | Example in OUR story | Reward | Loop step |
|---|---|---|---|
| `help` | Help Shanthamma's cook find the gas cylinder; escort Ananya's cycle back | wallet / social / trust | Action |
| `investigate` | Track Ravi after the 1 AM call; find where the fever Reels were shot (Hebbal) | story flag | Curiosity |
| `collect` | **"City Moments"** — photograph 30 spots (bandstand, Vidhana Soudha, filter-coffee tumbler…). Ties to Ananya (photographer) & Gallery app | upgrades, Gallery fills, Act 4 nostalgia | Reward |
| `chase` | Scooter chase of the RC-fraud seller (Act 1 closer); Act 4 bike escape from Yeshwantpur | unlock fast-travel node | Feedback |
| `combat-lite` | Act 4 only: break through, don't fight | survival | Challenge |
Engine: 5 handler types, infinite instances. Each quest JSON declares `type`, `giver`, `steps[]`, `reward{}`.

### 2.2 Stress (sanity-lite) stat → added to Profile & Stats §2
| Stat | Start | Down | Up | Effect |
|---|---|---|---|---|
| `stress` | 0 | overtime, traffic jam, PG fights, missed Amma call, Ravi flashback, Act 4 nights | Cubbon Park, guitar, call home, sports ground, dates | ≥70: scooter wobble + UI jitter; 100: forced sleep / breakdown scene |
Design value: the player carries the same meter Ravi had — his tragedy is *felt*, not told.

### 2.3 Zone stability → `districts[].stability` 0–100
Acts 1–3: cosmetic (hoardings, potholes, waterlogging frequency). Act 4: the fall order (Hebbal→…→Whitefield) is stability hitting 0 per district on a timer; infected density = `1 − stability`. One number drives the whole collapse.

### 2.4 Clues as a counted currency → `inventory.clues[]`
Not spendable. Gates Act 3: ≥5 clues (lab shuttle sighting, Ravi's badge, news item, Reels clip, HIVR cold-box) unlock the *full* hospital flashback. Supports `investigate` missions.

### 2.5 Fast travel earned, not given
Metro stations unlock by challenges (existing). Add: `chase` / `collect` missions can unlock an **auto-stand fast-travel node** per district before the metro opens.

## 3. Rejected (recorded so we don't re-debate)
| Item | Why dropped |
|---|---|
| Grey Syndicate villain, "Chaos is inefficient" | ADR-03: accident-not-villain; origin is negligence |
| Act 3 "Discovery of villain", Act 5 "Final confrontation" | No boss; ending = survival/escape (ending count still open) |
| Points as main currency | Rupees; realism is the hook |
| Open-world GTA from the start | LeafGreen gating; open-world feel arrives with scooter + metro in Act 2 |

## 4. Doc updates made
Profile & Stats §2 + `stress` · Components §11.1 · Decisions ADR-18/19/20


---
# Screenshot 2 — "Option C: You Are Losing Yourself" board (2026-10-11)

## 1. Already covered
| Item | Where |
|---|---|
| Explore → Meet NPC → Problem → Solve → Earn | Core loop |
| Gain trust → unlock contacts → bigger missions | ReputationManager + NPC tiers |
| Struggle → Growth | Housing ladder, salary, scooter |
| Problem-solving / Investigation / Combat / Social mission cards | ADR-18 taxonomy (social ⊂ help; see 2.2) |
| World as districts; Airport = "small problems, introduces systems" | districts.json, Scene 0.1 |
| Tasks: NPC interaction, mission triggers, reward system, scalable quest structure | Technical v1 §6 (QuestSystem, Triggers.bind) |

## 2. New — adopt
### 2.1 "You are losing yourself" as the **player's** slow arc (strongest idea on the board)
Reframe, not crime: the city erodes the small-town self. Implement through **three cheap, reversible signals** tied to `stress` and `social`:
| Signal | Trigger | Reversal |
|---|---|---|
| **You forget things** — Amma's call: a dialogue option goes grey ("What was the name of our temple street?") | stress ≥ 60 for 3+ days | call home, visit a City Moment, festival |
| **People don't recognise you** — hometown NPC on a train/bus or a Reels comment ("you've changed, da") | social with hometown-tag NPCs = 0 for 2 weeks | reply to them in Chats |
| **Identity fading** — ID-card photo on the pause screen slowly desaturates; office lanyard replaces name with employee ID in dialogue headers | stress + overtime | guitar, Ananya, Ravi friendship |
Payoff: Act 4 inverts it. When UPI, job and lanyard die, the **hometown self comes back** (Amma's recipes = crafting recipes; hometown slang unlocks a barter NPC). ADR-21.
→ "Points = stability / identity" becomes exactly this: **identity meter = 100 − stress, surfaced visually, never as a number.**

### 2.2 Social missions as a first-class type (board says VERY IMPORTANT — agree)
Add `social` to taxonomy: build trust, convince, negotiate. Our story already has them unlabelled: PG deposit negotiation, Shanthamma, Kannada auto driver, RC-fraud owner at the gate, Ananya's UPI, Act 4 barter. Engine: a **negotiation mini-system** (offer / counter / walk, three NPC "temperaments", reputation modifier). One handler, reused everywhere. ADR-22.

### 2.3 Delivery / transport missions (GTA-style, timed)
"Deliver under time, avoid checkpoints" maps cleanly:
- Act 1–2: Dunzo-style side gigs for the player's own wallet; **traffic conditions** (Conditions §6) are the obstacle; teaches scooter + fuel.
- Act 4: run medicine/water between bases, avoid infected patrol lanes = same handler, different obstacle.
Add `deliver` to taxonomy → final set: `help | social | deliver | investigate | collect | chase | combat-lite`.

### 2.4 District *flavour tiers* (strip the crime, keep the texture)
| Board | Ours |
|---|---|
| Local streets: theft, scams, small gangs | PG lanes: scams (RC fraud, broker fees, fake PG listings), lost items, neighbour disputes |
| Tech parks: corporate crime, data leaks, surveillance | Whitefield/ORR: overtime, badge access, HR, the **HIVR data leak as a rumour thread** (investigate missions seed Act 3) |
| Night areas: illegal deals, black market | Indiranagar/Church St night: drinking-with-colleagues beats, dating-app meetups, Act 4 black market → barter hub |
| High-end areas: politicians, big players | Koramangala/Sadashivanagar: landlord/boss class NPCs, "society" gates; Act 4 gated-community fortresses |
Store as `districts[].flavour` tags driving which quest templates spawn there.

### 2.5 Enemy behaviour tiers → infected AI (Act 4), not goons
| Board | Reuse as |
|---|---|
| Early: local goons / thieves — basic chase, simple attack | Infected T1 "wanderer": single, slow, basic chase |
| Mid: organised gangs — group attacks, patrols | Infected T2 "cluster": patrol lanes along stability<30 districts, group lunge on noise |
Same two-tier behaviour design, zero crime content. Noise (plate-banging, scooter engine, guitar!) is the aggro trigger. ADR-23.

### 2.6 "Outsider → trusted fixer → key player" ladder → **"outsider → regular → local"**
Reputation tiers renamed for our tone: *Hosa* (new) → *Gothu* (known) → *Namma* (one of us). Unlocks: Kannada dialogue options, Darshini discount, auto driver picks you up in Act 4.

## 3. Rejected
| Item | Why |
|---|---|
| Crime thriller tone, mafia, gang combat, data-leak corporate villainy | ADR-03 / ADR-14 |
| Points as stability | Replaced by `stress` + `stability` + identity signals (2.1) |

## 4. Updates made
Components §11.2 · Decisions ADR-21/22/23 · Profile & Stats §2 note on identity · Unfinished: negotiation mini-system spec, delivery handler spec


---
# Screenshot 3 — "Phase 4 update / Phase 5 thoughts" (2026-10-11)

## 1. Already covered
| Item | Where |
|---|---|
| Grounded world + cinematic moments | Story v1 (realism) + CutsceneScene (Technical §1) |
| Mission states, reward system, unlock next mission | QuestSystem + ADR-18/22 taxonomy |
| Warm lights + dark streets + muted colours | Art pipeline STYLE BLOCK (Zelter palette, "night sodium-lamp") |

## 2. New — adopt
### 2.1 Emotional pacing curve (layer *on top of* the core loop) — ADR-24
Core loop = what the **systems** do (Challenge→Action→Feedback→Progress→Reward→Curiosity).
Pacing curve = what the **player feels**: **Calm → Curious → Engaged → Tense → Reward → Repeat** ("go → discover → react → tension → payoff").
Rule: every scene in the story script gets a `pacing:` tag per beat, and no two Tense beats run back-to-back without a Calm. Example Scene 1.6 Cubbon Park: Calm (walk in) → Curious (Ananya stuck at cycle rack) → Engaged (help/UPI) → Tense (guard / time) → Reward (ride together) → Calm (bench).
Act 4 compresses the curve (Calm gets shorter), which *is* the horror.

### 2.2 Interaction contract
`Interact` = **E** (keyboard) / **A button** (on-screen, PWA) / **tap NPC** (touch). Flow: prompt bubble appears within 1 tile → dialogue → choice (`accept / decline / later`). Declined missions stay on the NPC with a `!` marker; "later" adds to Phone → Chats as a reminder.

### 2.3 Mission state machine (extend QuestSystem)
`locked → available → active → completed` + `failed` (timed delivery/chase) + `expired` (world moved on: e.g. PG quests after you move out, everything pre-lockdown in Act 4). Expired missions are a quiet storytelling tool — the Phone shows them struck through after the outbreak.

### 2.4 Lighting — "biggest upgrade lever" (agree) — ADR-25
- Phaser `Lights2D` pipeline: per-lamp point lights (sodium orange `#FFB050`, radius 3 tiles), shop-front spill, phone torch in Act 4.
- Night tint via full-screen multiply (`TimeSystem` drives 4 keyframes: morning haze, noon, evening gold, night blue).
- Soft shadows: baked 1-tile blob under characters/vehicles; no dynamic shadows (perf on mobile PWA).
- Tiles need normal maps? **No** — keep flat; lights are additive glow sprites + ambient tint. Cheap and Zelter-like.
- Power-cut condition = lamps off in a district; Act 4 = most lamps dead → lit areas become safe zones (gameplay from art).

### 2.5 Scale rule: player height ≈ door height
Character 32×48 → **standard door = 1 tile wide × 1.5 tiles tall (32×48)**, shop shutters 2×1.5, gates 2–3 wide. Add to map-validator as a warning (door objects must be 48 px tall) and to the art pipeline façade kit.

### 2.6 Minimal Playable Loop (milestone *before* the vertical slice) — "M0"
Spawn at airport → talk to chai Anna (E) → mission "Buy a chai and find the Vayu Vajra stop" → complete → +₹ spent, +1 social, unlock next mission (bus).
Exercises: WorldScene, interaction, dialogue, quest states, `spend()`, reward, district exit. Goal: proves the whole pipeline end-to-end in ~1 day after WorldScene lands. Added to TASKS as the first "Now" target after migration step 4.

## 3. Open / disagreement
| Item | Note |
|---|---|
| "+ reputation" struck out on the board | We currently **keep** reputation (Hosa→Gothu→Namma, Act 4 auto driver payoff). Confirm with user. |
| "Points" | Rupees + social + clues replace points (already decided). |
