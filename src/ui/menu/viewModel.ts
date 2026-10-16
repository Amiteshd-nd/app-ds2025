import type { SlotSummary } from '../../systems/SaveManager';
import type { Settings } from '../../systems/SettingsManager';
import type { SettingsMenu, SettingsMenuRow, SettingsMenuSection } from '../../utils/types';
import { rupees } from '../kit/text';

/**
 * What the menus show, computed from settings data + save summaries — no
 * pixels, no Phaser (ADR-119). MenuScene draws exactly this; tests check it.
 */

export type MenuMode = 'world' | 'title';

export interface RowView {
  id: string;
  label: string;
  /** Second line (slot rows). */
  detail?: string;
  kind: 'item' | 'toggle' | 'choice' | 'slider' | 'action' | 'note' | 'slot';
  /** Right-hand value text (toggle / choice / slider). */
  value?: string;
  /** Slider blocks out of 10. */
  blocks?: number;
  /** Shown but not takeable. */
  disabled?: boolean;
  /** Needs a confirm before it happens. */
  destructive?: boolean;
}

// ── Pause ────────────────────────────────────────────────────────────────

export type PauseAction = 'resume' | 'settings' | 'save' | 'load' | 'map' | 'quit';

/** Resume · Settings · Save · Load · Map · Quit to Title (settings_and_saveload §3). From the title: Load · Settings only. */
export function pauseRows(mode: MenuMode): Array<RowView & { id: PauseAction }> {
  if (mode === 'title') {
    return [
      { id: 'load', label: 'LOAD GAME', kind: 'item' },
      { id: 'settings', label: 'SETTINGS', kind: 'item' },
    ];
  }
  return [
    { id: 'resume', label: 'RESUME', kind: 'item' },
    { id: 'settings', label: 'SETTINGS', kind: 'item' },
    { id: 'save', label: 'SAVE', kind: 'item' },
    { id: 'load', label: 'LOAD', kind: 'item' },
    { id: 'map', label: 'MAP', kind: 'item' },
    { id: 'quit', label: 'QUIT TO TITLE', kind: 'item', destructive: true },
  ];
}

// ── Settings ─────────────────────────────────────────────────────────────

export const sectionRows = (menu: SettingsMenu): RowView[] => menu.sections.map((s) => ({ id: s.id, label: s.title, kind: 'item' }));

/** Read a dotted setting path. */
export function readSetting(settings: Settings, path: string): unknown {
  const [section, key] = path.split('.');
  return (settings as unknown as Record<string, Record<string, unknown>>)[section]?.[key];
}

const sliderBlocks = (row: Extract<SettingsMenuRow, { kind: 'slider' }>, v: number): number =>
  Math.round(((v - row.min) / (row.max - row.min)) * 10);

/** One section's rows with their current values. */
export function settingRows(section: SettingsMenuSection, settings: Settings): RowView[] {
  return section.rows.map((row, i): RowView => {
    const id = `${section.id}:${i}`;
    switch (row.kind) {
      case 'note': return { id, label: row.label, kind: 'note' };
      case 'toggle': return { id, label: row.label, kind: 'toggle', value: readSetting(settings, row.setting) ? '✓ ON' : '○ OFF' };
      case 'choice': {
        const v = String(readSetting(settings, row.setting));
        return { id, label: row.label, kind: 'choice', value: row.options.find((o) => o.value === v)?.label ?? v.toUpperCase() };
      }
      case 'slider': {
        const v = Number(readSetting(settings, row.setting));
        return { id, label: row.label, kind: 'slider', value: String(v), blocks: sliderBlocks(row, v) };
      }
      case 'action': return { id, label: row.label, kind: 'action', destructive: row.action !== 'about' };
    }
  });
}

/** The value a row takes after a step (−1 / +1): toggles flip, choices cycle, sliders step and clamp. */
export function stepValue(row: SettingsMenuRow, current: unknown, dir: -1 | 1): unknown {
  switch (row.kind) {
    case 'toggle': return !current;
    case 'choice': {
      const i = row.options.findIndex((o) => o.value === String(current));
      const n = row.options.length;
      return row.options[((Math.max(0, i) + dir) % n + n) % n].value;
    }
    case 'slider': {
      const v = Number(current) + dir * row.step;
      return Math.max(row.min, Math.min(row.max, v));
    }
    default: return current;
  }
}

/** Settings whose stored value is a number-looking string ("2") keep their declared type. */
export function coerceLike(sample: unknown, value: unknown): unknown {
  if (typeof sample === 'number') return Number(value);
  if (typeof sample === 'boolean') return Boolean(value);
  return String(value);
}

// ── Save / load ──────────────────────────────────────────────────────────

/** '1h 12m' / '8m' / '—' */
export function playtime(seconds: number | undefined): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${Math.max(1, m)}m`;
}

export const slotLabel = (slot: string): string => (slot === 'autosave' ? 'AUTOSAVE' : `SLOT ${slot.replace('slot', '')}`);

/**
 * Slot rows. Saving never targets the autosave (the game writes it); loading
 * and deleting skip empty slots.
 */
export function slotRows(summaries: SlotSummary[], purpose: 'save' | 'load' | 'delete'): RowView[] {
  return summaries.map((s): RowView => {
    const label = s.empty ? `${slotLabel(s.slot)} · EMPTY` : `${slotLabel(s.slot)} · ${(s.name ?? '').toUpperCase()}`;
    const detail = s.empty ? undefined : `${s.place} · Day ${s.day} · ${rupees(s.wallet ?? 0)} · ${playtime(s.playtimeSeconds)}`;
    const disabled = purpose === 'save' ? s.slot === 'autosave' : s.empty;
    return { id: s.slot, label, detail, kind: 'slot', disabled, destructive: purpose !== 'load' ? !s.empty : true };
  });
}

/** The question before a slot action. */
export function slotConfirm(purpose: 'save' | 'load' | 'delete', slot: string, mode: MenuMode): string | null {
  const name = slotLabel(slot).toLowerCase();
  if (purpose === 'save') return `Overwrite ${name}?`;
  if (purpose === 'delete') return `Delete ${name}? This cannot be undone.`;
  return mode === 'world' ? `Load ${name}? Unsaved progress is lost.` : null;
}

// ── About ────────────────────────────────────────────────────────────────

export function aboutLines(version: string): string[] {
  return [
    'BANGALORE TIMES',
    `Version ${version} · Made in Bengaluru`,
    '',
    'Font: Pixelify Sans (SIL Open Font License 1.1)',
    'Map data © OpenStreetMap contributors (ODbL 1.0)',
    'Everything else drawn and written for this game.',
    '',
    'Licences ship at /licenses/ in the game folder.',
  ];
}

// ── Hints ────────────────────────────────────────────────────────────────

export type InputHint = 'keys' | 'pad' | 'touch';

export function hintLine(screen: 'list' | 'settings' | 'confirm', input: InputHint): string {
  if (input === 'touch') return '';
  const move = input === 'pad' ? 'D-PAD MOVE' : '▲▼ MOVE';
  const ok = input === 'pad' ? 'A SELECT' : 'E SELECT';
  const back = input === 'pad' ? 'B BACK' : 'ESC BACK';
  if (screen === 'settings') return `${move} · ◀▶ CHANGE · ${ok} · ${back}`;
  if (screen === 'confirm') return `◀▶ CHOOSE · ${ok}`;
  return `${move} · ${ok} · ${back}`;
}
