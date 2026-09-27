import { useSyncExternalStore } from "react";
import bg from "./bg.json";

export type Language = "en" | "bg";
const dictionary: Record<string, string> = bg;
export function chooseLanguage(url: string, saved?: string | null): Language {
  const requested = new URL(url).searchParams.get("lang");
  return requested === "bg" || requested === "en" ? requested : saved === "bg" ? "bg" : "en";
}
function initialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  let saved: string | null = null;
  try { saved = localStorage.getItem("tpc-language"); } catch {}
  return chooseLanguage(window.location.href, saved);
}
let language = initialLanguage();
const listeners = new Set<() => void>();
function updateDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.title = language === "bg" ? "Тесте на блъфа — безплатна демо игра" : "Liar's Deck — Free browser demo";
}
updateDocument();
export function setLanguage(next: Language) {
  language = next;
  updateDocument();
  try { localStorage.setItem("tpc-language", next); } catch {}
  const url = new URL(window.location.href);
  url.searchParams.set("lang", next);
  window.history.replaceState(null, "", url);
  listeners.forEach(notify => notify());
}
if (typeof window !== "undefined") window.addEventListener("popstate", () => {
  language = initialLanguage(); updateDocument(); listeners.forEach(notify => notify());
});
export function useLanguage() {
  const current = useSyncExternalStore(notify => { listeners.add(notify); return () => { listeners.delete(notify); }; }, () => language);
  return [current, setLanguage] as const;
}

// Translate presentation strings only; card ranks, player IDs, and server messages stay unchanged on the wire.
export function t(text: string, locale: Language = language): string {
  if (locale === "en") return text.replace(/^You wins the table\.?$/, "You win the table!");
  if (Object.hasOwn(dictionary, text)) return dictionary[text];
  for (const [pattern, format] of patterns) {
    const match = text.match(pattern);
    if (match) return format(match, value => t(value, locale));
  }
  return text;
}
type Format = (match: RegExpMatchArray, translate: (value: string) => string) => string;
const patterns: Array<[RegExp, Format]> = [
  [/^Round (\d+): table card is (\w+)\.$/, (m, tr) => `Рунд ${m[1]}: на масата е ${tr(m[2])}.`],
  [/^(.+) played (\d+) cards? face down\.$/, (m, tr) => `${m[1] === "You" ? "Играете" : `${tr(m[1])} играе`} ${m[2]} ${m[2] === "1" ? "карта" : "карти"} с лицето надолу.`],
  [/^(.+) called LIAR on (.+)\. Revealed: (.+)\.$/, (m, tr) => `${m[1] === "You" ? "Оспорвате" : `${tr(m[1])} оспорва`} хода на ${m[2] === "You" ? "Вас" : tr(m[2])}. Разкрити карти: ${m[3].split(", ").map(tr).join(", ")}.`],
  [/^(.+) wins the table\.?$/, (m, tr) => m[1] === "You" ? "Печелите играта!" : `${tr(m[1])} печели играта!`],
  [/^(.+) (?:was eliminated|got hit)\.?$/, (m, tr) => m[1] === "You" ? "Отпадате." : `${tr(m[1])} отпада.`],
  [/^(.+) got a dry click\.?$/, (m, tr) => m[1] === "You" ? "Сухо щракване. Продължавате!" : `${tr(m[1])}: сухо щракване. Продължава!`],
  [/^(.+) faces the roulette gun\.\.\.$/, (m, tr) => m[1] === "You" ? "Изчаквате резултата…" : `${tr(m[1])} чака резултата…`],
  [/^Taking aim at (.+)\.\.\.$/, (m, tr) => `На прицел: ${tr(m[1])}…`],
  [/^Spectating: (.+) is thinking\.\.\.$/, (m, tr) => `Наблюдавате: ${tr(m[1])} обмисля хода си…`],
  [/^(.+) is thinking(?:\.\.\.)?$/, (m, tr) => m[1] === "You" ? "Обмисляте хода си…" : `${tr(m[1])} обмисля хода си…`],
  [/^(.+) is playing$/, (m, tr) => m[1] === "You" ? "Играете" : `${tr(m[1])} играе`],
  [/^(.+) will act shortly\..+$/, (m, tr) => m[1] === "You" ? "Скоро ще направите ход." : `${tr(m[1])} скоро ще направи ход.`],
  [/^Ready to play (\d+) cards? face down\.$/, m => `Готови за ход с ${m[1]} ${m[1] === "1" ? "карта" : "карти"} с лицето надолу.`],
  [/^(\d+) cards?( left)?$/, m => `${m[1]} ${m[1] === "1" ? "карта" : "карти"}${m[2] ? m[1] === "1" ? " остава" : " остават" : ""}`],
  [/^(\d+) shots? left$/, m => `${m[1]} ${m[1] === "1" ? "оставащ опит" : "оставащи опита"}`],
  [/^ · (\d+) in voice · (\d+) speaker links?$/, m => ` · ${m[1]} в чата · ${m[2]} аудио връзки`]
];
