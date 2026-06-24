export type LengthUnit = 'm' | 'cm' | 'mm' | 'in' | 'ft';
export type VolumeUnit = 'm3' | 'l' | 'bbl' | 'gal';
export type MassUnit = 'kg' | 't' | 'lb';

const lengthToM: Record<LengthUnit, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  in: 0.0254,
  ft: 0.3048,
};

const volumeToM3: Record<VolumeUnit, number> = {
  m3: 1,
  l: 0.001,
  bbl: 0.158987294928,
  gal: 0.003785411784,
};

const massToKg: Record<MassUnit, number> = {
  kg: 1,
  t: 1000,
  lb: 0.45359237,
};

export const lengthUnitLabels: Record<LengthUnit, string> = {
  m: 'm',
  cm: 'cm',
  mm: 'mm',
  in: 'in',
  ft: 'ft',
};

export const volumeUnitLabels: Record<VolumeUnit, string> = {
  m3: 'm3',
  l: 'L',
  bbl: 'bbl',
  gal: 'US gal',
};

export const massUnitLabels: Record<MassUnit, string> = {
  kg: 'kg',
  t: 't',
  lb: 'lb',
};

export function toMeters(value: number, unit: LengthUnit): number {
  return value * lengthToM[unit];
}

export function fromMeters(value: number, unit: LengthUnit): number {
  return value / lengthToM[unit];
}

export function toCubicMeters(value: number, unit: VolumeUnit): number {
  return value * volumeToM3[unit];
}

export function fromCubicMeters(value: number, unit: VolumeUnit): number {
  return value / volumeToM3[unit];
}

export function fromKg(value: number, unit: MassUnit): number {
  return value / massToKg[unit];
}

export function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 100) return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
