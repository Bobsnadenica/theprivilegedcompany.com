import { ChevronLeft, ChevronRight, Flame, HelpCircle, Shield, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { RulesStep } from "./animationTypes";

const RULES: RulesStep[] = [
  {
    kicker: "Goal",
    title: "Survive the table",
    body: "Play until only one player is not eliminated. Every round has a table card, and every bluff can send someone to roulette."
  },
  {
    kicker: "Cards",
    title: "Play face down",
    body: "On your turn, play 1 to 3 cards. Cards matching the table rank are safe. Jokers are always safe. Everything else is a lie."
  },
  {
    kicker: "LIAR",
    title: "Challenge the last play",
    body: "Call LIAR when you think the previous player hid at least one wrong card. If they lied, they take the risk. If they were honest, you do."
  },
  {
    kicker: "Roulette",
    title: "Dry click or splash",
    body: "The chamber has five dry clicks and one water-filled shot. A dry click misses. A hit eliminates you with a dramatic but non-graphic splash."
  }
];

export function RulesOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  if (!open) {
    return null;
  }

  const step = RULES[index];
  const Icon = index === 0 ? Shield : index === 1 ? Sparkles : index === 2 ? Flame : HelpCircle;

  return (
    <section className="rules-overlay" data-testid="rules-overlay" aria-label="Game rules">
      <div className="rules-card">
        <button className="rules-close" type="button" title="Close rules" onClick={onClose} data-testid="close-rules">
          <X size={18} />
        </button>
        <div className="rules-icon">
          <Icon size={32} />
        </div>
        <p className="eyebrow">{step.kicker}</p>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="rules-dots" aria-label="Rules step">
          {RULES.map((item, itemIndex) => (
            <button
              type="button"
              key={item.title}
              title={item.title}
              data-active={itemIndex === index}
              onClick={() => setIndex(itemIndex)}
            />
          ))}
        </div>
        <div className="rules-actions">
          <button className="secondary-button" type="button" disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>
            <ChevronLeft size={18} />
            Back
          </button>
          {index === RULES.length - 1 ? (
            <button className="primary-button" type="button" onClick={onClose}>
              <Shield size={18} />
              Got it
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={() => setIndex((current) => Math.min(RULES.length - 1, current + 1))}>
              Next
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
