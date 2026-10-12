import { useEffect, useState, type ReactNode } from 'react';
import { gameEvents } from './core/events';
import PhaserGame from './PhaserGame';
import TouchControls from './TouchControls';
import { useGameStore } from './store';
import { useSettings } from './systems/SettingsManager';
import { QUESTS } from './data';
import { REPUTATION_THRESHOLDS, REPUTATION_TIER_NAMES, SCENE_KEYS, SKILL_TIER_NAMES } from './utils/constants';
import './game.css';

export interface BangaloreTimesProps {
  /**
   * Optional node rendered as the back pill (e.g. a react-router <Link>).
   * Omit it — as the standalone build does — and no back button shows.
   */
  backSlot?: ReactNode;
  /** Scene to enter after loading. Defaults to the title screen. */
  startScene?: string;
  /** District to drop straight into, e.g. "whitefield_street" for the sandbox. */
  startDistrict?: string;
  /** Touch joystick + A: 'auto' (coarse pointers only, the default) or 'always'. */
  touchControls?: 'auto' | 'always';
}

// Scenes where the player is walking around and the stat HUD is meaningful.
// Menus, transit cards and the loading screen get a bare canvas instead.
const GAMEPLAY_SCENES = new Set<string>([SCENE_KEYS.WORLD]);

// Self-contained game screen. Portable across hosts: it takes no router or
// theme dependency.
/** "Day 1 · 06:10" from the store clock (TimeManager owns the rules). */
const clockLabel = (day: number, minute: number): string =>
  `Day ${day} · ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const BangaloreTimes = ({ backSlot, startScene, startDistrict, touchControls = 'auto' }: BangaloreTimesProps) => {
  const botCount = useGameStore((s) => s.botCount);
  const joystickSide = useSettings((s) => s.settings.controls.joystickSide) as 'left' | 'right';
  const clock = useGameStore((s) => s.clock);
  const hotelNights = useGameStore((s) => s.counters.hotel_nights_left);
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([]);

  // Toasts: short feedback lines from systems ("3 nights left", "Saved").
  useEffect(() => {
    let nextId = 1;
    return gameEvents.on('ui:toast', ({ text }) => {
      const id = nextId++;
      setToasts((t) => [...t, { id, text }]);
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
    });
  }, []);
  const reputation = useGameStore((s) => s.reputation);
  const stats = useGameStore((s) => s.stats);
  const survival = useGameStore((s) => s.skills.city_survival);
  const activeScene = useGameStore((s) => s.activeScene);
  const quests = useGameStore((s) => s.quests);

  // The two oldest active quests: the hotel's last objective and the PG hunt
  // run side by side. The phone's quest list (P6) will show the rest.
  const activeQuests = Object.keys(quests.active)
    .filter((id) => QUESTS[id])
    .slice(0, 2)
    .map((id) => ({ quest: QUESTS[id], done: quests.active[id] }));
  const pgSigned = useGameStore((s) => Boolean(s.flags.pg_signed));

  const inGameplay = activeScene !== null && GAMEPLAY_SCENES.has(activeScene);
  const survivalTier = SKILL_TIER_NAMES.city_survival[survival.level];

  // Reputation tier drives the macro loop, so the HUD leads with it rather
  // than a raw number.
  const repTier = REPUTATION_THRESHOLDS.reduce(
    (tier, threshold, i) => (reputation.total >= threshold ? i : tier),
    0,
  );
  const repNext = REPUTATION_THRESHOLDS[repTier + 1];

  return (
    <div className="nq-root">
      {/* Game canvas fills the viewport */}
      <PhaserGame startScene={startScene} startDistrict={startDistrict} />

      {/* HUD overlay. The back pill stays available everywhere so the player is
          never stranded in a menu; the rest is gameplay-only. */}
      <div className="nq-hud-top">
        <div className="nq-back-slot">{backSlot}</div>

        {inGameplay && (
          <div className="nq-title-block">
            <span className="nq-title">{clockLabel(clock.day, clock.minute)}</span>
            <span className="nq-sub">
              {REPUTATION_TIER_NAMES[repTier]} ·{' '}
              {repNext === undefined
                ? `Reputation ${reputation.total}`
                : `Reputation ${reputation.total}/${repNext}`}
              {botCount > 0 && ` · ${botCount} online`}
            </span>
            {hotelNights !== undefined && !pgSigned && (
              <span className={hotelNights === 0 ? 'nq-sub nq-timer nq-timer-out' : 'nq-sub nq-timer'}>
                {hotelNights === 0 ? 'Hotel: checkout today' : `Hotel: ${hotelNights} night${hotelNights === 1 ? '' : 's'} left`}
              </span>
            )}
          </div>
        )}
      </div>

      {toasts.length > 0 && (
        <div className="nq-toasts" role="status">
          {toasts.map((t) => <span key={t.id} className="nq-toast">{t.text}</span>)}
        </div>
      )}

      {inGameplay && activeQuests.length > 0 && (
        <div className="nq-quest">
          {activeQuests.map(({ quest, done: doneObjectives }) => (
            <div key={quest.id} className="nq-quest-block">
              <span className="nq-quest-title">{quest.title}</span>
              {quest.objectives.map((objective) => {
                const done = doneObjectives.includes(objective.id);
                return (
                  <span key={objective.id} className={done ? 'nq-obj nq-obj-done' : 'nq-obj'}>
                    {done ? '✓' : '○'} {objective.text}
                    {objective.optional ? ' (optional)' : ''}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {inGameplay && (
        <>
          {/* Stat readout (design system §5): health, food, stress only when it
              bites, wallet. A meter appears only when relevant. */}
          <div className="nq-stats">
            <span className="nq-stat">
              <span className="nq-stat-label">Health</span>
              <span className="nq-meter">
                <span className="nq-meter-fill nq-health" style={{ width: `${stats.health}%` }} />
              </span>
            </span>
            <span className="nq-stat">
              <span className="nq-stat-label">Food</span>
              <span className="nq-meter">
                <span className="nq-meter-fill nq-food" style={{ width: `${stats.food}%` }} />
              </span>
            </span>
            {stats.stress > 0 && (
              <span className="nq-stat">
                <span className="nq-stat-label">Stress</span>
                <span className="nq-meter">
                  <span className="nq-meter-fill nq-stress" style={{ width: `${stats.stress}%` }} />
                </span>
              </span>
            )}
            <span className="nq-stat nq-stat-text">₹{stats.wallet.toLocaleString('en-IN')}</span>
            <span className="nq-stat nq-stat-text">{survivalTier}</span>
          </div>

          <div className="nq-controls">
            <span className="nq-sub">
              Move with WASD or arrow keys · SHIFT to run · E to interact
            </span>
          </div>

          {/* Joystick + A on touch devices; nothing on a desktop. */}
          <TouchControls always={touchControls === 'always'} side={joystickSide} />
        </>
      )}
    </div>
  );
};

export default BangaloreTimes;
