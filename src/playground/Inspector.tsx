import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { OVERLAY_URLS, SPRITE_URLS } from '../assets';
import { DISTRICTS, SCENES } from '../data';
import { locationErrors, type Location } from './tree';
import { applyOverride, beatFlag, type PlaygroundState, type StateOverride } from '../dev/prereq';
import type { DevApi, DevNode, LayerInfo, OverlayKind, Pick } from '../dev/devApi';
import { PALETTE, hex, motion } from '../ui/tokens';
import type { SceneBeat, SceneComponent } from '../utils/types';
import breathLines from '../assets/_raw/characters/breath.json';
import type { Preset, SimOptions } from './Playground';
import { DEVICES, MIN_TARGET_MM, checkControl, type DevicePreset, type HandSize } from './ergonomics';
import type { Target } from './ThumbOverlay';
import type { TreeNode } from './tree';
import { lineDiff } from './diff';
import { AUDIO, type Bus } from '../audio/data';
import { useGameStore } from '../store';
import { ACT4_DAY, ACT4_FLAG, GRADES, act4Curve, act4DayOf, grade, setStabilityOverride, stabilityOverride } from '../systems/stability';
import { stabilityNow } from '../systems/stabilityNow';

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
  /** Part B: open a location (free-roam) and select its node (or keep the current one); the last click-to-inspect pick; validator problems. */
  openLocation(mapKey: string, keepSelection?: boolean): void;
  pick: Pick | null;
  inspecting: boolean;
  setInspecting(on: boolean): void;
  problems: string[];
}

/** Things the inspector will show once they exist (ADR-105) — never faked. */
const NOT_YET = ['Active City Pulse slots', 'Relationships', 'Difficulty (Relaxed / Normal)'];

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
      {node.kind === 'location' && node.location && <LocationInspector {...props} location={node.location} />}
      {node.kind === 'audio' && <AudioInspector {...props} />}
      {node.kind === 'act4' && <Act4Inspector {...props} />}
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
      <SceneLocations {...props} scene={scene} />
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

/** B5: the maps a scene uses — its district's and every exit's — each opening in free-roam. */
function SceneLocations({ scene, openLocation }: Props & { scene: SceneComponent }) {
  const locs = useMemo(() => {
    const mapOf = (id: string) => DISTRICTS[id]?.map;
    const keys = new Set<string>();
    const own = mapOf(scene.district); if (own) keys.add(own);
    for (const e of scene.exits ?? []) if (typeof e === 'object' && mapOf(e.to)) keys.add(mapOf(e.to)!);
    return [...keys];
  }, [scene]);
  if (!locs.length) return null;
  return (
    <div className="pg-row">
      <span className="pg-dim">Locations:</span>
      {locs.map((k) => <button key={k} onClick={() => openLocation(k)} title="Open this map alone, free-roam">{Object.values(DISTRICTS).find((d) => d.map === k)?.name ?? k}</button>)}
    </div>
  );
}

const OVERLAYS: Array<{ kind: OverlayKind; label: string; tint: string }> = [
  { kind: 'collision', label: 'Collision boxes', tint: 'pg-bad' },
  { kind: 'ysort', label: 'Y-sort lines (feet Y + depth)', tint: 'pg-warnline' },
  { kind: 'feet', label: 'Feet boxes (player, NPCs)', tint: 'pg-ok' },
  { kind: 'tintSorted', label: 'Tint the sorted band', tint: 'pg-warnline' },
  { kind: 'tintAbove', label: 'Tint props_above', tint: 'pg-blue' },
  { kind: 'zones', label: 'Spawns + zones', tint: 'pg-dim' },
  { kind: 'audio', label: 'Sound sources + footstep surfaces', tint: 'pg-blue' },
];

