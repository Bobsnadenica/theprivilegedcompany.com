import { describe, expect, it } from 'vitest';
import { liquidPresets } from './liquids';
import { loadWorkspaceState, saveWorkspaceState, WORKSPACE_STORAGE_KEY, type StoredWorkspace } from './workspace';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(WORKSPACE_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const workspace: StoredWorkspace = {
  version: 1,
  profileName: 'Saved profile',
  chambers: [{
    id: 'chamber-1',
    name: 'Chamber 1',
    shapeId: 'vertical-cylinder',
    dimensions: { diameter: 2, height: 4 },
    liquid: liquidPresets[0],
    fillHeightM: 2,
    useTargetVolume: false,
  }],
  selectedChamberId: 'chamber-1',
  language: 'en',
  lengthUnit: 'm',
  volumeUnit: 'm3',
  massUnit: 'kg',
};

describe('workspace storage', () => {
  it('round-trips a valid workspace', () => {
    const storage = memoryStorage();
    expect(saveWorkspaceState(workspace, storage)).toBe(true);
    expect(loadWorkspaceState(storage)).toEqual(workspace);
  });

  it('ignores malformed or unsupported saved data', () => {
    expect(loadWorkspaceState(memoryStorage('{bad json'))).toBeNull();
    expect(loadWorkspaceState(memoryStorage(JSON.stringify({ ...workspace, version: 2 })))).toBeNull();
    expect(loadWorkspaceState(memoryStorage(JSON.stringify({ ...workspace, selectedChamberId: 'missing' })))).toBeNull();
  });

  it('handles unavailable storage without disrupting the calculator', () => {
    expect(loadWorkspaceState(undefined)).toBeNull();
    expect(saveWorkspaceState(workspace, undefined)).toBe(false);
  });
});
