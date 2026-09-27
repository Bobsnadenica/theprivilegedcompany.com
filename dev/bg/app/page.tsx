import { useEffect, useState } from "react";
import indicators from "../data/indicators/world-bank.json";
import TrendChart from "./TrendChart";
import SourcesPanel from "./SourcesPanel";

const filters = [
  { id: "all", label: "Всички" },
  { id: "economy", label: "Икономика" },
  { id: "people", label: "Хора" },
  { id: "nature", label: "Природа" },
] as const;

type FilterId = (typeof filters)[number]["id"];
type IndicatorKey = keyof typeof indicators.series;
const charts: { key: IndicatorKey; topic: Exclude<FilterId, "all"> }[] = [
  { key: "population", topic: "people" },
  { key: "growth", topic: "economy" },
  { key: "inflation", topic: "economy" },
  { key: "internet", topic: "people" },
  { key: "gdp", topic: "economy" },
  { key: "unemployment", topic: "economy" },
  { key: "life", topic: "people" },
  { key: "forest", topic: "nature" },
];

function filterFromHash(): FilterId {
  return filters.find(filter => `#${filter.id}` === window.location.hash)?.id ?? "all";
}

export default function Home() {
  const [activeFilter, setActiveFilter] = useState<FilterId>(filterFromHash);
  const [showSources, setShowSources] = useState(window.location.hash === "#sources");
  const visibleCharts = charts.filter(chart => activeFilter === "all" || chart.topic === activeFilter);

  useEffect(() => {
    function followHash() {
      if (window.location.hash === "#sources") {
        setShowSources(true);
      } else {
        setActiveFilter(filterFromHash());
      }
    }
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, []);

  useEffect(() => {
    if (showSources && window.location.hash === "#sources") {
      document.getElementById("sources")?.scrollIntoView({ block: "start" });
    }
  }, [showSources]);

  function selectFilter(id: FilterId) {
    setActiveFilter(id);
    window.location.hash = id;
  }

  return <main>
    <header className="site-header">
      <a className="brand" href="#top" aria-label="България в Данни — начало"><span className="brand-monogram">БвД</span><strong>България в Данни</strong></a>
      <a className="header-source" href="#sources" onClick={() => setShowSources(true)}>Източници ↗</a>
    </header>

    <section className="hero" id="top">
      <span className="eyebrow">8 показателя · публични източници</span>
      <h1>България, <em>в графики.</em></h1>
      <p>Изберете тема. Преместете годината. Проверете източника.</p>
    </section>

    <section className="explorer" id="graphs" aria-labelledby="graphs-title">
      <div className="explorer-head">
        <h2 id="graphs-title" className="sr-only">Национални показатели</h2>
        <div className="filters" role="group" aria-label="Тема на графиките">
          {filters.map(filter => <button key={filter.id} type="button" aria-pressed={activeFilter === filter.id} onClick={() => selectFilter(filter.id)}>{filter.label}</button>)}
        </div>
        <p className="view-note" aria-live="polite">{visibleCharts.length} {visibleCharts.length === 1 ? "графика" : "графики"} <span>· Годишни данни; периодите са различни.</span></p>
      </div>
      <div className="indicator-grid">
        {visibleCharts.map(({ key }) => <TrendChart key={key} indicatorKey={key} series={indicators.series[key]} retrievedAt={indicators.retrieved_at} />)}
      </div>
    </section>

    <SourcesPanel open={showSources} onToggle={setShowSources} />

    <footer>
      <a href="/?lang=bg">Проект на The Privileged Company ↗</a>
      <a href="/contact?lang=bg">Имате идея с данни? Пишете ни ↗</a>
    </footer>
  </main>;
}
