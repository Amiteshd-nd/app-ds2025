/**
 * Decode compressed audio (OGG Vorbis, MP3, M4A…) with the headless Chromium
 * Movie Mode already uses (playwright-core, Apache-2.0) — no codec package,
 * no ffmpeg (audio plan v1 §6, ADR-141). The browser decodes and resamples to
 * mono at `sampleRate` in one OfflineAudioContext render.
 */
import { readFileSync } from 'node:fs';

export async function decodeFiles(paths, sampleRate) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const out = new Map();
    for (const path of paths) {
      const b64 = readFileSync(path).toString('base64');
      const samples = await page.evaluate(async ({ b64, sampleRate }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const probe = new OfflineAudioContext(1, 1, sampleRate);
        const decoded = await probe.decodeAudioData(bytes.buffer);
        const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * sampleRate)), sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = decoded; // channels mix down to the context's one channel
        src.connect(ctx.destination);
        src.start();
        const rendered = await ctx.startRendering();
        return Array.from(rendered.getChannelData(0));
      }, { b64, sampleRate });
      out.set(path, Float32Array.from(samples));
    }
    return out;
  } finally {
    await browser.close();
  }
}
