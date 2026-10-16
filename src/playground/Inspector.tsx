import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SPRITE_URLS } from '../assets';
import { applyOverride, beatFlag, type PlaygroundState, type StateOverride } from '../dev/prereq';
import type { DevApi, DevNode } from '../dev/devApi';
import { PALETTE, hex, motion } from '../ui/tokens';
import type { SceneBeat, SceneComponent } from '../utils/types';
import breathLines from '../assets/_raw/characters/breath.json';
import type { Preset, SimOptions } from './Playground';
import { DEVICES, MIN_TARGET_MM, checkControl, type DevicePreset, type HandSize } from './ergonomics';
import type { Target } from './ThumbOverlay';
import type { TreeNode } from './tree';
import { lineDiff } from './diff';

interface Props {
  node: TreeNode;
  api: DevApi | null;
  override: StateOverride;
  setOverride(o: StateOverride): void;
  presets: Preset[];
  refreshPresets(): void;
  refreshValidation(): void;
  play(node: DevNode, extra?: StateOverride): void;
  current(): PlaygroundState | null;
  device: DevicePreset;
  setDeviceId(id: string): void;
  sim: SimOptions;
  setSim(s: SimOptions): void;
  targets: Target[];
}

/** Things the inspector will show once they exist (ADR-105) — never faked. */
const NOT_YET = ['District stability → grade()', 'Active City Pulse slots', 'Relationships', 'Difficulty (Relaxed / Normal)'];

export default function Inspector(props: Props) {
  const { node } = props;
  return (
    <div className="pg-inspector">
      <h2>{node.label}</h2>
      {node.errors?.length ? (
        <div className="pg-errors">{node.errors.map((e) => <div key={e}>✗ {e}</div>)}</div>
      ) : null}
      {node.kind === 'intro' && <IntroInspector {...props} />}
      {node.kind === 'scene' && node.scene && <SceneInspector {...props} scene={node.scene} />}
      {node.kind === 'beat' && node.scene && node.beat && <BeatInspector {...props} scene={node.scene} beat={node.beat} />}
      {node.kind === 'character' && <CharacterViewer node={node} />}
      {node.kind === 'device' && <DeviceInspector {...props} />}
      {(node.kind === 'group' || node.kind === 'act' || node.kind === 'arc') && (
        <p className="pg-dim">{node.children?.length ?? 0} item{node.children?.length === 1 ? '' : 's'} — select one to inspect or play it.</p>
      )}
    </div>
  );
}

function IntroInspector({ node, api, play }: Props) {
  return (
    <>
      <p className="pg-dim">Starts the real {node.label.toLowerCase()} scene on its own, with a fresh run.</p>
      <button className="pg-primary" disabled={!api} onClick={() => play({ kind: 'intro', scene: node.ref as 'TitleScene' })}>▶ Play</button>
    </>
  );
}

// ── State editor ────────────────────────────────────────────────────────────

