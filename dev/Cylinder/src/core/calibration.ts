import type { CalibrationPoint, CalibrationTable, Chamber, ChamberCalculation } from './types';
import { clamp, formatNumber } from './units';

export interface CalibrationMetadata {
  title: string;
  sourceReference: string;
  revision: string;
  certifiedBy: string;
}

export function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function parseCalibrationCsv(csvText: string): CalibrationPoint[] {
  const rows = csvText
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split(/[,\t;]/).map((cell) => cell.trim()));

  const points = rows
    .filter((cells) => cells.length >= 2)
    .map((cells, index) => {
      const heightM = Number(cells[0]);
      const volumeM3 = Number(cells[1]);
      if (!Number.isFinite(heightM) || !Number.isFinite(volumeM3)) {
        if (index === 0 && /height/i.test(cells[0])) return null;
        throw new Error(`Row ${index + 1} must contain numeric height_m and volume_m3 values.`);
      }
      return { heightM, volumeM3 };
    })
    .filter((point): point is CalibrationPoint => point !== null);

  validateCalibrationPoints(points);
  return points;
}

export function validateCalibrationPoints(points: CalibrationPoint[]): void {
  if (points.length < 2) {
    throw new Error('Calibration table requires at least two height-volume rows.');
  }
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point.heightM < 0 || point.volumeM3 < 0) {
      throw new Error('Calibration table cannot contain negative heights or volumes.');
    }
    if (i > 0) {
      const previous = points[i - 1];
      if (point.heightM <= previous.heightM) {
        throw new Error('Calibration heights must be strictly increasing.');
      }
      if (point.volumeM3 < previous.volumeM3) {
        throw new Error('Calibration volumes must be monotonically increasing.');
      }
    }
  }
}

export function makeCalibrationTable(csvText: string, metadata: CalibrationMetadata): CalibrationTable {
  const points = parseCalibrationCsv(csvText);
  return {
    id: `cal-${Date.now()}`,
    title: metadata.title || 'Imported calibration table',
    sourceReference: metadata.sourceReference || 'User-provided certified table',
    revision: metadata.revision || 'Unspecified revision',
    certifiedBy: metadata.certifiedBy || 'Unspecified certifier',
    checksum: checksumText(csvText),
    importedAtIso: new Date().toISOString(),
    points,
  };
}

export function interpolateVolume(points: CalibrationPoint[], heightM: number): number {
  validateCalibrationPoints(points);
  const minHeight = points[0].heightM;
  const maxHeight = points[points.length - 1].heightM;
  const height = clamp(heightM, minHeight, maxHeight);

  for (let i = 1; i < points.length; i += 1) {
    const left = points[i - 1];
    const right = points[i];
    if (height <= right.heightM) {
      const span = right.heightM - left.heightM;
      const t = span === 0 ? 0 : (height - left.heightM) / span;
      return left.volumeM3 + t * (right.volumeM3 - left.volumeM3);
    }
  }
  return points[points.length - 1].volumeM3;
}

export function interpolateHeight(points: CalibrationPoint[], volumeM3: number): number {
  validateCalibrationPoints(points);
  const minVolume = points[0].volumeM3;
  const maxVolume = points[points.length - 1].volumeM3;
  const volume = clamp(volumeM3, minVolume, maxVolume);

  for (let i = 1; i < points.length; i += 1) {
    const left = points[i - 1];
    const right = points[i];
    if (volume <= right.volumeM3) {
      const span = right.volumeM3 - left.volumeM3;
      const t = span === 0 ? 0 : (volume - left.volumeM3) / span;
      return left.heightM + t * (right.heightM - left.heightM);
    }
  }
  return points[points.length - 1].heightM;
}

export function calculateFromCalibrationTable(chamber: Chamber): ChamberCalculation {
  if (!chamber.calibrationTable) {
    throw new Error('Calibration table mode requires an imported certified table.');
  }

  const points = chamber.calibrationTable.points;
  const maxHeight = points[points.length - 1].heightM;
  const totalVolumeM3 = points[points.length - 1].volumeM3;
  const fillHeightM = chamber.useTargetVolume && chamber.targetVolumeM3 !== undefined
    ? interpolateHeight(points, chamber.targetVolumeM3)
    : clamp(chamber.fillHeightM, points[0].heightM, maxHeight);
  const volumeM3 = interpolateVolume(points, fillHeightM);

  return {
    chamberId: chamber.id,
    chamberName: chamber.name,
    shapeId: chamber.shapeId,
    fillHeightM,
    totalVolumeM3,
    volumeM3,
    headspaceM3: Math.max(0, totalVolumeM3 - volumeM3),
    fillPercent: totalVolumeM3 > 0 ? (volumeM3 / totalVolumeM3) * 100 : 0,
    massKg: volumeM3 * chamber.liquid.densityKgM3,
    formula: {
      formulaId: `calibration-table:${chamber.calibrationTable.id}`,
      formulaLabel: 'Certified calibration table interpolation',
      formulaText: 'Linear interpolation between certified height-volume table rows',
      substitutedText: `height = ${formatNumber(fillHeightM)} m, checksum = ${chamber.calibrationTable.checksum}`,
      source: {
        id: chamber.calibrationTable.id,
        kind: 'imported-table',
        title: chamber.calibrationTable.title,
        reference: chamber.calibrationTable.sourceReference,
        note: `Revision: ${chamber.calibrationTable.revision}; certified by: ${chamber.calibrationTable.certifiedBy}.`,
      },
      validity: 'Valid only to the extent of the imported certified table metadata and row coverage.',
    },
    warnings: [
      {
        level: 'info',
        message: 'Result uses interpolation from imported table; verify table revision and certification before operational use.',
      },
    ],
  };
}
