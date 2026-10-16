import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { validateSettingsMenu } from '../../scripts/validate-content.ts';
import metrics from '../assets/fonts/metrics.json';
import defaults from '../data/settings.defaults.json';
import { SETTINGS_MENU } from '../data';
import { useSettings } from '../systems/SettingsManager';
import { MIN_TAP } from '../ui/kit/molecules';
import { measure, missingGlyphs } from '../ui/kit/text';
import { menuLayout, rowAt, scrollFor, visibleRows, zone } from '../ui/menu/layout';
import { aboutLines, coerceLike, hintLine, pauseRows, playtime, readSetting, sectionRows, settingRows, slotConfirm, slotRows, stepValue } from '../ui/menu/viewModel';
import type { SettingsMenuRow } from '../utils/types';

const dataDir = join(__dirname, '..', 'data');
const glyphs = new Set(Object.keys(metrics.advance));

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  useSettings.getState().reset();
});

describe('settings menu data (ADR-119)', () => {
  it('the shipped menu validates against the shipped defaults and font', () => {
    const menu = JSON.parse(readFileSync(join(dataDir, 'menus/settings.json'), 'utf8'));
    expect(validateSettingsMenu(menu, defaults, glyphs)).toEqual([]);
  });

  it('catches a row that edits nothing, a wrong kind, and options without the default', () => {
    const bad = { sections: [{ id: 'x', title: 'X', rows: [
      { kind: 'toggle', label: 'A', setting: 'audio.nothing' },
      { kind: 'toggle', label: 'B', setting: 'audio.master' },
      { kind: 'choice', label: 'C', setting: 'gameplay.difficulty', options: [{ value: 'relaxed', label: 'R' }] },
      { kind: 'slider', label: 'D', setting: 'audio.master', min: 10, max: 0, step: 1 },
      { kind: 'action', label: 'E', action: 'explode' },
      { kind: 'note', label: 'emoji 📱' },
    ] }] };
    const p = validateSettingsMenu(bad, defaults, glyphs);
    expect(p.some((x) => x.includes('not in settings.defaults.json'))).toBe(true);
    expect(p.some((x) => x.includes('is a toggle but'))).toBe(true);
    expect(p.some((x) => x.includes('do not include the default'))).toBe(true);
    expect(p.some((x) => x.includes('min < max'))).toBe(true);
    expect(p.some((x) => x.includes('unknown action'))).toBe(true);
    expect(p.some((x) => x.includes('cannot draw'))).toBe(true);
  });

  it('covers every settings atom the design doc lists (except audio hooks that have no sound yet)', () => {
    const edited = new Set(SETTINGS_MENU.sections.flatMap((s) => s.rows.flatMap((r) => ('setting' in r ? [r.setting] : []))));
    const { $comment: _c, ...d } = defaults;
    for (const [section, atoms] of Object.entries(d)) for (const key of Object.keys(atoms)) expect(edited, `${section}.${key}`).toContain(`${section}.${key}`);
  });
});

