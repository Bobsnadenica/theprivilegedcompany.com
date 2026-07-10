const HORIZONS = {
    one_day: { short: "1D", long: "1 day" },
    one_month: { short: "1M", long: "1 month" },
    one_year: { short: "1Y", long: "1 year" },
};

const state = {
    data: null,
    query: "",
    signal: "ALL",
    horizon: "one_month",
    sort: "market_cap",
};

const PRODUCTION_DATA_URL = "https://raw.githubusercontent.com/Bobsnadenica/theprivilegedcompany.com/main/dev/Trading/data/analysis.json";

const elements = {
    status: document.querySelector(".data-status"),
    statusText: document.getElementById("data-status-text"),
    snapshotDate: document.getElementById("snapshot-date"),
    sourceLabel: document.getElementById("source-label"),
    search: document.getElementById("asset-search"),
    signalFilter: document.getElementById("signal-filter"),
    sortControl: document.getElementById("sort-control"),
    horizonControl: document.getElementById("horizon-control"),
    cryptoGrid: document.getElementById("crypto-grid"),
    stockList: document.getElementById("stock-list"),
    cryptoCount: document.getElementById("crypto-visible-count"),
    stockCount: document.getElementById("stock-visible-count"),
    emptyState: document.getElementById("empty-state"),
    freshnessBanner: document.getElementById("freshness-banner"),
    freshnessMessage: document.getElementById("freshness-message"),
    healthStatus: document.getElementById("health-status"),
    healthCoverage: document.getElementById("health-coverage"),
    modelVersion: document.getElementById("model-version"),
    universeStatus: document.getElementById("universe-status"),
    counts: {
        BUY: document.getElementById("buy-count"),
        HOLD: document.getElementById("hold-count"),
        SELL: document.getElementById("sell-count"),
    },
    countContexts: [
        document.getElementById("buy-context"),
        document.getElementById("hold-context"),
        document.getElementById("sell-context"),
    ],
    assetDialog: document.getElementById("asset-dialog"),
    methodDialog: document.getElementById("method-dialog"),
};

const priceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const compactPriceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
});

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatPrice(value, compact = false) {
    if (!Number.isFinite(value)) return "—";
    return (compact ? compactPriceFormatter : priceFormatter).format(value);
}

