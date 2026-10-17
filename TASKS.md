# Tasks (execution)
Updated: 2026-10-16
Task ids `T-###`, never reused. One line each; detail lives in `docs/design/`.

## Now — Render model (user's layering brief, ADR-125) · then Act 2
- [x] T-048 Part A render model — all ten maps migrated and A5-walked 2026-10-16 (AUDIT_LOG table); airport approved: seven layers in the manifest, `sorted` band (cut-outs with footprints, `above` images), `collision` rects with kinds, `FEET_BOX` token, `feetY` depth, validator rules A3 (seven layers, tall tiles, walls↔collision, props_above, footprints, reachability, no depth literals), tests A4 (402 green). Next: migrate whitefield_street, hotel, Prashanth, PG room, ITPL gate, hill, flat, bus, Cubbon with the A5 walk each (AUDIT_LOG), then Part B
- [x] T-049 Part B Playground Locations — built 2026-10-16, awaiting the user's audit with Part A: root node + per-scene Locations, free-roam inspection with layer eye toggles, collision boxes, Y-sort lines, feet boxes, band tints, validator panel, click-to-inspect + Copy ref (needs the validators split into pure modules the browser can import)
- [ ] T-051 Cables as overhead cut-outs on Prashanth Layout and the hill (hand-painted overlays or a re-render with cables off + a cable sprite) — they stay painted on the ground for now
- [x] T-050 Street tileset: tag `tall` and `door` tile properties in `street.tiles.json` so rule 2 and rule 4 bite on tile-built maps; move the street's awnings to `props_above`

