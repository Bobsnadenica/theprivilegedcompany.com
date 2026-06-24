import { describe, expect, it } from 'vitest';
import { interpolateHeight, interpolateVolume, makeCalibrationTable, parseCalibrationCsv } from './calibration';

describe('calibration tables', () => {
  it('parses height-volume csv and interpolates', () => {
    const points = parseCalibrationCsv('height_m,volume_m3\n0,0\n1,10\n2,30');
    expect(points).toHaveLength(3);
    expect(interpolateVolume(points, 1.5)).toBeCloseTo(20);
    expect(interpolateHeight(points, 20)).toBeCloseTo(1.5);
  });

  it('rejects non-monotonic heights', () => {
    expect(() => parseCalibrationCsv('0,0\n1,10\n1,20')).toThrow(/strictly increasing/);
  });

  it('creates table metadata and checksum', () => {
    const table = makeCalibrationTable('0,0\n1,10', {
      title: 'Tank A',
      sourceReference: 'Certificate 42',
      revision: '2026-06',
      certifiedBy: 'Lab',
    });

    expect(table.title).toBe('Tank A');
    expect(table.checksum).toMatch(/^fnv1a-/);
  });
});
