// Mock data state
const state = {
    sp500: {
        price: 5123.45,
        change: 12.34,
        predictions: { '24h': 'BUY', '7d': 'HOLD', '1y': 'BUY' }
    },
    btc: {
        price: 64231.80,
        change: -450.20,
        predictions: { '24h': 'SELL', '7d': 'BUY', '1y': 'BUY' }
    }
};

// Formatters
const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

const cryptoFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
});

// DOM Elements
const elements = {
    sp500: {
        container: document.getElementById('sp500-card').querySelector('.price-container'),
        price: document.getElementById('sp500-price'),
        change: document.getElementById('sp500-change'),
        '24h': document.getElementById('sp500-24h'),
        '7d': document.getElementById('sp500-7d'),
        '1y': document.getElementById('sp500-1y'),
    },
    btc: {
        container: document.getElementById('btc-card').querySelector('.price-container'),
        price: document.getElementById('btc-price'),
        change: document.getElementById('btc-change'),
        '24h': document.getElementById('btc-24h'),
        '7d': document.getElementById('btc-7d'),
        '1y': document.getElementById('btc-1y'),
    }
};

function updateUI() {
    // Update S&P 500
    elements.sp500.price.textContent = usdFormatter.format(state.sp500.price);
    updateChangeElement(elements.sp500.change, state.sp500.change);
    updatePredictions('sp500');

    // Update BTC
    elements.btc.price.textContent = cryptoFormatter.format(state.btc.price);
    updateChangeElement(elements.btc.change, state.btc.change);
    updatePredictions('btc');
    
    // Trigger update animations
    elements.sp500.container.classList.remove('updating');
    elements.btc.container.classList.remove('updating');
    void elements.sp500.container.offsetWidth; // Trigger reflow
    void elements.btc.container.offsetWidth;
    elements.sp500.container.classList.add('updating');
    elements.btc.container.classList.add('updating');
}


function updateChangeElement(el, change) {
    const isUp = change >= 0;
    el.textContent = `${isUp ? '▲' : '▼'} ${Math.abs(change).toFixed(2)} (${((change/state.sp500.price)*100).toFixed(2)}%)`;
    el.className = `change ${isUp ? 'up' : 'down'}`;
}

function updatePredictions(asset) {
    const assetPredictions = state[asset].predictions;
    for (const [timeframe, signal] of Object.entries(assetPredictions)) {
        const el = elements[asset][timeframe];
        el.textContent = signal;
        el.className = `signal ${signal.toLowerCase()}`;
    }
}

function simulateMarket() {
    // Smoother price fluctuations
    const sp500Change = (Math.random() - 0.5) * 1.5;
    const btcChange = (Math.random() - 0.5) * 40;

    state.sp500.price += sp500Change;
    state.sp500.change += sp500Change;
    
    state.btc.price += btcChange;
    state.btc.change += btcChange;

    // Occasionally change predictions for "live" feel
    if (Math.random() > 0.95) {
        const signals = ['BUY', 'SELL', 'HOLD'];
        const assets = ['sp500', 'btc'];
        const timeframes = ['24h', '7d', '1y'];
        
        const randomAsset = assets[Math.floor(Math.random() * assets.length)];
        const randomTime = timeframes[Math.floor(Math.random() * timeframes.length)];
        const randomSignal = signals[Math.floor(Math.random() * signals.length)];
        
        state[randomAsset].predictions[randomTime] = randomSignal;
    }

    updateUI();
}

// Initial render
updateUI();

// Simulation loop - faster for "live" feel
setInterval(simulateMarket, 1000);

