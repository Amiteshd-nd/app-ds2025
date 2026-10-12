# Tasks (execution)
Updated: 2026-10-12
Task ids `T-###`, never reused. One line each; detail lives in `docs/design/`.

## Now — P3 M0 minimal loop
- [x] T-001 P0.1 Adopt the 5 repo docs (CLAUDE/ARCHITECTURE/TASKS/DECISIONS/MEMORY) + `docs/design/` per `project_docs_convention.md`
- [x] T-002 P0.2 `WorldScene` refactor (tech §7 steps 1–4): Populate/Exits/Triggers, `districts.json` v2, `TransitScene` card airport→whitefield_street, delete Airport/Whitefield scenes, saves persist `districtId+spawnId`
- [x] T-003 P0.3 Extend validators: district reachability from `airport` via exits, spawn/zone/npc/`to` references, door objects 32×48 (warn), City Pulse slot checks
- [x] T-004 P0.4 Platform shell: `src/platform/` interface + `web.ts` + `native.ts`, Capacitor config, `android/` + `ios/` generated from one `dist/`, Title boots on web (Android emulator + iOS simulator need Xcode/Android Studio — see MEMORY)

## Next

- [x] T-006 P2 Character creation form → profile, generated+imported M/F × 5 skins, walk preview — approved 2026-10-12
- [x] T-007 P3 Stat model (health/wallet ₹35,000/social/stamina/food/stress/battery) + `spend()`/`earn()`/`meet()` (ADR-87)
- [ ] T-008 P3 M0 minimal loop: airport → Chai Anna (₹20 via spend) → HIVR breadcrumb → Vayu Vajra exit (₹250 fare) → Whitefield; touch joystick + A; `act0_arrivals` scene component — **built, awaiting P3 audit**

## Later
- [ ] T-009 P4 Hotel (3-night timer) · T-010 P5 PG hunt (negotiation) · T-011 P6 Phone overlay + minimap + Settings + Save/Load slots · T-012 P7 Monday/office · T-013 P8 hill flat · T-014 P9 Cubbon + Ananya + City Moments
- [ ] T-015 Quest taxonomy → `help|social|deliver|investigate|collect|chase|combat-lite` (ADR-18/22) and rep tiers → Hosa/Gothu/Namma (ADR-26); migrate existing content ids to prefix convention (`npc_`, `q_`, `dlg_`…)
- [ ] T-016 M1 Android release · T-017 M2 iOS release (after web slice public)
- [ ] T-024 Landscape lock + "rotate your phone" panel in portrait; safe-area insets on HUD pills (mobile foundation rules 4–5; seen at the P3 phone check)
- [ ] T-023 Airport interior tileset regenerated in the locked style (reference art replaced, provenance closed)
- [ ] T-022 Citizens + remaining M0 NPCs (cab tout, lanyard man, legacy four) through the import pipeline (same template); attire layers so age/bag variants and NPC outfits composite from one base
- [ ] T-021 Regenerate `street.png` + airport tilesets on `palette.gpl` (validator warns today); first pixel-font (OFL) for UI text
- [ ] T-018 Decide: install Xcode + CocoaPods on this Mac, or cloud macOS CI, for iOS builds; install Android Studio for the emulator smoke test

## Done
- [x] T-005 P1 Style Lock — candidate D locked: `_meta/style/style_sheet.png` + `_meta/palette.gpl` (2026-10-12)
- [x] T-019 P0 audit (2026-10-12): title → Bangalore Times (ADR-77); ADR-66/67/75 confirmed (ADR-78); rules in AUDIT_LOG.md
- [x] T-000 All design docs + decisions ADR-01..64, City Pulse, mobile foundation, pitch deck, phased plan (2026-10-11)

## Gates
Audit after EVERY phase (`AUDIT_LOG.md`). Ask for references before visual work (ADR-30). Don't build ahead of an audit. Mobile smoke test at every gate. Tests green before and after every change.
