import { describe, expect, it } from 'vitest';
import { formulaRegistry } from './formulas';
import { customLiquid, liquidPresets } from './liquids';
import { calculateReport } from './report';
import type { Chamber, TankProfile } from './types';

const dimensionsByShape: Record<string, Record<string, number>> = {
  'vertical-cylinder': { diameter: 2, height: 10 },
  'vertical-cylinder-conical-bottom': { diameter: 2, coneHeight: 2, cylinderHeight: 8 },
  'horizontal-cylinder': { diameter: 2, length: 10 },
  'horizontal-elliptical-cylinder': { width: 4, height: 2, length: 10 },
  'tilted-horizontal-cylinder': { diameter: 2, length: 10, slopeHeight: 0.25, gaugeOffset: 10 },
  'horizontal-cylinder-hemispherical': { diameter: 2, length: 10 },
  'horizontal-cylinder-ellipsoidal': { diameter: 2, length: 10, headDepth: 0.5 },
  rectangular: { length: 4, width: 3, height: 2 },
  'sloped-rectangular': { length: 4, width: 3, height: 2, slopeHeight: 0.5, gaugeOffset: 4 },
  sphere: { diameter: 2 },
  ellipsoid: { length: 4, width: 2, height: 2 },
  cone: { topDiameter: 2, height: 8 },
  frustum: { bottomDiameter: 2, topDiameter: 4, height: 3 },
};

function makeProfile(chamber: Partial<Chamber>): TankProfile {
  return {
    id: 'profile',
    name: 'Validation profile',
    chambers: [{
      id: 'c1',
      name: 'Chamber 1',
      shapeId: 'vertical-cylinder',
      dimensions: { diameter: 2, height: 10 },
      liquid: liquidPresets[0],
      fillHeightM: 5,
      useTargetVolume: false,
      ...chamber,
    }],
  };
}

function expectFiniteReport(profile: TankProfile): void {
  const report = calculateReport(profile);
  const values = [
    report.totals.volumeM3,
    report.totals.totalVolumeM3,
    report.totals.headspaceM3,
    report.totals.massKg,
    report.totals.fillPercent,
    ...report.chamberResults.flatMap((result) => [
      result.fillHeightM,
      result.totalVolumeM3,
      result.volumeM3,
      result.headspaceM3,
      result.massKg,
      result.fillPercent,
    ]),
  ];
  values.forEach((value) => expect(Number.isFinite(value)).toBe(true));
}

describe('calculation validation', () => {
  it('warns and stays finite for missing dimensions', () => {
    const report = calculateReport(makeProfile({ dimensions: { diameter: 2, height: 0 } }));
    expect(report.chamberResults[0].warnings.map((warning) => warning.code)).toContain('invalid-dimensions');
    expect(report.totals.volumeM3).toBe(0);
    expectFiniteReport(makeProfile({ dimensions: { diameter: 2, height: 0 } }));
  });

  it('clamps target volume above capacity', () => {
    const report = calculateReport(makeProfile({ useTargetVolume: true, targetVolumeM3: 10_000 }));
    const result = report.chamberResults[0];
    expect(result.fillHeightM).toBeCloseTo(10);
    expect(result.warnings.map((warning) => warning.code)).toContain('target-volume-clamped');
  });

  it('clamps fill height outside the supported range', () => {
    const report = calculateReport(makeProfile({ fillHeightM: 99 }));
    const result = report.chamberResults[0];
    expect(result.fillHeightM).toBeCloseTo(10);
    expect(result.warnings.map((warning) => warning.code)).toContain('fill-height-clamped');
  });

  it('warns and reports zero mass for invalid density', () => {
    const report = calculateReport(makeProfile({ liquid: customLiquid(0) }));
    const result = report.chamberResults[0];
    expect(result.massKg).toBe(0);
    expect(result.warnings.map((warning) => warning.code)).toContain('invalid-density');
  });

  it('warns when gauge offset is clamped', () => {
    const report = calculateReport(makeProfile({
      shapeId: 'tilted-horizontal-cylinder',
      dimensions: { diameter: 2, length: 10, slopeHeight: 0.25, gaugeOffset: 20 },
      fillHeightM: 1,
    }));
    expect(report.chamberResults[0].warnings.map((warning) => warning.code)).toContain('gauge-offset-clamped');
  });

  it('keeps reports finite for every registered formula at zero dimensions', () => {
    formulaRegistry.forEach((formula) => {
      expectFiniteReport(makeProfile({
        shapeId: formula.shapeId,
        dimensions: Object.fromEntries(Object.keys(dimensionsByShape[formula.shapeId]).map((key) => [key, 0])),
        fillHeightM: Number.NaN,
      }));
    });
  });
});
