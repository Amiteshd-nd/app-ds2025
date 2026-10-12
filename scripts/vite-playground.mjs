/**
 * Test Playground dev-server plugin (ADR-104). `apply: 'serve'`: it exists
 * only under `vite dev` — never in a build. Endpoints under /__pg:
 *
 *   GET  /__pg/validate          → { problems: string[] } from the real validators
 *   GET  /__pg/presets           → { presets: Preset[] }  (src/data/playground/presets)
 *   POST /__pg/presets           { name, preset }   → writes <name>.json
 *   POST /__pg/export            { file, json }     → writes a scene file ONLY if the
 *                                                     content validator still passes;
 *                                                     otherwise restores it and returns problems
 *
 * Writing game data happens only through /export, which the playground calls
 * after showing a diff and getting the user's confirmation.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
export const PRESETS_DIR = join(root, 'src/data/playground/presets');

/** "Act 1 broke (₹200)" → "act-1-broke-200". */
export const presetFileName = (name) =>
  String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'preset';

export function readPresets(dir = PRESETS_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ id: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
}

export function writePreset(name, preset, dir = PRESETS_DIR) {
  mkdirSync(dir, { recursive: true });
  const id = presetFileName(name);
  writeFileSync(join(dir, `${id}.json`), `${JSON.stringify({ name, ...preset }, null, 2)}\n`);
  return id;
}

/**
 * Write `json` to `file` (relative to src/data), run `validate()`; if it
 * reports problems, put the original back and return them.
 */
export async function exportWithValidation(file, json, validate, dataRoot = join(root, 'src/data')) {
  if (!/^scenes\/[a-z0-9_]+\.json$/.test(file)) return { ok: false, problems: [`refusing to write ${file}: only scenes/*.json can be exported`] };
  const path = join(dataRoot, file);
  const original = existsSync(path) ? readFileSync(path, 'utf8') : null;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  const problems = await validate();
  if (problems.length) {
    if (original === null) writeFileSync(path, ''); else writeFileSync(path, original);
    return { ok: false, problems };
  }
  return { ok: true, problems: [] };
}

const run = (script) => new Promise((done) => {
  execFile(process.execPath, [join(root, 'scripts', script)], { cwd: root }, (_err, stdout, stderr) => {
    done(`${stdout}\n${stderr}`.split('\n').filter((l) => l.trim().startsWith('•')).map((l) => l.trim().slice(1).trim()));
  });
});
export const runValidators = async () => [...(await run('validate-content.ts')), ...(await run('validate-maps.mjs'))];

const body = (req) => new Promise((done) => {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => { try { done(JSON.parse(data || '{}')); } catch { done({}); } });
});
const send = (res, status, json) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(json)); };

export function playgroundPlugin() {
  return {
    name: 'bangalore-times-playground',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__pg', async (req, res) => {
        try {
          if (req.method === 'GET' && req.url?.startsWith('/validate')) return send(res, 200, { problems: await runValidators() });
          if (req.method === 'GET' && req.url?.startsWith('/presets')) return send(res, 200, { presets: readPresets() });
          if (req.method === 'POST' && req.url?.startsWith('/presets')) {
            const { name, preset } = await body(req);
            if (!name || !preset) return send(res, 400, { error: 'name and preset are required' });
            return send(res, 200, { id: writePreset(name, preset) });
          }
          if (req.method === 'POST' && req.url?.startsWith('/export')) {
            const { file, json } = await body(req);
            return send(res, 200, await exportWithValidation(file, json, async () => run('validate-content.ts')));
          }
          send(res, 404, { error: 'unknown playground endpoint' });
        } catch (err) {
          send(res, 500, { error: String(err) });
        }
      });
    },
  };
}
