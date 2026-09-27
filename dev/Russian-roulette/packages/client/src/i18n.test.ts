import { describe, expect, it } from "vitest";
import { chooseLanguage, t } from "./i18n";

describe("game language", () => {
  it("uses a shared link's explicit language before a saved preference", () => {
    expect(chooseLanguage("https://example.com/play/?lang=en", "bg")).toBe("en");
    expect(chooseLanguage("https://example.com/play/?lang=bg", "en")).toBe("bg");
    expect(chooseLanguage("https://example.com/play/", "bg")).toBe("bg");
    expect(chooseLanguage("https://example.com/play/?lang=unknown")).toBe("en");
  });
  it("translates dynamic public gameplay without changing names or revealing a pending result", () => {
    expect(t("Mira played 1 card face down.", "bg")).toBe("Mira играе 1 карта с лицето надолу.");
    expect(t("Round 3: table card is QUEEN.", "bg")).toBe("Рунд 3: на масата е ДАМА.");
    expect(t("Spectating: Gordon Freeman is thinking...", "bg")).toBe("Наблюдавате: Gordon Freeman обмисля хода си…");
    expect(t("Mira faces the roulette gun...", "bg")).toBe("Mira чака резултата…");
    expect(t("Mira wins the table", "bg")).toBe("Mira печели играта!");
  });
  it("keeps singular and plural card counts readable in Bulgarian", () => {
    expect(t("1 cards", "bg")).toBe("1 карта");
    expect(t("3 cards", "bg")).toBe("3 карти");
    expect(t("Ready to play 2 cards face down.", "bg")).toBe("Готови за ход с 2 карти с лицето надолу.");
  });
  it("retains English and safely falls back for unfamiliar player messages", () => {
    expect(t("Play against bots", "en")).toBe("Play against bots");
    expect(t("Иван <script>", "bg")).toBe("Иван <script>");
  });
});