function formatPercent(value, digits = 2) {
    if (!Number.isFinite(value)) return "—";
    return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function changeClass(value) {
    return value >= 0 ? "positive" : "negative";
}

function signalClass(signal) {
    return `signal-${signal.toLowerCase()}`;
}

function indicatorTone(value) {
    const normalized = String(value).toUpperCase();
    if (["BULLISH", "LOW", "UPPER HALF"].includes(normalized)) return "positive";
    if (["BEARISH", "HIGH", "LOWER HALF", "BELOW BAND"].includes(normalized)) return "negative";
    return "neutral";
}

function sortAssets(assets) {
    const riskOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    return [...assets].sort((left, right) => {
        if (state.sort === "strength") {
            return right.signals[state.horizon].strength - left.signals[state.horizon].strength;
        }
        if (state.sort === "change") return right.change_pct - left.change_pct;
        if (state.sort === "risk") {
            return riskOrder[left.indicators.volatility_risk] - riskOrder[right.indicators.volatility_risk];
        }
        if (state.sort === "name") return left.name.localeCompare(right.name);
        return (right.market_cap || 0) - (left.market_cap || 0);
    });
}

function getFilteredAssets() {
    const query = state.query.trim().toLowerCase();
    return state.data.assets.filter((asset) => {
        const matchesText = !query || [asset.name, asset.symbol, asset.exchange]
            .some((value) => value.toLowerCase().includes(query));
        const matchesSignal = state.signal === "ALL" || asset.signals[state.horizon].label === state.signal;
        return matchesText && matchesSignal;
    });
}

function renderSummary() {
    const counts = { BUY: 0, HOLD: 0, SELL: 0 };
    state.data.assets.forEach((asset) => {
        counts[asset.signals[state.horizon].label] += 1;
    });
    Object.entries(counts).forEach(([signal, value]) => {
        elements.counts[signal].textContent = value;
    });
    const horizonText = HORIZONS[state.horizon].long;
    elements.countContexts.forEach((element) => {
        element.textContent = `assets on ${horizonText}`;
    });
}

function signalBlocks(asset) {
    return Object.entries(HORIZONS).map(([key, label]) => {
        const signal = asset.signals[key];
        return `
            <span class="signal-block">
                <span>${label.long}</span>
                <strong class="${signalClass(signal.label)}" aria-label="${signal.label}, signal strength ${signal.strength} out of 100"><span aria-hidden="true">${signal.label}</span><small aria-hidden="true">${signal.strength}</small></strong>
            </span>
        `;
    }).join("");
}

function renderCryptoCard(asset) {
    return `
        <article class="crypto-card">
            <button class="asset-button" type="button" data-asset-id="${escapeHtml(asset.id)}" aria-label="Open analysis for ${escapeHtml(asset.name)}">
                <div class="crypto-top">
                    <div class="asset-name">
                        <strong>${escapeHtml(asset.name)}</strong>
                        <span>${escapeHtml(asset.symbol)} / USD</span>
                    </div>
                    <span class="exchange-label">${escapeHtml(asset.exchange)}</span>
                </div>
                <div class="price-line">
                    <span class="asset-price">${formatPrice(asset.price, asset.price >= 100000)}</span>
                    <span class="change ${changeClass(asset.change_pct)}">${formatPercent(asset.change_pct)}</span>
                </div>
                <div class="crypto-signals">${signalBlocks(asset)}</div>
            </button>
        </article>
    `;
}

function renderStockRow(asset) {
    const signalCells = Object.entries(HORIZONS).map(([key, horizon]) => {
        const signal = asset.signals[key];
        return `<span class="signal-cell signal-pill ${signalClass(signal.label)}" role="cell" aria-label="${horizon.long}: ${signal.label}, signal strength ${signal.strength} out of 100"><span class="mobile-horizon" aria-hidden="true">${horizon.short}</span><span aria-hidden="true">${signal.label}<small>${signal.strength}</small></span></span>`;
    }).join("");

    return `
        <button class="market-row asset-row" type="button" role="row" data-asset-id="${escapeHtml(asset.id)}" aria-label="Open analysis for ${escapeHtml(asset.name)}">
            <span class="asset-name stock-name" role="cell">
                <strong>${escapeHtml(asset.name)}</strong>
                <span>${escapeHtml(asset.symbol)} · ${escapeHtml(asset.sector)}</span>
            </span>
            <span class="stock-price" role="cell">
                <strong>${formatPrice(asset.price)}</strong>
                <span class="change ${changeClass(asset.change_pct)}">${formatPercent(asset.change_pct)}</span>
            </span>
            ${signalCells}
            <span class="risk-value risk-${asset.indicators.volatility_risk.toLowerCase()}" role="cell">${asset.indicators.volatility_risk}</span>
        </button>
    `;
}

function bindAssetButtons() {
    document.querySelectorAll("[data-asset-id]").forEach((button) => {
        button.addEventListener("click", () => openAssetDialog(button.dataset.assetId));
    });
}

function renderAssets() {
    const assets = getFilteredAssets();
    const crypto = sortAssets(assets.filter((asset) => asset.type === "crypto"));
    const stocks = sortAssets(assets.filter((asset) => asset.type === "stock"));

    elements.cryptoGrid.innerHTML = crypto.map(renderCryptoCard).join("");
    elements.stockList.innerHTML = stocks.map(renderStockRow).join("");
    elements.cryptoGrid.closest(".asset-section").hidden = crypto.length === 0;
    elements.stockList.closest(".asset-section").hidden = stocks.length === 0;
    elements.cryptoCount.textContent = `${crypto.length} ${crypto.length === 1 ? "asset" : "assets"}`;
    elements.stockCount.textContent = `${stocks.length} ${stocks.length === 1 ? "asset" : "assets"}`;
    elements.emptyState.hidden = assets.length !== 0;
    bindAssetButtons();
}

function renderAll() {
    renderSummary();
    renderAssets();
}

function metricCard(label, value, tone = "neutral") {
    return `<span class="metric-card metric-${tone}"><span>${label}</span><strong>${value}</strong></span>`;
}

function openAssetDialog(assetId) {
    const asset = state.data.assets.find((item) => item.id === assetId);
    if (!asset) return;

    document.getElementById("dialog-type").textContent = asset.type === "crypto" ? "Digital asset analysis" : `${asset.exchange} · ${asset.sector}`;
    document.getElementById("dialog-title").textContent = asset.name;
    document.getElementById("dialog-symbol").textContent = asset.symbol;
    document.getElementById("dialog-asof").textContent = `Price as of ${dateFormatter.format(new Date(`${asset.price_as_of}T12:00:00Z`))}`;
    document.getElementById("dialog-price").textContent = formatPrice(asset.price);
    const changeElement = document.getElementById("dialog-change");
    changeElement.textContent = `${formatPercent(asset.change_pct)} latest session`;
    changeElement.className = changeClass(asset.change_pct);

    document.getElementById("dialog-signals").innerHTML = Object.entries(HORIZONS).map(([key, horizon]) => {
        const signal = asset.signals[key];
        return `
            <article class="dialog-signal">
                <span>${horizon.long}</span>
                <strong class="${signalClass(signal.label)}">${signal.label}<em>${signal.strength} strength</em></strong>
                <small>${escapeHtml(signal.summary)}</small>
            </article>
        `;
    }).join("");

    document.getElementById("dialog-metrics").innerHTML = [
        metricCard("Trend regime", asset.indicators.trend_regime, indicatorTone(asset.indicators.trend_regime)),
        metricCard("MACD", asset.indicators.macd, indicatorTone(asset.indicators.macd)),
        metricCard("Bollinger position", asset.indicators.bollinger, indicatorTone(asset.indicators.bollinger)),
        metricCard("Volatility risk", asset.indicators.volatility_risk, indicatorTone(asset.indicators.volatility_risk)),
        metricCard("14-day RSI", asset.metrics.rsi14.toFixed(1)),
        metricCard("1 month return", formatPercent(asset.metrics.return_1m), changeClass(asset.metrics.return_1m)),
        metricCard("1 year return", formatPercent(asset.metrics.return_1y), changeClass(asset.metrics.return_1y)),
        metricCard("1 year max drawdown", formatPercent(asset.metrics.max_drawdown_1y), "negative"),
    ].join("");

    elements.assetDialog.showModal();
}

function closeOnBackdrop(dialog, event) {
    const rect = dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) dialog.close();
}

