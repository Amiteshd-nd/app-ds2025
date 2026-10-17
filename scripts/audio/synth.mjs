/**
 * The placeholder synthesiser (audio plan v1 §5.1, ADR-139) — pure JS, no
 * dependency. Every sound the game has before a real recording or a CC0 file
 * replaces it is rendered here from data:
 *
 *   recipes  src/data/audio/synth/*.json   token → { dur, layers, events?, loop? }
 *   songs    src/data/audio/songs/*.json   a tiny tracker: scale degrees in 8th-note steps
 *
 * Seeded (mulberry32 per token), so `pnpm audio` renders byte-identical files.
 * Output: mono 8-bit PCM WAV — small, and every browser decodes it.
 */

export const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const seedOf = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const pair = (v) => (Array.isArray(v) ? v : [v, v]);

/** One layer into `out` at `at` seconds: oscillator × envelope, with optional slide, vibrato, tremolo, arpeggio, filters. */
function renderLayer(out, sr, L, rng, scale = 1, pitch = 1) {
  const at = L.at ?? 0;
  const len = L.len ?? 0.2;
  const n = Math.max(1, Math.round(len * sr));
  const start = Math.round(at * sr);
  const [f0, f1] = pair(L.f ?? 440).map((f) => f * pitch);
  const [a, d, s, r] = L.env ?? [0.005, 0.05, 0.6, 0.05];
  const vol = (L.vol ?? 0.6) * scale;
  const duty = L.duty ?? 0.5;
  const [lp0, lp1] = L.lp ? pair(L.lp) : [0, 0];
  const [hp0, hp1] = L.hp ? pair(L.hp) : [0, 0];
  const arp = L.arp ?? [1];
  let phase = 0;
  let lpY = 0, hpY = 0, hpX = 0;
  let pink = [0, 0, 0], brown = 0;
  // Karplus–Strong pluck: a delay line of noise, averaged (the guitar).
  let ks = null, ksi = 0;
  if (L.wave === 'pluck') { const p = Math.max(2, Math.round(sr / f0)); ks = new Float32Array(p).map(() => rng() * 2 - 1); }
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const time = i / sr;
    let f = f1 === f0 ? f0 : f0 * Math.pow(f1 / f0, t);
    if (arp.length > 1) f *= arp[Math.min(arp.length - 1, Math.floor(t * arp.length))];
    if (L.vib) f *= Math.pow(2, (Math.sin(TAU * L.vib[0] * time) * L.vib[1]) / 12);
    phase += f / sr; phase -= Math.floor(phase);
    let v;
    switch (L.wave) {
      case 'square': v = phase < duty ? 1 : -1; break;
      case 'triangle': v = 1 - 4 * Math.abs(phase - 0.5); break;
      case 'saw': v = 2 * phase - 1; break;
      case 'noise': v = rng() * 2 - 1; break;
      case 'pink': { const w = rng() * 2 - 1; pink = [0.99765 * pink[0] + w * 0.099046, 0.963 * pink[1] + w * 0.2965164, 0.57 * pink[2] + w * 1.0526913]; v = (pink[0] + pink[1] + pink[2] + w * 0.1848) * 0.25; break; }
      case 'brown': { brown = (brown + 0.02 * (rng() * 2 - 1)) / 1.02; v = brown * 3.5; break; }
      case 'pluck': { const j = (ksi + 1) % ks.length; v = ks[ksi]; ks[ksi] = 0.996 * 0.5 * (ks[ksi] + ks[j]); ksi = j; break; }
      default: v = Math.sin(TAU * phase);
    }
    if (lp0) { const c = lerp(lp0, lp1, t); const k = 1 - Math.exp(-TAU * c / sr); lpY += k * (v - lpY); v = lpY; }
    if (hp0) { const c = lerp(hp0, hp1, t); const k = Math.exp(-TAU * c / sr); const y = k * (hpY + v - hpX); hpX = v; hpY = y; v = y; }
    // ADSR over the layer's own length: attack, decay to sustain, release at the end.
    let e;
    if (time < a) e = time / a;
    else if (time < a + d) e = lerp(1, s, (time - a) / d);
    else e = s;
    const tail = len - time;
    if (tail < r) e *= Math.max(0, tail / r);
    if (L.trem) e *= 1 - L.trem[1] * (0.5 + 0.5 * Math.sin(TAU * L.trem[0] * time));
    const idx = start + i;
    if (idx >= 0 && idx < out.length) out[idx] += v * e * vol;
  }
}

