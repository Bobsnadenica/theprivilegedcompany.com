import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import dashboard from "../data/site/dashboard.json";
import RoadMap from "./RoadMap";

type TrendPoint = { year: string; value: number };
type Indicator = {
  indicator: string;
  title: string;
  unit: string;
  source_url: string;
  data: TrendPoint[];
};
type FeaturedDataset = {
  identifier: string;
  identifier_type: "uuid" | "legacy";
  title: string;
  description: string;
  category_id: number;
  organisation: string;
  formats: string[];
  resource_count: number;
  updated_at: string | null;
  portal_url: string;
};
type CatalogDataset = FeaturedDataset & { tags?: string[] };
type CatalogResponse = { datasets: CatalogDataset[]; total_records: number };
type CoverageRow = { key: string; label: string; count: number; percent: number };
type FreshnessRow = { year: string; datasets: number };
type OrganisationRow = { name: string; datasets: number };
type FormatRow = { format: string; datasets: number };
type CategoryBreakdownRow = { id: number; name: string; datasets: number };

const tabs = [
  { id: "home", label: "Начало" },
  { id: "transport", label: "Транспорт" },
  { id: "economy", label: "Икономика" },
  { id: "nature", label: "Природа" },
  { id: "people", label: "Хора" },
  { id: "public", label: "Държава" },
  { id: "catalog", label: "Каталог" },
] as const;

type TabId = (typeof tabs)[number]["id"];
type ThemeId = "transport" | "economy" | "nature" | "people" | "public";
type IconName = TabId | "data" | "verified" | "resources";

const themeCopy: Record<ThemeId, { eyebrow: string; title: string; intro: string; short: string }> = {
  transport: {
    eyebrow: "Пътища и мобилност",
    title: "Транспортът на карта",
    intro: "Пътни произшествия, регистри и инфраструктура — с реални координати, ясни филтри и директна връзка към първоизточника.",
    short: "Пътища, ПТП и мобилност",
  },
  economy: {
    eyebrow: "Икономика и финанси",
    title: "Публичната икономика в контекст",
    intro: "Финансовите набори в портала са съчетани с проверен дългосрочен индикатор за мащаба на българската икономика.",
    short: "Финанси, бюджети и пазари",
  },
  nature: {
    eyebrow: "Земя, енергия и екосистеми",
    title: "Природата като система от данни",
    intro: "Околна среда, гори, земеделие и енергетика в един изглед с тематичен състав и национална времева серия.",
    short: "Земя, гори, енергия и въздух",
  },
  people: {
    eyebrow: "Население и общество",
    title: "Промените зад числата",
    intro: "Население, образование, здравеопазване и дигитално участие — представени чрез две проверени тенденции и пълния каталог.",
    short: "Население, здраве и образование",
  },
  public: {
    eyebrow: "Държава, региони и правосъдие",
    title: "Публичният сектор без лабиринт",
    intro: "Данни за управление, общини, региони, наука, правосъдие и международни отношения — включително ясно показани некатегоризирани записи.",
    short: "Управление, региони и правосъдие",
  },
};

