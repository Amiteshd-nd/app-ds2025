import { hex } from '../ui/tokens';
import { reachPx, thumbPivots, type DevicePreset } from './ergonomics';
import type { SimOptions } from './Playground';

export interface Target { name: string; rect: { x: number; y: number; w: number; h: number } }

/**
 * Two thumbs holding the phone in landscape, drawn over the simulated screen:
 * reach zones (comfortable / stretch, everything else is hard), safe-area
 * bands, and each thumb reaching for its control where it actually renders.
 * Purely visual (pointer-events: none) — the controls underneath still work.
 */
export default function ThumbOverlay({ device, scale, options, targets }: { device: DevicePreset; scale: number; options: SimOptions; targets: Target[] }) {
  const { left, right } = thumbPivots(device);
  const r = reachPx(device, options.hand);
  const W = device.width, H = device.height;
  const thumbW = 16 * device.pxPerMm;

  const thumb = (pivot: { x: number; y: number }, target: Target | undefined, key: string) => {
    if (!target) return null;
    const tx = target.rect.x + target.rect.w / 2, ty = target.rect.y + target.rect.h / 2;
    const len = Math.hypot(tx - pivot.x, ty - pivot.y) + thumbW * 0.35;
    const angle = (Math.atan2(ty - pivot.y, tx - pivot.x) * 180) / Math.PI;
    return (
      <g key={key} transform={`translate(${pivot.x} ${pivot.y}) rotate(${angle})`} opacity={0.78}>
        <rect x={-thumbW} y={-thumbW / 2} width={len + thumbW} height={thumbW} rx={thumbW / 2} fill={hex('skin.2')} stroke={hex('ui.text.ink')} strokeWidth={3} />
        <ellipse cx={len - thumbW * 0.45} cy={0} rx={thumbW * 0.3} ry={thumbW * 0.34} fill={hex('plaster.cream')} stroke={hex('skin.2.shade')} strokeWidth={2} />
      </g>
    );
  };

  return (
    <svg className="pg-thumbs" width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <clipPath id="pg-screen-clip"><rect x={0} y={0} width={W} height={H} /></clipPath>
        <pattern id="pg-hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={8} height={8} fill="var(--pg-bad)" opacity={0.08} />
          <line x1={0} y1={0} x2={0} y2={8} stroke="var(--pg-bad)" strokeWidth={2} opacity={0.35} />
        </pattern>
      </defs>
      <g clipPath="url(#pg-screen-clip)">
        {options.zones && [left, right].map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={r.stretch} fill="var(--pg-warn)" opacity={0.16} />
            <circle cx={p.x} cy={p.y} r={r.comfortable} fill="var(--pg-good)" opacity={0.22} />
          </g>
        ))}
        {options.safe && (
          <>
            {device.safe.left > 0 && <rect x={0} y={0} width={device.safe.left} height={H} fill="url(#pg-hatch)" />}
            {device.safe.right > 0 && <rect x={W - device.safe.right} y={0} width={device.safe.right} height={H} fill="url(#pg-hatch)" />}
            {device.safe.bottom > 0 && <rect x={0} y={H - device.safe.bottom} width={W} height={device.safe.bottom} fill="url(#pg-hatch)" />}
          </>
        )}
      </g>
      {options.thumbs && (
        <>
          {thumb(left, targets.find((t) => t.name.startsWith('Joystick')), 'l')}
          {thumb(right, targets.find((t) => t.name.startsWith('A button')), 'r')}
        </>
      )}
    </svg>
  );
}
