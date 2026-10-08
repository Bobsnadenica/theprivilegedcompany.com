import { useState } from "react";
import { chartScale, periodChange } from "./statistics";
import type { TrendPoint } from "./statistics";

export type Indicator = {
  indicator: string; title: string; unit: string; source_url: string; api_url: string;
  metadata_url: string; source_last_updated: string | null; publisher: string; note: string;
  change_unit: string; raw_path: string; metadata_path: string; csv_path: string; data: TrendPoint[];
};

export function formatIndicator(key: string, value: number) {
  const n = (number: number, digits = 1) => number.toLocaleString("bg-BG", { maximumFractionDigits: digits });
  if (key === "gdp") return `${n(value / 1e9)} млрд. щ.д.`;
  if (key === "population") return `${n(value / 1e6, 2)} млн.`;
  if (key === "life") return `${n(value)} години`;
  return `${n(value)}%`;
}

export default function TrendChart({ indicatorKey, series, retrievedAt }: { indicatorKey: string; series: Indicator; retrievedAt: string }) {
  const [from, setFrom] = useState(series.data[0].year);
  const [to, setTo] = useState(series.data.at(-1)!.year);
  const [selectedYear, setSelectedYear] = useState(to);
  const [includeZero, setIncludeZero] = useState(false);
  const rows = series.data.filter(row => row.year >= from && row.year <= to);
  const first = rows[0], last = rows.at(-1)!;
  const selected = rows.find(row => row.year === selectedYear) ?? last;
  const selectedIndex = rows.indexOf(selected);
  const scale = chartScale(rows, includeZero);
  const delta = periodChange(first.value, last.value, series.change_unit);
  const y = (value: number) => 222 - (value - scale.min) / (scale.max - scale.min) * 190;
  const divisor = indicatorKey === "gdp" ? 1e9 : indicatorKey === "population" ? 1e6 : 1;
  const axis = (value: number) => (value / divisor).toLocaleString("bg-BG", { maximumFractionDigits: 1 });
  const axisUnit = indicatorKey === "gdp" ? "млрд. щ.д." : indicatorKey === "population" ? "млн. души" : indicatorKey === "life" ? "години" : "%";
  const stamp = new Date(retrievedAt).toLocaleDateString("bg-BG", { timeZone: "UTC" });
  const base = import.meta.env.BASE_URL;

  return <figure className="trend-chart" id={`stat-${indicatorKey}`}>
    <figcaption>
      <div><span className="eyebrow">{first.year}–{last.year}</span><h2>{series.title}</h2><p>{series.unit}{indicatorKey === "population" ? " · оценка към средата на годината" : ""}</p></div>
      <div className="trend-summary"><strong>{formatIndicator(indicatorKey, selected.value)}</strong><span>{selected.year} г.</span></div>
    </figcaption>
    <svg className="stat-plot" viewBox="0 0 640 265" role="img" aria-label={`${series.title}: ${first.year}–${last.year}. Точните стойности са в таблицата под графиката.`}>
      <text x="88" y="17" className="stat-axis-unit">{axisUnit}</text>
      {scale.ticks.map((tick, index) => <g key={index}><line x1="88" x2="608" y1={y(tick)} y2={y(tick)} className="stat-gridline" /><text x="76" y={y(tick) + 5} textAnchor="end">{axis(tick)}</text></g>)}
      {scale.min < 0 && scale.max > 0 && <line x1="88" x2="608" y1={y(0)} y2={y(0)} className="stat-zero" />}
      <path d={scale.path} fill="none" className="stat-line" />
      {scale.points.map(point => <circle key={point.year} cx={point.x} cy={point.y} r={point.year === selected.year ? 7 : 3.5} className={point.year === selected.year ? "stat-point selected" : "stat-point"}><title>{point.year}: {point.value.toLocaleString("bg-BG", { maximumFractionDigits: 8 })} {series.unit}</title></circle>)}
      {[...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])].map(index => <text key={index} x={scale.points[index].x} y="252" textAnchor="middle">{rows[index].year}</text>)}
    </svg>
    <div className="stat-scrubber">
      <label htmlFor={`year-${indicatorKey}`}>Изберете година <strong>{selected.year}</strong></label>
      <input id={`year-${indicatorKey}`} type="range" aria-label={`Изберете година — ${series.title}`} min="0" max={rows.length - 1} value={selectedIndex} disabled={rows.length === 1} onChange={e => setSelectedYear(rows[Number(e.target.value)].year)} aria-valuetext={`${selected.year}: ${formatIndicator(indicatorKey, selected.value)}`} />
    </div>
    <div className="chart-links"><a href={series.source_url} target="_blank" rel="noreferrer">Световна банка ↗</a><a href={`${base}data/${series.csv_path}`} download>CSV ↓</a></div>
    <details className="stat-details">
      <summary>Стойности и подробности</summary>
      <div className="stat-detail-content">
        <div className="stat-controls">
          <div className="year-range" aria-label={`Период за ${series.title}`}>
            <label>От<select aria-label={`От година — ${series.title}`} value={from} onChange={e => setFrom(e.target.value)}>{series.data.filter(row => row.year <= to).map(row => <option key={row.year}>{row.year}</option>)}</select></label>
            <label>До<select aria-label={`До година — ${series.title}`} value={to} onChange={e => setTo(e.target.value)}>{series.data.filter(row => row.year >= from).map(row => <option key={row.year}>{row.year}</option>)}</select></label>
          </div>
          <label className="zero-control"><input type="checkbox" checked={includeZero} onChange={e => setIncludeZero(e.target.checked)} />Включи нулата в скалата</label>
        </div>
        <p className="stat-context">{series.note}</p>
        <p className="stat-change">{rows.length === 1 ? "Избрана е една година." : delta === null ? "Промяна: няма база за сравнение." : `${delta > 0 ? "+" : ""}${delta.toLocaleString("bg-BG", { maximumFractionDigits: 1 })} ${series.change_unit} между ${first.year} и ${last.year}.`}</p>
        <p className="stat-scale-note">{includeZero ? "Скалата включва нулата." : "Скалата следва диапазона на стойностите."}{series.change_unit === "п.п." ? " п.п. = процентни пункта." : ""}</p>
        <div className="table-scroll"><table><caption>{series.title} · {series.unit}. До 8 знака след запетаята; CSV пази оригиналната точност за всички години.</caption><thead><tr><th scope="col">Година</th><th scope="col">Стойност</th><th scope="col">Бележка</th></tr></thead><tbody>{rows.map(row => <tr key={row.year}><th scope="row">{row.year}</th><td>{row.value.toLocaleString("bg-BG", { maximumFractionDigits: 8 })}</td><td>{row.status === "F" ? "Прогноза в източника" : row.status || "—"}</td></tr>)}</tbody></table></div>
        <div className="source-links"><a href={series.api_url} target="_blank" rel="noreferrer">API ↗</a><a href={`${base}data/${series.raw_path}`}>Оригинален отговор (JSON)</a><a href={`${base}data/${series.metadata_path}`}>Определение и произход</a></div>
        <p className="source-date">Изтеглено: {stamp}. Годината на всяко наблюдение е в таблицата.</p>
      </div>
    </details>
  </figure>;
}
