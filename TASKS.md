# Tasks (execution)
Updated: 2026-10-12
Task ids `T-###`, never reused. One line each; detail lives in `docs/design/`.

## Now — P0 foundations
- [x] T-001 P0.1 Adopt the 5 repo docs (CLAUDE/ARCHITECTURE/TASKS/DECISIONS/MEMORY) + `docs/design/` per `project_docs_convention.md`
- [x] T-002 P0.2 `WorldScene` refactor (tech §7 steps 1–4): Populate/Exits/Triggers, `districts.json` v2, `TransitScene` card airport→whitefield_street, delete Airport/Whitefield scenes, saves persist `districtId+spawnId`
- [x] T-003 P0.3 Extend validators: district reachability from `airport` via exits, spawn/zone/npc/`to` references, door objects 32×48 (warn), City Pulse slot checks
- [x] T-004 P0.4 Platform shell: `src/platform/` interface + `web.ts` + `native.ts`, Capacitor config, `android/` + `ios/` generated from one `dist/`, Title boots on web (Android emulator + iOS simulator need Xcode/Android Studio — see MEMORY)

## Next
- [ ] T-005 P1 Style Lock — candidates A/B generated + 48-colour palettes extracted (`src/assets/_meta/style/`); **awaiting "that's the look"** → lock winner as `style_sheet.png` + `palette.gpl`, AUDIT_LOG entry
- [ ] T-006 P2 Character creation form (name/gender/age/hometown/college/degree → `player.profile`) + M/F sprites × 5 skin tones; trim CharacterSelectScene
- [ ] T-007 P2 Stat model per profile doc §2 (health/wallet ₹35,000 ADR-17/social/stamina/food/stress/battery) + `spend()`/`canAfford()` wired; retune tests
- [ ] T-008 P3 M0 minimal loop: airport → chai Anna (interact/dialogue/UPI spend) → Vayu Vajra stop → bus transit card → whitefield_street

## Later
- [ ] T-009 P4 Hotel (3-night timer) · T-010 P5 PG hunt (negotiation) · T-011 P6 Phone overlay + minimap + Settings + Save/Load slots · T-012 P7 Monday/office · T-013 P8 hill flat · T-014 P9 Cubbon + Ananya + City Moments
- [ ] T-015 Quest taxonomy → `help|social|deliver|investigate|collect|chase|combat-lite` (ADR-18/22) and rep tiers → Hosa/Gothu/Namma (ADR-26); migrate existing content ids to prefix convention (`npc_`, `q_`, `dlg_`…)
- [ ] T-016 M1 Android release · T-017 M2 iOS release (after web slice public)
- [ ] T-018 Decide: install Xcode + CocoaPods on this Mac, or cloud macOS CI, for iOS builds; install Android Studio for the emulator smoke test

## Done
- [x] T-019 P0 audit (2026-10-12): title → Bangalore Times (ADR-77); ADR-66/67/75 confirmed (ADR-78); rules in AUDIT_LOG.md
- [x] T-000 All design docs + decisions ADR-01..64, City Pulse, mobile foundation, pitch deck, phased plan (2026-10-11)

## Gates
Audit after EVERY phase (`AUDIT_LOG.md`). Ask for references before visual work (ADR-30). Don't build ahead of an audit. Mobile smoke test at every gate. Tests green before and after every change.
