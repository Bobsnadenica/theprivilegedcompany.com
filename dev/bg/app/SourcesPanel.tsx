import indicators from "../data/indicators/world-bank.json";

const base = import.meta.env.BASE_URL;
const date = (value: string) => new Date(value).toLocaleDateString("bg-BG", { timeZone: "UTC" });

export default function SourcesPanel({ open, onToggle }: { open: boolean; onToggle: (open: boolean) => void }) {
  return <details className="sources" id="sources" open={open} onToggle={event => onToggle(event.currentTarget.open)}>
    <summary><span>Източници и метод</span><small>Определения, оригинални данни и дати</small></summary>
    <div className="sources-content">
      <p className="method-intro">Данни от World Development Indicators на Световната банка. Изтеглени на <strong>{date(indicators.retrieved_at)}</strong>; това не е годината на наблюдение.</p>
      <ul className="method-notes">
        <li>Последните 12 налични годишни стойности. Липсващите години не се попълват; източникът може да ревизира данните.</li>
        <li>Скалата на всяка графика следва стойностите. В „Стойности и подробности“ можете да включите нулата.</li>
        <li>При дялове и годишни темпове промяната е в процентни пункта (п.п.). Номиналният БВП и реалният растеж са отделни показатели.</li>
      </ul>
      <div className="source-list">{Object.entries(indicators.series).map(([key, series]) => <details className="source-card" key={key}>
        <summary><span>{series.title}</span><small>{series.data[0].year}–{series.data.at(-1)!.year}</small></summary>
        <div>
          <p>{series.note}</p>
          <p><strong>{series.unit}</strong> · {series.indicator}</p>
          <p className="source-date">Обновяване на базата WDI: {series.source_last_updated ? date(series.source_last_updated) : "не е указано"}.</p>
          <p><strong>Доставчици според Световната банка:</strong><br />{series.publisher}</p>
          <div className="source-links">
            <a href={series.source_url} target="_blank" rel="noreferrer">Официален показател ↗</a>
            <a href={series.api_url} target="_blank" rel="noreferrer">API ↗</a>
            <a href={`${base}data/${series.raw_path}`}>Запазен оригинал</a>
            <a href={`${base}data/${series.metadata_path}`}>Определение и произход</a>
            <a href={`${base}data/${series.csv_path}`} download>CSV ↓</a>
          </div>
        </div>
      </details>)}</div>
      <p className="method-foot">Лиценз: {indicators.license}. Проверяваме съвпадението на графиките с оригиналните API отговори; това не е независим одит на статистиката.</p>
      <div className="source-links"><a href={`${base}data/indicators/world-bank.json`}>Всички показатели (JSON)</a><a href={`${base}data/manifest.json`}>Файлове и SHA-256</a><a href={`${base}data/validation.json`}>Проверки на данните</a></div>
    </div>
  </details>;
}
