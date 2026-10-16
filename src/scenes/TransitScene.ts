import Phaser from 'phaser';
import { getDistrict } from '../data';
import { useGameStore } from '../store';
import { TimeManager } from '../systems/TimeManager';
import { FUEL_COUNTER } from '../systems/StatsManager';
import { gameEvents } from '../core/events';
import { FADE_MS, GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS, TRANSIT_CARD_MS } from '../utils/constants';
import type { TransitSceneData, WorldSceneData } from './WorldScene';

/**
 * TransitScene — the space between two places.
 *
 * Every area edge is a fade to black (design system §7). A walk is just the
 * fade; a ride (bus, metro, cab, scooter) also shows a card — "Vayu Vajra →
 * Whitefield" — that continues on its own or on E/tap. Pure presentation,
 * driven entirely by the exit it was handed; later phases layer the window
 * parallax, the hotel-night counter and the office time-lapse onto this scene
 * without touching WorldScene.
 */
export class TransitScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.TRANSIT;

  private transit!: TransitSceneData;
  private continued = false;

  constructor() {
    super(TransitScene.KEY);
  }

  create(data: TransitSceneData): void {
    this.transit = data;
    this.continued = false;
    useGameStore.getState().setActiveScene(TransitScene.KEY);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#000000');

    // The journey takes game time (ADR-121): a 40-minute walk can make you late.
    if (data.exit.minutes) TimeManager.getInstance().advance(data.exit.minutes);

    if (data.exit.transit === 'walk' && !data.exit.card) {
      this.time.delayedCall(FADE_MS / 2, () => this.arrive());
      return;
    }

    const destination = getDistrict(data.exit.to);
    const fuel = useGameStore.getState().counters[FUEL_COUNTER] ?? 0;
    const label = (data.exit.card ?? `${data.exit.transit} → ${destination.name}`) + (data.exit.transit === 'scooter' ? `\nFuel ${Math.round(fuel)}%` : '');

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 8, label, {
        font: 'bold 12px monospace',
        color: '#f8fafc',
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12, 'E / tap to continue', {
        font: '7px monospace',
        color: '#64748b',
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({ targets: this.children.list, alpha: 1, duration: FADE_MS });

    this.input.keyboard?.once('keydown-E', () => this.arrive());
    this.input.keyboard?.once('keydown-ENTER', () => this.arrive());
    this.input.once('pointerdown', () => this.arrive());
    this.time.delayedCall(TRANSIT_CARD_MS, () => this.arrive());
  }

  private arrive(): void {
    if (this.continued) return;
    this.continued = true;

    this.cameras.main.fadeOut(FADE_MS / 2, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(SCENE_KEYS.WORLD, {
        districtId: this.transit.exit.to,
        spawnId: this.transit.exit.spawn,
        fromDistrict: this.transit.fromDistrict,
      } satisfies WorldSceneData);
      // The gauge shows for a moment after a ride (ADR-126, contextual meters).
      if (this.transit.exit.transit === 'scooter') gameEvents.emit('fuel:show', { fuel: useGameStore.getState().counters[FUEL_COUNTER] ?? 0 });
    });
  }
}

export default TransitScene;
