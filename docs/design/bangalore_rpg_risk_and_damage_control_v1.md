# NAMMA OUTBREAK — Risk Register & Damage Control v1.0
> Predicted failure states + how to prevent, detect, and recover. Claude Code: consult this when stuck. Each risk = Likelihood/Impact, Prevention, Detection, Recovery.

## A. Claude Code build failures
1. **Rebuilds working code / breaks the 117 tests** (M/H). Prevent: run `npm test` before & after every change; touch only files the phase names. Detect: red tests, `tsc` errors. Recover: revert the diff, re-apply in smaller steps; never "fix forward" blindly.
2. **Writes a new Scene class per place** (violates ADR, M/H). Prevent: CLAUDE §0 rule 4; add a lint/check for `extends Phaser.Scene` outside the allowed list. Detect: new file in src/scenes. Recover: convert to a district JSON.
3. **Hardcodes values (hex, prices, layer names, strings)** (H/M). Prevent: design-system tokens + atoms; validator rejects inline. Detect: `_index.json` scan / grep in CI. Recover: extract to atom, reference by id.
4. **Builds ahead of an audit** (M/H). Prevent: phase gate in CLAUDE §0 rule 1. Detect: >1 scene changed since last AUDIT_LOG entry. Recover: pause, submit built work for audit, don't continue.
5. **Starts art before getting references** (M/M). Prevent: ADR-30 in CLAUDE §0 rule 2. Detect: assets created with no reference in `_meta`. Recover: discard, ask user, regenerate.
6. **Context loss across sessions / contradicts earlier decisions** (H/H). Prevent: read order in CLAUDE §2; MEMORY.md + DECISIONS.md first. Detect: drift guard. Recover: quote the ADR, ask user, supersede properly.
7. **Dangling references / duplicate ids** (M/M). Prevent/Detect: validator + `_index.json`. Recover: fix id or add missing atom.
8. **Silent scope creep in a phase** (M/M). Prevent: each phase has explicit `acceptance`. Detect: work outside acceptance. Recover: split into a new phase/ticket.

## B. Art pipeline failures
9. **Style drift between generations** (H/M). Prevent: style lock (P1) as reference #1 + palette quantise. Detect: visual diff vs style sheet. Recover: re-roll with reference; worst case hand-fix.
10. **Off-grid / wrong-size assets** (M/M). Prevent: asset_pipe grid snap; map-validator 32×32 / 32×48. Detect: validator. Recover: snap or regenerate.
11. **AI tool cost overrun** (M/L). Prevent: budget per batch (<$100 slice), cap 3 re-rolls. Detect: spend log. Recover: hand-draw the few stubborn assets.
12. **AI tool/API changes or dies** (L/H). Prevent: keep raw outputs + prompts + seeds in `_meta`; pipeline tool-agnostic. Recover: swap generator, regenerate from saved prompts.

## C. Legal / reputational
13. **Real brand/logo or institution slips into art** (M/H). Prevent: parody rule (ADR); no IISc/DRDO/HAL/Reliance named. Detect: art review checklist. Recover: replace with parody; patch build.
14. **City Pulse names a real person/shop/political side** (L/H). Prevent: blur-the-line (ADR-55), human approval, kill-switch. Detect: moderation step. Recover: kill-switch, pull bundle.
15. **Mature content / rating mismatch** (M/M). Prevent: 16+ framing, fade-to-black, minimal gore. Detect: store policy review. Recover: tune content; re-rate.
16. **Privacy/ads policy breach (tracking)** (M/H). Prevent: privacy-light, consented, aggregate; opt-out. Detect: policy/legal review. Recover: disable personalisation.

## D. Design / player-experience
17. **Reverse bait-and-switch** (slow burn bores zombie-seekers) (M/H). Prevent: honest trailer (ADR-53), free demo = Acts 0–1, playtest for 10-min drop-off. Detect: playtest retention. Recover: tighten Act 1 pacing, add earlier hooks (not zombies).
18. **Survival meters nag during life-sim** (M/M). Prevent: gentle Acts 1–3 tuning, Relaxed mode. Detect: playtest annoyance. Recover: retune tuning table (one file).
19. **Act 4 unfair / bullet-sponge feel (Zelter mistake)** (M/H). Prevent: escape valves, no instant base loss, one-shot Pulse Gun. Detect: playtest deaths-without-agency. Recover: adjust detection/chase numbers (one file).
20. **Fail-forward feels like no consequences** (L/M). Prevent: reroutes always cost (money/time/rep/stress). Detect: playtest "nothing matters". Recover: raise costs, add scars.
21. **Empty open world** (M/M). Prevent: ≥1 interactable per screen rule; pockets, not sprawl. Detect: validator density + playtest. Recover: add City Pulse/NPC molecules.

## E. Project / scope
22. **Scope explosion (never ships)** (H/H). Prevent: phase gates, vertical slice first, Acts 2–4 as stubs. Detect: TASKS "Now" growing. Recover: cut to demo scope (Acts 0–2), park the rest.
23. **Save-breaking updates** (M/H). Prevent: versioned save migrations (ADR-63). Detect: load errors on old saves. Recover: migration function; export/import fallback.
24. **PWA perf on low-end Android** (M/M). Prevent: ≤8MB atlases/district, lazy load, baked shadows, no normal maps, EasyStar throttled 500ms. Detect: device testing, FPS counter. Recover: reduce atlas/light count, fewer wander bots.
25. **Solo-dev burnout / bus factor** (M/H). Prevent: docs = single source of truth (this whole set), small phases, AUDIT_LOG continuity. Recover: any new collaborator/Claude resumes from CLAUDE.md.
26. **Over-reliance on AI content (Zelter overhaul trap)** (M/M). Prevent: pillars freeze at launch, additive-only after (ADR-54). Detect: repeated direction changes. Recover: stop, re-affirm pillars with user.

## F. Mobile platform
Risks 27–34 (iOS storage eviction, no audio on mobile, App Store rejection, Android WebView fragmentation, notch/HUD overlap, platform code leaking into game logic, no Mac for iOS, mobile blocking web) — see `bangalore_rpg_mobile_platform_foundation_v1.md` §9.

## Fast triage (Claude Code)
Stuck? → 1) tests green? 2) touching only this phase's files? 3) any inline value that should be a token/atom? 4) conflict with an ADR? → if yes, STOP + ask user. 5) past this phase's acceptance? → submit for audit (include mobile smoke result). Always prefer: revert + smaller step over forcing a fix.