function StateEditor({ base, override, setOverride }: { base: PlaygroundState; override: StateOverride; setOverride(o: StateOverride): void }) {
  const state = applyOverride(base, override);
  const [newFlag, setNewFlag] = useState('');
  const setStat = (k: keyof PlaygroundState['stats'], v: number) => setOverride({ ...override, stats: { ...override.stats, [k]: v } });
  const hhmm = `${String(Math.floor(state.clock.minute / 60)).padStart(2, '0')}:${String(state.clock.minute % 60).padStart(2, '0')}`;
  return (
    <div className="pg-state">
      <div className="pg-grid">
        {(['wallet', 'health', 'food', 'stress', 'stamina', 'battery', 'social'] as const).map((k) => (
          <label key={k}>{k === 'wallet' ? 'Wallet ₹' : k}
            <input type="number" value={state.stats[k]} onChange={(e) => setStat(k, Number(e.target.value))} />
          </label>
        ))}
        <label>Day<input type="number" min={1} value={state.clock.day} onChange={(e) => setOverride({ ...override, clock: { ...state.clock, day: Number(e.target.value) } })} /></label>
        <label>Time<input type="time" value={hhmm} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); setOverride({ ...override, clock: { ...state.clock, minute: h * 60 + m } }); }} /></label>
        <label>Reputation<input type="number" value={state.reputation} onChange={(e) => setOverride({ ...override, reputation: Number(e.target.value) })} /></label>
        <label>Spawn<input value={`${state.position.districtId} @ ${state.position.spawnId}`} readOnly /></label>
      </div>
      <label className="pg-wide">Inventory (comma-separated item ids)
        <input value={state.inventory.join(', ')} onChange={(e) => setOverride({ ...override, inventory: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
      </label>
      <div className="pg-sub">Flags</div>
      <div className="pg-flags">
        {Object.keys(state.flags).sort().filter((f) => !f.startsWith('neg.')).map((f) => (
          <label key={f}><input type="checkbox" checked={state.flags[f]} onChange={(e) => setOverride({ ...override, flags: { ...override.flags, [f]: e.target.checked } })} /> {f}</label>
        ))}
        <span className="pg-addflag">
          <input placeholder="add flag…" value={newFlag} onChange={(e) => setNewFlag(e.target.value)} />
          <button disabled={!newFlag.trim()} onClick={() => { setOverride({ ...override, flags: { ...override.flags, [newFlag.trim()]: true } }); setNewFlag(''); }}>+</button>
        </span>
      </div>
      <div className="pg-sub">Quests already done</div>
      <div className="pg-chips">{state.questsCompleted.length ? state.questsCompleted.map((q) => <span key={q} className="pg-chip">{q}</span>) : <span className="pg-dim">none</span>}</div>
    </div>
  );
}

/** One quiet line instead of a form: what the run will start with. */
function StateSummary({ base, override }: { base: PlaygroundState; override: StateOverride }) {
  const s = applyOverride(base, override);
  const hh = String(Math.floor(s.clock.minute / 60)).padStart(2, '0'), mm = String(s.clock.minute % 60).padStart(2, '0');
  const flags = Object.keys(s.flags).filter((f) => s.flags[f] && !f.startsWith('neg.')).length;
  const changed = Object.keys(override).length > 0;
  return (
    <p className="pg-summary">
      ₹{s.stats.wallet.toLocaleString('en-IN')} · Day {s.clock.day} {hh}:{mm} · {flags} flag{flags === 1 ? '' : 's'} · {s.questsCompleted.length} quest{s.questsCompleted.length === 1 ? '' : 's'} done
      {changed && <span className="pg-changed"> · edited</span>}
    </p>
  );
}

/** Closed by default — fields only appear when asked for. */
function Fold({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="pg-fold">
      <summary>{label}</summary>
      {children}
    </details>
  );
}

function PresetBar({ override, setOverride, presets, refreshPresets }: Props) {
  return (
    <div className="pg-row">
      <select value="" onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) setOverride(p.state); }}>
        <option value="">Load preset…</option>
        {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button onClick={async () => {
        const name = window.prompt('Preset name (e.g. "Act 0 broke ₹200")');
        if (!name) return;
        await fetch('/__pg/presets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, preset: { state: override } }) });
        refreshPresets();
      }}>Save preset</button>
      <button onClick={() => setOverride({})}>Clear overrides</button>
    </div>
  );
}

// ── Export (runtime edits → data, only with confirmation + validation) ──────