/** Render a recipe to samples. Beds get random `events` scattered over their length and a seamless loop seam. */
export function renderRecipe(recipe, sr, seed) {
  const rng = mulberry32(seed);
  const dur = recipe.dur ?? 0.3;
  const seam = recipe.loop ? Math.min(0.4, dur / 6) : 0;
  const out = new Float32Array(Math.round((dur + seam) * sr));
  const reps = recipe.repeat?.n ?? 1;
  for (let k = 0; k < reps; k++) {
    for (const L of recipe.layers ?? []) {
      const len = L.len ?? (recipe.loop ? dur + seam : dur - (L.at ?? 0));
      renderLayer(out, sr, { ...L, len, at: (L.at ?? 0) + k * (recipe.repeat?.gap ?? 0) }, rng);
    }
  }
  for (const ev of recipe.events ?? []) {
    const [lo, hi] = pair(ev.every);
    let t = rng() * lo;
    while (t < dur) {
      const v = lerp(...pair(ev.vol ?? 1), rng());
      const p = lerp(...pair(ev.pitch ?? 1), rng());
      for (const L of ev.layers) renderLayer(out, sr, { ...L, at: t + (L.at ?? 0) }, rng, v, p);
      t += lerp(lo, hi, rng());
    }
  }
  // Loop seam: the tail past `dur` is crossfaded into the head, then cut — the loop point is silent of clicks.
  let res = out;
  if (seam) {
    const m = Math.round(seam * sr), end = Math.round(dur * sr);
    res = out.slice(0, end);
    for (let i = 0; i < m; i++) { const w = i / m; res[i] = res[i] * w + out[end + i] * (1 - w); }
  }
  return normalise(res, recipe.peak ?? (recipe.loop ? 0.6 : 0.9));
}

export function normalise(buf, peak) {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < buf.length; i++) buf[i] *= peak / max;
  return buf;
}

// ── Songs ───────────────────────────────────────────────────────────────────
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** "1 3 5' . 6 - 5 3," → per 8th-step notes: degree (1-based) with ' up / , down an octave; '.' rest; '-' hold. Bars "|" are ignored. */
export function parseSeq(seq) {
  return seq.split(/\s+/).filter((t) => t && t !== '|').map((t) => {
    if (t === '.') return { rest: true };
    if (t === '-') return { hold: true };
    const up = (t.match(/'/g) ?? []).length, down = (t.match(/,/g) ?? []).length;
    return { degree: Number.parseInt(t, 10), oct: up - down };
  });
}

export function renderSong(song, sr, seed) {
  const rng = mulberry32(seed);
  const stepSec = 60 / song.bpm / 2;
  const steps = Math.max(...song.channels.map((c) => parseSeq(c.seq).length), song.drums ? parseSeq(song.drums.seq.replace(/[a-z]/g, '1')).length : 0);
  const dur = steps * stepSec;
  const out = new Float32Array(Math.round(dur * sr) + Math.round(0.6 * sr));
  for (const ch of song.channels) {
    const notes = parseSeq(ch.seq);
    for (let i = 0; i < notes.length; i++) {
      const nt = notes[i];
      if (!nt.degree) continue;
      let holdSteps = 1;
      while (notes[i + holdSteps]?.hold) holdSteps++;
      const d = nt.degree - 1;
      const octave = Math.floor(d / song.scale.length) + nt.oct + (ch.oct ?? 0);
      const semis = song.scale[((d % song.scale.length) + song.scale.length) % song.scale.length] + 12 * octave;
      renderLayer(out, sr, { wave: ch.wave, duty: ch.duty, f: midiHz(song.root + semis), at: i * stepSec, len: holdSteps * stepSec * (ch.gate ?? 0.95), env: ch.env ?? [0.005, 0.08, 0.5, 0.06], vol: ch.vol ?? 0.3, vib: ch.vib, lp: ch.lp }, rng);
    }
  }
  if (song.drums) {
    const hits = song.drums.seq.split(/\s+/).filter((t) => t && t !== '|');
    const kit = {
      k: [{ wave: 'sine', f: [120, 45], len: 0.18, env: [0.002, 0.12, 0, 0.05], vol: 0.9 }],
      s: [{ wave: 'noise', len: 0.12, env: [0.001, 0.08, 0, 0.04], vol: 0.45, hp: 900 }],
      h: [{ wave: 'noise', len: 0.04, env: [0.001, 0.03, 0, 0.01], vol: 0.18, hp: 5000 }],
      t: [{ wave: 'sine', f: [220, 160], len: 0.16, env: [0.002, 0.12, 0, 0.04], vol: 0.5 }, { wave: 'noise', len: 0.05, env: [0.001, 0.04, 0, 0.01], vol: 0.12, hp: 2500 }],
      g: [{ wave: 'sine', f: [90, 70], len: 0.3, env: [0.004, 0.25, 0, 0.05], vol: 0.6 }],
    };
    hits.forEach((h, i) => { for (const L of kit[h] ?? []) renderLayer(out, sr, { ...L, at: i * stepSec }, rng, song.drums.vol ?? 0.6); });
  }
  // The loop: the ring-out past the last bar folds back into the first.
  const end = Math.round(dur * sr);
  const res = out.slice(0, end);
  for (let i = 0; i < out.length - end && i < end; i++) res[i] += out[end + i];
  return normalise(res, song.peak ?? 0.8);
}

/** Mono 8-bit unsigned PCM WAV. */
export function wav8(samples, sr) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
  buf.write('data', 36); buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) {
    buf[44 + i] = Math.max(0, Math.min(255, Math.round(128 + samples[i] * 127)));
  }
  return buf;
}