function bindControls() {
    elements.search.addEventListener("input", (event) => {
        state.query = event.target.value;
        renderAssets();
    });

    elements.signalFilter.addEventListener("change", (event) => {
        state.signal = event.target.value;
        renderAssets();
    });

    elements.sortControl.addEventListener("change", (event) => {
        state.sort = event.target.value;
        renderAssets();
    });

    elements.horizonControl.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-horizon]");
        if (!button) return;
        state.horizon = button.dataset.horizon;
        elements.horizonControl.querySelectorAll("button").forEach((item) => {
            const active = item === button;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-pressed", String(active));
        });
        renderAll();
    });

    document.getElementById("dialog-close").addEventListener("click", () => elements.assetDialog.close());
    document.getElementById("methodology-button").addEventListener("click", () => elements.methodDialog.showModal());
    document.getElementById("method-close").addEventListener("click", () => elements.methodDialog.close());
    elements.assetDialog.addEventListener("click", (event) => closeOnBackdrop(elements.assetDialog, event));
    elements.methodDialog.addEventListener("click", (event) => closeOnBackdrop(elements.methodDialog, event));
}

function validatePayload(data) {
    if (!data || data.schema_version !== 2) throw new Error("Unsupported analysis schema");
    if (!Array.isArray(data.assets) || data.assets.length !== 22) throw new Error("Incomplete asset coverage");
    if (!data.data_health || data.data_health.status !== "healthy") throw new Error("Data health check failed");
    const ids = new Set();
    for (const asset of data.assets) {
        if (!asset.id || ids.has(asset.id)) throw new Error("Duplicate or missing asset id");
        ids.add(asset.id);
        if (!Number.isFinite(asset.price) || asset.price <= 0) throw new Error(`Invalid price for ${asset.symbol}`);
        if (!asset.indicators || !asset.metrics || !asset.signals) throw new Error(`Incomplete analysis for ${asset.symbol}`);
        for (const key of Object.keys(HORIZONS)) {
            const signal = asset.signals[key];
            if (!signal || !["BUY", "HOLD", "SELL"].includes(signal.label)) {
                throw new Error(`Invalid ${key} signal for ${asset.symbol}`);
            }
        }
    }
    const generated = new Date(data.generated_at);
    if (Number.isNaN(generated.getTime())) throw new Error("Invalid generation timestamp");
    return data;
}

