import type { Chamber, ShapeId } from './types';
import type { LengthUnit, MassUnit, VolumeUnit } from './units';

export type WorkspaceLanguage = 'en' | 'bg';

export interface StoredWorkspace {
  version: 1;
  profileName: string;
  chambers: Chamber[];
  selectedChamberId: string;
  language: WorkspaceLanguage;
  lengthUnit: LengthUnit;
  volumeUnit: VolumeUnit;
  massUnit: MassUnit;
}

interface StorageAdapter {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const WORKSPACE_STORAGE_KEY = 'formula-traceable-tank-calculator.workspace.v1';

const shapeIds = new Set<ShapeId>([
  'vertical-cylinder',
  'vertical-cylinder-conical-bottom',
  'horizontal-cylinder',
  'horizontal-elliptical-cylinder',
  'tilted-horizontal-cylinder',
  'horizontal-cylinder-hemispherical',
  'horizontal-cylinder-ellipsoidal',
  'rectangular',
  'sloped-rectangular',
  'sphere',
  'ellipsoid',
  'cone',
  'frustum',
  'calibration-table',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isCalibrationTable(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.points) || value.points.length < 2) return false;
  const metadataKeys = ['id', 'title', 'sourceReference', 'revision', 'certifiedBy', 'checksum', 'importedAtIso'];
  return metadataKeys.every((key) => isString(value[key]))
    && value.points.every((point) => isRecord(point) && isFiniteNumber(point.heightM) && isFiniteNumber(point.volumeM3));
}

function isChamber(value: unknown): value is Chamber {
  if (!isRecord(value) || !isString(value.id) || !isString(value.name)) return false;
  if (!isString(value.shapeId) || !shapeIds.has(value.shapeId as ShapeId)) return false;
  if (!isRecord(value.dimensions) || !Object.values(value.dimensions).every(isFiniteNumber)) return false;
  if (!isRecord(value.liquid)
    || !isString(value.liquid.id)
    || !isString(value.liquid.name)
    || !isString(value.liquid.note)
    || !isFiniteNumber(value.liquid.densityKgM3)) return false;
  if (!isFiniteNumber(value.fillHeightM) || typeof value.useTargetVolume !== 'boolean') return false;
  if (value.targetVolumeM3 !== undefined && !isFiniteNumber(value.targetVolumeM3)) return false;
  return value.calibrationTable === undefined || isCalibrationTable(value.calibrationTable);
}

function browserStorage(): StorageAdapter | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadWorkspaceState(storage: StorageAdapter | undefined = browserStorage()): StoredWorkspace | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(WORKSPACE_STORAGE_KEY);
    if (!text) return null;
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || value.version !== 1 || !isString(value.profileName)) return null;
    if (!Array.isArray(value.chambers) || value.chambers.length === 0 || !value.chambers.every(isChamber)) return null;
    if (!isString(value.selectedChamberId) || !value.chambers.some((chamber) => chamber.id === value.selectedChamberId)) return null;
    if (value.language !== 'en' && value.language !== 'bg') return null;
    if (!['m', 'cm', 'mm', 'in', 'ft'].includes(String(value.lengthUnit))) return null;
    if (!['m3', 'l', 'bbl', 'gal'].includes(String(value.volumeUnit))) return null;
    if (!['kg', 't', 'lb'].includes(String(value.massUnit))) return null;
    return value as unknown as StoredWorkspace;
  } catch {
    return null;
  }
}

export function saveWorkspaceState(
  state: StoredWorkspace,
  storage: StorageAdapter | undefined = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
