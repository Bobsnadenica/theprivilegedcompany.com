import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createState, demoState, validateState } from '../src/model.js';
import { goalSummary } from '../src/goals.js';

globalThis.location = { search: '?lang=en' };
globalThis.localStorage = { getItem: () => null };

// Exercise the actual HTML renderers in Node. Only browser stylesheet imports
// are removed; data calculations, translations, icons, and markup stay intact.
async function rendererModule(name, dependencies = {}) {
  const url = new URL(`../src/${name}`, import.meta.url);
  let source = await readFile(url, 'utf8');
  source = source.replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
  source = source.replace(/(['"])(\.\/[^'"]+\.js)\1/g, (_, quote, relative) =>
    `${quote}${dependencies[relative] || new URL(relative, url).href}${quote}`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const villageModule = await rendererModule('village.js');
const adventureModule = await rendererModule('adventure.js', { './village.js': villageModule });
const { adventureHTML } = await import(adventureModule);
const { goalDraft, goalEditorHTML } = await import(await rendererModule('goal-editor.js', { './adventure.js': adventureModule }));
const { holdingPreviewHTML } = await import(await rendererModule('wealth.js'));
const { money } = await import('../src/i18n.js');
const render = (state = demoState('2026-10-01'), options) => adventureHTML(validateState(state), options);
const tags = html => [...html.matchAll(/<[a-z][^>]*>/g)].map(match => match[0]);
const withAttribute = (html, name, value) => tags(html).filter(tag => tag.includes(` ${name}="${value}"`));

test('the primary 3D hero appears before the goal portfolio and the optional journey', () => {
  const html = render();
  const hero = tags(html).find(tag => /class="[^"]*\badventure-hero\b/.test(tag));
  assert.ok(hero, 'The adventure opens with its primary village hero');
  const village = html.indexOf('id="village-view"');
  const portfolioTag = tags(html).find(tag => /class="[^\"]*\bportfolio\b/.test(tag));
  const portfolio = html.indexOf(portfolioTag);
  const journey = html.indexOf('journey-journal');
  assert.ok(village >= 0 && village < portfolio, 'The 3D village precedes the financial cards');
  assert.ok(portfolio < journey, 'The illustrated journey remains secondary');
});

test('one fund and one companion remain visible without duplicate DOM identifiers', () => {
  const html = render();
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(withAttribute(html, 'id', 'goal-balance').length, 1);
  assert.equal(withAttribute(html, 'id', 'companion-button').length, 1);
  assert.equal(withAttribute(html, 'id', 'companion-speech').length, 1);
  const companion = withAttribute(html, 'id', 'companion-button')[0];
  assert.match(companion, /type="button"/);
  assert.match(companion, /aria-label="[^"]+"/);
});

test('the native journey disclosure starts closed and retains all six checkpoints', () => {
  const html = render();
  const journey = tags(html).find(tag => /^<details\b/.test(tag) && /class="[^"]*\bjourney-journal\b/.test(tag));
  assert.ok(journey);
  assert.doesNotMatch(journey, /\sopen(?:\s|=|>)/);
  const checkpoints = tags(html).filter(tag => tag.includes('data-action="landmark"'));
  const checkpointIds = new Set(checkpoints.map(tag => tag.match(/data-id="(\d+)"/)?.[1]));
  assert.deepEqual([...checkpointIds].sort(), ['0', '1', '2', '3', '4', '5']);
  assert.ok(checkpoints.every(tag => /type="button"/.test(tag) && /aria-label="[^"]+"/.test(tag)));
});

test('the displayed fund remains exact for a real shared balance and a deficit', () => {
  for (const deficit of [false, true]) {
    const state = demoState('2026-10-01');
    if (deficit) {
      state.opening = 0;
      state.entries = [{ id: 'deficit', type: 'expense', amount: 1299,
        category: 'other', essential: false, note: '', date: '2026-10-01' }];
    }
    const html = render(state), total = goalSummary(state);
    const displayed = html.match(/\sid="goal-balance"[^>]*>([^<]+)</)?.[1];
    assert.equal(displayed, money(total.balance, state.profile.currency));
  }
});

test('custom goal and companion names are escaped in the premium adventure', () => {
  const state = demoState('2026-10-01');
  state.profile.name = '<img src=x onerror=x>';
  state.goals[0].title = 'Wedding & friends <night>';
  const html = render(state);
  assert.ok(html.includes('&lt;img src=x onerror=x&gt;'));
  assert.ok(html.includes('Wedding &amp; friends &lt;night&gt;'));
  assert.doesNotMatch(html, /<img src=x|<night>/);
});

test('the hero keeps twelve keyboard-accessible village blueprints without replacing entry actions', () => {
  const html = render();
  const blueprints = tags(html).filter(tag => /data-village-inspect="\d+"/.test(tag));
  assert.equal(blueprints.length, 12);
  assert.ok(blueprints.every(tag => /type="button"/.test(tag) && /aria-label="[^"]+"/.test(tag)));
  for (const action of ['add-income', 'add-expense']) {
    const controls = tags(html).filter(tag => tag.includes(`data-action="${action}"`));
    assert.ok(controls.length > 0);
    assert.ok(controls.every(tag => /type="button"/.test(tag)));
  }
});

test('initial currency selection locks when a restored adventure contains cash records or wealth', () => {
  const date = '2026-10-01';
  const editor = state => goalEditorHTML(validateState(state), goalDraft(state), false);
  const empty = createState(date);
  assert.doesNotMatch(withAttribute(editor(empty), 'id', 'currency')[0], /\sdisabled(?:\s|>)/);
  for (const addMoney of [
    state => { state.entries.push({ id: 'income', type: 'income', category: 'income', amount: 1, date, note: '' }); },
    state => { state.holdings.push({ id: 'holding', kind: 'stock', name: 'Owned shares', symbol: 'TEST', openingQuantity: '1', price: '1', valuedAt: date }); },
    state => { state.liabilities.push({ id: 'debt', name: 'Loan', amount: 1 }); },
  ]) {
    const restored = createState(date); addMoney(restored);
    assert.match(withAttribute(editor(restored), 'id', 'currency')[0], /\sdisabled(?:\s|>)/);
    assert.equal(restored.profile.currency, 'EUR', 'Rendering never relabels existing financial records');
  }
});

test('a holding mark preview includes traded units without changing saved holdings or settlements', () => {
  const state = createState('2026-10-01'); state.opening = 100000;
  state.holdings = [{ id: 'stock', kind: 'stock', name: 'Shares', symbol: 'TEST',
    openingQuantity: '2.5', price: '20', valuedAt: '2026-10-01' }];
  state.investmentTrades = [
    { id: 'buy', holdingId: 'stock', side: 'buy', quantity: '0.5', amount: 1000, date: '2026-10-01' },
    { id: 'sale', holdingId: 'stock', side: 'sell', quantity: '1', amount: 2200, date: '2026-10-01' },
  ];
  validateState(state); const original = structuredClone(state);
  assert.ok(holdingPreviewHTML(state, { id: 'stock', mode: 'edit', quantity: '2.5', price: '25' }).includes(money(5000, 'EUR')),
    'The preview marks the two units currently held, including past settlements');
  assert.ok(holdingPreviewHTML(state, { id: 'stock', mode: 'edit', quantity: '3', price: '25' }).includes(money(6250, 'EUR')),
    'An opening quantity correction also retains recorded buys and sales');
  assert.ok(holdingPreviewHTML(state, { quantity: '3', price: '25' }).includes(money(7500, 'EUR')),
    'An unrecorded owned position uses its own entered quantity');
  assert.deepEqual(state, original, 'Previewing a mark never commits a financial change');
});
