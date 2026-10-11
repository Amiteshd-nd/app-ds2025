# NAMMA OUTBREAK — Settings & Save/Load System v1.0
> Standard industry conventions. Accessible from Title AND in-game pause. All settings = atoms in `data/atoms/settings.defaults.json`, persisted to local storage. Fits atomic architecture + design-system tokens.

## 1. Settings menu (pause + title)
### Audio
- Master volume · Music volume · SFX volume · Ambience volume (sliders 0–100). Mute toggle.
### Display
- Fullscreen toggle · Integer pixel scale (Auto/1×/2×/3×) · Screen shake on/off · Reduce flashes (accessibility; softens encounter flash/vignette).
### Gameplay
- Difficulty: Relaxed / Normal (Relaxed halves survival ticks, ADR-16) · "Do Not Disturb" (mutes non-critical phone buzzes/notifications) · Minimap on/off · Tutorial hints on/off · Dialogue speed (Slow/Normal/Fast/Instant) · Auto-run toggle.
### Controls
- Rebind keys (keyboard) · Virtual joystick side L/R + size (touch) · Haptics on/off (Android).
### Language
- UI language (English first; Kannada/Hindi later). (Diegetic signage stays bilingual regardless.)
### Accessibility
- Colourblind-safe meter icons (shape + colour) · Larger text toggle · Hold-vs-toggle for crouch/run.
### Data
- Delete save · Reset settings · (Privacy) ad-personalisation opt-in/out (City Pulse sponsors, ADR-56).
Rule: every control uses design-system UI molecules with all states; changes apply live and persist immediately.

## 2. Save / Load (SaveManager, existing — extended)
- **Autosave** on: area transition, quest step complete, sleep, purchase, phase-critical flags. Toast "Saved".
- **Manual save** from pause. **3 save slots** + 1 autosave slot. Each slot shows: player name, act/scene, in-game day, ₹, playtime, thumbnail.
- **Continue** (Title) loads latest autosave. **Load Game** lists slots.
- Save payload (atoms, not scene-class names — ADR): `profile`, `stats`, `inventory`, `flags`, `relationships`, `districtId + spawnId`, `stability map`, `settings`, `cityPulse cache`, timestamp, version.
- **Versioned migrations**: a `saveVersion` + migration functions so updates don't break old saves (anti-Zelter stability).
- Storage: IndexedDB (PWA), compressed (lz-string). Export/Import save as a file (backup; no server needed).
- Death (Acts 1–3) = reload from autosave at healthcare centre (not a save wipe). Act 4 = last base autosave (world moved on, ADR fail-forward).

## 3. Pause menu
Resume · Settings · Save · Load · Map (phone Maps) · Quit to Title. Pauses WorldScene (scene.pause), overlay like PhoneScene.

## 4. First-run
After character creation → a one-screen "How to play" (move/interact/map) respecting Tutorial-hints setting. Settings pre-filled from `settings.defaults.json`.
