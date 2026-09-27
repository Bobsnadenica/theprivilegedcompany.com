import dashboard from "../data/site/dashboard.json";
import type { Indicator } from "./TrendChart";

const base = import.meta.env.BASE_URL;
const date = (value: string) => new Date(value).toLocaleDateString("bg-BG", { timeZone: "UTC" });

export default function SourcesPanel() {
  return <section className="panel" aria-labelledby="sources-title">
    <header className="section-head"><div><span className="eyebrow">Източници и метод</span><h2 id="sources-title">Проверете всяко число.</h2></div><p>Графиката е начало на проверката. Тук са определенията, периодите, оригиналните отговори и стойностите за изтегляне.</p></header>
    <div className="source-method">
      <div><h3>Година ≠ дата на обновяване</h3><p>Националните серии са изтеглени на {date(dashboard.indicators.retrieved_at)}. Всеки показател има собствена последна налична година. Няма данни в реално време.</p></div>
      <div><h3>Без попълнени празнини</h3><p>Показваме последните 12 налични годишни наблюдения. Липсващите стойности не стават нули и не се интерполират. Източниците могат да ревизират минали години.</p></div>
      <div><h3>Сравними единици</h3><p>При дялове и годишни темпове разликата е в процентни пункта. Номиналният БВП не е реален растеж. Графиките обозначават скалата; таблиците и CSV позволяват собствена проверка.</p></div>
    </div>
    <div className="source-list">{Object.entries(dashboard.indicators.series).map(([key, value]) => {
      const series = value as Indicator;
      return <article className="source-card" key={key}>
        <span className="eyebrow">Световна банка · {series.indicator}</span><h3>{series.title}</h3>
        <p>{series.note}</p><p><strong>{series.data[0].year}–{series.data.at(-1)!.year}</strong> · {series.unit}</p>
        <p className="source-date">Обновяване на базата WDI: {series.source_last_updated ? date(series.source_last_updated) : "не е указано"} · Изтеглено: {date(dashboard.indicators.retrieved_at)}</p>
        <div className="source-links"><a href={series.source_url} target="_blank" rel="noreferrer">Показател и източници ↗</a><a href={series.api_url} target="_blank" rel="noreferrer">Проверете в API ↗</a><a href={`${base}data/${series.raw_path}`}>Запазен оригинал</a><a href={`${base}data/${series.csv_path}`} download>CSV ↓</a></div>
        <details><summary>Определение и първични доставчици</summary><p>{series.publisher}</p><a href={`${base}data/${series.metadata_path}`}>Оригинални метаданни (на английски)</a></details>
      </article>;
    })}</div>
    <div className="source-method secondary-sources">
      <div><h3>Каталог на отворените данни</h3><p>Моментна снимка от {date(dashboard.portal.retrieved_at)}: {dashboard.portal.datasets.toLocaleString("bg-BG")} записа. Броят набори и формати описва каталога, а не състоянието на икономиката или обществото.</p><a href={`${dashboard.portal.source}/data`} target="_blank" rel="noreferrer">Портал за отворени данни ↗</a></div>
      <div><h3>Карта на ПТП · МВР</h3><p>Период: {date(dashboard.road.date_from)}–{date(dashboard.road.date_to)}. Изтеглено: {date(dashboard.road.generated_at)}. На картата са само редовете с валидни координати; броят им не е пълният национален сбор.</p><a href={dashboard.road.source.dataset_url} target="_blank" rel="noreferrer">Оригинален набор на МВР ↗</a></div>
      <div><h3>Проверка и повторна употреба</h3><p>Националните серии са от World Development Indicators, лиценз CC BY 4.0. Пазим оригиналните API отговори и хешове. Автоматичните проверки установяват съгласуваност с тях, не заменят методологията на издателя.</p><a href={`${base}data/manifest.json`}>Файлове и SHA-256</a> · <a href={`${base}data/validation.json`}>Доклад от проверките</a></div>
    </div>
  </section>;
}
