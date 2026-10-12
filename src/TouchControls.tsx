import { useCallback, useEffect, useRef, useState } from 'react';
import { pressInteract, setAxis } from './input/InputMap';

/**
 * Virtual joystick + action button (mobile foundation §5 rules 1–3, 5).
 *
 * Rendered only on coarse-pointer devices (phones, tablets). The stick writes
 * the shared InputMap; the A button fires the same interaction the E key
 * does. Targets are ≥ 48 px; the overlay respects safe-area insets so a
 * notch or gesture bar never covers it. Pointer events, not touch events, so
 * a mouse on a touch laptop also works.
 */
const STICK_RADIUS = 56; // px, base radius
const KNOB_RADIUS = 24;

const coarsePointer = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

const TouchControls = ({ side = 'left' as 'left' | 'right', always = false }) => {
  const [coarse, setVisible] = useState(coarsePointer);
  // `always`: show the joystick + A on any pointer (a desktop touchscreen, or a
  // device simulation); otherwise only on coarse-pointer devices.
  const visible = always || coarse;
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeId = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse)');
    if (!mq) return;
    const onChange = () => setVisible(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const move = useCallback((clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let dx = clientX - cx, dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const max = STICK_RADIUS - KNOB_RADIUS / 2;
    if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
    setKnob({ x: dx, y: dy });
    setAxis(dx / max, dy / max);
  }, []);

  const release = useCallback(() => {
    activeId.current = null;
    setKnob({ x: 0, y: 0 });
    setAxis(0, 0);
  }, []);

  // A finger that leaves the stick, a cancelled gesture, or a capture that
  // was refused must still stop the player: listen at the window too. A
  // stuck axis is the one bug a virtual joystick must never have.
  useEffect(() => {
    if (!visible) return;
    const onUp = (e: PointerEvent) => { if (activeId.current === e.pointerId) release(); };
    const onBlur = () => release();
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onBlur);
      release();
    };
  }, [visible, release]);

  if (!visible) return null;

  return (
    <div className={`nq-touch nq-touch-${side}`} aria-hidden="true">
      <div
        ref={baseRef}
        className="nq-stick"
        onPointerDown={(e) => {
          activeId.current = e.pointerId;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not a live pointer; window listeners cover it */ }
          move(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => { if (activeId.current === e.pointerId) move(e.clientX, e.clientY); }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="nq-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <button
        type="button"
        className="nq-action"
        onPointerDown={(e) => { e.preventDefault(); pressInteract(); }}
      >
        A
      </button>
    </div>
  );
};

export default TouchControls;