const categoryName = new Map(dashboard.categories.map((category) => [category.id, category.name]));
const number = new Intl.NumberFormat("bg-BG");
const compact = new Intl.NumberFormat("bg-BG", { notation: "compact", maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
const baseUrl = import.meta.env.BASE_URL;
const isTestPortal = dashboard.portal.source.includes("testdata.");

function DataIcon({ name, size = "normal" }: { name: IconName; size?: "small" | "normal" | "large" }) {
  return <span className={`data-icon icon-${name} icon-${size}`} aria-hidden="true"><i /></span>;
}

function latest(series: Indicator) {
  return series.data[series.data.length - 1];
}

function formatDate(value: string | null | undefined) {
  return value ? date.format(new Date(value.replace(" ", "T") + (value.includes("T") ? "" : "Z"))) : "неуказана дата";
}

function formatIndicator(key: string, value: number) {
  if (key === "gdp") return `${(value / 1_000_000_000).toLocaleString("bg-BG", { maximumFractionDigits: 1 })} млрд. щ.д.`;
  if (key === "population") return `${(value / 1_000_000).toLocaleString("bg-BG", { maximumFractionDigits: 2 })} млн.`;
  return `${value.toLocaleString("bg-BG", { maximumFractionDigits: 1 })}%`;
}

function themeForCategory(categoryId: number): ThemeId {
  if (categoryId === 5) return "transport";
  if (categoryId === 7) return "economy";
  if ([1, 3, 4].includes(categoryId)) return "nature";
  if ([2, 8, 10].includes(categoryId)) return "people";
  return "public";
}

function Metric({ value, label, note, icon }: { value: string; label: string; note: string; icon: IconName }) {
  return (
    <article className="metric">
      <DataIcon name={icon} />
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{note}</small>
    </article>
  );
}

function DatasetCard({ dataset }: { dataset: FeaturedDataset | CatalogDataset }) {
  const theme = themeForCategory(dataset.category_id);
  return (
    <article className="dataset-card">
      <div className="dataset-meta">
        <span><DataIcon name={theme} size="small" />{categoryName.get(dataset.category_id) ?? "Некатегоризирани"}</span>
        <span>{dataset.formats.join(" · ") || "форматът не е указан"}</span>
      </div>
      <h3>{dataset.title}</h3>
      <p>{dataset.description || "Порталът не е публикувал описание към този набор."}</p>
      <div className="dataset-foot">
        <div>
          <strong>{dataset.organisation}</strong>
          <span>{dataset.resource_count} ресурса · обновено {formatDate(dataset.updated_at)}</span>
        </div>
        <a href={dataset.portal_url} target="_blank" rel="noreferrer" aria-label={`Отвори „${dataset.title}“ в портала`}>
          Отвори <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}

function TrendChart({ indicatorKey, series }: { indicatorKey: string; series: Indicator }) {
  const values = series.data.map((point) => point.value);
  const max = Math.max(...values, 1);
  const current = latest(series);
  const first = series.data[0];
  const change = ((current.value - first.value) / first.value) * 100;
  return (
    <figure className="trend-chart">
      <figcaption>
        <div>
          <span className="eyebrow">Национален индикатор</span>
          <h3>{series.title}</h3>
          <p>{series.unit} · {series.data.length} годишни наблюдения · {first.year}–{current.year}</p>
        </div>
        <div className="trend-summary">
          <strong>{formatIndicator(indicatorKey, current.value)}</strong>
          <span className={change < 0 ? "change-negative" : "change-positive"}>{change > 0 ? "+" : ""}{change.toLocaleString("bg-BG", { maximumFractionDigits: 1 })}% за периода</span>
        </div>
      </figcaption>
      <ol aria-label={`${series.title} по години; колоните започват от нула`}>
        {series.data.map((point) => {
          const height = Math.max(3, (point.value / max) * 100);
          return (
            <li key={point.year} aria-label={`${point.year}: ${formatIndicator(indicatorKey, point.value)}`}>
              <span className="bar-value">{indicatorKey === "gdp" ? compact.format(point.value) : point.value.toLocaleString("bg-BG", { maximumFractionDigits: 1 })}</span>
              <i style={{ "--height": `${height}%` } as CSSProperties} />
              <span>{point.year.slice(2)}</span>
            </li>
          );
        })}
      </ol>
      <div className="chart-note"><span>Скала от нула</span><a href={series.source_url} target="_blank" rel="noreferrer">Източник: Световна банка ↗</a></div>
    </figure>
  );
}

function CategoryChart({ compactView = false }: { compactView?: boolean }) {
  const sorted = [...dashboard.categories].sort((a, b) => b.dataset_count - a.dataset_count);
  const rows = compactView ? sorted.slice(0, 7) : sorted;
  const max = Math.max(...rows.map((row) => row.dataset_count), 1);
  return (
    <figure className="category-chart">
      <figcaption>
        <span className="eyebrow">Целият портал</span>
        <h3>{compactView ? "Най-големи официални категории" : "Всички 14 категории"}</h3>
        <p>Брой публикувани набори в локалната моментна снимка</p>
      </figcaption>
      <ol>
        {rows.map((row) => (
          <li key={row.id}>
            <span title={row.name}>{row.name}</span>
            <i><b style={{ width: `${(row.dataset_count / max) * 100}%` }} /></i>
            <strong>{number.format(row.dataset_count)}</strong>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function CoverageChart({ rows, title = "Покритие на метаданните" }: { rows: CoverageRow[]; title?: string }) {
  return (
    <figure className="coverage-chart visual-card">
      <figcaption>
        <span className="eyebrow">Качество</span>
        <h3>{title}</h3>
        <p>Дял от наборите в текущия изглед</p>
      </figcaption>
      <ol>
        {rows.map((row) => (
          <li key={row.key}>
            <div><span>{row.label}</span><strong>{row.percent.toLocaleString("bg-BG", { maximumFractionDigits: 1 })}%</strong></div>
            <i><b style={{ width: `${row.percent}%` }} /></i>
            <small>{number.format(row.count)} набора</small>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function FreshnessChart({ rows }: { rows: FreshnessRow[] }) {
  const max = Math.max(...rows.map((row) => row.datasets), 1);
  return (
    <figure className="freshness-chart visual-card">
      <figcaption>
        <span className="eyebrow">Последна промяна</span>
        <h3>Кога е обновен каталогът</h3>
        <p>Година на последна промяна в метаданните</p>
      </figcaption>
      <ol aria-label="Набори по година на последна промяна">
        {rows.map((row) => (
          <li key={row.year} aria-label={`${row.year}: ${number.format(row.datasets)} набора`}>
            <strong>{compact.format(row.datasets)}</strong>
            <i className={row.datasets === 0 ? "is-zero" : undefined} style={{ "--height": `${row.datasets === 0 ? 0 : Math.max(3, (row.datasets / max) * 100)}%` } as CSSProperties} />
            <span>{row.year === "Неуказана" ? "—" : row.year.slice(2)}</span>
          </li>
        ))}
      </ol>
      <small>Показва метаданните, не датата на всяко наблюдение в ресурсите.</small>
    </figure>
  );
}

function SubthemeChart({ rows }: { rows: CategoryBreakdownRow[] }) {
  const sorted = [...rows].sort((a, b) => b.datasets - a.datasets);
  const max = Math.max(...sorted.map((row) => row.datasets), 1);
  return (
    <figure className="subtheme-chart visual-card">
      <figcaption>
        <span className="eyebrow">Тематичен състав</span>
        <h3>Какво включва разделът</h3>
        <p>Официални категории и брой набори</p>
      </figcaption>
      <ol>
        {sorted.map((row) => (
          <li key={row.id}>
            <span title={row.name}>{row.name}</span>
            <i><b style={{ width: `${(row.datasets / max) * 100}%` }} /></i>
            <strong>{number.format(row.datasets)}</strong>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function ProfileComposition({ organisations, formats, label }: { organisations: OrganisationRow[]; formats: FormatRow[]; label: string }) {
  const organisationMax = Math.max(...organisations.map((row) => row.datasets), 1);
  const formatMax = Math.max(...formats.map((row) => row.datasets), 1);
  return (
    <section className="theme-composition" aria-label={`Издатели и формати за ${label}`}>
      <figure className="metadata-chart">
        <figcaption>
          <span className="eyebrow">Издатели</span>
          <h3>Кой публикува най-много</h3>
          <p>Шестте издатели с най-много набори</p>
        </figcaption>
        <ol>
          {organisations.map((row) => (
            <li key={row.name}>
              <span title={row.name}>{row.name}</span>
              <i><b style={{ width: `${(row.datasets / organisationMax) * 100}%` }} /></i>
              <strong>{number.format(row.datasets)}</strong>
            </li>
          ))}
        </ol>
      </figure>
      <figure className="metadata-chart formats-chart">
        <figcaption>
          <span className="eyebrow">Формати</span>
          <h3>Как са публикувани</h3>
          <p>Един набор може да има повече от един формат</p>
        </figcaption>
        <ol>
          {formats.map((row) => (
            <li key={row.format}>
              <span>{row.format}</span>
              <i><b style={{ width: `${(row.datasets / formatMax) * 100}%` }} /></i>
              <strong>{number.format(row.datasets)}</strong>
            </li>
          ))}
        </ol>
      </figure>
    </section>
  );
}

function ThemeNavigator({ onNavigate }: { onNavigate: (id: ThemeId) => void }) {
  const ids: ThemeId[] = ["transport", "economy", "nature", "people", "public"];
  return (
    <section className="theme-navigator" aria-labelledby="theme-nav-title">
      <header>
        <div><span className="eyebrow">Визуални раздели</span><h3 id="theme-nav-title">Пет входа към всички 14 категории</h3></div>
        <p>Изберете тема. Всеки раздел комбинира показатели, структура на каталога и преки източници.</p>
      </header>
      <div>
        {ids.map((id) => {
          const theme = dashboard.themes[id];
          return (
            <button key={id} type="button" onClick={() => onNavigate(id)}>
              <DataIcon name={id} size="large" />
              <span>{theme.name}</span>
              <small>{themeCopy[id].short}</small>
              <strong>{number.format(theme.dataset_count)} <i>набора</i></strong>
              <em>{theme.category_ids.length} {theme.category_ids.length === 1 ? "категория" : "категории"} →</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PublicSignal({ rows }: { rows: CategoryBreakdownRow[] }) {
  const largest = [...rows].sort((a, b) => b.datasets - a.datasets)[0];
  const total = rows.reduce((sum, row) => sum + row.datasets, 0);
  const share = total ? (largest.datasets / total) * 100 : 0;
  return (
    <aside className="public-signal">
      <DataIcon name="public" size="large" />
      <div><span className="eyebrow">Важно за прочита</span><h3>{largest.name}</h3><p>Това е най-голямата група в раздела. Тя съдържа {number.format(largest.datasets)} набора, или {share.toLocaleString("bg-BG", { maximumFractionDigits: 1 })}% от тази тематична секция.</p></div>
      <strong>{share.toLocaleString("bg-BG", { maximumFractionDigits: 1 })}%</strong>
    </aside>
  );
}

function ThemePanel({ id }: { id: ThemeId }) {
  const theme = dashboard.themes[id];
  const copy = themeCopy[id];
  return (
    <section className="panel" aria-labelledby={`${id}-title`}>
      <header className="section-head themed-head">
        <div>
          <DataIcon name={id} size="large" />
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2 id={`${id}-title`}>{copy.title}</h2>
        </div>
        <p>{copy.intro}</p>
      </header>
      <div className="metric-row">
        <Metric icon="data" value={number.format(theme.dataset_count)} label="набора от данни" note={`${theme.category_ids.length} официални ${theme.category_ids.length === 1 ? "категория" : "категории"}`} />
        <Metric icon="resources" value={number.format(theme.resource_count)} label="публикувани ресурса" note="Свързани файлове и API ресурси" />
        <Metric icon="verified" value={number.format(theme.organisation_count)} label="организации" note="Уникални издатели в раздела" />
      </div>

      {id === "transport" && <RoadMap />}
      {id === "economy" && <TrendChart indicatorKey="gdp" series={dashboard.indicators.series.gdp as Indicator} />}
      {id === "nature" && <TrendChart indicatorKey="forest" series={dashboard.indicators.series.forest as Indicator} />}
      {id === "people" && (
        <div className="indicator-grid">
          <TrendChart indicatorKey="population" series={dashboard.indicators.series.population as Indicator} />
          <TrendChart indicatorKey="internet" series={dashboard.indicators.series.internet as Indicator} />
        </div>
      )}
      {id === "public" && <PublicSignal rows={theme.category_breakdown as CategoryBreakdownRow[]} />}

      <div className={`visual-grid ${theme.category_breakdown.length > 1 ? "visual-grid-three" : "visual-grid-two"}`}>
        {theme.category_breakdown.length > 1 && <SubthemeChart rows={theme.category_breakdown as CategoryBreakdownRow[]} />}
        <FreshnessChart rows={theme.updated_distribution as FreshnessRow[]} />
        <CoverageChart rows={theme.coverage as CoverageRow[]} />
      </div>
      <ProfileComposition organisations={theme.top_organisations as OrganisationRow[]} formats={theme.format_breakdown as FormatRow[]} label={theme.name} />

      <div className="subhead">
        <div><span className="eyebrow">Подбрани записи</span><h3>От данните към източника</h3></div>
        <p>Последно обновени записи с описание и публикуван ресурс. Всеки води към оригинала.</p>
      </div>
      <div className="dataset-grid">
        {(theme.featured as FeaturedDataset[]).map((dataset) => <DatasetCard key={dataset.identifier} dataset={dataset} />)}
      </div>
    </section>
  );
}

function HomePanel({ onNavigate }: { onNavigate: (id: ThemeId) => void }) {
  const population = dashboard.indicators.series.population as Indicator;
  const internet = dashboard.indicators.series.internet as Indicator;
  return (
    <section className="panel" aria-labelledby="home-title">
      <header className="section-head">
        <div><span className="eyebrow">Проверен обзор</span><h2 id="home-title">Публичните данни на едно място</h2></div>
        <p>БвД подрежда целия наличен каталог в пет разбираеми теми, визуализира проверими показатели и винаги води обратно към официалния запис.</p>
      </header>
      <div className="metric-row">
        <Metric icon="people" value={`${(latest(population).value / 1_000_000).toLocaleString("bg-BG", { maximumFractionDigits: 2 })} млн.`} label={`население през ${latest(population).year} г.`} note="Световна банка" />
        <Metric icon="data" value={`${latest(internet).value.toLocaleString("bg-BG", { maximumFractionDigits: 1 })}%`} label={`използват интернет през ${latest(internet).year} г.`} note="Дял от населението" />
        <Metric icon="resources" value={number.format(dashboard.portal.resources)} label="ресурса в каталога" note="Свързани с публичните набори" />
      </div>
      <ThemeNavigator onNavigate={onNavigate} />
      <div className="home-visual-grid">
        <CategoryChart compactView />
        <div>
          <FreshnessChart rows={dashboard.catalog_profile.updated_distribution as FreshnessRow[]} />
          <CoverageChart rows={dashboard.catalog_profile.coverage as CoverageRow[]} title="Колко добре е описан каталогът" />
        </div>
      </div>
      <ProfileComposition organisations={dashboard.catalog_profile.top_organisations as OrganisationRow[]} formats={dashboard.catalog_profile.format_breakdown as FormatRow[]} label="целия каталог" />
      <div className="method-card">
        <DataIcon name="verified" size="large" />
        <div><span className="eyebrow">Какво е проверено</span><h3>Прозрачен обхват</h3></div>
        <p>{dashboard.validation.verified_scope}</p>
        <a href={`${baseUrl}data/validation.json`}>Доклад от проверките →</a>
      </div>
    </section>
  );
}

function CatalogPanel() {
  const [datasets, setDatasets] = useState<CatalogDataset[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${baseUrl}data/catalog-datasets.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<CatalogResponse>;
      })
      .then((value) => { setDatasets(value.datasets); setState("ready"); })
      .catch((error: unknown) => { if ((error as { name?: string }).name !== "AbortError") setState("error"); });
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("bg-BG");
    return datasets.filter((dataset) => {
      const matchesCategory = category === "all" || dataset.category_id === Number(category);
      const haystack = `${dataset.title} ${dataset.description} ${dataset.tags?.join(" ") ?? ""}`.toLocaleLowerCase("bg-BG");
      return matchesCategory && (!needle || haystack.includes(needle));
    });
  }, [category, datasets, query]);

  return (
    <section className="panel" aria-labelledby="catalog-title">
      <header className="section-head themed-head">
        <div><DataIcon name="catalog" size="large" /><span className="eyebrow">Пълен локален индекс</span><h2 id="catalog-title">Всички отворени данни</h2></div>
        <p>Тук няма подбор: търсенето обхваща всеки запис в моментната снимка. Резултатите се променят само след ръчното обновяване.</p>
      </header>
      <div className="metric-row">
        <Metric icon="data" value={number.format(dashboard.portal.datasets)} label="набора в индекса" note="Всички 14 категории" />
        <Metric icon="resources" value={number.format(dashboard.portal.resources)} label="ресурса" note="Файлове и API ресурси" />
        <Metric icon="verified" value={number.format(dashboard.portal.organisations)} label="организации" note="Активни издатели в портала" />
      </div>
      <div className="catalog-visuals">
        <CategoryChart />
        <CoverageChart rows={dashboard.catalog_profile.coverage as CoverageRow[]} title="Покритие на целия каталог" />
      </div>
      <ProfileComposition organisations={dashboard.catalog_profile.top_organisations as OrganisationRow[]} formats={dashboard.catalog_profile.format_breakdown as FormatRow[]} label="целия каталог" />

      <div className="catalog-search-head"><div><span className="eyebrow">Търсене</span><h3>Намерете конкретен набор</h3></div><p>По заглавие, описание, етикет или официална категория</p></div>
      <div className="catalog-tools">
        <label><span>Ключова дума</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="напр. пътища, бюджет, гори…" /></label>
        <label><span>Официална категория</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Всички 14 категории</option>{dashboard.categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <div className="result-count" aria-live="polite">
          {state === "loading" && "Зареждане на каталога…"}
          {state === "error" && "Каталогът не може да бъде зареден."}
          {state === "ready" && <><strong>{number.format(filtered.length)}</strong><span>намерени набора</span></>}
        </div>
      </div>
      {state === "ready" && <><div className="dataset-grid catalog-grid">{filtered.slice(0, 60).map((dataset) => <DatasetCard key={dataset.identifier} dataset={dataset} />)}</div>{filtered.length > 60 && <p className="catalog-note">Показани са първите 60 резултата. Стеснете търсенето за по-точен списък.</p>}</>}
      <div className="download-row">
        <a href={`${baseUrl}data/catalog-datasets.json`}>Пълен каталог (JSON)</a>
        <a href={`${baseUrl}data/manifest.json`}>Манифест и хешове</a>
        <a href={`${baseUrl}data/validation.json`}>Доклад от проверките</a>
      </div>
    </section>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const snapshotDate = date.format(new Date(dashboard.portal.retrieved_at));

  function selectTab(id: TabId) {
    setActiveTab(id);
    document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const tab = tabs[next];
    setActiveTab(tab.id);
    document.getElementById(`tab-${tab.id}`)?.focus();
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="България в Данни — начало">
          <span className="brand-monogram">БвД</span>
          <span><strong>България в Данни</strong><small>отворен публичен атлас</small></span>
        </a>
        <div className="header-status"><i /> Проверена моментна снимка</div>
        <a className="portal-link" href={dashboard.portal.source} target="_blank" rel="noreferrer">{isTestPortal ? "Тестов портал" : "Официален портал"} ↗</a>
      </header>

      <section className="hero" id="top">
        <div>
          <span className="hero-kicker"><b>БвД</b> Отворени данни · България</span>
          <h1>България<br /><em>в Данни.</em></h1>
          <p>Професионален, локален и проверим изглед към всички публични данни — от пътищата и икономиката до природата, хората и държавата.</p>
          <button type="button" onClick={() => selectTab("home")}>Влезте в атласа <span>↓</span></button>
        </div>
        <aside aria-label="Обобщение на моментната снимка">
          <div><DataIcon name="data" /><strong>{number.format(dashboard.portal.datasets)}</strong><span>набора от данни</span></div>
          <div><DataIcon name="resources" /><strong>{number.format(dashboard.portal.resources)}</strong><span>публикувани ресурса</span></div>
          <div><DataIcon name="catalog" /><strong>{dashboard.portal.themes}</strong><span>официални категории</span></div>
          <p>Моментна снимка от {snapshotDate}<br />Обновява се само с <code>./update.sh</code></p>
        </aside>
      </section>

      <div className="trust-strip">
        <p><DataIcon name="verified" /><span><strong>{dashboard.validation.checks} автоматични проверки</strong><small>{dashboard.validation.warnings} предупреждения · 0 грешки</small></span></p>
        <p><DataIcon name="catalog" /><span><strong>Всички 14 категории</strong><small>Пет тематични раздела + пълен каталог</small></span></p>
        <p><DataIcon name="data" /><span><strong>Статични локални данни</strong><small>Без външни заявки при разглеждане</small></span></p>
      </div>

      <section className="explorer" id="explorer">
        <div className="tab-wrap">
          <div className="tabs" role="tablist" aria-label="Раздели с данни">
            {tabs.map((tab, index) => (
              <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => onTabKeyDown(event, index)}>
                <DataIcon name={tab.id} size="small" /><span>0{index + 1}</span><b>{tab.label}</b>
              </button>
            ))}
          </div>
        </div>
        <div id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
          {activeTab === "home" && <HomePanel onNavigate={selectTab} />}
          {activeTab === "transport" && <ThemePanel id="transport" />}
          {activeTab === "economy" && <ThemePanel id="economy" />}
          {activeTab === "nature" && <ThemePanel id="nature" />}
          {activeTab === "people" && <ThemePanel id="people" />}
          {activeTab === "public" && <ThemePanel id="public" />}
          {activeTab === "catalog" && <CatalogPanel />}
        </div>
      </section>

      <footer>
        <div><span className="brand-monogram brand-monogram-small">БвД</span><span><strong>България в Данни</strong><small>Локален проект с публични източници</small></span></div>
        <div><a href={`${baseUrl}data/validation.json`}>Проверки</a><a href={`${baseUrl}data/manifest.json`}>Манифест</a><a href={dashboard.portal.source} target="_blank" rel="noreferrer">Източник ↗</a></div>
      </footer>
    </main>
  );
}