/** B3/B4: a map opened alone — layer eyes, overlays, click-to-inspect, validator results, spawns and exits. */
function LocationInspector(props: Props & { location: Location }) {
  const { location, api, openLocation, pick, inspecting, setInspecting, problems } = props;
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [overlays, setOverlays] = useState<Record<OverlayKind, boolean> | null>(null);
  const [info, setInfo] = useState<ReturnType<DevApi['mapInfo']>>(null);
  const [copied, setCopied] = useState(false);
  const running = info?.key === location.mapKey;
  useEffect(() => {
    if (!api) return;
    const tick = () => { setInfo(api.mapInfo()); setLayers(api.mapLayers()); setOverlays(api.overlays()); };
    tick();
    const timer = window.setInterval(tick, 700);
    return () => window.clearInterval(timer);
  }, [api, location.mapKey]);
  const errors = useMemo(() => locationErrors(problems, location), [problems, location]);
  const scenes = location.scenes.map((id) => SCENES[id]).filter(Boolean);
  const copy = (text: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); }).catch(() => {}); };
  return (
    <>
      <p className="pg-dim">{location.districts.map((d) => `${d.name} (${d.id})`).join(' · ') || 'no district renders this map'}</p>
      <div className="pg-row">
        <button className="pg-primary" disabled={!api} onClick={() => openLocation(location.mapKey)}>{running ? '↻ Reload map' : '▶ Open map (free-roam)'}</button>
        <label title="Click anything on the canvas to see its layer, id, footprint and depth"><input type="checkbox" checked={inspecting} onChange={(e) => setInspecting(e.target.checked)} /> Inspect on click</label>
      </div>
      {running ? (
        <>
          <h3>Layers (render order)</h3>
          <div className="pg-layers">
            {layers.map((l) => (
              <label key={l.name} className="pg-layer">
                <input type="checkbox" checked={l.visible} onChange={(e) => api?.setLayerVisible(l.name, e.target.checked)} title={l.visible ? 'Hide' : 'Show'} />
                <span className="pg-eye">{l.visible ? '◉' : '○'}</span>
                <span>{l.name}</span>
                <span className="pg-dim">{l.kind} · {l.count}</span>
              </label>
            ))}
          </div>
          <h3>Layer lines</h3>
          <div className="pg-layers">
            {OVERLAYS.map((o) => (
              <label key={o.kind} className="pg-layer"><input type="checkbox" checked={overlays?.[o.kind] ?? false} onChange={(e) => api?.setOverlay(o.kind, e.target.checked)} /> <span className={o.tint}>■</span> {o.label}</label>
            ))}
          </div>
          <h3>Picked</h3>
          {pick ? (
            <dl className="pg-props pg-pick">
              <dt>Layer</dt><dd>{pick.layer}</dd>
              <dt>Kind</dt><dd>{pick.kind}</dd>
              <dt>Id / name</dt><dd>{pick.name}</dd>
              <dt>Position</dt><dd>{Math.round(pick.x)}, {Math.round(pick.y)}{pick.w ? ` · ${Math.round(pick.w)}×${Math.round(pick.h ?? 0)}` : ''}</dd>
              <dt>Footprint</dt><dd>{pick.footprint ? `${Math.round(pick.footprint.x)}, ${Math.round(pick.footprint.y)} · ${Math.round(pick.footprint.w)}×${Math.round(pick.footprint.h)}` : '—'}</dd>
              <dt>Collision</dt><dd>{pick.collision ? 'yes' : 'no'}</dd>
              <dt>Depth</dt><dd>{pick.depth !== undefined ? `${pick.depth.toFixed(4)}${pick.feetY !== undefined ? ` (feet Y ${pick.feetY})` : ''}` : '—'}</dd>
            </dl>
          ) : <p className="pg-dim">{inspecting ? 'Click something on the canvas.' : 'Turn on "Inspect on click" and click a prop or tile.'}</p>}
          {pick && <div className="pg-row"><code className="pg-ref">{pick.ref}</code><button onClick={() => copy(pick.ref)}>{copied ? 'Copied' : 'Copy ref'}</button></div>}
        </>
      ) : <p className="pg-dim">Open the map to see its layers and inspect it.</p>}
      <h3>Validator</h3>
      {errors.length ? <div className="pg-errors">{errors.map((e) => <div key={e}>✗ {e}</div>)}</div> : <div className="pg-ok">✓ no problems for this map</div>}
      <Fold label="Details">
        <dl className="pg-props">
          <dt>Map key</dt><dd>{location.mapKey}</dd>
          <dt>Size</dt><dd>{info && running ? `${info.tiles[0]}×${info.tiles[1]} tiles (${info.widthPx}×${info.heightPx} px)` : '—'}</dd>
          <dt>Pocket</dt><dd>{location.districts.map((d) => { const rw = DISTRICTS[d.id]?.realworld; return rw && 'area' in rw && rw.area ? `${d.name}: ${rw.area.radiusM} m radius${rw.area.pocket ? `, ${rw.area.pocket.metresPerTile} m/tile` : ''}` : rw && 'parent' in rw ? `${d.name}: inside ${rw.parent}` : null; }).filter(Boolean).join(' · ') || '—'}</dd>
          <dt>Spawns</dt><dd>{info && running ? info.spawns.map((sp) => `${sp.name}${sp.point ? '' : ' (zone)'}`).join(', ') : '— (open the map)'}</dd>
          <dt>Exits</dt><dd>{location.districts.flatMap((d) => (DISTRICTS[d.id]?.exits ?? []).map((e) => `${e.zone} → ${e.to} (${e.transit})`)).join(', ') || '—'}</dd>
          <dt>Scenes</dt><dd>{scenes.map((sc) => `${sc.seq ?? ''} ${sc.title}`).join(', ') || '—'}</dd>
          <dt>Assets</dt><dd>tileset {location.mapKey.replace(/_map$/, '')}.png · {Object.keys(OVERLAY_URLS).filter((k) => k.startsWith(`${location.districts[0]?.id === 'airport' ? 'kempegowda_arrivals' : location.mapKey}__`)).length} cut-outs</dd>
        </dl>
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

// ── Audio (ADR-140) ─────────────────────────────────────────────────────────

interface AudioHandle {
  inspect(): { mix: { state: string; band: string; bed: Record<string, number>; music: string | null } | null; noise: number; beds: Record<string, number>; music: string | null };
  busLevels(): Record<Bus, number>;
  setSolo(bus: Bus | null): void;
  getSolo(): Bus | null;
  setDebug(d: { stability?: number; chaseActive?: boolean; nearestInfected?: number | null }): void;
  getDebug(): { stability?: number; chaseActive?: boolean; nearestInfected?: number | null };
  preview(token: string): void;
}
const audioHandle = (): AudioHandle | null => (window as unknown as { __nqAudio?: AudioHandle }).__nqAudio ?? null;
const BUSES: Bus[] = ['music', 'ambience', 'sfx', 'ui', 'voice'];

/** Every token with ▶, the bus meters with solo, the live mix, and the Act 4 test bench (stability, a chase, an infected's distance). */
function AudioInspector({ openLocation }: Props) {
  const [view, setView] = useState<{ mix: ReturnType<AudioHandle['inspect']>; levels: Record<Bus, number>; solo: Bus | null; debug: ReturnType<AudioHandle['getDebug']> } | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const tick = () => { const a = audioHandle(); setView(a ? { mix: a.inspect(), levels: a.busLevels(), solo: a.getSolo(), debug: a.getDebug() } : null); };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, []);
  const a = audioHandle();
  const tokens = Object.entries(AUDIO).filter(([t]) => !filter || t.includes(filter.toLowerCase()));
  const placeholders = Object.values(AUDIO).filter((e) => e.tier === 'placeholder').length;
  const stability = view?.debug.stability;
  const infected = view?.debug.nearestInfected;
  return (
    <>
      <p className="pg-dim">{Object.keys(AUDIO).length} tokens · {placeholders} placeholder · {Object.keys(AUDIO).length - placeholders} final. Click the game once first — browsers start sound only after a click.</p>
      {!a ? <p className="pg-dim">The game has not started its sound yet.</p> : null}
      <h3>Now</h3>
      <div className="pg-kv">
        <div>State</div><div><b>{view?.mix.mix?.state ?? '—'}</b> · band {view?.mix.mix?.band ?? '—'}</div>
        <div>Music</div><div>{view?.mix.music ?? 'none (the city only)'}</div>
        <div>Beds</div><div>{Object.entries(view?.mix.beds ?? {}).map(([t, g]) => `${t.replace('a.bed.', '')} ${g}`).join(' · ') || '—'}</div>
        <div>Noise</div><div>{view?.mix.noise ?? 0} tiles</div>
      </div>
      <h3>Buses</h3>
      {BUSES.map((b) => (
        <div key={b} className="pg-row">
          <label style={{ width: 90 }}><input type="radio" name="solo" checked={view?.solo === b} onChange={() => a?.setSolo(b)} /> {b}</label>
          <div style={{ flex: 1, height: 8, background: 'var(--pg-edge)' }}><div style={{ width: `${Math.min(100, Math.round((view?.levels[b] ?? 0) * 100))}%`, height: 8, background: 'var(--pg-good)' }} /></div>
        </div>
      ))}
      <div className="pg-row"><label><input type="radio" name="solo" checked={!view?.solo} onChange={() => a?.setSolo(null)} /> all buses</label></div>
      <h3>Act 4 test bench</h3>
      <p className="pg-dim">Stand-ins for Act 4's inputs. Stability here is the shared dial (ADR-144): the look and the crowd follow it too — the <b>Act 4 · stability dial</b> node has the real Act 4 day.</p>
      <button disabled={!a} onClick={() => openLocation('whitefield_street', true)}>▶ Open the test map (Whitefield street)</button>
      <div className="pg-row">
        <label style={{ width: 90 }}>Stability</label>
        <input type="range" min={0} max={100} step={5} value={stability ?? 100} onChange={(e) => a?.setDebug({ stability: Number(e.target.value) })} />
        <span>{stability ?? 100} · {view?.mix.mix?.band ?? ''}</span>
      </div>
      <div className="pg-row">
        <label style={{ width: 90 }}>Infected</label>
        <input type="range" min={0} max={12} step={1} value={infected ?? 12} onChange={(e) => a?.setDebug({ nearestInfected: Number(e.target.value) >= 12 ? null : Number(e.target.value) })} />
        <span>{infected === null || infected === undefined ? 'none near' : `${infected} tiles`}</span>
      </div>
      <div className="pg-row">
        <label><input type="checkbox" checked={view?.debug.chaseActive ?? false} onChange={(e) => a?.setDebug({ chaseActive: e.target.checked })} /> Chase</label>
        <button onClick={() => a?.setDebug({ stability: undefined, chaseActive: false, nearestInfected: null })}>Reset</button>
      </div>
      <h3>Tokens</h3>
      <input placeholder="filter (e.g. step, bed., chai)" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="pg-layers" style={{ maxHeight: 320, overflow: 'auto' }}>
        {tokens.map(([t, e]) => (
          <div key={t} className="pg-layer">
            <button disabled={!a || e.loop} title={e.loop ? 'A loop — hear it in a place' : 'Play once'} onClick={() => a?.preview(t)}>▶</button>
            <span>{t}</span>
            <span className="pg-dim">{e.bus} · {e.tier} · {e.licence}{e.loop ? ' · loop' : ''}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Act 4's dial (ADR-144, Act 4 systems plan §3.1): start Act 4, move its day,
 * and watch every place's stability and grade; or hold one stability over
 * everything. Open any map to see and hear it (the crowd is counted when a
 * map opens, so re-open it after a change).
 */
function Act4Inspector({ openLocation }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(timer);
  }, []);
  const s = useGameStore.getState();
  const day = act4DayOf(s);
  const held = stabilityOverride();
  const here = s.activeDistrict;
  const hereStability = here ? stabilityNow(here) : null;
  const hold = (v: number | null) => {
    const a = audioHandle();
    if (a) a.setDebug({ stability: v ?? undefined }); else setStabilityOverride(v);
  };
  const setDay = (d: number | null) => {
    s.setFlag(ACT4_FLAG, d !== null);
    s.setCounter(ACT4_DAY, d ?? 0);
  };
  const pockets = Object.values(DISTRICTS).filter((d) => d.act4).sort((x, y) => x.act4!.fallDay - y.act4!.fallDay);
  return (
    <>
      <p className="pg-dim">One number per place, one function for everything it drives: ≥80 safe · 60–79 warning · 40–59 infected · 20–39 hot · &lt;20 ground zero. Story flags (<code>stabilityIf</code>) win over the curve; the dial below wins over both.</p>
      <button onClick={() => openLocation('whitefield_street', true)}>▶ Open a map to look (Whitefield street)</button>
      <h3>Now</h3>
      <div className="pg-kv">
        <div>Place</div><div>{here ?? '— (open a map)'}</div>
        <div>Stability</div><div>{hereStability ?? '—'}{hereStability !== null ? ` · level ${grade(hereStability)} ${GRADES[grade(hereStability)].name}` : ''}</div>
        <div>Act 4</div><div>{day === null ? 'not started' : `day ${day}`}</div>
      </div>
      <h3>Act 4 day</h3>
      <div className="pg-row">
        <label><input type="checkbox" checked={day !== null} onChange={(e) => setDay(e.target.checked ? 0 : null)} /> Act 4 has begun</label>
      </div>
      <div className="pg-row">
        <label style={{ width: 90 }}>Day</label>
        <input type="range" min={0} max={20} step={1} disabled={day === null} value={day ?? 0} onChange={(e) => setDay(Number(e.target.value))} />
        <span>{day ?? '—'}</span>
      </div>
      <h3>Hold one stability everywhere</h3>
      <div className="pg-row">
        <label><input type="checkbox" checked={held !== null} onChange={(e) => hold(e.target.checked ? 50 : null)} /> Hold</label>
        <input type="range" min={0} max={100} step={5} disabled={held === null} value={held ?? 100} onChange={(e) => hold(Number(e.target.value))} />
        <span>{held === null ? 'off' : `${held} · ${GRADES[grade(held)].name}`}</span>
      </div>
      <h3>The fall, by place</h3>
      <div className="pg-layers">
        {pockets.map((d) => {
          const v = day === null ? 100 : act4Curve(d.act4!, day);
          return <div key={d.id} className="pg-layer">{d.name} · falls day {d.act4!.fallDay} · {v} · {GRADES[grade(v)].name}</div>;
        })}
      </div>
    </>
  );
}