function ExportButton({ scene, draft, refreshValidation }: { scene: SceneComponent; draft: SceneComponent; refreshValidation(): void }) {
  const [diff, setDiff] = useState<string[] | null>(null);
  const [result, setResult] = useState('');
  const before = JSON.stringify(scene, null, 2), after = JSON.stringify(draft, null, 2);
  return (
    <>
      <button disabled={before === after} onClick={() => setDiff(lineDiff(before, after))}>Export changes…</button>
      {result && <div className="pg-dim">{result}</div>}
      {diff && (
        <div className="pg-modal">
          <div className="pg-modal-box">
            <h3>Write to src/data/scenes/{scene.id}.json?</h3>
            <pre className="pg-diff">{diff.map((l, i) => <div key={i} className={l[0] === '+' ? 'pg-add' : l[0] === '-' ? 'pg-del' : ''}>{l}</div>)}</pre>
            <div className="pg-row">
              <button className="pg-primary" onClick={async () => {
                const r = await fetch('/__pg/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: `scenes/${scene.id}.json`, json: draft }) }).then((x) => x.json());
                setResult(r.ok ? 'Written — validator passed. Reload to pick it up.' : `Not written — validator failed:\n${r.problems.join('\n')}`);
                setDiff(null);
                refreshValidation();
              }}>Confirm &amp; validate</button>
              <button onClick={() => setDiff(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const TEXT_FIELDS = ['title', 'time', 'player_goal', 'design_goal'] as const;

function SceneInspector(props: Props & { scene: SceneComponent }) {
  const { scene, api, override, play } = props;
  const base = useMemo(() => api?.prereq(scene.id) ?? null, [api, scene.id]);
  const [draft, setDraft] = useState<SceneComponent>(scene);
  useEffect(() => setDraft(scene), [scene]);
  return (
    <>
      <p className="pg-dim">{scene.district} · starts at {scene.entry?.spawn ?? '—'}{scene.status === 'STUB' ? ' · stub' : ''}</p>
      <p>{scene.player_goal}</p>
      {base && <StateSummary base={base} override={override} />}
      <div className="pg-row">
        <button className="pg-primary" disabled={!api || scene.status === 'STUB'} title={scene.status === 'STUB' ? 'A stub: co-author it with the user first (HANDOFF §3)' : undefined} onClick={() => play({ kind: 'scene', sceneId: scene.id })}>▶ Play</button>
        <PresetPicker {...props} />
      </div>
      <Fold label="Edit starting state…">
        <PresetBar {...props} />
        {base ? <StateEditor base={base} override={override} setOverride={props.setOverride} /> : <p className="pg-dim">Waiting for the game…</p>}
        <button disabled={!api} onClick={() => api?.applyState(override)}>Apply to the running game</button>
      </Fold>
      <Fold label="Edit scene text…">
        {TEXT_FIELDS.map((k) => (
          <label key={k} className="pg-wide">{k}
            <textarea rows={k.endsWith('goal') ? 2 : 1} value={String(draft[k] ?? '')} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
          </label>
        ))}
        <ExportButton scene={scene} draft={draft} refreshValidation={props.refreshValidation} />
      </Fold>
      <Fold label="More details">
        <dl className="pg-props">
          <dt>Story order</dt><dd>{scene.seq ?? '—'} (act {scene.act}){scene.arc ? ` · arc ${scene.arc}` : ''}</dd>
          <dt>Pacing</dt><dd>{scene.pacing.join(' → ')}</dd>
          <dt>Cast</dt><dd>{scene.cast.map((c) => c.npc).join(', ') || '—'}</dd>
          <dt>Leaves flags</dt><dd>{(scene.save_flags ?? []).join(', ') || '—'}</dd>
        </dl>
        <div className="pg-sub">Not in the game yet</div>
        {NOT_YET.map((n) => <div key={n} className="pg-notyet">{n}</div>)}
      </Fold>
    </>
  );
}

/** Just a dropdown: pick a preset, it applies to the next Play. */
function PresetPicker({ presets, override, setOverride }: Props) {
  const current = presets.find((p) => JSON.stringify(p.state) === JSON.stringify(override));
  return (
    <select value={current?.id ?? ''} onChange={(e) => setOverride(presets.find((x) => x.id === e.target.value)?.state ?? {})}>
      <option value="">Default state</option>
      {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

const BEAT_FIELDS = ['pacing', 'what', 'interact', 'reward', 'flag', 'economy', 'reroute'] as const;

function BeatInspector(props: Props & { scene: SceneComponent; beat: SceneBeat }) {
  const { scene, beat, api, override, play } = props;
  const [draft, setDraft] = useState<SceneBeat>(beat);
  useEffect(() => setDraft(beat), [beat]);
  const flag = beatFlag(beat);
  const sceneDraft: SceneComponent = {
    ...scene,
    beats: (scene.beats as SceneBeat[]).map((b) => (typeof b === 'object' && b.id === beat.id ? draft : b)),
  };
  return (
    <>
      <p>{beat.what}</p>
      <p className="pg-dim">{beat.pacing}{flag ? ` · sets ${flag}` : ''}</p>
      <div className="pg-row">
        <button className="pg-primary" disabled={!api} onClick={() => play({ kind: 'scene', sceneId: scene.id, beatId: beat.id }, override)}>▶ Start here</button>
        <button disabled={!api || !flag} title={flag ? `Sets ${flag} in the running game` : 'This beat sets no flag'} onClick={() => flag && api?.applyState({ flags: { [flag]: true } })}>✓ Mark complete</button>
        <PresetPicker {...props} />
      </div>
      <Fold label="Edit beat…">
        {BEAT_FIELDS.map((k) => (
          <label key={k} className="pg-wide">{k}
            <textarea rows={k === 'what' ? 3 : 1} value={String(draft[k] ?? '')} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
          </label>
        ))}
        <ExportButton scene={scene} draft={sceneDraft} refreshValidation={props.refreshValidation} />
      </Fold>
    </>
  );
}

// ── Phone in landscape ──────────────────────────────────────────────────────

const REACH_TEXT = { comfortable: 'comfortable reach', stretch: 'a stretch', hard: 'hard to reach' } as const;

function DeviceInspector({ api, device, setDeviceId, sim, setSim, targets, play }: Props) {
  const phones = DEVICES.filter((d) => d.id !== 'desktop');
  const reports = targets.map((t) => checkControl(device, t.name, t.rect, sim.hand));
  return (
    <>
      <p className="pg-dim">Both thumbs on the screen edges, the way a phone is held in landscape. Green is comfortable reach, amber a stretch; hatched bands are the notch / home-indicator safe areas.</p>
      <div className="pg-row">
        <select value={device.id === 'desktop' ? 'iphone15' : device.id} onChange={(e) => setDeviceId(e.target.value)}>
          {phones.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <select value={sim.hand} onChange={(e) => setSim({ ...sim, hand: e.target.value as HandSize })}>
          <option value="small">Small hands</option>
          <option value="medium">Medium hands</option>
          <option value="large">Large hands</option>
        </select>
      </div>
      <div className="pg-row">
        <label><input type="checkbox" checked={sim.zones} onChange={(e) => setSim({ ...sim, zones: e.target.checked })} /> Reach zones</label>
        <label><input type="checkbox" checked={sim.thumbs} onChange={(e) => setSim({ ...sim, thumbs: e.target.checked })} /> Thumbs</label>
        <label><input type="checkbox" checked={sim.safe} onChange={(e) => setSim({ ...sim, safe: e.target.checked })} /> Safe areas</label>
      </div>
      <h3>Controls on this phone</h3>
      {device.id === 'desktop' ? <p className="pg-dim">Pick a phone above.</p> : reports.length === 0 ? (
        <>
          <p className="pg-dim">The joystick and A button appear once a scene is running.</p>
          <button className="pg-primary" disabled={!api} onClick={() => play({ kind: 'scene', sceneId: 'act0_pg_hunt' })}>▶ Load the PG lane to try them</button>
        </>
      ) : reports.map((r) => (
        <div key={r.name} className="pg-check">
          <strong>{r.name}</strong>
          <div className={r.bigEnough ? 'pg-ok' : 'pg-bad'}>{r.bigEnough ? '✓' : '✗'} {r.sizeMm} mm across (min {MIN_TARGET_MM} mm)</div>
          <div className={r.reach === 'comfortable' ? 'pg-ok' : r.reach === 'stretch' ? 'pg-warnline' : 'pg-bad'}>{r.reach === 'comfortable' ? '✓' : '⚠'} {REACH_TEXT[r.reach]}</div>
          <div className={r.inSafeArea ? 'pg-warnline' : 'pg-ok'}>{r.inSafeArea ? '⚠ overlaps a safe area here — on the device env(safe-area-inset) pushes it inward' : '✓ clear of the safe areas'}</div>
        </div>
      ))}
      <p className="pg-dim">Drag the joystick and click A with the mouse to drive the game. {device.width}×{device.height} CSS px, {device.pxPerMm} px/mm.</p>
    </>
  );
}

// ── Character viewer ────────────────────────────────────────────────────────

type Anim = 'idle' | 'walk' | 'breath';
const DIRS = ['down', 'left', 'right', 'up'] as const;
const BREATH = breathLines as unknown as Record<string, Record<string, { head_y: number; waist_y: number; enabled: boolean }>>;
const PALETTE_SET = new Set(PALETTE.map((h) => h.toLowerCase()));

const loadImage = (url: string) => new Promise<HTMLImageElement>((done, fail) => {
  const img = new Image();
  img.onload = () => done(img);
  img.onerror = fail;
  img.src = url;
});

function CharacterViewer({ node }: { node: TreeNode }) {
  const sheets = node.sheets ?? [];
  const [sheet, setSheet] = useState(sheets.find((s) => s.endsWith('_3')) ?? sheets[0]);
  const [anim, setAnim] = useState<Anim>('idle');
  const [lines, setLines] = useState(true);
  const [check, setCheck] = useState('');
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const base = node.ref ?? '';
  const breathUrl = SPRITE_URLS[`${sheet}__breath`];

  useEffect(() => setSheet(sheets.find((s) => s.endsWith('_3')) ?? sheets[0]), [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let raf = 0, stop = false;
    const url = SPRITE_URLS[sheet];
    if (!url) return;
    Promise.all([loadImage(url), breathUrl ? loadImage(breathUrl) : Promise.resolve(null)]).then(([img, breath]) => {
      // Contract check: 96×192, every opaque pixel on palette.gpl.
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, img.width, img.height).data;
      let off = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const h = `#${[px[i], px[i + 1], px[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        if (!PALETTE_SET.has(h)) off++;
      }
      setCheck(`${img.width}×${img.height} (${img.width === 96 && img.height === 192 ? 'ok' : 'expected 96×192'}) · frames 32×48 · ${off ? `${off} px off palette` : 'all on palette.gpl'}`);

      const holds = [motion('m.breath.f0'), motion('m.breath.f1'), motion('m.breath.f2'), motion('m.breath.f3')];
      const cycle = holds.reduce((a, b) => a + b, 0);
      const draw = (t: number) => {
        if (stop) return;
        DIRS.forEach((dir, row) => {
          const cv = canvases.current[row];
          if (!cv) return;
          const g = cv.getContext('2d')!;
          g.imageSmoothingEnabled = false;
          g.clearRect(0, 0, cv.width, cv.height);
          let src: HTMLImageElement = img, col = 1;
          if (anim === 'walk') col = [0, 1, 2, 1][Math.floor(t / 125) % 4];
          if (anim === 'breath' && breath) {
            let at = t % cycle, k = 0;
            while (at >= holds[k]) { at -= holds[k]; k++; }
            if (k > 0) { src = breath; col = k - 1; }
          }
          // 1× and 4× side by side.
          g.drawImage(src, col * 32, row * 48, 32, 48, 2, 2, 32, 48);
          g.drawImage(src, col * 32, row * 48, 32, 48, 38, 2, 96, 144);
          const l = BREATH[base]?.[dir];
          if (lines && l) {
            g.fillStyle = hex('ui.bad'); g.fillRect(38, 2 + l.head_y * 3, 96, 1);
            g.fillStyle = hex('accent.metro'); g.fillRect(38, 2 + l.waist_y * 3, 96, 1);
          }
        });
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    }).catch(() => setCheck('could not load the sheet'));
    return () => { stop = true; cancelAnimationFrame(raf); };
  }, [sheet, anim, lines, breathUrl, base]);

  const npc = node.npc;
  return (
    <>
      <dl className="pg-props">
        {npc && <><dt>NPC</dt><dd>{npc.name} · tier {npc.tier}{npc.dialogue ? ` · ${npc.dialogue}` : ''}{npc.breathing === false ? ' · breathing off' : ''}</dd></>}
        <dt>Sheet</dt><dd>{check || '…'}</dd>
      </dl>
      <div className="pg-row">
        {sheets.length > 1 && (
          <label>Skin<select value={sheet} onChange={(e) => setSheet(e.target.value)}>{sheets.map((s) => <option key={s} value={s}>{s.slice(-1)}</option>)}</select></label>
        )}
        <label>Animation<select value={anim} onChange={(e) => setAnim(e.target.value as Anim)}>
          <option value="idle">Idle</option>
          <option value="walk">Walk (4-dir)</option>
          <option value="breath">Breathing idle</option>
        </select></label>
        <label><input type="checkbox" checked={lines} onChange={(e) => setLines(e.target.checked)} /> head / waist lines</label>
      </div>
      {anim === 'breath' && !breathUrl && <p className="pg-warnline">Breath frames are not baked yet (T-029, breathing is switched off) — showing the still idle.</p>}
      <div className="pg-dirs">
        {DIRS.map((d, i) => (
          <figure key={d}><canvas ref={(el) => { canvases.current[i] = el; }} width={136} height={148} /><figcaption>{d}</figcaption></figure>
        ))}
      </div>
      <Fold label="More details">
        <div className="pg-sub">Not in the game yet</div>
        {['Attire layers', 'Infected / _ruined variants', 'Ground shadow'].map((n) => <div key={n} className="pg-notyet">{n}</div>)}
      </Fold>
    </>
  );
}
