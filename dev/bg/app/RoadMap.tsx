import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";

type RoadEvent = [
  lon: number,
  lat: number,
  year: number,
  fatalities: number,
  injured: number,
  severe: number,
  regionIndex: number,
  crashTypeIndex: number,
  date: string,
];

type RoadData = {
  generated_at: string;
  title: string;
  source: {
    publisher: string;
    dataset_title: string;
    dataset_url: string;
  };
  boundary: {
    source: string;
    source_url: string;
    license: string;
    bounds: [number, number, number, number];
    polygons: [number, number][][];
  };
  dictionaries: {
    regions: string[];
    crash_types: string[];
  };
  summary: {
    total_rows: number;
    mapped_rows: number;
    unmapped_rows: number;
    missing_coordinates: number;
    outside_bulgaria_bounds: number;
    years: { year: number; events: number }[];
    date_from: string;
    date_to: string;
    fatalities: number;
    injured: number;
    severe_crashes: number;
  };
  events: RoadEvent[];
};

type Severity = "all" | "severe" | "fatal";
type ChartRow = { label: string; value: number };

const baseUrl = import.meta.env.BASE_URL;
const number = new Intl.NumberFormat("bg-BG");
const shortDate = new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function formatRoadDate(value: string) {
  if (!value) return "неуказана дата";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "неуказана дата" : shortDate.format(parsed);
}

function filterEvent(event: RoadEvent, year: number | "all", severity: Severity) {
  if (year !== "all" && event[2] !== year) return false;
  if (severity === "severe" && event[5] !== 1) return false;
  if (severity === "fatal" && event[3] === 0) return false;
  return true;
}

function projection(bounds: [number, number, number, number], width: number, height: number) {
  const [minLon, minLat, maxLon, maxLat] = bounds;
  const padding = Math.max(24, Math.min(width, height) * 0.07);
  const scale = Math.min((width - padding * 2) / (maxLon - minLon), (height - padding * 2) / (maxLat - minLat));
  const drawingWidth = (maxLon - minLon) * scale;
  const drawingHeight = (maxLat - minLat) * scale;
  const left = (width - drawingWidth) / 2;
  const top = (height - drawingHeight) / 2;
  return (lon: number, lat: number): [number, number] => [left + (lon - minLon) * scale, top + (maxLat - lat) * scale];
}

