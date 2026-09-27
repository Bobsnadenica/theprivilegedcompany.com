export type TrendPoint = { year: string; value: number; status?: string };

export function periodChange(first: number, last: number, unit: string) {
  if (unit === "%") return first === 0 ? null : (last - first) / Math.abs(first) * 100;
  return last - first;
}

export function chartScale(rows: TrendPoint[], includeZero: boolean) {
  const values = rows.map(row => row.value);
  const low = Math.min(...values, ...(includeZero ? [0] : []));
  const high = Math.max(...values, ...(includeZero ? [0] : []));
  const padding = (high - low || Math.abs(high) || 1) * .12;
  const min = includeZero && low === 0 ? 0 : low - padding;
  const max = includeZero && high === 0 && low < 0 ? 0 : high + padding;
  const firstYear = Number(rows[0].year);
  const lastYear = Number(rows.at(-1)!.year);
  const points = rows.map(row => ({ ...row,
    x: firstYear === lastYear ? 348 : 88 + (Number(row.year) - firstYear) / (lastYear - firstYear) * 520,
    y: 222 - (row.value - min) / (max - min) * 190,
  }));
  const path = points.map((point, index) => `${index && Number(point.year) === Number(points[index - 1].year) + 1 ? "L" : "M"}${point.x},${point.y}`).join(" ");
  return { min, max, points, path, ticks: Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4) };
}