## Act 2 (stubs co-authored with the user; Act 1 complete 2026-10-16)
- [x] T-052 P10 = 2.1 "Credited" — approved 2026-10-16 (ADR-126: paydays, Noor Motors pocket on ITPL Main Road, outright haggle + EMI, fuel + bunk, Maps RIDE, contextual fuel gauge, parked scooter by flag)
- [x] T-047 Act 2–4 scene STUBS scaffolded; 2.1 decided by the user and built as P10 (T-052); 2.2+ remain stubs to co-author
- [ ] T-054 Playground Movie Mode (the user's brief, plan approved 2026-10-16, ADR-128): step 2 approved 2026-10-16; **step 3 built 2026-10-17 — generator + 12 walkthroughs + the full movie green (12/12, 0 cheats), four game bugs fixed on the way (ADR-129) — awaiting the user's audit**; **step 4 built 2026-10-17 — `pnpm movie` headless (12/12 green, ~90 s), `--twice` determinism (identical 243-step trace and game times), the bot haggles (`planHaggle`), per-scene seeds (ADR-130) — awaiting the user's audit**; step 5 docs done with step 4
- [x] T-053 P11 = 2.2 "Metro Opens" + 2.2b "First Train" — approved 2026-10-16 (ADR-127: the opening on the sleep after the scooter decision, the station mouth and opening-day dressing on the street, the concourse pocket with the lost kid / token jam challenges, the coach ride with the seat check, Maps METRO fast travel ₹0 → ADR-115 fare, metro_tier_1)
- [ ] T-055 P12 = 2.3 "Guitar" — defaults taken by the user 2026-10-17; **built 2026-10-17 (ADR-131): Church Street + guitar shop pockets, busker, guitarNights ("Tuesday"), Maps METRO before the first visit, ₹6,500 purchase, RhythmScene three lessons one a night, the clip for Ananya; `pnpm movie` 13/13 green and deterministic — awaiting the user's audit**
- [ ] T-056 P13 = 2.4 "IKEA Run" — defaults taken 2026-10-17; **built 2026-10-17 (ADR-132): Majestic interchange + lost uncle, Green Line coaches, Hyggeland (arrows, tags, café, aisle, tills), the carry limit + BOXES plate, the aunty on the ride home, ₹10/box on the hill bus, assembly + the folded table, Sameer's ₹699; `pnpm movie` 14/14 deterministic — awaiting the user's audit**
- [ ] T-057 P14 = 2.5 "Ravi, 1 AM" — defaults taken 2026-10-17; **built 2026-10-17 (ADR-133): night rules + the night look (core), the 00:50 wake in a power cut, night autos, Ravi at the shuttle bay (sit / ₹2,000 / both / leave), the morning message; `pnpm movie` 15/15 deterministic — awaiting the user's audit**
- [ ] T-058 P15 = 2.6 "The App" — defaults taken 2026-10-17; **built 2026-10-17 (ADR-134): Jodi (four cards, avoidable), Tanvi at the café, Sunday at the bandstand → strained; three Maps bugs fixed; the bot rides METRO through Maps; `pnpm movie` 16/16 deterministic — awaiting the user's audit**
- [ ] T-059 P16 = 2.7 "Breadcrumbs" — defaults taken 2026-10-17; **built 2026-10-17 (ADR-135): four mornings of news (News app + Reels), Sameer sick and back, the AMR-07 clue, the guard's salute, Amma's call → act2_done — Act 2 complete; awaiting the user's audit**
- [ ] T-060 P17 = 3.1 "Outer Ring Road" (Act 3 opens) — defaults taken 2026-10-17; **built 2026-10-17 (ADR-136): ACT 3 — FEVER on waking, Divya sends you to HIVR, the office door plays the card sequence (the HIVR day, the AMR-07 overwrite at 02:14, the ride home over the Hebbal junction still, the cut, the ambulance fragments, the green lanyard, APPA), it holds on Ravi until 3.2; scooter wrecked or Sameer's bike; CardScene reusable — awaiting the user's audit**
- [ ] T-061 P18 = 3.2 "Ward 4" — defaults taken 2026-10-17; **built 2026-10-17 (ADR-137): 3.1 lands in a 12×8 government ward at 10:20; cast = slower walk; Sister Lalitha (the bus nurse); the dark isolation door, tapping; the TV ticker; Ravi in the next bed over three visits → "Appa called. I answered."; the ward stays playable — awaiting the user's audit**
- [ ] T-062 P19 = 3.3 "The Corridor" — defaults taken 2026-10-17; **built 2026-10-17 (ADR-138): "Tell me." → play as Ravi at 01:52 on the rainy Thursday; Appa's call (Ignore greyed out); the glove station refuses; tray AMR-07 unsealed at 02:14; the ant in four stills; Vikram's dripping locker; back to the ward at 18:30 — awaiting the user's audit**
- [ ] T-064 P20 = 3.4 "Three Nights, Again" — draft written 2026-10-17 (`act3_three_nights.json`: the hotel's countdown comes back as 'Discharge · 3 nights'; three ward nights — curfew headline, Amma 'Come home', UPI 'Server busy' + no signal; the woman's bed empty, the door silent; morning 3 Ravi's bed stripped, IV line on the floor; the ward's sound thins through the stability bands; ten open questions) — **waiting for the user's answers**
- [ ] T-063 Audio (`docs/audio_plan_v1.md`) — A1 (ADR-139), A2 (ADR-140) and **A3 batch 1 (ADR-141, Kenney: 60 tokens real)** built 2026-10-17 — awaiting the user's audit. Next batches: the user's recordings (§5.4) → Freesound CC0 (§5.3, the user downloads); ffmpeg (user installs) for OGG/M4A; then composed music and the mobile check
- [ ] T-016 / T-017 mobile smoke tests are blocked on this machine: no Xcode (Command Line Tools only) and no Android SDK — install one, then `pnpm cap:android` / `cap:ios`

## Act 1 (P7 office ADR-120/121 · P8 hill flat ADR-122 · P9 Cubbon ADR-123/124)
- [x] T-012 P7 Monday / office — approved 2026-10-16
- [x] T-013 P8 Ambedkar Nagar hill flat — approved 2026-10-16 (ADR-122)
- [x] T-014 P9 Cubbon Park + Ananya + City Moments — approved 2026-10-16 (ADR-123 systems: `busSchedule` + HUD timer plate, `busRide`, Camera + `photoSpots`, RelationshipManager + Contacts, Notes wishlist, `companion`, NPC `tic`, chat `upi`; ADR-124 pockets: `cubbon_park` on the bandstand (OSM), `bus_interior`, the street's barricade + kerb stop, `street_props` + `animals` sheets, eight sheets; quests 1.5–1.6, scene components, Amma's call, Act 1 close → `act2_started`)
- [ ] T-043 Auto-rickshaw + HIVR van props — art done in `street_props` (cells 4–5, ADR-124); still to place at Prashanth's auto stand and the ITPL shuttle bay as `AUTO_RICKSHAW` / `VAN` objects
- [ ] T-044 Bus passengers sit (draw the three on their seats instead of standing in the aisle) — a seated-pose row in the sheet template, or a `seated` NpcDef flag that lifts the sprite onto the seat and drops its body
- [ ] T-045 Ambient crowd spawns can land inside Shapes blocks on generated maps (Cubbon's `ambient_area` overlaps hedges) — spawn on walkable ground only
- [ ] T-046 Act 2 stubs: `act2_started` already unlocks the Dating app on the last Act 1 sleep (ADR-07) — co-author 2.1+ with the user before any Act 2 content

## Done — P6 Phone · fullscreen map · HUD · menus (style board, ADR-113/114)
- [x] T-032 P6a (approved 2026-10-13) — font pipeline (Pixelify Sans → bitmap `px`/`pxb`), UI palette + tokens, UI-kit molecules (5 states), PhoneScene: frame, status bar, home 4×3 + dock, Chats (list + thread), UPI, Maps (list), stubs; DND-aware buzz + unlock pop; playground preset `phone-day-3`
- [x] T-033 P6b (approved 2026-10-13) — fullscreen symbolic map (ADR-115): `city.json`, MapManager (visited/travelled/route/reroute/★/fast travel), glyph-field regions, 8px-grid paths dotted→solid, metro, nodes, label cards, yellow dashed route, legend, compass, 1×/2× zoom, M key + phone Maps; presets `map-day-3`
- [x] T-038 Map Area view (ADR-117, approved 2026-10-13): OSM streets around Prashanth Extension, pocket drawn at true size, player position inside it, street labels, © OSM
- [ ] T-039 Real areas for the airport arrivals kerb and the Whitefield hotel street (choose their real spots, fetch, place) — and every new pocket from P7 on
- [x] T-034 P6c (ADR-118) — HUD rebuilt in-canvas (objective, location card + NEW, clock + sky glyph, wallet tick, phone button top-right, context action, prompt bubble, toast queue, SAVED glyph, contextual meters, dialogue card with typewriter + pills), in-canvas joystick, rotate panel; 5 HUD presets; DOM HUD + TouchControls deleted (closes T-024) — approved 2026-10-16
- [x] T-035 P6d (ADR-119) — MenuScene: Pause / Settings from `data/menus/settings.json` (9 sections incl. HUD auto-hide + meters, Larger text = 2× HUD/menus, About & credits) / Save / Load / Delete / confirm dialogs; keyboard + gamepad (`ui/kit/gamepad.ts`, also HUD walk, phone, map, dialogue, title) + touch; Title gains Load Game + Settings; phone Settings app → menu; background → autosave + pause — approved 2026-10-16
- [ ] T-040 Dialogue card at 2× (Larger text): page long lines, two-line choice pills — or cap content at 40-char lines / 30-char choices per the design system
- [ ] T-041 Save export / import in Settings → Data (needs a `platform.files` download/upload molecule; web = Blob download, native = share sheet)
- [ ] T-042 Key rebinding (Settings → Controls) once the input map has named actions
- [x] T-001 P0.1 Adopt the 5 repo docs (CLAUDE/ARCHITECTURE/TASKS/DECISIONS/MEMORY) + `docs/design/` per `project_docs_convention.md`
- [x] T-002 P0.2 `WorldScene` refactor (tech §7 steps 1–4): Populate/Exits/Triggers, `districts.json` v2, `TransitScene` card airport→whitefield_street, delete Airport/Whitefield scenes, saves persist `districtId+spawnId`
- [x] T-003 P0.3 Extend validators: district reachability from `airport` via exits, spawn/zone/npc/`to` references, door objects 32×48 (warn), City Pulse slot checks
- [x] T-004 P0.4 Platform shell: `src/platform/` interface + `web.ts` + `native.ts`, Capacitor config, `android/` + `ios/` generated from one `dist/`, Title boots on web (Android emulator + iOS simulator need Xcode/Android Studio — see MEMORY)

## Next

- [x] T-006 P2 Character creation form → profile, generated+imported M/F × 5 skins, walk preview — approved 2026-10-12
- [x] T-007 P3 Stat model (health/wallet ₹35,000/social/stamina/food/stress/battery) + `spend()`/`earn()`/`meet()` (ADR-87)
- [x] T-008 P3 M0 minimal loop — approved 2026-10-12

## Later
- [x] T-009 P4 Hotel: `whitefield_hotel` (generated interior, ADR-92), TimeSystem (ADR-91), `hotelNightTimer` (ADR-93), check-in quest, Divya call — approved 2026-10-12
- [x] T-010 P5 PG hunt (approved 2026-10-12): Prashanth Layout + Shanthamma's PG room (generated), negotiation mini-system (ADR-95), NPCs remember (ADR-96), food drain (ADR-97), lane cast generated (ADR-98) — **built, awaiting P5 audit**
- [x] T-025 Shanthamma's voice approved as drafted; ADR-97 food drain and the HiveNest retune confirmed (P5 audit round 1)
- [x] T-026 P5 audit round 1 fixes: generated crowd, pixel-precise collision + occluders (ADR-99), interiors at character scale on black (ADR-100) — approved
- [ ] T-029 Idle breathing — **parked, switched off** (user, 2026-10-12). Baked upper-body pipeline + controller kept (ADR-107); breath lines await approval; seated characters never breathe
- [x] T-030 Test Playground (ADR-104/105/108) — approved 2026-10-13: tree, prerequisite builder, quiet inspector, presets, deep links, isolated saves, export-with-confirm, light/dark, resizable panels, phone-in-landscape thumbs simulation
- [x] T-031 Brand-new airport (ADR-109) — approved 2026-10-13
- [x] T-028 Living title screen (ADR-101/102) — approved 2026-10-13
- [x] T-011 P6 systems (ADR-110/111/112: slots via platform.saves, settings, phone rules, UPI ledger, Maps data, autosave triggers); UI split into T-032…T-035 · T-013 P8 hill flat · T-014 P9 Cubbon + Ananya + City Moments
- [ ] T-015 Quest taxonomy → `help|social|deliver|investigate|collect|chase|combat-lite` (ADR-18/22) and rep tiers → Hosa/Gothu/Namma (ADR-26); migrate existing content ids to prefix convention (`npc_`, `q_`, `dlg_`…)
- [ ] T-016 M1 Android release · T-017 M2 iOS release (after web slice public)
- [x] T-024 Landscape lock + "rotate your phone" panel in portrait; safe-area insets on HUD pills; **the HUD + quest panel cover ~⅓ of an iPhone-size screen** (playground phone simulation, 2026-10-13) — closed by P6c (ADR-118): canvas HUD, bottom 20 px kept clear, OrientationScene
- [x] T-023 Airport regenerated in the locked style; reference art deleted, provenance closed (ADR-109)
- [x] T-022 Every character on screen is a generated sheet (lane cast, crowd, hotel receptionist, airport six — ADR-98/100/109); attire layers move to their own task when needed through the import pipeline (same template); attire layers so age/bag variants and NPC outfits composite from one base
- [ ] T-027 Occluders + pixel collision for the hand-made airport map and the procedural Whitefield street (only generated maps have them so far)
- [ ] T-021 Regenerate `street.png` + airport tilesets on `palette.gpl` (validator warns today) — pixel font done in T-032
- [ ] T-018 Decide: install Xcode + CocoaPods on this Mac, or cloud macOS CI, for iOS builds; install Android Studio for the emulator smoke test

## Done
- [x] T-005 P1 Style Lock — candidate D locked: `_meta/style/style_sheet.png` + `_meta/palette.gpl` (2026-10-12)
- [x] T-019 P0 audit (2026-10-12): title → Bangalore Times (ADR-77); ADR-66/67/75 confirmed (ADR-78); rules in AUDIT_LOG.md
- [x] T-000 All design docs + decisions ADR-01..64, City Pulse, mobile foundation, pitch deck, phased plan (2026-10-11)

## Gates
Audit after EVERY phase (`AUDIT_LOG.md`). Ask for references before visual work (ADR-30). Don't build ahead of an audit. Mobile smoke test at every gate. Tests green before and after every change.

- [ ] T-036 Act 4 map overlay (red dither where stability < 40, green spread fog, ☠ rows) — needs district `stability` + `grade()` (ADR-105)
- [ ] T-037 City Pulse `?` rumour icons on the map once rumours exist (shown only after the player has heard them)
