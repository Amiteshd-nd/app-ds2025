import Phaser from 'phaser';
import type { Settings } from '../systems/SettingsManager';

/**
 * Settings → Display, applied to Phaser's scale manager (ADR-119). Fullscreen
 * needs a user gesture — the menu press that changed it is one. Pixel scale:
 * AUTO fits the window (Scale.FIT); 1×/2×/3× fix the canvas at that integer
 * zoom (Scale.NONE + zoom), letterboxed by the host.
 */
export function applyDisplaySettings(game: Phaser.Game, display: Settings['display']): void {
  const scale = game.scale;
  if (!scale) return;
  if (display.fullscreen && !scale.isFullscreen && scale.fullscreen.available) scale.startFullscreen();
  else if (!display.fullscreen && scale.isFullscreen) scale.stopFullscreen();

  const wantZoom = display.pixelScale === 'auto' ? null : Number(display.pixelScale);
  const wantMode = wantZoom === null ? Phaser.Scale.FIT : Phaser.Scale.NONE;
  if (scale.scaleMode !== wantMode) scale.scaleMode = wantMode;
  if (wantZoom !== null) scale.setZoom(wantZoom);
  else if (scale.zoom !== 1) scale.setZoom(1);
  scale.refresh();
}
