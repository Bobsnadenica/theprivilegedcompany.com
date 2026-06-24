import type { Chamber, ChamberCalculation, FormulaEntry, FormulaEvaluation, FormulaSource } from './types';
import { clamp, formatNumber } from './units';
import { calculateFromCalibrationTable } from './calibration';

export const standardsSources: FormulaSource[] = [
  {
    id: 'iso-7507-1',
    kind: 'standard-context',
    title: 'ISO 7507-1:2003',
    reference: 'Petroleum and liquid petroleum products - Calibration of vertical cylindrical tanks - Part 1: Strapping method',
    sourceUrl: 'https://www.iso.org/standard/37004.html',
    note: 'Standards context only. The app does not reproduce paid standard procedures.',
  },
  {
    id: 'iso-12917-1',
    kind: 'standard-context',
    title: 'ISO 12917-1:2017',
    reference: 'Petroleum and liquid petroleum products - Calibration of horizontal cylindrical tanks - Part 1: Manual methods',
    sourceUrl: 'https://www.iso.org/standard/55309.html',
    note: 'Standards context only. Formula-backed mode uses public analytical geometry unless a certified table is imported.',
  },
  {
    id: 'iso-12917-2',
    kind: 'standard-context',
    title: 'ISO 12917-2:2002',
    reference: 'Petroleum and liquid petroleum products - Calibration of horizontal cylindrical tanks - Part 2: Internal EODR method',
    sourceUrl: 'https://www.iso.org/standard/35927.html',
    note: 'Use certified table import for EODR calibration outputs.',
  },
  {
    id: 'iso-4269',
    kind: 'standard-context',
    title: 'ISO 4269:2001',
    reference: 'Tank calibration by liquid measurement - Incremental method using volumetric meters',
    sourceUrl: 'https://www.iso.org/standard/33525.html',
    note: 'Use certified table import for liquid-measurement calibration outputs.',
  },
];

const analyticalGeometrySource: FormulaSource = {
  id: 'open-analytical-geometry',
  kind: 'open-formula',
  title: 'Analytical solid geometry',
  reference: 'Public geometry formula, implemented directly and tested with analytical cases',
  note: 'Formula-traceable calculation. Not a legal metrology certificate by itself.',
};

function safePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function binarySolve(entry: FormulaEntry, dimensions: Record<string, number>, targetVolume: number): number {
  const total = entry.totalVolume(dimensions);
  const maxHeight = entry.maxFillHeight(dimensions);
  if (targetVolume <= 0) return 0;
  if (targetVolume >= total) return maxHeight;

  let low = 0;
  let high = maxHeight;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const volume = entry.volumeAtHeight(dimensions, mid);
    if (volume < targetVolume) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function circleSegmentArea(radius: number, depth: number): number {
  const h = clamp(depth, 0, 2 * radius);
  if (h <= 0) return 0;
  if (h >= 2 * radius) return Math.PI * radius ** 2;
  return radius ** 2 * Math.acos((radius - h) / radius) - (radius - h) * Math.sqrt(2 * radius * h - h ** 2);
}

function integrateSimpson(fn: (x: number) => number, min: number, max: number, slices = 512): number {
  const n = slices % 2 === 0 ? slices : slices + 1;
  const width = (max - min) / n;
  let sum = fn(min) + fn(max);
  for (let i = 1; i < n; i += 1) {
    sum += fn(min + i * width) * (i % 2 === 0 ? 2 : 4);
  }
  return (sum * width) / 3;
}

function tiltedCylinderVolume(dimensions: Record<string, number>, measuredHeight: number): number {
  const radius = safePositive(dimensions.diameter) / 2;
  const length = safePositive(dimensions.length);
  const slopeHeight = Math.max(0, dimensions.slopeHeight ?? 0);
  const gaugeOffset = clamp(dimensions.gaugeOffset ?? length, 0, length);
  if (radius === 0 || length === 0) return 0;
  const lowEndDepth = measuredHeight + (slopeHeight * gaugeOffset) / length;
  return integrateSimpson((x) => circleSegmentArea(radius, lowEndDepth - (slopeHeight * x) / length), 0, length);
}

export const formulaRegistry: FormulaEntry[] = [
  {
    id: 'vertical-cylinder.v1',
    shapeId: 'vertical-cylinder',
    label: 'Vertical cylinder',
    shortLabel: 'Vertical cyl.',
    fillHeightKey: 'height',
    requiredDimensions: [
      { key: 'diameter', label: 'Internal diameter', unit: 'length', min: 0, helper: 'Measured inside diameter.' },
      { key: 'height', label: 'Shell height', unit: 'length', min: 0, helper: 'Maximum measurable liquid height.' },
    ],
    formulaText: 'V(h) = pi x (D / 2)^2 x h',
    source: analyticalGeometrySource,
    validity: 'Valid for right circular vertical cylinders with constant internal diameter.',
    maxFillHeight: (d) => safePositive(d.height),
    totalVolume: (d) => Math.PI * (safePositive(d.diameter) / 2) ** 2 * safePositive(d.height),
    volumeAtHeight: (d, h) => Math.PI * (safePositive(d.diameter) / 2) ** 2 * clamp(h, 0, safePositive(d.height)),
    substitutedText: (d, h) =>
      `V = pi x (${formatNumber(d.diameter)} / 2)^2 x ${formatNumber(clamp(h, 0, d.height))}`,
  },
  {
    id: 'horizontal-cylinder-flat.v1',
    shapeId: 'horizontal-cylinder',
    label: 'Horizontal cylinder with flat ends',
    shortLabel: 'Horizontal cyl.',
    fillHeightKey: 'diameter',
    requiredDimensions: [
      { key: 'diameter', label: 'Internal diameter', unit: 'length', min: 0, helper: 'Vertical inside diameter.' },
      { key: 'length', label: 'Straight length', unit: 'length', min: 0, helper: 'Internal cylindrical length between flat ends.' },
    ],
    formulaText: 'A(h) = R^2 acos((R - h) / R) - (R - h) sqrt(2Rh - h^2); V = A(h) x L',
    source: analyticalGeometrySource,
    validity: 'Valid for level horizontal circular cylinders with flat ends and constant internal radius.',
    maxFillHeight: (d) => safePositive(d.diameter),
    totalVolume: (d) => Math.PI * (safePositive(d.diameter) / 2) ** 2 * safePositive(d.length),
    volumeAtHeight: (d, h) => circleSegmentArea(safePositive(d.diameter) / 2, h) * safePositive(d.length),
    substitutedText: (d, h) => {
      const radius = d.diameter / 2;
      return `R = ${formatNumber(radius)}, h = ${formatNumber(clamp(h, 0, d.diameter))}; V = segment area x ${formatNumber(d.length)}`;
    },
  },
  {
    id: 'tilted-horizontal-cylinder-flat.v1',
    shapeId: 'tilted-horizontal-cylinder',
    label: 'Tilted horizontal cylinder with flat ends',
    shortLabel: 'Tilted horiz.',
    fillHeightKey: 'diameter',
    requiredDimensions: [
      { key: 'diameter', label: 'Internal diameter', unit: 'length', min: 0, helper: 'Vertical inside diameter.' },
      { key: 'length', label: 'Straight length', unit: 'length', min: 0, helper: 'Internal cylindrical barrel length between flat ends.' },
      { key: 'slopeHeight', label: 'Slope height difference', unit: 'length', min: -1, helper: 'Vertical rise from low end to high end.' },
      { key: 'gaugeOffset', label: 'Gauge offset from low end', unit: 'length', min: -1, helper: '0 = low end, L / 2 = center, L = high end.' },
    ],
    formulaText: 'h(x)=h_g+slope*x_g/L-slope*x/L; V=integral Asegment(R,h(x)) dx',
    source: analyticalGeometrySource,
    validity: 'Valid for tilted straight circular cylinders with flat ends; fill height is measured at the configured gauge offset.',
    maxFillHeight: (d) => {
      const length = safePositive(d.length);
      if (length === 0) return 0;
      const gaugeOffset = clamp(d.gaugeOffset ?? length, 0, length);
      const slopeHeight = Math.max(0, d.slopeHeight ?? 0);
      return safePositive(d.diameter) + slopeHeight * (1 - gaugeOffset / length);
    },
    totalVolume: (d) => Math.PI * (safePositive(d.diameter) / 2) ** 2 * safePositive(d.length),
    volumeAtHeight: (d, h) => tiltedCylinderVolume(d, h),
    substitutedText: (d, h) => {
      const length = safePositive(d.length);
      const gaugeOffset = clamp(d.gaugeOffset ?? length, 0, length);
      const slopeHeight = Math.max(0, d.slopeHeight ?? 0);
      const lowEndDepth = h + (slopeHeight * gaugeOffset) / length;
      const highEndDepth = lowEndDepth - slopeHeight;
      return `R = ${formatNumber(d.diameter / 2)}, L = ${formatNumber(length)}, slope = ${formatNumber(slopeHeight)}, gauge = ${formatNumber(gaugeOffset)}, h_low = ${formatNumber(lowEndDepth)}, h_high = ${formatNumber(highEndDepth)}`;
    },
  },
  {
    id: 'horizontal-cylinder-hemispherical-heads.v1',
    shapeId: 'horizontal-cylinder-hemispherical',
    label: 'Horizontal cylinder with hemispherical heads',
    shortLabel: 'Horiz. hemi.',
    fillHeightKey: 'diameter',
    requiredDimensions: [
      { key: 'diameter', label: 'Internal diameter', unit: 'length', min: 0, helper: 'Vertical inside diameter of shell and hemispherical heads.' },
      { key: 'length', label: 'Straight shell length', unit: 'length', min: 0, helper: 'Internal cylindrical barrel length between tangent lines, excluding heads.' },
    ],
    formulaText: 'V(h) = L x Asegment(R,h) + pi x h^2 x (R - h / 3)',
    source: analyticalGeometrySource,
    validity: 'Valid for level horizontal circular cylinders with two identical hemispherical heads.',
    maxFillHeight: (d) => safePositive(d.diameter),
    totalVolume: (d) => {
      const radius = safePositive(d.diameter) / 2;
      return Math.PI * radius ** 2 * safePositive(d.length) + (4 / 3) * Math.PI * radius ** 3;
    },
    volumeAtHeight: (d, h) => {
      const radius = safePositive(d.diameter) / 2;
      const depth = clamp(h, 0, 2 * radius);
      const barrel = circleSegmentArea(radius, depth) * safePositive(d.length);
      const pairedHeads = Math.PI * depth ** 2 * (radius - depth / 3);
      return barrel + pairedHeads;
    },
    substitutedText: (d, h) => {
      const radius = d.diameter / 2;
      const depth = clamp(h, 0, d.diameter);
      return `R = ${formatNumber(radius)}, L = ${formatNumber(d.length)}, h = ${formatNumber(depth)}; V = barrel segment + spherical-cap paired heads`;
    },
  },
  {
    id: 'horizontal-cylinder-ellipsoidal-heads.v1',
    shapeId: 'horizontal-cylinder-ellipsoidal',
    label: 'Horizontal cylinder with ellipsoidal heads',
    shortLabel: 'Horiz. ellip.',
    fillHeightKey: 'diameter',
    requiredDimensions: [
      { key: 'diameter', label: 'Internal diameter', unit: 'length', min: 0, helper: 'Vertical inside diameter of shell and heads.' },
      { key: 'length', label: 'Straight shell length', unit: 'length', min: 0, helper: 'Internal cylindrical barrel length between tangent lines, excluding heads.' },
      { key: 'headDepth', label: 'One head depth', unit: 'length', min: 0, helper: 'Longitudinal depth of one ellipsoidal head. For 2:1 heads use D / 4.' },
    ],
    formulaText: 'V(h) = L x Asegment(R,h) + pi x a x R x (h^2 / R - h^3 / (3R^2))',
    source: analyticalGeometrySource,
    validity: 'Valid for level horizontal circular cylinders with two identical semi-ellipsoidal heads.',
    maxFillHeight: (d) => safePositive(d.diameter),
    totalVolume: (d) => {
      const radius = safePositive(d.diameter) / 2;
      const headDepth = safePositive(d.headDepth);
      return Math.PI * radius ** 2 * safePositive(d.length) + (4 / 3) * Math.PI * headDepth * radius ** 2;
    },
    volumeAtHeight: (d, h) => {
      const radius = safePositive(d.diameter) / 2;
      const headDepth = safePositive(d.headDepth);
      const depth = clamp(h, 0, 2 * radius);
      const barrel = circleSegmentArea(radius, depth) * safePositive(d.length);
      const pairedHeads = Math.PI * headDepth * radius * (depth ** 2 / radius - depth ** 3 / (3 * radius ** 2));
      return barrel + pairedHeads;
    },
    substitutedText: (d, h) => {
      const radius = d.diameter / 2;
      const depth = clamp(h, 0, d.diameter);
      return `R = ${formatNumber(radius)}, L = ${formatNumber(d.length)}, a = ${formatNumber(d.headDepth)}, h = ${formatNumber(depth)}; V = barrel segment + ellipsoid-cap paired heads`;
    },
  },
  {
    id: 'rectangular-prism.v1',
    shapeId: 'rectangular',
    label: 'Rectangular tank / IBC',
    shortLabel: 'Rectangular',
    fillHeightKey: 'height',
    requiredDimensions: [
      { key: 'length', label: 'Internal length', unit: 'length', min: 0, helper: 'Inside length.' },
      { key: 'width', label: 'Internal width', unit: 'length', min: 0, helper: 'Inside width.' },
      { key: 'height', label: 'Internal height', unit: 'length', min: 0, helper: 'Inside height.' },
    ],
    formulaText: 'V(h) = L x W x h',
    source: analyticalGeometrySource,
    validity: 'Valid for rectangular prisms with flat bottom and vertical sides.',
    maxFillHeight: (d) => safePositive(d.height),
    totalVolume: (d) => safePositive(d.length) * safePositive(d.width) * safePositive(d.height),
    volumeAtHeight: (d, h) => safePositive(d.length) * safePositive(d.width) * clamp(h, 0, safePositive(d.height)),
    substitutedText: (d, h) =>
      `V = ${formatNumber(d.length)} x ${formatNumber(d.width)} x ${formatNumber(clamp(h, 0, d.height))}`,
  },
  {
    id: 'sphere-cap.v1',
    shapeId: 'sphere',
    label: 'Sphere',
    shortLabel: 'Sphere',
    fillHeightKey: 'diameter',
    requiredDimensions: [
      { key: 'diameter', label: 'Internal diameter', unit: 'length', min: 0, helper: 'Inside sphere diameter.' },
    ],
    formulaText: 'V(h) = pi x h^2 x (R - h / 3)',
    source: analyticalGeometrySource,
    validity: 'Valid for a full sphere filled from the bottom.',
    maxFillHeight: (d) => safePositive(d.diameter),
    totalVolume: (d) => (4 / 3) * Math.PI * (safePositive(d.diameter) / 2) ** 3,
    volumeAtHeight: (d, h) => {
      const radius = safePositive(d.diameter) / 2;
      const depth = clamp(h, 0, 2 * radius);
      return Math.PI * depth ** 2 * (radius - depth / 3);
    },
    substitutedText: (d, h) =>
      `R = ${formatNumber(d.diameter / 2)}, h = ${formatNumber(clamp(h, 0, d.diameter))}; V = pi x h^2 x (R - h / 3)`,
  },
  {
    id: 'ellipsoid-cap.v1',
    shapeId: 'ellipsoid',
    label: 'Vertical ellipsoid',
    shortLabel: 'Ellipsoid',
    fillHeightKey: 'height',
    requiredDimensions: [
      { key: 'length', label: 'Axis X diameter', unit: 'length', min: 0, helper: 'Horizontal inside diameter along X.' },
      { key: 'width', label: 'Axis Y diameter', unit: 'length', min: 0, helper: 'Horizontal inside diameter along Y.' },
      { key: 'height', label: 'Vertical diameter', unit: 'length', min: 0, helper: 'Vertical inside diameter.' },
    ],
    formulaText: 'V(h) = pi x a x b x (h^2 / c - h^3 / (3c^2))',
    source: analyticalGeometrySource,
    validity: 'Valid for ellipsoids filled along the vertical semi-axis c.',
    maxFillHeight: (d) => safePositive(d.height),
    totalVolume: (d) => (4 / 3) * Math.PI * (safePositive(d.length) / 2) * (safePositive(d.width) / 2) * (safePositive(d.height) / 2),
    volumeAtHeight: (d, h) => {
      const a = safePositive(d.length) / 2;
      const b = safePositive(d.width) / 2;
      const c = safePositive(d.height) / 2;
      const depth = clamp(h, 0, 2 * c);
      return Math.PI * a * b * (depth ** 2 / c - depth ** 3 / (3 * c ** 2));
    },
    substitutedText: (d, h) =>
      `a = ${formatNumber(d.length / 2)}, b = ${formatNumber(d.width / 2)}, c = ${formatNumber(d.height / 2)}, h = ${formatNumber(clamp(h, 0, d.height))}`,
  },
  {
    id: 'cone-apex-down.v1',
    shapeId: 'cone',
    label: 'Vertical cone, apex down',
    shortLabel: 'Cone',
    fillHeightKey: 'height',
    requiredDimensions: [
      { key: 'topDiameter', label: 'Top internal diameter', unit: 'length', min: 0, helper: 'Maximum inside diameter at the top.' },
      { key: 'height', label: 'Cone height', unit: 'length', min: 0, helper: 'Vertical distance from apex to top.' },
    ],
    formulaText: 'V(h) = pi x R^2 x h^3 / (3H^2)',
    source: analyticalGeometrySource,
    validity: 'Valid for right circular cones with apex at bottom and flat top plane.',
    maxFillHeight: (d) => safePositive(d.height),
    totalVolume: (d) => Math.PI * (safePositive(d.topDiameter) / 2) ** 2 * safePositive(d.height) / 3,
    volumeAtHeight: (d, h) => {
      const radius = safePositive(d.topDiameter) / 2;
      const height = safePositive(d.height);
      const depth = clamp(h, 0, height);
      return Math.PI * radius ** 2 * depth ** 3 / (3 * height ** 2);
    },
    substitutedText: (d, h) =>
      `R = ${formatNumber(d.topDiameter / 2)}, H = ${formatNumber(d.height)}, h = ${formatNumber(clamp(h, 0, d.height))}`,
  },
  {
    id: 'frustum-vertical.v1',
    shapeId: 'frustum',
    label: 'Vertical conical frustum',
    shortLabel: 'Frustum',
    fillHeightKey: 'height',
    requiredDimensions: [
      { key: 'bottomDiameter', label: 'Bottom internal diameter', unit: 'length', min: 0, helper: 'Inside diameter at bottom plane.' },
      { key: 'topDiameter', label: 'Top internal diameter', unit: 'length', min: 0, helper: 'Inside diameter at top plane.' },
      { key: 'height', label: 'Frustum height', unit: 'length', min: 0, helper: 'Vertical distance between bottom and top planes.' },
    ],
    formulaText: 'r(h)=r1+(r2-r1)h/H; V(h)=pi h (r1^2 + r1 r(h) + r(h)^2) / 3',
    source: analyticalGeometrySource,
    validity: 'Valid for right circular frustums with linear radius change over height.',
    maxFillHeight: (d) => safePositive(d.height),
    totalVolume: (d) => {
      const r1 = safePositive(d.bottomDiameter) / 2;
      const r2 = safePositive(d.topDiameter) / 2;
      return Math.PI * safePositive(d.height) * (r1 ** 2 + r1 * r2 + r2 ** 2) / 3;
    },
    volumeAtHeight: (d, h) => {
      const r1 = safePositive(d.bottomDiameter) / 2;
      const r2 = safePositive(d.topDiameter) / 2;
      const height = safePositive(d.height);
      const depth = clamp(h, 0, height);
      const rh = r1 + ((r2 - r1) * depth) / height;
      return Math.PI * depth * (r1 ** 2 + r1 * rh + rh ** 2) / 3;
    },
    substitutedText: (d, h) => {
      const depth = clamp(h, 0, d.height);
      const r1 = d.bottomDiameter / 2;
      const r2 = d.topDiameter / 2;
      const rh = r1 + ((r2 - r1) * depth) / d.height;
      return `r1 = ${formatNumber(r1)}, r2 = ${formatNumber(r2)}, r(h) = ${formatNumber(rh)}, h = ${formatNumber(depth)}`;
    },
  },
];

export const formulaByShape = new Map(formulaRegistry.map((entry) => [entry.shapeId, entry]));

export function heightForVolume(entry: FormulaEntry, dimensions: Record<string, number>, volume: number): number {
  return entry.heightForVolume ? entry.heightForVolume(dimensions, volume) : binarySolve(entry, dimensions, volume);
}

export function makeFormulaEvaluation(entry: FormulaEntry, dimensions: Record<string, number>, height: number): FormulaEvaluation {
  return {
    formulaId: entry.id,
    formulaLabel: entry.label,
    formulaText: entry.formulaText,
    substitutedText: entry.substitutedText(dimensions, height),
    source: entry.source,
    validity: entry.validity,
  };
}

export function calculateChamber(chamber: Chamber): ChamberCalculation {
  if (chamber.shapeId === 'calibration-table') {
    return calculateFromCalibrationTable(chamber);
  }

  const entry = formulaByShape.get(chamber.shapeId);
  if (!entry) {
    throw new Error(`No formula registered for shape ${chamber.shapeId}`);
  }

  const missing = entry.requiredDimensions.filter((dimension) => safePositive(chamber.dimensions[dimension.key]) <= dimension.min);
  const totalVolumeM3 = entry.totalVolume(chamber.dimensions);
  const requestedHeight = chamber.useTargetVolume && chamber.targetVolumeM3 !== undefined
    ? heightForVolume(entry, chamber.dimensions, chamber.targetVolumeM3)
    : chamber.fillHeightM;
  const fillHeightM = clamp(requestedHeight, 0, entry.maxFillHeight(chamber.dimensions));
  const volumeM3 = entry.volumeAtHeight(chamber.dimensions, fillHeightM);

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
    formula: makeFormulaEvaluation(entry, chamber.dimensions, fillHeightM),
    warnings: [
      ...(missing.length
        ? [{ level: 'blocker' as const, message: `Missing or invalid dimensions: ${missing.map((d) => d.label).join(', ')}.` }]
        : []),
      {
        level: 'info',
        message: 'Temperature correction is unavailable until a supported source formula or certified table is supplied.',
      },
    ],
  };
}
