import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs script, no types
import { checkSource, runValidation, ALLOWLIST } from '../../scripts/validate-platform.mjs';

describe('platform boundary (ADR-64)', () => {
  it('the real src/ is clean apart from the allowlist', () => {
    expect(runValidation()).toEqual([]);
  });

  it('catches a direct localStorage call in game code, with the file and line', () => {
    const p = checkSource('scenes/PauseScene.ts', "const x = 1;\nlocalStorage.setItem('a', 'b');");
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('scenes/PauseScene.ts:2');
    expect(p[0]).toContain('platform.storage');
  });

  it('catches navigator.*, indexedDB and Capacitor imports', () => {
    const src = [
      "import { Haptics } from '@capacitor/haptics';",
      'navigator.vibrate(10);',
      "indexedDB.open('x');",
      'if (Capacitor.isNativePlatform()) {}',
    ].join('\n');
    expect(checkSource('systems/Fx.ts', src)).toHaveLength(4);
  });

  it('ignores the API name inside a comment', () => {
    expect(checkSource('x.ts', '// never call localStorage here')).toEqual([]);
  });

  it('lets an allowlisted file through, and the allowlist names the task that removes it', () => {
    expect(checkSource('systems/SaveManager.ts', 'localStorage.getItem("k")')).toEqual([]);
    for (const reason of Object.values(ALLOWLIST) as string[]) expect(reason).toMatch(/T-\d{3}/);
  });
});
