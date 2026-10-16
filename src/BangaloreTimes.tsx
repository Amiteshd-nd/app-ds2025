import type { ReactNode } from 'react';
import PhaserGame from './PhaserGame';
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
  /** On-screen joystick + action button: 'auto' (touch devices only, the default) or 'always'. */
  touchControls?: 'auto' | 'always';
}

/**
 * Self-contained game screen. Portable across hosts: it takes no router or
 * theme dependency.
 *
 * Since P6c (ADR-118) the whole HUD — plates, prompts, toasts, the dialogue
 * card and the touch controls — is drawn inside the canvas by HudScene, in
 * the bitmap font, so the React shell is only the canvas and the host's back
 * pill. Nothing here reads game state.
 */
const BangaloreTimes = ({ backSlot, startScene, startDistrict, touchControls = 'auto' }: BangaloreTimesProps) => (
  <div className="nq-root">
    <PhaserGame startScene={startScene} startDistrict={startDistrict} touchControls={touchControls} />
    {backSlot && (
      <div className="nq-hud-top">
        <div className="nq-back-slot">{backSlot}</div>
      </div>
    )}
  </div>
);

export default BangaloreTimes;
