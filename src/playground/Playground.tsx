import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MovieBar from './MovieBar';
import { PhaserDriver } from './movie/driver';
import { MovieRunner, type MovieScene } from './movie/runner';
import { WALKTHROUGHS } from './movie/walkthroughs';
import { sceneOrder } from '../dev/prereq';
import type { SceneBeat } from '../utils/types';
import type Phaser from 'phaser';
import BangaloreTimes from '../BangaloreTimes';
import { DISTRICTS, NPCS, SCENES } from '../data';
import { SPRITE_URLS } from '../assets';
import { MAPS } from '../assets/maps';
import { installDevApi, type DevApi, type DevNode, type Pick } from '../dev/devApi';
import type { PlaygroundState, StateOverride } from '../dev/prereq';
import { devUi, type DevTheme } from '../ui/tokens';
import { GAME_WIDTH } from '../utils/constants';
import { buildLocations, buildTree, filterTree, findNode, type TreeNode } from './tree';
import { DEVICES, deviceById, type HandSize } from './ergonomics';
import ThumbOverlay, { type Target } from './ThumbOverlay';
import Inspector from './Inspector';
import { useSettings } from '../systems/SettingsManager';

export interface Preset {
  id: string;
  name: string;
  description?: string;
  state: StateOverride;
}

/** What the phone simulation shows over the game. */
export interface SimOptions {
  zones: boolean;
  thumbs: boolean;
  safe: boolean;
  hand: HandSize;
}

const SPEEDS = [0.5, 1, 2, 4];

/** Per-viewer conveniences (theme, panel widths) — browser storage, guarded. */
const stored = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const store = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

export function applyTheme(theme: DevTheme): void {
  for (const [k, v] of Object.entries(devUi(theme))) document.documentElement.style.setProperty(`--pg-${k}`, v);
  document.documentElement.dataset.theme = theme;
}

/**
 * Phaser sizes its canvas from its parent's getBoundingClientRect, which
 * includes the playground's scale-to-fit transform — it would shrink twice.
 * Measure the untransformed layout box instead (playground only).
 */
function measureUntransformed(game: Phaser.Game): void {
  const sm = game.scale as unknown as { parent: HTMLElement | null; parentSize: { width: number; height: number; setSize(w: number, h: number): void }; getParentBounds(): boolean };
  sm.getParentBounds = function getParentBounds() {
    if (!this.parent) return false;
    const w = this.parent.offsetWidth, h = this.parent.offsetHeight;
    if (this.parentSize.width === w && this.parentSize.height === h) return false;
    this.parentSize.setSize(w, h);
    return true;
  };
  // Centring compares the canvas's on-screen box (scaled) with that unscaled
  // parent size — use the canvas's layout size as well.
  const center = game.scale as unknown as { canvas: HTMLCanvasElement; parentSize: { width: number; height: number }; autoCenter: number; updateCenter(): void };
  center.updateCenter = function updateCenter() {
    if (!this.autoCenter) return;
    const w = this.canvas.offsetWidth, h = this.canvas.offsetHeight;
    this.canvas.style.marginLeft = `${Math.floor((this.parentSize.width - w) / 2)}px`;
    this.canvas.style.marginTop = `${Math.floor((this.parentSize.height - h) / 2)}px`;
  };
  game.scale.refresh();
}

/**
 * Test Playground (dev only, ADR-104/105/108): content tree on the left, the
 * real game in the middle, the selected node on the right. Jumping to a scene
 * builds its prerequisite state; edits are runtime-only until an explicit,
 * validated "Export changes". Quiet by default — fields open on request.
 */
