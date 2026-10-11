import { describe, expect, it } from 'vitest';
import { BEHAVIOURS } from '../world/behaviours';
import { BEHAVIOUR_NAMES } from '../world/behaviours/names';

describe('behaviour registry', () => {
  it('names.ts (what the validator accepts) matches index.ts (what WorldScene can attach)', () => {
    expect([...BEHAVIOUR_NAMES].sort()).toEqual(Object.keys(BEHAVIOURS).sort());
  });
});
