import test from 'node:test';
import assert from 'node:assert/strict';
import { createRules, evaluateGame, buildWinningSolution, characters, characterCount, emojiCount, digitSum, uppercaseCount, additionMatches, largestInteger, isPrime, MAX_INPUT } from './rules.mjs';

test('every rule accepts a valid example and rejects an invalid one in both languages', () => {
  const examples = [
    ['abcdefgh', 'abcdefg'], ['abc', 'abc\n'], ['aB', 'аб'], ['a0', 'abc'], ['a!', 'abc'],
    ['aba', 'abb'], ['abcdef!', 'abcdef.'], ['Cat', 'dog'], ['GREEN', 'cyan'], ['2026', '2025'],
    ['🇧🇬', ':)'], ['baconCHICKEN', 'bacon'], ['venus', 'pluto'], ['aEi', 'aaaa'], ['α', 'Α'],
    ['sushi', 'water'], ['coffee', 'water'], ['rain', 'rock'], ['shrek', 'home'], ['LOL', 'ha'],
    ['monday', 'day'], ['#hello', '#123'], ['SOS', 'sos'], ['V', 'v'], ['€', 'USD'],
    ['www.', 'www'], ['coffee', 'cofEe'], ['😺🎵', '😺'], ['RULES', 'rule'], ['8+7=15', '8+7=14'],
    ['404', '403'], ['9001', '9000'], ['eve', 'abc'], ['abA', 'ab'],
    ['ABCDEFGH', 'ABCDEFG'], ['99999996', '99999995'], ['abcde', 'abcd']
  ];
  for (const language of ['en', 'bg']) {
    const rules = createRules(language, 2026);
    assert.equal(rules.length, 37);
    examples.forEach(([pass, fail], index) => {
      assert.equal(rules[index].check(pass), true, `${language} rule ${index + 1}: ${pass}`);
      assert.equal(rules[index].check(fail), false, `${language} rule ${index + 1}: ${fail}`);
      assert.ok(rules[index].text && rules[index].hint && rules[index].detail(pass));
    });
  }
});

test('construct a winning solution for every year 2000–2100, in English and Bulgarian', () => {
  for (let year = 2000; year <= 2100; year++) {
    const solution = buildWinningSolution(year);
    assert.ok(solution.length < MAX_INPUT);
    assert.equal(uppercaseCount(solution), 8);
    assert.equal(digitSum(solution), 69);
    assert.equal(emojiCount(solution), 2);
    assert.equal(isPrime(characterCount(solution)), true);
    for (const language of ['en', 'bg']) {
      const result = evaluateGame(solution, createRules(language, year));
      assert.equal(result.won, true, `${language} ${year}`);
      assert.equal(result.visible, 37);
    }
  }
});

test('sequential discovery, regressions and recovery preserve the challenge', () => {
  const rules = createRules('en', 2026);
  let state = evaluateGame('', rules);
  assert.equal(state.visible, 1);
  state = evaluateGame('abcdefgh', rules, state.visible);
  assert.equal(state.visible, 3);
  assert.equal(state.active, 2);
  state = evaluateGame('Abcdefgh', rules, state.visible);
  assert.equal(state.visible, 4);
  state = evaluateGame('a', rules, state.visible);
  assert.equal(state.visible, 4);
  assert.equal(state.active, 0);
  assert.equal(state.won, false);
  const solution = buildWinningSolution(2026);
  state = evaluateGame(solution, rules, state.visible);
  assert.equal(state.won, true);
  state = evaluateGame(solution.replace('SOS', 'sos'), rules, state.visible);
  assert.equal(state.won, false);
  assert.equal(state.active, 22);
  assert.equal(state.visible, 37);
  assert.equal(evaluateGame(solution, rules, state.visible).won, true);
});

test('flags, families, skin tones, keycaps and combined letters count as visible characters', () => {
  for (const emoji of ['😺', '🎵', '🇧🇬', '🇬🇧', '👨‍👩‍👧‍👦', '👍🏽', '1️⃣', '#️⃣']) {
    assert.equal(characterCount(emoji), 1, emoji);
    assert.equal(emojiCount(emoji), 1, emoji);
    assert.equal(emojiCount(`${emoji}😺`), 2, emoji);
  }
  assert.equal(characterCount('e\u0301'), 1);
  assert.equal(emojiCount('hello 1 #'), 0);
  assert.deepEqual(characters('a🇧🇬e👨‍👩‍👧‍👦12!'), ['a', '🇧🇬', 'e', '👨‍👩‍👧‍👦', '1', '2', '!']);
  const rules = createRules();
  assert.equal(rules[5].check('a🇧🇬e'), true);
  assert.equal(rules[6].check('a🇧🇬e👨‍👩‍👧‍👦12!'), true);
});

test('equations cannot pass using a correct-looking fragment of incorrect math', () => {
  for (const value of ['8+7=15', '#12+9=21#', 'abc999+999=1998x', '01+2=3', '8+7=14#3+2=5']) assert.equal(additionMatches(value), true, value);
  for (const value of ['1008+7=15', '8+7=150', '8+7=15+1', '-8+7=15', '8+-7=1', '8+7=14', '8 + 7 = 15', '1+1=1+1=2']) assert.equal(additionMatches(value), false, value);
});

test('large integers and hostile oversized input do not crash validation', () => {
  assert.equal(largestInteger('none'), null);
  assert.equal(largestInteger('-9001'), null);
  assert.equal(largestInteger('00009001#2026'), 9001n);
  assert.equal(largestInteger('9'.repeat(500)), BigInt('9'.repeat(500)));
  const rules = createRules();
  assert.equal(evaluateGame('9'.repeat(MAX_INPUT + 1), rules).won, false);
  assert.equal(evaluateGame('<img src=x onerror=alert(1)>', rules).won, false);
});

test('all final constraints remain active after discovery', () => {
  const rules = createRules('en', 2026);
  const solution = buildWinningSolution(2026);
  const changes = [
    value => value.replace('🎵', ''), value => value.replace('ABCDE', 'ABCDef'),
    value => value.replace('#404', '#405'), value => `${value.slice(0, -1)}b`,
    value => `${value.slice(0, -1)}xa`, value => `${value} `
  ];
  for (const change of changes) assert.equal(evaluateGame(change(solution), rules, 37).won, false);
});
