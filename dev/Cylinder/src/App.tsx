import {
  AlertTriangle,
  Beaker,
  Calculator,
  Download,
  FileCheck2,
  FlaskConical,
  Layers3,
  Plus,
  Ruler,
  Save,
  ShieldCheck,
  TableProperties,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { checksumText, makeCalibrationTable, parseCalibrationCsv } from './core/calibration';
import { formulaByShape, formulaRegistry } from './core/formulas';
import { customLiquid, liquidPresets } from './core/liquids';
import { calculateReport, makeAuditText } from './core/report';
import type { CalibrationTable, Chamber, ShapeId, TankProfile } from './core/types';
import {
  formatNumber,
  fromCubicMeters,
  fromKg,
  fromMeters,
  lengthUnitLabels,
  massUnitLabels,
  toCubicMeters,
  toMeters,
  volumeUnitLabels,
  type LengthUnit,
  type MassUnit,
  type VolumeUnit,
} from './core/units';
import { loadWorkspaceState, saveWorkspaceState } from './core/workspace';

type Language = 'en' | 'bg';
type MobileSection = 'build' | 'results' | 'evidence' | 'tables';

const ui = {
  en: {
    mode: 'Formula-Traceable Certified Calculation Mode',
    title: 'Tank Volume And Fill Calculator',
    profile: 'Profile',
    savedLocally: 'Workspace auto-saves in this browser.',
    exportReport: 'Export report',
    chambers: 'Chambers',
    add: 'Add',
    remove: 'Remove',
    units: 'Units',
    length: 'Length',
    volume: 'Volume',
    mass: 'Mass',
    language: 'Language',
    buildTab: 'Build',
    resultsTab: 'Results',
    evidenceTab: 'Evidence',
    tablesTab: 'Tables',
    presets: 'Tank Presets',
    preset: 'Preset',
    applyPreset: 'Apply preset',
    observedVolume: 'Observed volume',
    totalCapacity: 'Total capacity',
    fill: 'Fill',
    headspace: 'Headspace',
    statusReady: 'Calculation ready',
    statusReadyDetail: 'No blocking input issues were detected.',
    statusReview: 'Review recommended',
    statusWarnings: 'Warnings to review',
    statusBlocked: 'Calculation blocked',
    statusBlockers: 'Blocking issues',
    builder: 'Chamber Builder',
    chamberName: 'Chamber name',
    shapeBasis: 'Shape basis',
    dimensionsSi: 'Dimensions converted to SI for calculation',
    tableModeActive: 'Certified table mode is active. Geometry fields are locked; volume comes only from imported table rows.',
    fillMode: 'Fill mode',
    knownFillHeight: 'Known fill height',
    solveHeight: 'Solve height from target volume',
    targetVolume: 'Target volume',
    fillHeight: 'Fill height',
    liquidAndMass: 'Liquid And Mass',
    liquidProfile: 'Liquid profile',
    density: 'Density kg/m3',
    tempDisabled: 'Temperature correction is intentionally disabled until a supported formula source or certified table is supplied.',
    fillVisualization: 'Fill Visualization',
    formulaAudit: 'Formula Audit',
    formulaId: 'Formula ID',
    formula: 'Formula',
    substitution: 'Substitution',
    source: 'Source',
    validity: 'Validity',
    selectFormula: 'Select a formula-backed shape or import a certified table.',
    tableImport: 'Certified Table Import',
    tablePreview: 'Table preview',
    tableCoverage: 'Coverage',
    tableChecksum: 'Checksum',
    tablePoints: 'Points',
    noTableRows: 'Paste rows to preview coverage before import.',
    tableTitle: 'Table title',
    sourceReference: 'Source reference',
    revision: 'Revision',
    certifiedBy: 'Certified by',
    csvRows: 'CSV rows: height_m, volume_m3',
    importTable: 'Import table to chamber',
    blockedWithoutTable: 'Blocked Without Table',
    standardsContext: 'Standards Context',
    complexHeadsRequireTable: 'Complex heads require certified table',
    irregularRequireTable: 'Irregular/deformed tanks require certified table',
    illustrativeSchematic: 'Illustrative schematic only; calculation follows the formula or certified table evidence.',
  },
  bg: {
    mode: 'Проследим режим за сертифицирани изчисления',
    title: 'Калкулатор за обем и запълване на резервоари',
    profile: 'Профил',
    savedLocally: 'Работното пространство се запазва автоматично в този браузър.',
    exportReport: 'Експорт на отчет',
    chambers: 'Камери',
    add: 'Добави',
    remove: 'Премахни',
    units: 'Мерни единици',
    length: 'Дължина',
    volume: 'Обем',
    mass: 'Маса',
    language: 'Език',
    buildTab: 'Създаване',
    resultsTab: 'Резултати',
    evidenceTab: 'Доказателства',
    tablesTab: 'Таблици',
    presets: 'Шаблони за резервоар',
    preset: 'Шаблон',
    applyPreset: 'Приложи шаблон',
    observedVolume: 'Изчислен обем',
    totalCapacity: 'Пълен капацитет',
    fill: 'Запълване',
    headspace: 'Свободен обем',
    statusReady: 'Изчислението е готово',
    statusReadyDetail: 'Не са открити блокиращи проблеми във входните данни.',
    statusReview: 'Препоръчва се преглед',
    statusWarnings: 'Предупреждения за преглед',
    statusBlocked: 'Изчислението е блокирано',
    statusBlockers: 'Блокиращи проблеми',
    builder: 'Конструктор на камера',
    chamberName: 'Име на камера',
    shapeBasis: 'Форма / база',
    dimensionsSi: 'Размерите се конвертират към SI за изчисление',
    tableModeActive: 'Активен е режим със сертифицирана таблица. Геометрията е заключена; обемът идва само от редовете в таблицата.',
    fillMode: 'Режим на запълване',
    knownFillHeight: 'Известна височина на течността',
    solveHeight: 'Намери височина от зададен обем',
    targetVolume: 'Зададен обем',
    fillHeight: 'Височина на течността',
    liquidAndMass: 'Течност и маса',
    liquidProfile: 'Профил на течност',
    density: 'Плътност kg/m3',
    tempDisabled: 'Температурна корекция е изключена, докато няма поддържана формула или сертифицирана таблица.',
    fillVisualization: 'Визуализация на запълване',
    formulaAudit: 'Одит на формулата',
    formulaId: 'ID на формула',
    formula: 'Формула',
    substitution: 'Заместени стойности',
    source: 'Източник',
    validity: 'Валидност',
    selectFormula: 'Изберете форма с формула или импортирайте сертифицирана таблица.',
    tableImport: 'Импорт на сертифицирана таблица',
    tablePreview: 'Преглед на таблица',
    tableCoverage: 'Покритие',
    tableChecksum: 'Контролна сума',
    tablePoints: 'Точки',
    noTableRows: 'Поставете редове за преглед на покритието преди импорт.',
    tableTitle: 'Име на таблица',
    sourceReference: 'Референция / сертификат',
    revision: 'Ревизия',
    certifiedBy: 'Сертифицирано от',
    csvRows: 'CSV редове: height_m, volume_m3',
    importTable: 'Импортирай таблица към камерата',
    blockedWithoutTable: 'Блокирано без таблица',
    standardsContext: 'Стандарти',
    complexHeadsRequireTable: 'Сложните дъна изискват сертифицирана таблица',
    irregularRequireTable: 'Неправилни/деформирани резервоари изискват сертифицирана таблица',
    illustrativeSchematic: 'Схемата е само илюстративна; изчислението следва формулата или сертифицираната таблица.',
  },
} satisfies Record<Language, Record<string, string>>;

const shapeLabels: Record<ShapeId, Record<Language, string>> = {
  'vertical-cylinder': { en: 'Vertical cylinder', bg: 'Вертикален цилиндър' },
  'vertical-cylinder-conical-bottom': { en: 'Vertical cylinder, conical bottom', bg: 'Вертикален цилиндър, конусно дъно' },
  'horizontal-cylinder': { en: 'Horizontal cylinder, flat ends', bg: 'Хоризонтален цилиндър, плоски дъна' },
  'horizontal-elliptical-cylinder': { en: 'Horizontal elliptical cylinder', bg: 'Хоризонтален елиптичен цилиндър' },
  'tilted-horizontal-cylinder': { en: 'Tilted horizontal cylinder', bg: 'Хоризонтален наклонен цилиндър' },
  'horizontal-cylinder-hemispherical': { en: 'Horizontal cylinder, hemispherical heads', bg: 'Хоризонтален цилиндър, полусферични дъна' },
  'horizontal-cylinder-ellipsoidal': { en: 'Horizontal cylinder, ellipsoidal heads', bg: 'Хоризонтален цилиндър, елипсоидни дъна' },
  rectangular: { en: 'Rectangular / IBC', bg: 'Правоъгълен / IBC' },
  'sloped-rectangular': { en: 'Sloped-bottom rectangular', bg: 'Правоъгълен със скосено дъно' },
  sphere: { en: 'Sphere', bg: 'Сфера' },
  ellipsoid: { en: 'Ellipsoid', bg: 'Елипсоид' },
  cone: { en: 'Cone, apex down', bg: 'Конус, връх надолу' },
  frustum: { en: 'Conical frustum', bg: 'Конусен пресечен конус' },
  'calibration-table': { en: 'Certified table', bg: 'Сертифицирана таблица' },
};

const dimensionLabels: Record<string, Record<Language, string>> = {
  diameter: { en: 'Internal diameter', bg: 'Вътрешен диаметър' },
  length: { en: 'Length', bg: 'Дължина' },
  width: { en: 'Width', bg: 'Ширина' },
  height: { en: 'Height', bg: 'Височина' },
  cylinderHeight: { en: 'Cylinder shell height', bg: 'Височина на цилиндричната част' },
  coneHeight: { en: 'Cone bottom height', bg: 'Височина на конусното дъно' },
  topDiameter: { en: 'Top internal diameter', bg: 'Горен вътрешен диаметър' },
  bottomDiameter: { en: 'Bottom internal diameter', bg: 'Долен вътрешен диаметър' },
  headDepth: { en: 'One head depth', bg: 'Височина на едно дъно' },
  slopeHeight: { en: 'Slope height difference', bg: 'Височина на наклона' },
  gaugeOffset: { en: 'Gauge offset from low end', bg: 'Позиция на мерене от ниския край' },
};

const dimensionHelpers: Record<string, Record<Language, string>> = {
  diameter: { en: 'Measured inside diameter.', bg: 'Измерен вътрешен диаметър.' },
  length: { en: 'Internal straight length.', bg: 'Вътрешна права дължина.' },
  width: { en: 'Internal width.', bg: 'Вътрешна ширина.' },
  height: { en: 'Maximum measurable liquid height.', bg: 'Максимална измерима височина на течността.' },
  cylinderHeight: { en: 'Straight shell above cone bottom.', bg: 'Права цилиндрична част над конусното дъно.' },
  coneHeight: { en: 'Vertical cone depth from apex to shell.', bg: 'Вертикална дълбочина от върха до цилиндъра.' },
  topDiameter: { en: 'Inside diameter at top plane.', bg: 'Вътрешен диаметър в горната равнина.' },
  bottomDiameter: { en: 'Inside diameter at bottom plane.', bg: 'Вътрешен диаметър в долната равнина.' },
  headDepth: { en: 'For 2:1 ellipsoidal heads use D / 4.', bg: 'За 2:1 елипсоидни дъна използвайте D / 4.' },
  slopeHeight: { en: 'Vertical rise from low end to high end.', bg: 'Вертикална разлика от ниския към високия край.' },
  gaugeOffset: { en: '0 = low end, L / 2 = center, L = high end.', bg: '0 = нисък край, L / 2 = център, L = висок край.' },
};

const defaultDimensions: Record<ShapeId, Record<string, number>> = {
  'vertical-cylinder': { diameter: 2.4, height: 5.8 },
  'vertical-cylinder-conical-bottom': { diameter: 2.4, cylinderHeight: 4.8, coneHeight: 1 },
  'horizontal-cylinder': { diameter: 2.2, length: 8.5 },
  'horizontal-elliptical-cylinder': { width: 2.6, height: 1.8, length: 7 },
  'tilted-horizontal-cylinder': { diameter: 2, length: 4, slopeHeight: 0.16, gaugeOffset: 4 },
  'horizontal-cylinder-hemispherical': { diameter: 2.2, length: 8.5 },
  'horizontal-cylinder-ellipsoidal': { diameter: 2.2, length: 8.5, headDepth: 0.55 },
  rectangular: { length: 4, width: 2.2, height: 2 },
  'sloped-rectangular': { length: 4, width: 2.2, height: 2, slopeHeight: 0.25, gaugeOffset: 4 },
  sphere: { diameter: 3 },
  ellipsoid: { length: 4.5, width: 2.5, height: 2.2 },
  cone: { topDiameter: 3, height: 4 },
  frustum: { bottomDiameter: 1.8, topDiameter: 3.2, height: 4 },
  'calibration-table': {},
};

const unsupportedShapes: Record<Language, string[]> = {
  en: [
    'Torispherical / knuckle heads without licensed formulas',
    'Abnormally deformed or non-circular tanks',
    'Tilt-corrected ISO/BDS workflows without supplied procedure',
    'Floating roof displacement without certified table',
  ],
  bg: [
    'Торисферични / knuckle дъна без лицензирани формули',
    'Деформирани или некръгли резервоари',
    'ISO/BDS корекции за наклон без предоставена процедура',
    'Плаващ покрив без сертифицирана таблица',
  ],
};

interface TankPreset {
  id: string;
  name: Record<Language, string>;
  description: Record<Language, string>;
  shapeId: ShapeId;
  dimensions: Record<string, number>;
  fillHeightM: number;
}

const tankPresets: TankPreset[] = [
  {
    id: 'bg-tilted-demo',
    name: { en: 'Tilted horizontal example', bg: 'Пример: наклонен хоризонтален' },
    description: { en: '4 m x 2 m, 16 cm slope, gauge at high end, 100 cm liquid.', bg: '4 m x 2 m, 16 cm наклон, мерене в горния край, 100 cm течност.' },
    shapeId: 'tilted-horizontal-cylinder',
    dimensions: { diameter: 2, length: 4, slopeHeight: 0.16, gaugeOffset: 4 },
    fillHeightM: 1,
  },
  {
    id: 'ibc-1000',
    name: { en: 'IBC / rectangular tote', bg: 'IBC / правоъгълен контейнер' },
    description: { en: 'Typical 1000 L class rectangular container.', bg: 'Типичен правоъгълен контейнер около 1000 L.' },
    shapeId: 'rectangular',
    dimensions: { length: 1.2, width: 1, height: 1 },
    fillHeightM: 0.83,
  },
  {
    id: 'vertical-10m3',
    name: { en: 'Vertical process tank', bg: 'Вертикален процесен резервоар' },
    description: { en: 'Formula-backed upright cylindrical vessel.', bg: 'Вертикален цилиндър с директна формула.' },
    shapeId: 'vertical-cylinder',
    dimensions: { diameter: 2, height: 3.2 },
    fillHeightM: 1.6,
  },
  {
    id: 'conical-bottom-process',
    name: { en: 'Conical-bottom process tank', bg: 'Процесен резервоар с конусно дъно' },
    description: { en: 'Vertical shell plus centered conical bottom.', bg: 'Вертикална част с центрирано конусно дъно.' },
    shapeId: 'vertical-cylinder-conical-bottom',
    dimensions: { diameter: 2.4, cylinderHeight: 4.8, coneHeight: 1 },
    fillHeightM: 2.4,
  },
  {
    id: 'horizontal-elliptical-20m3',
    name: { en: 'Horizontal elliptical tank', bg: 'Хоризонтален елиптичен резервоар' },
    description: { en: 'Flat-ended elliptical cross-section vessel.', bg: 'Резервоар с елиптично сечение и плоски краища.' },
    shapeId: 'horizontal-elliptical-cylinder',
    dimensions: { width: 2.6, height: 1.8, length: 7 },
    fillHeightM: 0.9,
  },
  {
    id: 'sloped-rectangular-sump',
    name: { en: 'Sloped rectangular sump', bg: 'Правоъгълен съд със скосено дъно' },
    description: { en: 'Planar sloped bottom, gauge at high end.', bg: 'Плоско скосено дъно, мерене в горния край.' },
    shapeId: 'sloped-rectangular',
    dimensions: { length: 4, width: 2.2, height: 2, slopeHeight: 0.25, gaugeOffset: 4 },
    fillHeightM: 0.9,
  },
  {
    id: 'spherical-storage',
    name: { en: 'Spherical vessel', bg: 'Сферичен съд' },
    description: { en: 'Full sphere, bottom-fill formula.', bg: 'Пълна сфера с формула за запълване отдолу.' },
    shapeId: 'sphere',
    dimensions: { diameter: 3 },
    fillHeightM: 1.5,
  },
  {
    id: 'cone-hopper',
    name: { en: 'Cone hopper', bg: 'Конусен бункер' },
    description: { en: 'Vertical cone with apex down.', bg: 'Вертикален конус с връх надолу.' },
    shapeId: 'cone',
    dimensions: { topDiameter: 2, height: 2.8 },
    fillHeightM: 1.4,
  },
];

function makeChamber(index: number, shapeId: ShapeId = 'vertical-cylinder'): Chamber {
  const dimensions = { ...defaultDimensions[shapeId] };
  const formula = shapeId === 'calibration-table' ? undefined : formulaByShape.get(shapeId);
  const maxHeight = formula?.maxFillHeight(dimensions) ?? 0;
  const fillHeightM = Number.isFinite(maxHeight) && maxHeight > 0 ? maxHeight * 0.5 : 0;
  return {
    id: `chamber-${Date.now()}-${index}`,
    name: `Chamber ${index}`,
    shapeId,
    dimensions,
    liquid: liquidPresets[0],
    fillHeightM,
    targetVolumeM3: undefined,
    useTargetVolume: false,
  };
}

function maxFillHeight(chamber: Chamber): number {
  if (chamber.shapeId === 'calibration-table') {
    return chamber.calibrationTable?.points.at(-1)?.heightM ?? 0;
  }
  const value = formulaByShape.get(chamber.shapeId)?.maxFillHeight(chamber.dimensions) ?? 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function shapeTotalVolume(chamber: Chamber): number {
  if (chamber.shapeId === 'calibration-table') {
    return chamber.calibrationTable?.points.at(-1)?.volumeM3 ?? 0;
  }
  const value = formulaByShape.get(chamber.shapeId)?.totalVolume(chamber.dimensions) ?? 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function updateChamber(chambers: Chamber[], chamberId: string, updater: (chamber: Chamber) => Chamber): Chamber[] {
  return chambers.map((chamber) => (chamber.id === chamberId ? updater(chamber) : chamber));
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function schematicFamily(shapeId: ShapeId): string {
  if (shapeId === 'calibration-table') return 'table';
  if (shapeId.includes('horizontal')) return shapeId === 'horizontal-elliptical-cylinder' ? 'horizontal elliptical' : 'horizontal';
  if (shapeId === 'vertical-cylinder-conical-bottom') return 'conical-bottom';
  if (shapeId === 'sloped-rectangular') return 'sloped-box';
  if (shapeId === 'rectangular') return 'box';
  if (shapeId === 'sphere' || shapeId === 'ellipsoid') return 'rounded';
  if (shapeId === 'cone') return 'cone';
  if (shapeId === 'frustum') return 'frustum';
  return 'vertical';
}

function FillSchematic({
  chamber,
  fillPercent,
  language,
  note,
}: {
  chamber: Chamber;
  fillPercent: number;
  language: Language;
  note: string;
}) {
  const pct = Math.max(0, Math.min(100, fillPercent));
  const family = schematicFamily(chamber.shapeId);
  const shapeClass = `tank-visual ${family}`;
  const label = `${shapeLabels[chamber.shapeId][language]} ${formatNumber(pct, 2)}% fill. ${note}`;
  return (
    <div className="visual-wrap" aria-label={label}>
      <div className={shapeClass}>
        <div className="liquid-fill" style={{ height: `${pct}%` }} />
        <div className="centerline" />
      </div>
      <div className="visual-scale">
        <span>100%</span>
        <span>{formatNumber(pct, 2)}%</span>
        <span>0%</span>
      </div>
      <p className="schematic-note">{note}</p>
    </div>
  );
}

export function App() {
  const [initialWorkspace] = useState(loadWorkspaceState);
  const [language, setLanguage] = useState<Language>(initialWorkspace?.language ?? 'en');
  const copy = ui[language];
  const [profileName, setProfileName] = useState(initialWorkspace?.profileName ?? 'Formula traceable tank profile');
  const [chambers, setChambers] = useState<Chamber[]>(() => initialWorkspace?.chambers ?? [makeChamber(1)]);
  const [selectedChamberId, setSelectedChamberId] = useState(initialWorkspace?.selectedChamberId ?? chambers[0].id);
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>(initialWorkspace?.lengthUnit ?? 'm');
  const [volumeUnit, setVolumeUnit] = useState<VolumeUnit>(initialWorkspace?.volumeUnit ?? 'm3');
  const [massUnit, setMassUnit] = useState<MassUnit>(initialWorkspace?.massUnit ?? 'kg');
  const [customDensityKgM3, setCustomDensityKgM3] = useState(900);
  const [tableCsv, setTableCsv] = useState('');
  const [tableTitle, setTableTitle] = useState('Certified tank table');
  const [tableReference, setTableReference] = useState('Certificate / drawing reference');
  const [tableRevision, setTableRevision] = useState('rev-1');
  const [tableCertifier, setTableCertifier] = useState('Authorized calibration body');
  const [tableError, setTableError] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState(tankPresets[0].id);
  const [activeMobileSection, setActiveMobileSection] = useState<MobileSection>('build');

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    saveWorkspaceState({
      version: 1,
      profileName,
      chambers,
      selectedChamberId,
      language,
      lengthUnit,
      volumeUnit,
      massUnit,
    });
  }, [profileName, chambers, selectedChamberId, language, lengthUnit, volumeUnit, massUnit]);

  const selectedChamber = chambers.find((chamber) => chamber.id === selectedChamberId) ?? chambers[0];
  const mobileSections: Array<{ id: MobileSection; label: string }> = [
    { id: 'build', label: copy.buildTab },
    { id: 'results', label: copy.resultsTab },
    { id: 'evidence', label: copy.evidenceTab },
    { id: 'tables', label: copy.tablesTab },
  ];
  const profile: TankProfile = useMemo(
    () => ({ id: 'local-profile', name: profileName, chambers }),
    [profileName, chambers],
  );

  const calculation = useMemo(() => {
    try {
      return { report: calculateReport(profile), error: null as string | null };
    } catch (error) {
      return { report: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [profile]);

  const selectedResult = calculation.report?.chamberResults.find((result) => result.chamberId === selectedChamber.id);
  const currentFormula = selectedChamber.shapeId === 'calibration-table' ? undefined : formulaByShape.get(selectedChamber.shapeId);
  const calculationWarnings = calculation.report?.chamberResults.flatMap((result) => result.warnings) ?? [];
  const blockingIssueCount = calculationWarnings.filter((warning) => warning.level === 'blocker').length;
  const reviewIssueCount = calculationWarnings.filter((warning) => warning.level === 'warning').length;
  const calculationHealth = calculation.error || blockingIssueCount > 0
    ? 'blocker'
    : reviewIssueCount > 0
      ? 'warning'
      : 'ready';
  const calculationHealthTitle = calculationHealth === 'blocker'
    ? copy.statusBlocked
    : calculationHealth === 'warning'
      ? copy.statusReview
      : copy.statusReady;
  const calculationHealthDetail = calculation.error
    ?? (calculationHealth === 'blocker'
      ? `${copy.statusBlockers}: ${blockingIssueCount}`
      : calculationHealth === 'warning'
        ? `${copy.statusWarnings}: ${reviewIssueCount}`
        : copy.statusReadyDetail);
  const tablePreview = useMemo(() => {
    if (!tableCsv.trim()) {
      return { points: [], error: null as string | null, checksum: '', minHeight: 0, maxHeight: 0, minVolume: 0, maxVolume: 0 };
    }
    try {
      const points = parseCalibrationCsv(tableCsv);
      return {
        points,
        error: null as string | null,
        checksum: checksumText(tableCsv),
        minHeight: points[0].heightM,
        maxHeight: points[points.length - 1].heightM,
        minVolume: points[0].volumeM3,
        maxVolume: points[points.length - 1].volumeM3,
      };
    } catch (error) {
      return {
        points: [],
        error: error instanceof Error ? error.message : String(error),
        checksum: '',
        minHeight: 0,
        maxHeight: 0,
        minVolume: 0,
        maxVolume: 0,
      };
    }
  }, [tableCsv]);

  const applyChamber = (updater: (chamber: Chamber) => Chamber) => {
    setChambers((items) => updateChamber(items, selectedChamber.id, updater));
  };

  const setShape = (shapeId: ShapeId) => {
    applyChamber((chamber) => {
      const dimensions = { ...defaultDimensions[shapeId] };
      const formula = shapeId === 'calibration-table' ? undefined : formulaByShape.get(shapeId);
      const maxHeight = formula?.maxFillHeight(dimensions) ?? 0;
      return {
        ...chamber,
        shapeId,
        dimensions,
        fillHeightM: Number.isFinite(maxHeight) && maxHeight > 0 ? maxHeight * 0.5 : 0,
        targetVolumeM3: undefined,
        useTargetVolume: false,
        calibrationTable: undefined,
      };
    });
  };

  const applyPreset = () => {
    const preset = tankPresets.find((item) => item.id === selectedPresetId);
    if (!preset) return;
    applyChamber((chamber) => ({
      ...chamber,
      name: preset.name[language],
      shapeId: preset.shapeId,
      dimensions: { ...preset.dimensions },
      fillHeightM: preset.fillHeightM,
      targetVolumeM3: undefined,
      useTargetVolume: false,
      calibrationTable: undefined,
    }));
  };

  const setImportedTable = (table: CalibrationTable) => {
    applyChamber((chamber) => ({
      ...chamber,
      shapeId: 'calibration-table',
      calibrationTable: table,
      dimensions: {},
      fillHeightM: table.points[Math.floor((table.points.length - 1) / 2)].heightM,
      targetVolumeM3: undefined,
      useTargetVolume: false,
    }));
  };

  const importTable = () => {
    try {
      const table = makeCalibrationTable(tableCsv, {
        title: tableTitle,
        sourceReference: tableReference,
        revision: tableRevision,
        certifiedBy: tableCertifier,
      });
      setImportedTable(table);
      setTableError(null);
    } catch (error) {
      setTableError(error instanceof Error ? error.message : String(error));
    }
  };

  const addChamber = () => {
    const next = makeChamber(chambers.length + 1, selectedChamber.shapeId === 'calibration-table' ? 'vertical-cylinder' : selectedChamber.shapeId);
    setChambers((items) => [...items, next]);
    setSelectedChamberId(next.id);
  };

  const removeSelected = () => {
    if (chambers.length === 1) return;
    const next = chambers.filter((chamber) => chamber.id !== selectedChamber.id);
    setChambers(next);
    setSelectedChamberId(next[0].id);
  };

  const reportText = calculation.report ? makeAuditText(calculation.report, chambers) : '';
  const totalVolumeM3 = shapeTotalVolume(selectedChamber);
  const minimumTargetVolumeM3 = selectedChamber.calibrationTable?.points[0]?.volumeM3 ?? 0;
  const targetVolumeValue = selectedChamber.targetVolumeM3 ?? selectedResult?.volumeM3 ?? minimumTargetVolumeM3;
  const maxHeight = maxFillHeight(selectedChamber);
  const reportFilename = `${profileName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tank'}-calculation-report.txt`;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow"><ShieldCheck size={16} /> {copy.mode}</div>
          <h1>{copy.title}</h1>
          <div className="session-note"><Save size={13} /> {copy.savedLocally}</div>
        </div>
        <div className="topbar-actions">
          <label className="profile-name">
            <span>{copy.profile}</span>
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
          </label>
          <label className="language-switch">
            <span>{copy.language}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
              <option value="en">English</option>
              <option value="bg">Български</option>
            </select>
          </label>
          <button
            className="primary-action"
            type="button"
            disabled={!calculation.report}
            onClick={() => downloadText(reportFilename, reportText)}
          >
            <Download size={16} />
            {copy.exportReport}
          </button>
        </div>
      </header>

      <nav className="mobile-tabs" aria-label="Mobile workspace sections">
        {mobileSections.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-pressed={activeMobileSection === section.id}
            onClick={() => setActiveMobileSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <main className="workspace" data-active-mobile-section={activeMobileSection}>
        <aside className="rail mobile-section" data-mobile-section="build">
          <section className="panel chambers-panel">
            <div className="panel-title">
              <Layers3 size={17} />
              {copy.chambers}
            </div>
            <div className="chamber-list">
              {chambers.map((chamber) => (
                <button
                  type="button"
                  key={chamber.id}
                  className={chamber.id === selectedChamber.id ? 'chamber-row active' : 'chamber-row'}
                  onClick={() => setSelectedChamberId(chamber.id)}
                >
                  <span>{chamber.name}</span>
                  <small>{shapeLabels[chamber.shapeId][language]}</small>
                </button>
              ))}
            </div>
            <div className="button-row">
              <button type="button" onClick={addChamber}>
                <Plus size={15} />
                {copy.add}
              </button>
              <button type="button" disabled={chambers.length === 1} onClick={removeSelected}>
                <Trash2 size={15} />
                {copy.remove}
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <Ruler size={17} />
              {copy.units}
            </div>
            <div className="field-grid two">
              <label>
                <span>{copy.length}</span>
                <select value={lengthUnit} onChange={(event) => setLengthUnit(event.target.value as LengthUnit)}>
                  {Object.keys(lengthUnitLabels).map((unit) => (
                    <option key={unit} value={unit}>{lengthUnitLabels[unit as LengthUnit]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{copy.volume}</span>
                <select value={volumeUnit} onChange={(event) => setVolumeUnit(event.target.value as VolumeUnit)}>
                  {Object.keys(volumeUnitLabels).map((unit) => (
                    <option key={unit} value={unit}>{volumeUnitLabels[unit as VolumeUnit]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{copy.mass}</span>
                <select value={massUnit} onChange={(event) => setMassUnit(event.target.value as MassUnit)}>
                  {Object.keys(massUnitLabels).map((unit) => (
                    <option key={unit} value={unit}>{massUnitLabels[unit as MassUnit]}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <Calculator size={17} />
              {copy.presets}
            </div>
            <div className="field-grid">
              <label>
                <span>{copy.preset}</span>
                <select value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)}>
                  {tankPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name[language]}</option>
                  ))}
                </select>
                <small>{tankPresets.find((preset) => preset.id === selectedPresetId)?.description[language]}</small>
              </label>
              <button type="button" onClick={applyPreset}>
                {copy.applyPreset}
              </button>
            </div>
          </section>

        </aside>

        <section className="main-column">
          <section className="metrics-strip mobile-section" data-mobile-section="results">
            <div className="metric">
              <span>{copy.observedVolume}</span>
              <strong>{calculation.report ? formatNumber(fromCubicMeters(calculation.report.totals.volumeM3, volumeUnit), 4) : 'n/a'}</strong>
              <small>{volumeUnitLabels[volumeUnit]}</small>
            </div>
            <div className="metric">
              <span>{copy.totalCapacity}</span>
              <strong>{calculation.report ? formatNumber(fromCubicMeters(calculation.report.totals.totalVolumeM3, volumeUnit), 4) : 'n/a'}</strong>
              <small>{volumeUnitLabels[volumeUnit]}</small>
            </div>
            <div className="metric">
              <span>{copy.mass}</span>
              <strong>{calculation.report ? formatNumber(fromKg(calculation.report.totals.massKg, massUnit), 3) : 'n/a'}</strong>
              <small>{massUnitLabels[massUnit]}</small>
            </div>
            <div className="metric">
              <span>{copy.fill}</span>
              <strong>{calculation.report ? formatNumber(calculation.report.totals.fillPercent, 2) : 'n/a'}</strong>
              <small>%</small>
            </div>
          </section>

          <div
            className={`notice calculation-health ${calculationHealth === 'ready' ? 'info' : calculationHealth} mobile-section`}
            data-mobile-section="results"
            role={calculationHealth === 'blocker' ? 'alert' : 'status'}
            aria-live={calculationHealth === 'blocker' ? 'assertive' : 'polite'}
          >
            {calculationHealth === 'ready' ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
            <div>
              <strong>{calculationHealthTitle}</strong>
              <span>{calculationHealthDetail}</span>
            </div>
          </div>

          {calculation.error && (
            <div className="notice blocker mobile-section" data-mobile-section="evidence" role="alert" aria-live="assertive">
              <AlertTriangle size={17} />
              {calculation.error}
            </div>
          )}

          <section className="work-grid mobile-section" data-mobile-section="build">
            <section className="panel editor-panel">
              <div className="panel-title">
                <Calculator size={17} />
                {copy.builder}
              </div>

              <div className="field-grid two">
                <label>
                  <span>{copy.chamberName}</span>
                  <input
                    value={selectedChamber.name}
                    onChange={(event) => applyChamber((chamber) => ({ ...chamber, name: event.target.value }))}
                  />
                </label>
                <label>
                  <span>{copy.shapeBasis}</span>
                  <select value={selectedChamber.shapeId} onChange={(event) => setShape(event.target.value as ShapeId)}>
                    {formulaRegistry.map((formula) => (
                      <option key={formula.shapeId} value={formula.shapeId}>{shapeLabels[formula.shapeId][language]}</option>
                    ))}
                    <option value="calibration-table">{shapeLabels['calibration-table'][language]}</option>
                    <option disabled>{copy.complexHeadsRequireTable}</option>
                    <option disabled>{copy.irregularRequireTable}</option>
                  </select>
                </label>
              </div>

              {currentFormula && (
                <div className="dimension-section">
                  <div className="section-caption">{copy.dimensionsSi}</div>
                  <div className="field-grid two">
                    {currentFormula.requiredDimensions.map((dimension) => {
                      const valueM = selectedChamber.dimensions[dimension.key] ?? 0;
                      const invalid = !Number.isFinite(valueM) || (dimension.min < 0 ? valueM < 0 : valueM <= dimension.min);
                      return (
                        <label key={dimension.key}>
                          <span>{dimensionLabels[dimension.key]?.[language] ?? dimension.label} ({lengthUnitLabels[lengthUnit]})</span>
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            aria-invalid={invalid}
                            value={formatNumber(fromMeters(valueM, lengthUnit), 6)}
                            onChange={(event) => {
                              const nextValueM = toMeters(Number(event.target.value), lengthUnit);
                              applyChamber((chamber) => ({
                                ...chamber,
                                dimensions: { ...chamber.dimensions, [dimension.key]: nextValueM },
                              }));
                            }}
                          />
                          <small>{dimensionHelpers[dimension.key]?.[language] ?? dimension.helper}</small>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedChamber.shapeId === 'calibration-table' && (
                <div className="notice" role="status" aria-live="polite">
                  <TableProperties size={17} />
                  {copy.tableModeActive}
                </div>
              )}

              <div className="field-grid two">
                <label>
                  <span>{copy.fillMode}</span>
                  <select
                    value={selectedChamber.useTargetVolume ? 'volume' : 'height'}
                    onChange={(event) => {
                      const solveByVolume = event.target.value === 'volume';
                      applyChamber((chamber) => ({
                        ...chamber,
                        useTargetVolume: solveByVolume,
                        ...(solveByVolume
                          ? { targetVolumeM3: selectedResult?.volumeM3 ?? minimumTargetVolumeM3 }
                          : { fillHeightM: selectedResult?.fillHeightM ?? chamber.fillHeightM }),
                      }));
                    }}
                  >
                    <option value="height">{copy.knownFillHeight}</option>
                    <option value="volume">{copy.solveHeight}</option>
                  </select>
                </label>
                {selectedChamber.useTargetVolume ? (
                  <label>
                    <span>{copy.targetVolume} ({volumeUnitLabels[volumeUnit]})</span>
                    <input
                      type="number"
                      min={fromCubicMeters(minimumTargetVolumeM3, volumeUnit)}
                      max={fromCubicMeters(totalVolumeM3, volumeUnit)}
                      aria-invalid={!Number.isFinite(targetVolumeValue)
                        || targetVolumeValue < minimumTargetVolumeM3
                        || targetVolumeValue > totalVolumeM3}
                      value={formatNumber(fromCubicMeters(targetVolumeValue, volumeUnit), 6)}
                      onChange={(event) => applyChamber((chamber) => ({
                        ...chamber,
                        targetVolumeM3: toCubicMeters(Number(event.target.value), volumeUnit),
                      }))}
                    />
                  </label>
                ) : (
                  <label>
                    <span>{copy.fillHeight} ({lengthUnitLabels[lengthUnit]})</span>
                    <input
                      type="number"
                      min={0}
                      max={fromMeters(maxHeight, lengthUnit)}
                      aria-invalid={!Number.isFinite(selectedChamber.fillHeightM)
                        || selectedChamber.fillHeightM < 0
                        || selectedChamber.fillHeightM > maxHeight}
                      value={formatNumber(fromMeters(selectedChamber.fillHeightM, lengthUnit), 6)}
                      onChange={(event) => applyChamber((chamber) => ({
                        ...chamber,
                        fillHeightM: toMeters(Number(event.target.value), lengthUnit),
                      }))}
                    />
                  </label>
                )}
              </div>

              <div className="range-block">
                <input
                  type="range"
                  aria-label={`${copy.fillHeight} slider`}
                  min={0}
                  max={Math.max(maxHeight, 0.0001)}
                  step={Math.max(maxHeight / 500, 0.0001)}
                  value={selectedChamber.useTargetVolume ? selectedResult?.fillHeightM ?? 0 : selectedChamber.fillHeightM}
                  disabled={selectedChamber.useTargetVolume || maxHeight === 0}
                  onChange={(event) => applyChamber((chamber) => ({ ...chamber, fillHeightM: Number(event.target.value) }))}
                />
                <div className="range-labels">
                  <span>0 {lengthUnitLabels[lengthUnit]}</span>
                  <span>{formatNumber(fromMeters(maxHeight, lengthUnit), 4)} {lengthUnitLabels[lengthUnit]}</span>
                </div>
              </div>
            </section>

            <section className="panel liquid-panel">
              <div className="panel-title">
                <FlaskConical size={17} />
                {copy.liquidAndMass}
              </div>
              <div className="field-grid">
                <label>
                  <span>{copy.liquidProfile}</span>
                  <select
                    value={selectedChamber.liquid.id}
                    onChange={(event) => {
                      const liquid = event.target.value === 'custom'
                        ? customLiquid(customDensityKgM3)
                        : liquidPresets.find((item) => item.id === event.target.value) ?? liquidPresets[0];
                      applyChamber((chamber) => ({ ...chamber, liquid }));
                    }}
                  >
                    {liquidPresets.map((liquid) => (
                      <option key={liquid.id} value={liquid.id}>{liquid.name}</option>
                    ))}
                    <option value="custom">Custom density</option>
                  </select>
                </label>
                <label>
                  <span>{copy.density}</span>
                  <input
                    type="number"
                    min={0}
                    aria-invalid={!Number.isFinite(selectedChamber.liquid.densityKgM3) || selectedChamber.liquid.densityKgM3 <= 0}
                    value={selectedChamber.liquid.densityKgM3}
                    onChange={(event) => {
                      const density = Number(event.target.value);
                      setCustomDensityKgM3(density);
                      applyChamber((chamber) => ({ ...chamber, liquid: customLiquid(density) }));
                    }}
                  />
                </label>
              </div>
              <div className="source-note">
                <Beaker size={16} />
                {selectedChamber.liquid.note}
              </div>
              <div className="notice warning" role="status" aria-live="polite">
                <AlertTriangle size={17} />
                {copy.tempDisabled}
              </div>
            </section>
          </section>

          <section className="work-grid lower">
            <section className="panel visual-panel mobile-section" data-mobile-section="results">
              <div className="panel-title">
                <Ruler size={17} />
                {copy.fillVisualization}
              </div>
              <FillSchematic
                chamber={selectedChamber}
                fillPercent={selectedResult?.fillPercent ?? 0}
                language={language}
                note={copy.illustrativeSchematic}
              />
              <div className="result-table">
                <div><span>{copy.fillHeight}</span><strong>{selectedResult ? formatNumber(fromMeters(selectedResult.fillHeightM, lengthUnit), 5) : 'n/a'} {lengthUnitLabels[lengthUnit]}</strong></div>
                <div><span>{copy.observedVolume}</span><strong>{selectedResult ? formatNumber(fromCubicMeters(selectedResult.volumeM3, volumeUnit), 5) : 'n/a'} {volumeUnitLabels[volumeUnit]}</strong></div>
                <div><span>{copy.headspace}</span><strong>{selectedResult ? formatNumber(fromCubicMeters(selectedResult.headspaceM3, volumeUnit), 5) : 'n/a'} {volumeUnitLabels[volumeUnit]}</strong></div>
                <div><span>{copy.mass}</span><strong>{selectedResult ? formatNumber(fromKg(selectedResult.massKg, massUnit), 5) : 'n/a'} {massUnitLabels[massUnit]}</strong></div>
              </div>
            </section>

            <section className="panel audit-panel mobile-section" data-mobile-section="evidence">
              <div className="panel-title">
                <ShieldCheck size={17} />
                {copy.formulaAudit}
              </div>
              {selectedResult ? (
                <>
                  <div className="audit-kv">
                    <span>{copy.formulaId}</span>
                    <strong>{selectedResult.formula.formulaId}</strong>
                    <span>{copy.formula}</span>
                    <strong>{selectedResult.formula.formulaText}</strong>
                    <span>{copy.substitution}</span>
                    <strong>{selectedResult.formula.substitutedText}</strong>
                    <span>{copy.source}</span>
                    <strong>{selectedResult.formula.source.title}</strong>
                    <span>{copy.validity}</span>
                    <strong>{selectedResult.formula.validity}</strong>
                  </div>
                  <div className="warnings-list">
                    {selectedResult.warnings.map((warning) => (
                      <div
                        key={`${warning.code ?? warning.level}-${warning.message}`}
                        className={`notice ${warning.level}`}
                        role={warning.level === 'blocker' ? 'alert' : 'status'}
                        aria-live={warning.level === 'blocker' ? 'assertive' : 'polite'}
                      >
                        <AlertTriangle size={16} />
                        {warning.message}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="notice blocker" role="alert" aria-live="assertive">
                  <AlertTriangle size={17} />
                  {copy.selectFormula}
                </div>
              )}
            </section>
          </section>
        </section>

        <aside className="rightbar">
          <section className="panel table-panel mobile-section" data-mobile-section="tables">
            <div className="panel-title">
              <TableProperties size={17} />
              {copy.tableImport}
            </div>
            <div className="field-grid">
              <label>
                <span>{copy.tableTitle}</span>
                <input value={tableTitle} onChange={(event) => setTableTitle(event.target.value)} />
              </label>
              <label>
                <span>{copy.sourceReference}</span>
                <input value={tableReference} onChange={(event) => setTableReference(event.target.value)} />
              </label>
              <div className="field-grid two">
                <label>
                  <span>{copy.revision}</span>
                  <input value={tableRevision} onChange={(event) => setTableRevision(event.target.value)} />
                </label>
                <label>
                  <span>{copy.certifiedBy}</span>
                  <input value={tableCertifier} onChange={(event) => setTableCertifier(event.target.value)} />
                </label>
              </div>
              <label>
                <span>{copy.csvRows}</span>
                <textarea
                  value={tableCsv}
                  onChange={(event) => {
                    setTableCsv(event.target.value);
                    setTableError(null);
                  }}
                  placeholder={'height_m,volume_m3\n0,0\n0.5,1.74\n1.0,4.92'}
                />
              </label>
            </div>
            <div className="table-preview" aria-live="polite">
              <div className="section-caption">{copy.tablePreview}</div>
              {!tableCsv.trim() && <p>{copy.noTableRows}</p>}
              {tablePreview.error && (
                <div className="notice blocker" role="alert" aria-live="assertive">
                  <AlertTriangle size={17} />
                  {tablePreview.error}
                </div>
              )}
              {!tablePreview.error && tablePreview.points.length > 0 && (
                <>
                  <div className="preview-metrics">
                    <div>
                      <span>{copy.tablePoints}</span>
                      <strong>{tablePreview.points.length}</strong>
                    </div>
                    <div>
                      <span>{copy.tableCoverage}</span>
                      <strong>
                        {formatNumber(tablePreview.minHeight)}-{formatNumber(tablePreview.maxHeight)} m / {formatNumber(tablePreview.minVolume)}-{formatNumber(tablePreview.maxVolume)} m3
                      </strong>
                    </div>
                  </div>
                  <div className="checksum-line">
                    <span>{copy.tableChecksum}</span>
                    <strong>{tablePreview.checksum}</strong>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>height_m</th>
                        <th>volume_m3</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tablePreview.points.slice(0, 5).map((point) => (
                        <tr key={`${point.heightM}-${point.volumeM3}`}>
                          <td>{formatNumber(point.heightM, 6)}</td>
                          <td>{formatNumber(point.volumeM3, 6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <button
              type="button"
              className="primary-action wide"
              disabled={!tableCsv.trim() || !!tablePreview.error}
              onClick={importTable}
            >
              <TableProperties size={16} />
              {copy.importTable}
            </button>
            {tableError && (
              <div className="notice blocker" role="alert" aria-live="assertive">
                <AlertTriangle size={17} />
                {tableError}
              </div>
            )}
            {selectedChamber.calibrationTable && (
              <div className="table-meta">
                <strong>{selectedChamber.calibrationTable.title}</strong>
                <span>{selectedChamber.calibrationTable.sourceReference}</span>
                <span>{selectedChamber.calibrationTable.checksum}</span>
                <span>
                  {selectedChamber.calibrationTable.points.length} points,
                  {' '}
                  {formatNumber(selectedChamber.calibrationTable.points[0].heightM)}-
                  {formatNumber(selectedChamber.calibrationTable.points.at(-1)?.heightM ?? 0)} m
                </span>
              </div>
            )}
          </section>

          <section className="panel blocked-panel mobile-section" data-mobile-section="evidence">
            <div className="panel-title">
              <AlertTriangle size={17} />
              {copy.blockedWithoutTable}
            </div>
            <ul>
              {unsupportedShapes[language].map((shape) => (
                <li key={shape}>{shape}</li>
              ))}
            </ul>
          </section>

          <section className="panel standards-panel mobile-section" data-mobile-section="evidence">
            <div className="panel-title">
              <FileCheck2 size={17} />
              {copy.standardsContext}
            </div>
            <div className="standard-list">
              {calculation.report?.standardsContext.map((source) => (
                <a key={source.id} href={source.sourceUrl} target="_blank" rel="noreferrer">
                  <strong>{source.title}</strong>
                  <span>{source.reference}</span>
                </a>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