function Ranking({ eyebrow, title, rows }: { eyebrow: string; title: string; rows: ChartRow[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <figure className="road-ranking">
      <figcaption>
        <span className="eyebrow">{eyebrow}</span>
        <h4>{title}</h4>
      </figcaption>
      <ol>
        {rows.map((row) => (
          <li key={row.label}>
            <span title={row.label}>{row.label}</span>
            <i><b style={{ width: `${(row.value / max) * 100}%` }} /></i>
            <strong>{number.format(row.value)}</strong>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export default function RoadMap() {
  const [data, setData] = useState<RoadData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [year, setYear] = useState<number | "all">("all");
  const [severity, setSeverity] = useState<Severity>("all");
  const [size, setSize] = useState({ width: 1000, height: 490 });
  const [selected, setSelected] = useState<RoadEvent | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${baseUrl}data/road-visuals.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<RoadData>;
      })
      .then((value) => {
        setData(value);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setLoadState("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(300, Math.round(entry.contentRect.width));
      setSize({ width, height: Math.max(350, Math.min(560, Math.round(width * 0.52))) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const filtered = useMemo(
    () => data?.events.filter((event) => filterEvent(event, year, severity)) ?? [],
    [data, severity, year],
  );

  const analysis = useMemo(() => {
    if (!data) return null;
    const regions = new Map<number, number>();
    const types = new Map<number, number>();
    let fatalities = 0;
    let injured = 0;
    let severeCrashes = 0;
    for (const event of filtered) {
      fatalities += event[3];
      injured += event[4];
      severeCrashes += event[5];
      regions.set(event[6], (regions.get(event[6]) ?? 0) + 1);
      types.set(event[7], (types.get(event[7]) ?? 0) + 1);
    }
    const regionRows = [...regions.entries()]
      .map(([index, value]) => ({ label: data.dictionaries.regions[index], value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
    const typeRows = [...types.entries()]
      .map(([index, value]) => ({ label: data.dictionaries.crash_types[index], value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
    return { fatalities, injured, severeCrashes, regionRows, typeRows };
  }, [data, filtered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    const project = projection(data.boundary.bounds, size.width, size.height);

    context.strokeStyle = "rgba(17, 37, 30, .08)";
    context.lineWidth = 1;
    for (let lon = Math.ceil(data.boundary.bounds[0]); lon <= data.boundary.bounds[2]; lon += 1) {
      const [x] = project(lon, data.boundary.bounds[1]);
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, size.height);
      context.stroke();
    }
    for (let lat = Math.ceil(data.boundary.bounds[1]); lat <= data.boundary.bounds[3]; lat += 1) {
      const [, y] = project(data.boundary.bounds[0], lat);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size.width, y);
      context.stroke();
    }

    context.fillStyle = "#e5eee8";
    context.strokeStyle = "#17382b";
    context.lineWidth = 1.4;
    for (const ring of data.boundary.polygons) {
      context.beginPath();
      ring.forEach(([lon, lat], index) => {
        const [x, y] = project(lon, lat);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fill();
      context.stroke();
    }

    const layers = [
      { test: (event: RoadEvent) => event[5] === 0 && event[3] === 0, color: "rgba(23, 98, 71, .24)", radius: 1.15 },
      { test: (event: RoadEvent) => event[5] === 1 && event[3] === 0, color: "rgba(202, 137, 13, .58)", radius: 1.65 },
      { test: (event: RoadEvent) => event[3] > 0, color: "rgba(197, 50, 59, .86)", radius: 2.35 },
    ];
    for (const layer of layers) {
      context.fillStyle = layer.color;
      context.beginPath();
      for (const event of filtered) {
        if (!layer.test(event)) continue;
        const [x, y] = project(event[0], event[1]);
        context.moveTo(x + layer.radius, y);
        context.arc(x, y, layer.radius, 0, Math.PI * 2);
      }
      context.fill();
    }

    if (selected && filterEvent(selected, year, severity)) {
      const [x, y] = project(selected[0], selected[1]);
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.strokeStyle = "#11251e";
      context.fillStyle = "#fffdf8";
      context.lineWidth = 2;
      context.fill();
      context.stroke();
    }
  }, [data, filtered, selected, severity, size, year]);

  function selectNearest(event: MouseEvent<HTMLCanvasElement>) {
    if (!data) return;
    const box = event.currentTarget.getBoundingClientRect();
    const targetX = event.clientX - box.left;
    const targetY = event.clientY - box.top;
    const project = projection(data.boundary.bounds, size.width, size.height);
    let nearest: RoadEvent | null = null;
    let nearestDistance = 11 * 11;
    for (const item of filtered) {
      const [x, y] = project(item[0], item[1]);
      const distance = (x - targetX) ** 2 + (y - targetY) ** 2;
      if (distance < nearestDistance) {
        nearest = item;
        nearestDistance = distance;
      }
    }
    setSelected(nearest);
  }

  if (loadState === "loading") {
    return <div className="road-loading" role="status">Зареждане на проверените координати за ПТП…</div>;
  }
  if (loadState === "error" || !data || !analysis) {
    return <div className="road-loading road-error" role="alert">Картата не може да бъде заредена от локалната моментна снимка.</div>;
  }

  const severityLabels: Record<Severity, string> = { all: "Всички ПТП", severe: "Тежки ПТП", fatal: "Със загинали" };
  const filterDescription = `${year === "all" ? `${formatRoadDate(data.summary.date_from)}–${formatRoadDate(data.summary.date_to)}` : `${year} г.`}, ${severityLabels[severity].toLocaleLowerCase("bg-BG")}`;

  return (
    <section className="road-visual" aria-labelledby="road-map-title">
      <header className="road-visual-head">
        <div>
          <span className="eyebrow">{number.format(data.summary.mapped_rows)} проверени координати</span>
          <h3 id="road-map-title">Карта на пътните произшествия</h3>
          <p>{formatRoadDate(data.summary.date_from)}–{formatRoadDate(data.summary.date_to)} · източник: {data.source.publisher}</p>
        </div>
        <strong>{number.format(filtered.length)}<span>показани точки</span></strong>
      </header>

      <div className="road-controls" aria-label="Филтри за картата">
        <div>
          <span>Период</span>
          <div className="filter-buttons">
            <button type="button" aria-pressed={year === "all"} onClick={() => { setYear("all"); setSelected(null); }}>Всички</button>
            {data.summary.years.map((item) => (
              <button key={item.year} type="button" aria-pressed={year === item.year} onClick={() => { setYear(item.year); setSelected(null); }}>{item.year}</button>
            ))}
          </div>
        </div>
        <div>
          <span>Тежест</span>
          <div className="filter-buttons">
            {(Object.keys(severityLabels) as Severity[]).map((value) => (
              <button key={value} type="button" aria-pressed={severity === value} onClick={() => { setSeverity(value); setSelected(null); }}>{severityLabels[value]}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="road-map-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          onClick={selectNearest}
          role="img"
          aria-label={`Карта на България с ${number.format(filtered.length)} точки за ${filterDescription}. Натиснете близо до точка за подробности.`}
        />
        <div className="road-legend" aria-label="Легенда">
          <span><i className="point-normal" />ПТП</span>
          <span><i className="point-severe" />Тежко ПТП</span>
          <span><i className="point-fatal" />Със загинали</span>
        </div>
        <p className="map-instruction">Натиснете точка за подробности</p>
      </div>

      {selected && (
        <aside className="road-selection" aria-live="polite">
          <div>
            <span className="eyebrow">Избрано произшествие</span>
            <h4>{data.dictionaries.crash_types[selected[7]]}</h4>
          </div>
          <dl>
            <div><dt>Дата</dt><dd>{formatRoadDate(selected[8])}</dd></div>
            <div><dt>Област</dt><dd>{data.dictionaries.regions[selected[6]]}</dd></div>
            <div><dt>Ранени</dt><dd>{selected[4]}</dd></div>
            <div><dt>Загинали</dt><dd>{selected[3]}</dd></div>
          </dl>
          <button type="button" onClick={() => setSelected(null)}>Затвори</button>
        </aside>
      )}

      <div className="road-kpis" aria-label={`Обобщение за ${filterDescription}`}>
        <div><strong>{number.format(filtered.length)}</strong><span>произшествия</span></div>
        <div><strong>{number.format(analysis.severeCrashes)}</strong><span>тежки ПТП</span></div>
        <div><strong>{number.format(analysis.injured)}</strong><span>ранени</span></div>
        <div><strong>{number.format(analysis.fatalities)}</strong><span>загинали</span></div>
      </div>

      <div className="road-rankings">
        <Ranking eyebrow="Териториално разпределение" title="Области с най-много ПТП" rows={analysis.regionRows} />
        <Ranking eyebrow="Вид на инцидента" title="Най-чести произшествия" rows={analysis.typeRows} />
      </div>

      <footer className="road-source">
        <p><strong>Покритие:</strong> {number.format(data.summary.mapped_rows)} от {number.format(data.summary.total_rows)} реда имат валидни координати. {number.format(data.summary.unmapped_rows)} реда не са нанесени; подробностите са в доклада от проверките.</p>
        <div>
          <a href={data.source.dataset_url} target="_blank" rel="noreferrer">Данни: МВР ↗</a>
          <a href={data.boundary.source_url} target="_blank" rel="noreferrer">Контур: Natural Earth · обществено достояние ↗</a>
        </div>
      </footer>
    </section>
  );
}