export default function Playground() {
  const [api, setApi] = useState<DevApi | null>(null);
  const [game, setGame] = useState<Phaser.Game | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>('scene:act0_pg_hunt');
  const [open, setOpen] = useState<Record<string, boolean>>({ 'group:intro': true, 'group:chapters': true, 'act:0': true, 'group:devices': true });
  const [override, setOverride] = useState<StateOverride>({});
  const [lastNode, setLastNode] = useState<{ node: DevNode; override: StateOverride } | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [collision, setCollision] = useState(false);
  const [zones, setZones] = useState(false);
  const [fps, setFps] = useState(0);
  const [deviceId, setDeviceId] = useState('desktop');
  const [sim, setSim] = useState<SimOptions>({ zones: true, thumbs: true, safe: true, hand: 'medium' });
  const [theme, setTheme] = useState<DevTheme>(() => stored<DevTheme>('pg-theme', 'light'));
  const [widths, setWidths] = useState(() => stored('pg-widths', { left: 240, right: 300 }));
  const [status, setStatus] = useState('');
  const [pick, setPick] = useState<Pick | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const device = deviceById(deviceId);

  useEffect(() => { applyTheme(theme); store('pg-theme', theme); }, [theme]);
  useEffect(() => { store('pg-widths', widths); }, [widths]);

  // The game is the real one: wait for PhaserGame's dev handle, then install the dev API.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const g = (window as unknown as { __nqGame?: Phaser.Game }).__nqGame;
      if (g) {
        window.clearInterval(timer);
        measureUntransformed(g);
        setGame(g);
        setApi(installDevApi(g));
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  // Scale the device's real viewport to fit the stage.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const pad = device.id === 'desktop' ? 24 : 72;
      setScale(Math.max(0.1, Math.min((el.clientWidth - pad) / device.width, (el.clientHeight - pad) / device.height)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [device]);
  useEffect(() => { if (game) window.setTimeout(() => game.scale.refresh(), 0); }, [game, device, scale]);

  const refreshValidation = useCallback(() => {
    setStatus('Validating…');
    fetch('/__pg/validate').then((r) => r.json()).then((j) => { setProblems(j.problems ?? []); setStatus(''); })
      .catch(() => setStatus('Validator endpoint unavailable (dev server only).'));
  }, []);
  const refreshPresets = useCallback(() => {
    fetch('/__pg/presets').then((r) => r.json()).then((j) => setPresets(j.presets ?? [])).catch(() => {});
  }, []);
  useEffect(() => { refreshValidation(); refreshPresets(); }, [refreshValidation, refreshPresets]);

  useEffect(() => {
    if (!api) return;
    const timer = window.setInterval(() => setFps(Math.round(api.fps())), 500);
    return () => window.clearInterval(timer);
  }, [api]);

  const locations = useMemo(() => buildLocations(Object.keys(MAPS), Object.values(DISTRICTS), Object.values(SCENES)), []);
  const tree = useMemo(
    () => buildTree(Object.values(SCENES), Object.keys(SPRITE_URLS), Object.values(NPCS), problems, locations),
    [problems, locations],
  );
  const visible = useMemo(() => filterTree(tree, query), [tree, query]);
  const selected = findNode(tree, selectedId);

  // Movie Mode (T-054): one runner per game instance; built scenes in story order; reports go to /__pg/reports.
  const runner = useMemo(() => {
    if (!api || !game) return null;
    const built: MovieScene[] = sceneOrder(Object.values(SCENES)).filter((s) => s.status !== 'STUB').map((s) => ({
      id: s.id, title: s.title, act: s.act, place: DISTRICTS[s.district]?.name ?? s.district,
      beats: (s.beats ?? []).filter((b): b is SceneBeat => typeof b === 'object').map((b) => b.id),
    }));
    const driver = new PhaserDriver(game, api);
    const movie = new MovieRunner(driver, built, WALKTHROUGHS, {
      seed: 7,
      onReport: (report) => fetch('/__pg/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report }) }).then((r) => r.json()).then((j) => (j.file as string) ?? null).catch(() => null),
    });
    // Scriptable from the browser pane / a headless run (step 5 of the brief): window.__nqMovie.play().
    (window as unknown as Record<string, unknown>).__nqMovie = movie;
    return movie;
  }, [api, game]);
  const movieSelected = selected && (selected.kind === 'scene' || selected.kind === 'beat') && selected.ref && selected.scene?.status !== 'STUB'
    ? { scene: selected.ref, beat: selected.kind === 'beat' ? selected.beat?.id : undefined }
    : null;

  const play = useCallback((node: DevNode, extra: StateOverride = override) => {
    if (!api) return;
    api.loadNode(node, extra);
    setLastNode({ node, override: extra });
    if (paused) { api.resume(); setPaused(false); }
  }, [api, override, paused]);

  // Deep links: /playground.html?node=act0_pg_hunt&beat=F4&preset=act-0-broke-200&device=iphone15
  useEffect(() => {
    if (!api) return;
    const params = new URLSearchParams(window.location.search);
    const d = params.get('device');
    if (d) setDeviceId(deviceById(d).id);
    const sceneId = params.get('node');
    if (!sceneId) return;
    const beat = params.get('beat') ?? undefined;
    const presetId = params.get('preset');
    const apply = (list: Preset[]) => {
      const extra = list.find((p) => p.id === presetId)?.state ?? {};
      setOverride(extra);
      setSelectedId(beat ? `beat:${sceneId}:${beat}` : `scene:${sceneId}`);
      play({ kind: 'scene', sceneId, beatId: beat }, extra);
    };
    if (presetId) fetch('/__pg/presets').then((r) => r.json()).then((j) => apply(j.presets ?? [])).catch(() => apply([]));
    else apply([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  /** B3: open a map alone at its first district's default spawn — free-roam, no quest state. */
  const openLocation = useCallback((mapKey: string, keepSelection = false) => {
    const district = Object.values(DISTRICTS).find((d) => d.map === mapKey);
    if (!district) return;
    if (!keepSelection) setSelectedId(`loc:${mapKey}`);
    setPick(null);
    play({ kind: 'district', districtId: district.id }, {});
  }, [play]);

  const select = (n: TreeNode) => {
    setSelectedId(n.id);
    // The phone simulation item switches the stage to a phone, if it was a desktop.
    if (n.kind === 'device' && deviceId === 'desktop') setDeviceId('iphone15');
    // B2: clicking a location anywhere in the tree opens that map.
    if (n.kind === 'location' && n.location) openLocation(n.location.mapKey);
  };

  /** Click-to-inspect: a click on the canvas becomes a game-pixel point for the dev API. */
  const onStageClick = (e: React.MouseEvent) => {
    if (!inspecting || !api) return;
    const canvas = screenRef.current?.querySelector('canvas');
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) return;
    const gx = ((e.clientX - box.left) / box.width) * GAME_WIDTH;
    const gy = ((e.clientY - box.top) / box.height) * (GAME_WIDTH * 9 / 16);
    setPick(api.inspectAt(gx, gy));
  };
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  /** Drag a panel edge to resize its width. */
  const dragEdge = (side: 'left' | 'right') => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX, start = widths[side];
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const next = Math.min(560, Math.max(180, side === 'left' ? start + dx : start - dx));
      setWidths((w: { left: number; right: number }) => ({ ...w, [side]: next }));
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); document.body.classList.remove('pg-resizing'); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.classList.add('pg-resizing');
  };

  const renderNode = (n: TreeNode, depth: number) => {
    const hasKids = Boolean(n.children?.length);
    const isOpen = query ? true : open[n.id] ?? false;
    const icon = n.status === 'failing' ? '✗' : n.status === 'stub' ? '◌' : n.kind === 'location' ? '⌖' : n.status === 'built' ? '●' : n.kind === 'device' ? '📱' : '';
    return (
      <div key={n.id}>
        <div
          className={`pg-node pg-${n.kind} ${n.status ? `pg-st-${n.status}` : ''} ${selectedId === n.id ? 'pg-selected' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => { select(n); if (hasKids) toggle(n.id); }}
          title={n.errors?.join('\n')}
        >
          <span className="pg-caret">{hasKids ? (isOpen ? '▾' : '▸') : ''}</span>
          <span className="pg-icon">{icon}</span>
          {n.label}
          {n.errors?.length ? <span className="pg-badge">{n.errors.length}</span> : null}
        </div>
        {hasKids && isOpen && n.children!.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const [targets, setTargets] = useState<Target[]>([]);
  const simVisible = device.id !== 'desktop' && (selected?.kind === 'device' || sim.zones || sim.thumbs || sim.safe);

  /**
   * Touch controls' rectangles in the device viewport (CSS px), for the
   * ergonomics checks. The controls live in the canvas HUD (P6c), so their
   * game-px zones are mapped through the canvas's on-screen box.
   */
  const measure = useCallback(() => {
    const screen = screenRef.current;
    const canvas = screen?.querySelector('canvas');
    if (!screen || !canvas || !api) return [];
    const origin = screen.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    const k = box.width / scale / GAME_WIDTH;
    const ox = (box.left - origin.left) / scale, oy = (box.top - origin.top) / scale;
    return api.touchTargets().map((t) => ({ name: t.name, rect: { x: ox + t.rect.x * k, y: oy + t.rect.y * k, w: t.rect.w * k, h: t.rect.h * k } }));
  }, [scale, api]);
  // Keep the thumbs pointed at the controls as layout settles.
  useEffect(() => {
    if (device.id === 'desktop') { setTargets([]); return; }
    const tick = () => setTargets(measure());
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [device, measure]);

  // Sound controls in the toolbar: the game's own Settings → Audio (master, step 10; mute), so the pause menu agrees.
  const muted = useSettings((st) => st.settings.audio.muted);
  const master = useSettings((st) => st.settings.audio.master);
  const setAudio = useSettings((st) => st.set);

  return (
    <div className="pg-root" style={{ gridTemplateColumns: `${widths.left}px 6px 1fr 6px ${widths.right}px` }}>
      <aside className="pg-left">
        <div className="pg-head">
          <strong>Test Playground</strong>
          <button className="pg-theme" title="Light / dark" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? '☾ Dark' : '☀ Light'}</button>
        </div>
        <input className="pg-search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="pg-tree">{visible.map((n) => renderNode(n, 0))}</div>
        <div className="pg-foot">
          <button onClick={refreshValidation}>Re-validate</button>
          <span className="pg-dim">{problems.length ? `${problems.length} problem${problems.length > 1 ? 's' : ''}` : 'content valid'}</span>
        </div>
      </aside>
      <div className="pg-handle" onPointerDown={dragEdge('left')} title="Drag to resize" />

      <main className="pg-centre">
        <div className="pg-toolbar">
          <button disabled={!api} onClick={() => { if (!api) return; if (paused) api.resume(); else api.pause(); setPaused(!paused); }}>{paused ? '▶' : '❚❚'}</button>
          <button disabled={!api || !lastNode} title="Restart node" onClick={() => lastNode && play(lastNode.node, lastNode.override)}>↻</button>
          <button disabled={!api || !paused} title="Step one frame" onClick={() => api?.step(1)}>⏭</button>
          <span className="pg-sound">
            <button title={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} onClick={() => setAudio('audio', 'muted', !muted)}>{muted ? '🔇' : '🔊'}</button>
            <button title="Volume down" disabled={master <= 0} onClick={() => setAudio('audio', 'master', Math.max(0, master - 10))}>−</button>
            <span className="pg-dim" title="Master volume">{master}</span>
            <button title="Volume up" disabled={master >= 100} onClick={() => setAudio('audio', 'master', Math.min(100, master + 10))}>+</button>
          </span>
          <select title="Speed" value={speed} onChange={(e) => { const v = Number(e.target.value); setSpeed(v); api?.setSpeed(v); }}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
          <select title="Device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {DEVICES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <details className="pg-viewmenu">
            <summary>View</summary>
            <label><input type="checkbox" checked={collision} onChange={(e) => { setCollision(e.target.checked); api?.showCollision(e.target.checked); }} /> Collision</label>
            <label><input type="checkbox" checked={zones} onChange={(e) => { setZones(e.target.checked); api?.showZones(e.target.checked); }} /> Trigger / exit zones</label>
          </details>
          <span className="pg-fps">{fps} fps</span>
        </div>
        <MovieBar runner={runner} selected={movieSelected} />
        <div className={`pg-stage ${inspecting ? 'pg-inspecting' : ''}`} ref={stageRef} onClickCapture={onStageClick}>
          <div className={`pg-frame ${device.id === 'desktop' ? 'pg-desktop' : 'pg-phoneframe'}`} style={{ width: device.width * scale, height: device.height * scale }}>
            <div className="pg-screen" ref={screenRef} style={{ width: device.width, height: device.height, transform: `scale(${scale})` }}>
              <BangaloreTimes startScene="TitleScene" touchControls={device.id === 'desktop' ? 'auto' : 'always'} />
            </div>
            {device.notch && <div className="pg-notch" />}
            {simVisible && <ThumbOverlay device={device} scale={scale} options={sim} targets={targets} />}
          </div>
        </div>
        {status && <div className="pg-status">{status}</div>}
      </main>
      <div className="pg-handle" onPointerDown={dragEdge('right')} title="Drag to resize" />

      <aside className="pg-right">
        {selected ? (
          <Inspector
            node={selected}
            api={api}
            override={override}
            setOverride={setOverride}
            presets={presets}
            refreshPresets={refreshPresets}
            refreshValidation={refreshValidation}
            play={play}
            current={(): PlaygroundState | null => api?.getState() ?? null}
            device={device}
            setDeviceId={setDeviceId}
            sim={sim}
            setSim={setSim}
            targets={targets}
            openLocation={openLocation}
            pick={pick}
            inspecting={inspecting}
            setInspecting={setInspecting}
            problems={problems}
          />
        ) : <p className="pg-dim">Select something on the left.</p>}
      </aside>
    </div>
  );
}