async function fetchJson(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
        return validatePayload(await response.json());
    } finally {
        window.clearTimeout(timeout);
    }
}

function renderHealth(data) {
    const generated = new Date(data.generated_at);
    const ageHours = Math.max(0, (Date.now() - generated.getTime()) / 3_600_000);
    const isStale = ageHours > 72;
    elements.freshnessBanner.hidden = !isStale;
    if (isStale) {
        elements.status.classList.add("is-warning");
        elements.freshnessMessage.textContent = `The last successful analysis is ${Math.floor(ageHours / 24)} days old. Check the GitHub refresh workflow before relying on it.`;
    }
    elements.healthStatus.textContent = isStale ? "Refresh overdue" : "Healthy";
    elements.healthStatus.className = isStale ? "health-warning" : "health-good";
    elements.healthCoverage.textContent = `${data.data_health.asset_count}/${data.data_health.expected_asset_count} assets`;
    elements.modelVersion.textContent = "Trend + MACD v2";
    elements.universeStatus.textContent = data.universe_selection === "dynamic_market_cap" ? "Live market-cap screen" : "Continuity fallback";
    return { generated, isStale };
}

async function loadDashboard() {
    bindControls();
    try {
        const productionHosts = ["theprivilegedcompany.com", "www.theprivilegedcompany.com", "bobsnadenica.github.io"];
        const urls = productionHosts.includes(window.location.hostname)
            ? [`${PRODUCTION_DATA_URL}?v=${Date.now()}`, `data/analysis.json?v=${Date.now()}`]
            : [`data/analysis.json?v=${Date.now()}`];
        let data = null;
        let lastError = null;
        for (const url of urls) {
            try {
                data = await fetchJson(url);
                break;
            } catch (error) {
                lastError = error;
            }
        }
        if (!data) throw lastError || new Error("No market data source available");
        state.data = data;
        const { generated, isStale } = renderHealth(data);
        elements.snapshotDate.textContent = dateFormatter.format(generated);
        elements.sourceLabel.textContent = data.source;
        elements.statusText.textContent = `${data.assets.length} assets · ${isStale ? "stale" : "updated"} ${dateFormatter.format(generated)}`;
        renderAll();
    } catch (error) {
        console.error(error);
        elements.status.classList.add("is-error");
        elements.statusText.textContent = "Market snapshot unavailable";
        elements.snapshotDate.textContent = "Update required";
        elements.sourceLabel.textContent = "Run the refresh workflow";
        elements.healthStatus.textContent = "Unavailable";
        elements.healthStatus.className = "health-error";
        elements.healthCoverage.textContent = "0/22 assets";
        elements.modelVersion.textContent = "Not loaded";
        elements.universeStatus.textContent = "Not loaded";
        elements.cryptoGrid.closest(".asset-section").hidden = true;
        elements.stockList.closest(".asset-section").hidden = true;
        elements.emptyState.hidden = false;
        elements.emptyState.querySelector("strong").textContent = "The market data file could not be loaded.";
        elements.emptyState.querySelector("span").textContent = "Run the GitHub Actions refresh or the local update script.";
    }
}

loadDashboard();
