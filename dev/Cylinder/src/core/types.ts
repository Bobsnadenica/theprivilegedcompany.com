export type ShapeId =
  | 'vertical-cylinder'
  | 'horizontal-cylinder'
  | 'tilted-horizontal-cylinder'
  | 'horizontal-cylinder-hemispherical'
  | 'horizontal-cylinder-ellipsoidal'
  | 'rectangular'
  | 'sphere'
  | 'ellipsoid'
  | 'cone'
  | 'frustum'
  | 'calibration-table';

export type FormulaKind = 'open-formula' | 'standard-context' | 'imported-table';

export interface FormulaSource {
  id: string;
  kind: FormulaKind;
  title: string;
  reference: string;
  sourceUrl?: string;
  note: string;
}

export interface FormulaDimension {
  key: string;
  label: string;
  unit: 'length';
  min: number;
  helper: string;
}

export interface FormulaEvaluation {
  formulaId: string;
  formulaLabel: string;
  formulaText: string;
  substitutedText: string;
  source: FormulaSource;
  validity: string;
}

export interface FormulaEntry {
  id: string;
  shapeId: Exclude<ShapeId, 'calibration-table'>;
  label: string;
  shortLabel: string;
  requiredDimensions: FormulaDimension[];
  fillHeightKey: string;
  formulaText: string;
  source: FormulaSource;
  validity: string;
  maxFillHeight: (dimensions: Record<string, number>) => number;
  totalVolume: (dimensions: Record<string, number>) => number;
  volumeAtHeight: (dimensions: Record<string, number>, height: number) => number;
  substitutedText: (dimensions: Record<string, number>, height: number) => string;
  heightForVolume?: (dimensions: Record<string, number>, volume: number) => number;
}

export interface CalibrationPoint {
  heightM: number;
  volumeM3: number;
}

export interface CalibrationTable {
  id: string;
  title: string;
  sourceReference: string;
  revision: string;
  certifiedBy: string;
  checksum: string;
  importedAtIso: string;
  points: CalibrationPoint[];
}

export interface LiquidProfile {
  id: string;
  name: string;
  densityKgM3: number;
  note: string;
}

export interface Chamber {
  id: string;
  name: string;
  shapeId: ShapeId;
  dimensions: Record<string, number>;
  liquid: LiquidProfile;
  fillHeightM: number;
  targetVolumeM3?: number;
  useTargetVolume: boolean;
  calibrationTable?: CalibrationTable;
}

export interface TankProfile {
  id: string;
  name: string;
  chambers: Chamber[];
}

export interface CalculationWarning {
  level: 'info' | 'warning' | 'blocker';
  message: string;
}

export interface ChamberCalculation {
  chamberId: string;
  chamberName: string;
  shapeId: ShapeId;
  fillHeightM: number;
  totalVolumeM3: number;
  volumeM3: number;
  headspaceM3: number;
  fillPercent: number;
  massKg: number;
  formula: FormulaEvaluation;
  warnings: CalculationWarning[];
}

export interface CalculationReport {
  profileName: string;
  generatedAtIso: string;
  chamberResults: ChamberCalculation[];
  totals: {
    volumeM3: number;
    totalVolumeM3: number;
    headspaceM3: number;
    massKg: number;
    fillPercent: number;
  };
  standardsContext: FormulaSource[];
}
