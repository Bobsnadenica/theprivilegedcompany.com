import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { t } from "./i18n";

const RULES = [
  ["Read the table", "The table shows King, Queen, or Ace. Matching cards and Jokers count as honest plays."],
  ["Play or bluff", "Choose 1–3 cards and play them face down. You can bluff with a different rank."],
  ["Call a bluff", "Challenge the previous play. If they lied, they take the risk. If they told the truth, you do."],
  ["Stay at the table", "Five dry chambers, one splash. A splash knocks a player out. The last player wins."]
];

export function RulesOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open) dialog.current?.close();
  }, [open]);
  return (
    <dialog ref={dialog} className="rules-dialog" data-testid="rules-overlay" aria-labelledby="rules-title" onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}>
      <div className="rules-card">
        <button className="rules-close" type="button" aria-label={t("Close rules")} onClick={onClose} data-testid="close-rules"><X size={20} /></button>
        <p className="eyebrow">{t("A minute to learn")}</p>
        <h2 id="rules-title">{t("How to play")}</h2>
        <ol className="rules-list">{RULES.map(([title, body]) => <li key={title}><strong>{t(title)}</strong><p>{t(body)}</p></li>)}</ol>
        <p className="rules-note">{t("Only one player still holding cards? They must challenge. This is a fictional card game with water effects.")}</p>
        <button className="primary-button" type="button" onClick={onClose}>{t("Got it")}</button>
      </div>
    </dialog>
  );
}
