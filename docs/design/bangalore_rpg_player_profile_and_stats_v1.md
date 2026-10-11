# NAMMA OUTBREAK — Player Profile & Survival Stats v1.0
> Ground rule (user): every system serves the loop **Challenge → Action → Feedback → Progress → Reward → Curiosity**. Each section names its step.
> Inspiration: Pokémon LeafGreen (centres, gated routes) + Zelda (stamina/ability gating, world conditions).

## 1. Character Creation (industry term: *character creation*; output = *player profile*)
Shown once after Title. Pixel "offer-letter form" aesthetic. Loop step: **Curiosity** (player invests identity before play).
| Field | Type | Used for |
|---|---|---|
| `name` | text, 2–14 chars | all dialogue, Amma's calls, ID card |
| `gender` | M / F | body base, attire layers, PG type ("Gents"/"Ladies"), some NPC lines |
| `age` | 20–26 | dialogue flavour; drives "fresher" jokes |
| `hometown` | state + town (dropdown state, free-text town) | Amma's accent/food references, starter variant (flight/bus/train by distance), Kannada-auto-driver arc intensity, Reels content |
| `college` | free text | office small-talk, Ravi bonding line ("same tier-3 college story") |
| `degree` | B.E/B.Tech, B.Sc, BCA, MCA, B.Com, other | job-title, which colleagues approach player, Ravi's biology contrast |
```jsonc
"profile": { "name": "", "gender": "M", "age": 22, "hometown": { "state": "", "town": "" }, "college": "", "degree": "B.E" }
```
Rule: **profile fields gate content, never block it.** Everything is playable with any profile; profile only changes flavour and which variant you see.

## 2. Core Stats (Zustand `player.stats`)
| Stat | Start | Range | Down when | Up when | Loop step |
|---|---|---|---|---|---|
| `health` | 100 | 0–100 | hunger tick, rain w/o umbrella, heat on road, accident, Act 4 attack | eat, sleep, healthcare centre (full), gym (max+) | Feedback |
| `wallet` | ₹35,000 | ≥0 | every purchase via UPI/cash (`spend()`), deposits, fines | salary credit, odd jobs, selling | Progress |
| `social` | 0 | int | — | first conversation with each **named** NPC (not ambient crowd) | Reward |
| `stamina` (Zelda) | 3 | 3–8 | — | gym / sports ground milestones; = max **energy** pips; running drains energy (ADR-32) | Progress |
| `food` | 100 | 0–100 | −1 per game-minute awake | meals (Darshini 40, home-cooked 60, snacks 15) | Challenge |
| `stress` | 0 | 0–100 | overtime, jams, missed calls, Act 4 nights | park, guitar, call home, sports, dates | Feedback (≥70 wobble; 100 breakdown) |
| `phone.battery` | 100 | 0–100 | −1 per 2 game-min screen on; Reels ×2 | charge at home/office/café | Challenge |
Identity (ADR-21): never a number; shown as greyed dialogue, unrecognition lines, fading ID photo when stress high / social low.
Note: ₹35,000 replaces the earlier ₹12,000. Retune PG deposit beat: Shanthamma now asks ₹10,000 deposit + ₹8,000 advance so the squeeze still lands after cab + hotel extras.

## 3. Survival Model — gentle early, harsh late (ADR-16)
Same system, two tuning tables. Player is trained in Acts 1–3; it bites in Act 4.
| Source | Acts 1–3 | Act 4 |
|---|---|---|
| Hunger (`food` = 0) | health −1 / 2 min | health −3 / min |
| Rain, no umbrella | health −1 / min outdoors | −2 / min + cold status (slower) |
| Heat on road 12:00–15:00, walking | health −1 / 3 min | −1 / min, water item needed |
| Waterlogged tile | speed ×0.5, shoes wet (−1 health one-off) | same + infection risk if bleeding |
| Sleep | +30 health, resets food to 70 | +15, only in a base |
| Healthcare centre | full heal, ₹200 | full heal, barter only, may be overrun |
Health 0 in Acts 1–3 → wake at nearest healthcare centre, ₹500 deducted, day lost (Pokémon faint). Act 4 → game over / last base reload.

## 4. Starting Inventory (backpack)
| Item | Property shown | Act 4 value |
|---|---|---|
| Phone | battery %, signal bars | signal dies; torch + gallery only |
| Laptop | — (office key item) | battery bank / barter |
| Game ID (parody of Aadhaar: "Aadhaar-ish — Unique Idle Number") | name, photo, hometown | lockdown checkpoint pass |
| Offer letter | company name | kindling (dark joke) |
| Umbrella | durability 3 rains | blunt shove tool |
| ₹35,000 | in wallet | worthless after UPI death |

## 5. Infrastructure Types (districts.json `buildings[].type`)
| Type | Function | Loop step |
|---|---|---|
| `healthcare` (govt PHC / private clinic / hospital) | full heal; Act 3 hub; Act 4 overrun | Feedback |
| `eatery` (Darshini, café, mess, cart) | food +; social spot | Challenge→Action |
| `shopping_centre` (mall, Commercial St, Brigade Rd) | items, furniture, guitar | Reward |
| `bus_stand` / `metro_station` | transit nodes, lock states | Progress |
| `police_station` | report scams, lose/recover scooter; Act 4 weapons locker | Curiosity |
| `gym` | stamina +1 per milestone, ₹1,500/month | Progress |
| `sports_ground` (cricket, football turf) | social +, stamina events, Sunday NPC schedules | Reward |
| `pg` / `hotel` / `flat` | housing ladder | Progress |
| `office` / `lab` | story gates | Curiosity |

## 6. Live City Conditions (`conditions.json`, per district per day) — Zelda-style world state
| Condition | Effect | Trigger |
|---|---|---|
| `metro_construction` | station locked, dust tiles, slow lane | Whitefield until metro opens |
| `waterlogged` | tiles flood after rain ≥ 2 game-hours; autos refuse; bus detour | monsoon days, low-lying districts (Bellandur, KR Puram) |
| `traffic_jam` | ORR/Silk Board speed ×0.3 for scooter; bus stuck | 9–11, 18–21 |
| `power_cut` | charging off, dark tint | random, hill flat often |
| `bandh` | shops shut, buses off | scripted once in Act 2 |
| `festival` (Ganesha, Diwali, Karaga) | crowd NPCs, free food, social + | calendar |
| `lockdown` | Act 4 opener | scripted |
Each condition is a tint + tile-swap + NPC-schedule override, same machinery as the Act 4 ruined pass.

## 7. Where this lives
- Schema → `game_components_v1.md` §2 (player), §7 (economy), new §11 (stats/conditions)
- Code → `src/systems/SurvivalSystem.ts`, `src/systems/ConditionSystem.ts`, `data/conditions.json`, `data/stats.tuning.json` (two tables)
- Decisions → ADR-15 (profile gates flavour only), ADR-16 (gentle→harsh survival), ADR-17 (wallet ₹35,000)
