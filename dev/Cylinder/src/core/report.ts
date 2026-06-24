import type { CalculationReport, Chamber, TankProfile } from './types';
import { calculateChamber, standardsSources } from './formulas';
import { formatNumber } from './units';

export function calculateReport(profile: TankProfile): CalculationReport {
  const chamberResults = profile.chambers.map(calculateChamber);
  const volumeM3 = chamberResults.reduce((sum, result) => sum + result.volumeM3, 0);
  const totalVolumeM3 = chamberResults.reduce((sum, result) => sum + result.totalVolumeM3, 0);
  const massKg = chamberResults.reduce((sum, result) => sum + result.massKg, 0);
  const headspaceM3 = Math.max(0, totalVolumeM3 - volumeM3);

  return {
    profileName: profile.name,
    generatedAtIso: new Date().toISOString(),
    chamberResults,
    totals: {
      volumeM3,
      totalVolumeM3,
      headspaceM3,
      massKg,
      fillPercent: totalVolumeM3 > 0 ? (volumeM3 / totalVolumeM3) * 100 : 0,
    },
    standardsContext: standardsSources,
  };
}

export function makeAuditText(report: CalculationReport, chambers: Chamber[]): string {
  const lines = [
    `Formula-Traceable Tank Calculation Report`,
    `Profile: ${report.profileName}`,
    `Generated: ${report.generatedAtIso}`,
    ``,
    `Totals`,
    `Observed volume: ${formatNumber(report.totals.volumeM3, 6)} m3`,
    `Total capacity: ${formatNumber(report.totals.totalVolumeM3, 6)} m3`,
    `Headspace: ${formatNumber(report.totals.headspaceM3, 6)} m3`,
    `Mass: ${formatNumber(report.totals.massKg, 3)} kg`,
    `Fill: ${formatNumber(report.totals.fillPercent, 3)} %`,
    ``,
    `Standards Context`,
    ...report.standardsContext.map((source) => `- ${source.title}: ${source.reference} (${source.sourceUrl ?? 'source retained locally'})`),
    ``,
    `Chambers`,
  ];

  report.chamberResults.forEach((result) => {
    const chamber = chambers.find((item) => item.id === result.chamberId);
    lines.push(
      ``,
      `[${result.chamberName}]`,
      `Shape: ${result.shapeId}`,
      `Liquid: ${chamber?.liquid.name ?? 'unknown'} (${formatNumber(chamber?.liquid.densityKgM3 ?? 0, 3)} kg/m3)`,
      `Fill height: ${formatNumber(result.fillHeightM, 6)} m`,
      `Observed volume: ${formatNumber(result.volumeM3, 6)} m3`,
      `Total volume: ${formatNumber(result.totalVolumeM3, 6)} m3`,
      `Mass: ${formatNumber(result.massKg, 3)} kg`,
      `Formula: ${result.formula.formulaId}`,
      `Formula label: ${result.formula.formulaLabel}`,
      `Formula text: ${result.formula.formulaText}`,
      `Substitution: ${result.formula.substitutedText}`,
      `Source: ${result.formula.source.title} - ${result.formula.source.reference}`,
      `Validity: ${result.formula.validity}`,
      ...result.warnings.map((warning) => `Warning [${warning.level}${warning.code ? `:${warning.code}` : ''}]: ${warning.message}`),
    );
  });

  lines.push(
    ``,
    `Certification Boundary`,
    `This report is formula-traceable. It is not a legal metrology certificate unless reviewed, validated, and paired with the required certified calibration artifacts.`,
  );

  return lines.join('\n');
}
