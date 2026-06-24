import { describe, expect, it } from 'vitest';
import { formulaRegistry, heightForVolume } from './formulas';

const byShape = Object.fromEntries(formulaRegistry.map((entry) => [entry.shapeId, entry]));

function expectClose(actual: number, expected: number, precision = 8): void {
  expect(actual).toBeCloseTo(expected, precision);
}

describe('formula registry', () => {
  it('calculates vertical cylinder volume', () => {
    const formula = byShape['vertical-cylinder'];
    const dimensions = { diameter: 2, height: 10 };
    expectClose(formula.totalVolume(dimensions), 10 * Math.PI);
    expectClose(formula.volumeAtHeight(dimensions, 5), 5 * Math.PI);
  });

  it('calculates vertical cylinder with conical bottom piecewise', () => {
    const formula = byShape['vertical-cylinder-conical-bottom'];
    const dimensions = { diameter: 2, coneHeight: 2, cylinderHeight: 4 };
    const coneVolume = Math.PI * 1 ** 2 * 2 / 3;
    expectClose(formula.totalVolume(dimensions), coneVolume + 4 * Math.PI);
    expectClose(formula.volumeAtHeight(dimensions, 1), Math.PI / 12);
    expectClose(formula.volumeAtHeight(dimensions, 2), coneVolume);
    expectClose(formula.volumeAtHeight(dimensions, 4), coneVolume + 2 * Math.PI);
  });

  it('calculates horizontal cylinder half-fill', () => {
    const formula = byShape['horizontal-cylinder'];
    const dimensions = { diameter: 2, length: 10 };
    expectClose(formula.totalVolume(dimensions), 10 * Math.PI);
    expectClose(formula.volumeAtHeight(dimensions, 1), 5 * Math.PI);
  });

  it('calculates horizontal elliptical cylinder half-fill', () => {
    const formula = byShape['horizontal-elliptical-cylinder'];
    const dimensions = { width: 4, height: 2, length: 10 };
    expectClose(formula.totalVolume(dimensions), 20 * Math.PI);
    expectClose(formula.volumeAtHeight(dimensions, 1), 10 * Math.PI);
  });

  it('calculates tilted horizontal cylinder from configured gauge position', () => {
    const formula = byShape['tilted-horizontal-cylinder'];
    const levelFormula = byShape['horizontal-cylinder'];
    const levelDimensions = { diameter: 2, length: 4 };
    const tiltedDimensions = { diameter: 2, length: 4, slopeHeight: 0.16, gaugeOffset: 4 };

    expectClose(formula.totalVolume(tiltedDimensions), levelFormula.totalVolume(levelDimensions));
    expectClose(formula.volumeAtHeight({ ...tiltedDimensions, slopeHeight: 0 }, 1), levelFormula.volumeAtHeight(levelDimensions, 1));
    expectClose(formula.volumeAtHeight(tiltedDimensions, 1), 6.921816454, 5);
  });

  it('calculates horizontal cylinder with hemispherical heads', () => {
    const formula = byShape['horizontal-cylinder-hemispherical'];
    const dimensions = { diameter: 2, length: 10 };
    expectClose(formula.totalVolume(dimensions), 10 * Math.PI + (4 / 3) * Math.PI);
    expectClose(formula.volumeAtHeight(dimensions, 1), 5 * Math.PI + (2 / 3) * Math.PI);
  });

  it('calculates horizontal cylinder with ellipsoidal heads', () => {
    const formula = byShape['horizontal-cylinder-ellipsoidal'];
    const dimensions = { diameter: 2, length: 10, headDepth: 0.5 };
    expectClose(formula.totalVolume(dimensions), 10 * Math.PI + (2 / 3) * Math.PI);
    expectClose(formula.volumeAtHeight(dimensions, 1), 5 * Math.PI + (1 / 3) * Math.PI);
  });

  it('calculates rectangular prism volume', () => {
    const formula = byShape.rectangular;
    const dimensions = { length: 4, width: 3, height: 2 };
    expectClose(formula.totalVolume(dimensions), 24);
    expectClose(formula.volumeAtHeight(dimensions, 1), 12);
  });

  it('calculates sloped rectangular volume at full and zero slope', () => {
    const formula = byShape['sloped-rectangular'];
    const dimensions = { length: 4, width: 3, height: 2, slopeHeight: 0.5, gaugeOffset: 4 };
    expectClose(formula.totalVolume(dimensions), 21);
    expectClose(formula.volumeAtHeight({ ...dimensions, slopeHeight: 0 }, 1), 12);
    expectClose(formula.volumeAtHeight(dimensions, 1), 15);
  });

  it('calculates sphere cap volumes', () => {
    const formula = byShape.sphere;
    const dimensions = { diameter: 2 };
    expectClose(formula.totalVolume(dimensions), (4 / 3) * Math.PI);
    expectClose(formula.volumeAtHeight(dimensions, 1), (2 / 3) * Math.PI);
  });

  it('calculates ellipsoid full and half volumes', () => {
    const formula = byShape.ellipsoid;
    const dimensions = { length: 4, width: 2, height: 2 };
    expectClose(formula.totalVolume(dimensions), (8 / 3) * Math.PI);
    expectClose(formula.volumeAtHeight(dimensions, 1), (4 / 3) * Math.PI);
  });

  it('calculates cone fill from apex down', () => {
    const formula = byShape.cone;
    const dimensions = { topDiameter: 2, height: 8 };
    const total = formula.totalVolume(dimensions);
    expectClose(formula.volumeAtHeight(dimensions, 4), total / 8);
  });

  it('calculates frustum full volume', () => {
    const formula = byShape.frustum;
    const dimensions = { bottomDiameter: 2, topDiameter: 4, height: 3 };
    expectClose(formula.totalVolume(dimensions), Math.PI * 3 * (1 ** 2 + 1 * 2 + 2 ** 2) / 3);
  });

  it('round trips volume to height for all registered formulas', () => {
    const cases: Array<{ formula: (typeof formulaRegistry)[number]; dimensions: Record<string, number>; ratio: number }> = [
      { formula: byShape['vertical-cylinder'], dimensions: { diameter: 2, height: 10 }, ratio: 0.37 },
      { formula: byShape['vertical-cylinder-conical-bottom'], dimensions: { diameter: 2, coneHeight: 2, cylinderHeight: 8 }, ratio: 0.37 },
      { formula: byShape['horizontal-cylinder'], dimensions: { diameter: 2, length: 10 }, ratio: 0.37 },
      { formula: byShape['horizontal-elliptical-cylinder'], dimensions: { width: 4, height: 2, length: 10 }, ratio: 0.37 },
      { formula: byShape['tilted-horizontal-cylinder'], dimensions: { diameter: 2, length: 10, slopeHeight: 0.25, gaugeOffset: 10 }, ratio: 0.37 },
      { formula: byShape['horizontal-cylinder-hemispherical'], dimensions: { diameter: 2, length: 10 }, ratio: 0.37 },
      { formula: byShape['horizontal-cylinder-ellipsoidal'], dimensions: { diameter: 2, length: 10, headDepth: 0.5 }, ratio: 0.37 },
      { formula: byShape.rectangular, dimensions: { length: 4, width: 3, height: 2 }, ratio: 0.37 },
      { formula: byShape['sloped-rectangular'], dimensions: { length: 4, width: 3, height: 2, slopeHeight: 0.5, gaugeOffset: 4 }, ratio: 0.37 },
      { formula: byShape.sphere, dimensions: { diameter: 2 }, ratio: 0.37 },
      { formula: byShape.ellipsoid, dimensions: { length: 4, width: 2, height: 2 }, ratio: 0.37 },
      { formula: byShape.cone, dimensions: { topDiameter: 2, height: 8 }, ratio: 0.37 },
      { formula: byShape.frustum, dimensions: { bottomDiameter: 2, topDiameter: 4, height: 3 }, ratio: 0.37 },
    ];

    cases.forEach(({ formula, dimensions, ratio }) => {
      const targetVolume = formula.totalVolume(dimensions) * ratio;
      const height = heightForVolume(formula, dimensions, targetVolume);
      expectClose(formula.volumeAtHeight(dimensions, height), targetVolume, 6);
    });
  });

  it('round trips boundary ratios for every registered formula', () => {
    const dimensionsByShape: Record<string, Record<string, number>> = {
      'vertical-cylinder': { diameter: 2, height: 10 },
      'vertical-cylinder-conical-bottom': { diameter: 2, coneHeight: 2, cylinderHeight: 8 },
      'horizontal-cylinder': { diameter: 2, length: 10 },
      'horizontal-elliptical-cylinder': { width: 4, height: 2, length: 10 },
      'tilted-horizontal-cylinder': { diameter: 2, length: 10, slopeHeight: 0.25, gaugeOffset: 0 },
      'horizontal-cylinder-hemispherical': { diameter: 2, length: 10 },
      'horizontal-cylinder-ellipsoidal': { diameter: 2, length: 10, headDepth: 0.5 },
      rectangular: { length: 4, width: 3, height: 2 },
      'sloped-rectangular': { length: 4, width: 3, height: 2, slopeHeight: 0.5, gaugeOffset: 0 },
      sphere: { diameter: 2 },
      ellipsoid: { length: 4, width: 2, height: 2 },
      cone: { topDiameter: 2, height: 8 },
      frustum: { bottomDiameter: 2, topDiameter: 4, height: 3 },
    };

    formulaRegistry.forEach((formula) => {
      const dimensions = dimensionsByShape[formula.shapeId];
      [0, 0.01, 0.25, 0.5, 0.9, 1].forEach((ratio) => {
        const targetVolume = formula.totalVolume(dimensions) * ratio;
        const height = heightForVolume(formula, dimensions, targetVolume);
        expectClose(formula.volumeAtHeight(dimensions, height), targetVolume, 5);
      });
    });
  });
});
