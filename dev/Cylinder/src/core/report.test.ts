import { describe, expect, it } from 'vitest';
import { liquidPresets } from './liquids';
import { calculateReport } from './report';
import type { TankProfile } from './types';

describe('calculation report', () => {
  it('aggregates multi-chamber totals', () => {
    const profile: TankProfile = {
      id: 'p1',
      name: 'Two chamber tank',
      chambers: [
        {
          id: 'c1',
          name: 'Vertical',
          shapeId: 'vertical-cylinder',
          dimensions: { diameter: 2, height: 10 },
          liquid: liquidPresets[0],
          fillHeightM: 5,
          useTargetVolume: false,
        },
        {
          id: 'c2',
          name: 'Box',
          shapeId: 'rectangular',
          dimensions: { length: 2, width: 2, height: 2 },
          liquid: liquidPresets[1],
          fillHeightM: 1,
          useTargetVolume: false,
        },
      ],
    };

    const report = calculateReport(profile);
    expect(report.chamberResults).toHaveLength(2);
    expect(report.totals.volumeM3).toBeCloseTo(5 * Math.PI + 4);
    expect(report.totals.massKg).toBeGreaterThan(0);
  });
});
