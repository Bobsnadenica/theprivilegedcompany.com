import { describe, expect, it } from 'vitest';
import { checksumText, interpolateHeight, interpolateVolume, makeCalibrationTable, parseCalibrationCsv } from './calibration';

describe('calibration tables', () => {
  it('parses height-volume csv and interpolates', () => {
    const points = parseCalibrationCsv('height_m,volume_m3\n0,0\n1,10\n2,30');
    expect(points).toHaveLength(3);
    expect(interpolateVolume(points, 1.5)).toBeCloseTo(20);
    expect(interpolateHeight(points, 20)).toBeCloseTo(1.5);
  });

  it('parses semicolon and tab delimited rows with headers', () => {
    expect(parseCalibrationCsv('height_m;volume_m3\n0;0\n1;10')).toEqual([
      { heightM: 0, volumeM3: 0 },
      { heightM: 1, volumeM3: 10 },
    ]);
    expect(parseCalibrationCsv('height_m\tvolume_m3\n0\t0\n1\t10')).toEqual([
      { heightM: 0, volumeM3: 0 },
      { heightM: 1, volumeM3: 10 },
    ]);
  });

  it('rejects non-monotonic heights', () => {
    expect(() => parseCalibrationCsv('0,0\n1,10\n1,20')).toThrow(/strictly increasing/);
  });

  it('reports source row numbers for invalid rows', () => {
    expect(() => parseCalibrationCsv('height_m,volume_m3\n0,0\nbad,10')).toThrow(/Row 3/);
  });

  it('clamps interpolation to table coverage', () => {
    const points = parseCalibrationCsv('0,0\n1,10\n2,30');
    expect(interpolateVolume(points, -1)).toBe(0);
    expect(interpolateVolume(points, 3)).toBe(30);
    expect(interpolateHeight(points, -1)).toBe(0);
    expect(interpolateHeight(points, 99)).toBe(2);
  });

  it('handles plateau volumes when solving height', () => {
    const points = parseCalibrationCsv('0,0\n1,10\n2,10\n3,30');
    expect(interpolateHeight(points, 10)).toBeCloseTo(1);
    expect(interpolateVolume(points, 1.5)).toBeCloseTo(10);
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

  it('applies metadata fallbacks and stable checksums', () => {
    const csv = '0,0\n1,10';
    const table = makeCalibrationTable(csv, {
      title: '',
      sourceReference: '',
      revision: '',
      certifiedBy: '',
    });

    expect(table.title).toBe('Imported calibration table');
    expect(table.sourceReference).toBe('User-provided certified table');
    expect(table.revision).toBe('Unspecified revision');
    expect(table.certifiedBy).toBe('Unspecified certifier');
    expect(checksumText(csv)).toBe(checksumText(csv));
  });
});
