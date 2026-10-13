# Tasks (execution)
Updated: 2026-10-13
Task ids `T-###`, never reused. One line each; detail lives in `docs/design/`.

## Now — P6 Phone · fullscreen map · HUD · menus (style board, ADR-113/114)
- [x] T-032 P6a (approved 2026-10-13) — font pipeline (Pixelify Sans → bitmap `px`/`pxb`), UI palette + tokens, UI-kit molecules (5 states), PhoneScene: frame, status bar, home 4×3 + dock, Chats (list + thread), UPI, Maps (list), stubs; DND-aware buzz + unlock pop; playground preset `phone-day-3`
- [x] T-033 P6b (approved 2026-10-13) — fullscreen symbolic map (ADR-115): `city.json`, MapManager (visited/travelled/route/reroute/★/fast travel), glyph-field regions, 8px-grid paths dotted→solid, metro, nodes, label cards, yellow dashed route, legend, compass, 1×/2× zoom, M key + phone Maps; presets `map-day-3`
- [x] T-038 Map Area view (ADR-117): OSM streets around Prashanth Extension, pocket drawn at true size, player position inside it, street labels, © OSM — **built, awaiting audit** (before P6c)
- [ ] T-039 Real areas for the airport arrivals kerb and the Whitefield hotel street (choose their real spots, fetch, place) — and every new pocket from P7 on
- [ ] T-034 P6c — HUD rebuild in-canvas (objective, location card, clock, wallet tick, phone button top-right, context action, prompt bubble, toasts queue, autosave glyph, contextual meters, dialogue box) + 5 HUD presets; retires the DOM HUD (closes T-024)
- [ ] T-035 P6d — Pause / Settings (HUD scale, objective auto-hide, meter visibility, About & credits) / Save / Load / confirm dialogs, full keyboard + gamepad nav
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
- [x] T-011 P6 systems (ADR-110/111/112: slots via platform.saves, settings, phone rules, UPI ledger, Maps data, autosave triggers); UI split into T-032…T-035 · T-012 P7 Monday/office · T-013 P8 hill flat · T-014 P9 Cubbon + Ananya + City Moments
- [ ] T-015 Quest taxonomy → `help|social|deliver|investigate|collect|chase|combat-lite` (ADR-18/22) and rep tiers → Hosa/Gothu/Namma (ADR-26); migrate existing content ids to prefix convention (`npc_`, `q_`, `dlg_`…)
- [ ] T-016 M1 Android release · T-017 M2 iOS release (after web slice public)
- [ ] T-024 Landscape lock + "rotate your phone" panel in portrait; safe-area insets on HUD pills; **the HUD + quest panel cover ~⅓ of an iPhone-size screen** (playground phone simulation, 2026-10-13) — compact phone HUD (mobile foundation rules 4–5)
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