describe('menu view-models', () => {
  it('pause: six items in play, two from the title; quit is destructive', () => {
    expect(pauseRows('world').map((r) => r.id)).toEqual(['resume', 'settings', 'save', 'load', 'map', 'quit']);
    expect(pauseRows('world').find((r) => r.id === 'quit')?.destructive).toBe(true);
    expect(pauseRows('title').map((r) => r.id)).toEqual(['load', 'settings']);
  });

  it('settings rows read the live values and render every kind', () => {
    const rows = settingRows(SETTINGS_MENU.sections.find((s) => s.id === 'gameplay')!, useSettings.getState().settings);
    expect(rows.find((r) => r.label === 'DIFFICULTY')).toMatchObject({ kind: 'choice', value: 'NORMAL' });
    expect(rows.find((r) => r.label === 'DO NOT DISTURB')).toMatchObject({ kind: 'toggle', value: '○ OFF' });
    const audio = settingRows(SETTINGS_MENU.sections.find((s) => s.id === 'audio')!, useSettings.getState().settings);
    expect(audio.find((r) => r.label === 'MASTER')).toMatchObject({ kind: 'slider', value: '80', blocks: 8 });
    expect(sectionRows(SETTINGS_MENU).map((r) => r.label)).toContain('ABOUT');
  });

  it('every menu string fits its row and is drawable', () => {
    const L = menuLayout(1);
    for (const section of SETTINGS_MENU.sections) {
      for (const row of settingRows(section, useSettings.getState().settings)) {
        expect(missingGlyphs(row.label), row.label).toEqual([]);
        if (row.kind === 'note') { expect(measure(row.label)).toBeLessThanOrEqual(L.rows.w + 20); continue; }
        expect(measure(row.label, true) + (row.value ? measure(`◀ ${row.value} ▶`, true) + 20 : 0)).toBeLessThanOrEqual(L.rows.w);
      }
    }
  });

  it('stepping: toggles flip, choices cycle both ways, sliders clamp; stored types are kept', () => {
    const choice = SETTINGS_MENU.sections.flatMap((s) => s.rows).find((r): r is Extract<SettingsMenuRow, { kind: 'choice' }> => r.kind === 'choice' && r.setting === 'gameplay.dialogueSpeed')!;
    expect(stepValue(choice, 'normal', 1)).toBe('fast');
    expect(stepValue(choice, 'slow', -1)).toBe('instant');
    const slider = SETTINGS_MENU.sections.flatMap((s) => s.rows).find((r): r is Extract<SettingsMenuRow, { kind: 'slider' }> => r.kind === 'slider')!;
    expect(stepValue(slider, 100, 1)).toBe(100);
    expect(stepValue(slider, 0, -1)).toBe(0);
    expect(stepValue({ kind: 'toggle', label: 'T', setting: 'audio.muted' }, false, 1)).toBe(true);
    expect(coerceLike(80, '70')).toBe(70);
    expect(coerceLike('auto', 2)).toBe('2');
    expect(readSetting(useSettings.getState().settings, 'controls.joystickSide')).toBe('left');
  });

  it('slots: autosave cannot be saved over, empty slots cannot be loaded; confirms read right', () => {
    const summaries = [
      { slot: 'autosave' as const, empty: false, name: 'Arjun', place: 'Prashanth Layout', day: 3, wallet: 34980, playtimeSeconds: 4320 },
      { slot: 'slot1' as const, empty: true },
      { slot: 'slot2' as const, empty: false, name: '', place: 'Whitefield', day: 1, wallet: 35000, playtimeSeconds: 40 },
      { slot: 'slot3' as const, empty: true },
    ];
    const save = slotRows(summaries, 'save');
    expect(save[0]).toMatchObject({ label: 'AUTOSAVE · ARJUN', disabled: true });
    expect(save[0].detail).toBe('Prashanth Layout · Day 3 · ₹34,980 · 1h 12m');
    expect(save[1]).toMatchObject({ label: 'SLOT 1 · EMPTY', disabled: false });
    expect(save[2].detail).toContain('1m');
    const load = slotRows(summaries, 'load');
    expect(load[1].disabled).toBe(true);
    expect(load[0].disabled).toBe(false);
    expect(slotConfirm('save', 'slot2', 'world')).toBe('Overwrite slot 2?');
    expect(slotConfirm('load', 'slot2', 'title')).toBeNull();
    expect(slotConfirm('load', 'autosave', 'world')).toContain('Unsaved progress');
    expect(slotConfirm('delete', 'slot1', 'world')).toContain('cannot be undone');
    expect(playtime(undefined)).toBe('—');
    expect(playtime(7 * 3600 + 5 * 60)).toBe('7h 05m');
  });

  it('about credits the font and the map data; hints follow the input', () => {
    const about = aboutLines('1.2.3');
    expect(about.join(' ')).toContain('1.2.3');
    expect(about.join(' ')).toContain('Pixelify Sans');
    expect(about.join(' ')).toContain('OpenStreetMap');
    for (const l of about) expect(missingGlyphs(l)).toEqual([]);
    expect(hintLine('settings', 'keys')).toContain('◀▶ CHANGE');
    expect(hintLine('list', 'pad')).toContain('B BACK');
    expect(hintLine('list', 'touch')).toBe('');
  });
});

describe('menu layout', () => {
  it.each([1, 2] as const)('at %d×: rows fit above the home strip, BACK is a full tap target, scrolling keeps the selection in view', (k) => {
    const L = menuLayout(k);
    const vis = visibleRows(L, L.rows.pitch);
    expect(vis).toBeGreaterThanOrEqual(k === 1 ? 10 : 4);
    expect(L.rows.y + vis * L.rows.pitch).toBeLessThanOrEqual(L.safeBottom);
    const back = zone(L, L.back);
    expect(back.w * k).toBeGreaterThanOrEqual(MIN_TAP);
    expect(back.h * k).toBeGreaterThanOrEqual(MIN_TAP);
    expect(scrollFor(0, 0, vis)).toBe(0);
    expect(scrollFor(vis, 0, vis)).toBe(1);
    expect(scrollFor(2, 5, vis)).toBe(2);
  });

  it('finds the row under a finger by its band, and nothing beside the list', () => {
    const L = menuLayout(1);
    expect(rowAt(L, 6, 0, L.rows.pitch, L.rows.x + 10, L.rows.y + 5)).toBe(0);
    expect(rowAt(L, 6, 0, L.rows.pitch, L.rows.x + 10, L.rows.y + L.rows.pitch + 21)).toBe(1); // the gap under row 1 still belongs to it
    expect(rowAt(L, 6, 2, L.rows.pitch, L.rows.x + 10, L.rows.y + 5)).toBe(2); // scrolled by two
    expect(rowAt(L, 6, 0, L.rows.pitch, L.rows.x + 10, L.rows.y + 10 * L.rows.pitch)).toBeNull();
    expect(rowAt(L, 6, 0, L.rows.pitch, L.W - 2, L.rows.y + 5)).toBeNull();
  });
});
