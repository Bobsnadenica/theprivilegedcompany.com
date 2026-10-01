import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, validateState, summarize, csv, uuid } from '../src/model.js';
import { CATEGORY_ICONS, normalizeCategoryName, categoryOptions, categoryById } from '../src/categories.js';

const date = '2026-10-01';
const custom = (name = 'Pets') => ({ id: `custom-${uuid()}`, name, icon: 'health', color: '#7ca184' });
const expense = (category, amount, entryDate = date, essential = false) => ({ id: uuid(), type: 'expense', amount,
  category, note: '', date: entryDate, essential });

test('category options keep builtins translated by id and expose custom labels and safe visuals', () => {
  const state = createState(date); state.customCategories.push(custom()); validateState(state);
  const options = categoryOptions(state);
  assert.equal(options.length, 12); assert.equal(CATEGORY_ICONS.length, 11);
  assert.deepEqual(options[0], { id: 'housing', name: null, icon: 'housing', color: '#b79977', essential: true, custom: false });
  const added = options[11];
  assert.deepEqual(added, { ...state.customCategories[0], essential: false, custom: true });
  assert.deepEqual(categoryById(state, added.id), added);
  assert.equal(categoryById(state, '__proto__'), null); assert.equal(categoryById(state, 'not-present'), null);
});

test('monthly spending keeps every custom category and essential override without mixing months', () => {
  const state = createState(date), pets = custom('Pets'), garden = custom('Garden');
  state.customCategories = [pets, garden];
  state.entries = [expense(pets.id, 1234, date, true), expense(pets.id, 100), expense(garden.id, 2222),
    expense('groceries', 555), expense(pets.id, 90000, '2026-09-30', true)];
  validateState(state);
  const october = summarize(state, '2026-10'), september = summarize(state, '2026-09');
  assert.deepEqual(october.categories, { [pets.id]: 1334, [garden.id]: 2222, groceries: 555 });
  assert.equal(october.expense, 4111); assert.equal(october.essentials, 1234); assert.equal(october.flexible, 2877);
  assert.equal(september.expense, 90000); assert.equal(state.entries[0].essential, true);
});

test('custom category names reject duplicates after trimming, case folding, and Unicode normalization', () => {
  assert.equal(normalizeCategoryName('  PETS '), 'pets'); assert.equal(normalizeCategoryName('ХРАНА'), 'храна');
  for (const names of [['Pets', ' pets '], ['Храна', 'ХРАНА'], ['Café', 'Cafe\u0301']]) {
    const state = createState(date); state.customCategories = names.map(name => custom(name));
    assert.throws(() => validateState(state), /invalidSave/);
  }
});

test('custom category backups reject unsafe colors, icons, names, IDs, and duplicate identifiers', () => {
  const original = createState(date); original.customCategories = [custom()];
  for (const change of [
    state => { delete state.customCategories; }, state => { state.customCategories = {}; },
    state => { state.customCategories[0].name = ' '; }, state => { state.customCategories[0].name = 'x'.repeat(33); },
    state => { state.customCategories[0].id = 'custom-not-a-uuid'; }, state => { state.customCategories[0].id = 'groceries'; },
    state => { state.customCategories[0].icon = '<svg onload=alert(1)>'; },
    state => { state.customCategories[0].color = 'url(https://example.com)'; },
    state => { state.customCategories[0].color = '#123456;background:red'; },
    state => { state.customCategories.push({ ...state.customCategories[0], name: 'Another name' }); },
    state => { state.customCategories = Array.from({ length: 31 }, (_, i) => custom(`Category ${i}`)); },
  ]) {
    const state = structuredClone(original); change(state);
    assert.throws(() => validateState(state), /invalidSave/);
  }
});

test('unknown or removed custom categories cannot leave orphaned expenses in a backup', () => {
  const state = createState(date), category = custom(); state.customCategories = [category];
  state.entries = [expense(category.id, 100)]; validateState(state);
  state.customCategories = []; assert.throws(() => validateState(state), /invalidSave/);
  state.entries[0].category = '__proto__'; assert.throws(() => validateState(state), /invalidSave/);
});

test('JSON backup preserves custom names; CSV uses stable category IDs and neutralizes formulas', () => {
  const state = createState(date), category = custom('=HYPERLINK("bad")');
  state.customCategories = [category]; state.entries = [expense(category.id, 1299)];
  state.entries[0].note = '=HYPERLINK("bad")';
  const loaded = validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(loaded.customCategories, state.customCategories); assert.deepEqual(loaded.entries, state.entries);
  const output = csv(state, '2026-10');
  assert.ok(output.includes(category.id)); assert.match(output, /'\=HYPERLINK\(""bad""\)/); assert.match(output, /12\.99/);
});
