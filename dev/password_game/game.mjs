import { createRules, evaluateGame, characterCount, digitSum, uppercaseCount, MAX_INPUT } from './rules.mjs?v=20260927a';

const $ = id => document.getElementById(id);
const copy = {
  en: {
    back: '← More games', kicker: '37 rules. One very stubborn puzzle.', titleStart: 'The ', titleWord: 'Password', titleEnd: ' Game',
    intro: 'One password. A new rule every time you get it right. Keep them all happy to win.',
    label: 'Your puzzle password', placeholder: 'Start with 8 characters…', inputHelp: 'Use a made-up password. Never enter a real one.',
    reset: 'Start over', challenge: 'Next move', hint: 'Need a hint?', rules: 'Discovered rules',
    note: 'Earlier rules stay active. English words work in both languages.',
    tools: 'Insert a character', insert: 'Insert', greek: 'Greek alpha', euro: 'Euro symbol', cat: 'Cat emoji', music: 'Music emoji',
    winKicker: 'All 37. Nicely done.', winTitle: 'You made the rules agree.',
    winCopy: 'A beautifully ridiculous solution. Keep it for the puzzle, never for a real account.',
    copy: 'Copy solution', copied: 'Copied ✓', copyFailed: 'Select your solution and copy it manually.', replay: 'Play again',
    footer: 'Free to play · No account · No time limit', privacy: 'Your puzzle text is not saved or sent to a server. Only your best time and language preference are saved.',
    ctaTitle: 'Your idea could be next.', ctaCopy: 'We build games and apps. Learn to build your own with 1:1 consultations from a certified senior cloud architect.', ctaLink: 'Let’s talk',
    best: 'Best', time: 'Elapsed time', char: 'character', chars: 'characters', complete: 'Complete', passes: 'Every rule passes.',
    passed: 'passed', unlocked: 'unlocked', rule: 'Rule', of: 'of', statusPass: 'Passed', statusFail: 'Needs work',
    confirmTitle: 'Start a new game?', confirmCopy: 'This clears your current puzzle. Your best time stays.', cancel: 'Keep playing',
    won: 'You win! All 37 rules pass.', limit: 'Input limit reached. Remove some text before adding more.',
    documentTitle: 'The Password Game — The Privileged Company'
  },
  bg: {
    back: '← Още игри', kicker: '37 правила. Една упорита загадка.', titleStart: 'Играта с ', titleWord: 'паролата', titleEnd: '',
    intro: 'Една парола. Ново правило след всеки успех. Изпълнете всички едновременно, за да спечелите.',
    label: 'Вашата парола за играта', placeholder: 'Започнете с 8 символа…', inputHelp: 'Измислете парола само за играта. Никога не въвеждайте истинска.',
    reset: 'Отначало', challenge: 'Следващ ход', hint: 'Нужна е подсказка?', rules: 'Открити правила',
    note: 'Предишните правила остават в сила. Думите се пишат на английски и в двата езика.',
    tools: 'Добавяне на символ', insert: 'Добавете', greek: 'гръцка алфа', euro: 'знак за евро', cat: 'емоджи котка', music: 'музикално емоджи',
    winKicker: 'Всички 37. Браво!', winTitle: 'Всички правила са изпълнени.',
    winCopy: 'Чудесно абсурдно решение. Запазете го за играта, никога за истински профил.',
    copy: 'Копирайте решението', copied: 'Копирано ✓', copyFailed: 'Маркирайте решението и го копирайте ръчно.', replay: 'Нова игра',
    footer: 'Безплатна игра · Без регистрация · Без ограничение във времето', privacy: 'Текстът Ви не се запазва и не се изпраща към сървър. Запазват се само най-доброто Ви време и избраният език.',
    ctaTitle: 'Следващата идея може да е Вашата.', ctaCopy: 'Разработваме игри и приложения. Научете се да създавате свои с 1:1 консултации със сертифициран старши архитект на облачни решения.', ctaLink: 'Свържете се с нас',
    best: 'Рекорд', time: 'Изминало време', char: 'символ', chars: 'символа', complete: 'Готово', passes: 'Всички правила са изпълнени.',
    passed: 'изпълнени', unlocked: 'открити', rule: 'Правило', of: 'от', statusPass: 'Изпълнено', statusFail: 'За поправка',
    confirmTitle: 'Нова игра?', confirmCopy: 'Текущото решение ще се изтрие. Рекордът Ви се запазва.', cancel: 'Продължете играта',
    won: 'Победа! Всичките 37 правила са изпълнени.', limit: 'Достигнахте лимита за текст. Изтрийте част от него, за да добавите още.',
    documentTitle: 'Играта с паролата — The Privileged Company'
  }
};
const input = $('password');
const year = new Date().getFullYear();
let language = new URLSearchParams(location.search).get('lang');
if (!['en', 'bg'].includes(language)) {
  try { language = localStorage.getItem('password-game-language'); } catch { /* Optional preference. */ }
}
if (!['en', 'bg'].includes(language)) language = 'en';
let rules = createRules(language, year);
let discovered = 1;
let active = -1;
let won = false;
let startedAt = null;
let timer = null;
let best = null;
let copyTimer = null;
input.maxLength = MAX_INPUT;

const t = key => copy[language][key];
const formatTime = milliseconds => {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
try {
  const stored = Number(localStorage.getItem('password-game-best-time'));
  if (Number.isFinite(stored) && stored > 0) best = stored;
} catch { /* Play still works when storage is blocked. */ }

function renderBest() { $('bestTime').textContent = `${t('best')} ${best === null ? '—' : formatTime(best)}`; }

function setLanguage(next) {
  language = next;
  rules = createRules(language, year);
  document.documentElement.lang = language;
  document.title = t('documentTitle');
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  input.placeholder = t('placeholder');
  document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === language)));
  document.querySelectorAll('[data-insert]').forEach(button => button.setAttribute('aria-label', `${t('insert')} ${t(button.dataset.name)}`));
  $('insertTools').setAttribute('aria-label', t('tools'));
  $('timer').setAttribute('aria-label', t('time'));
  $('copyStatus').textContent = '';
  $('progress').setAttribute('aria-label', language === 'bg' ? 'Изпълнени правила' : 'Rules passed');
  $('gameShell').setAttribute('aria-label', language === 'bg' ? 'Играта с паролата' : 'The Password Game');
  $('contactLink').href = `/contact?service=App%20Building&lang=${language}`;
  $('backLink').href = `/dev?lang=${language}`;
  try { localStorage.setItem('password-game-language', language); } catch { /* Optional preference. */ }
  const url = new URL(location.href);
  url.searchParams.set('lang', language);
  history.replaceState(null, '', url);
  clearTimeout(copyTimer);
  renderBest();
  render();
  $('announcer').textContent = won ? t('won') : `${t('rule')} ${active + 1}. ${rules[active].text}`;
}

function render() {
  const result = evaluateGame(input.value, rules, discovered);
  const previousActive = active;
  discovered = result.visible;
  active = result.active;
  if (active !== previousActive) $('hint').open = false;
  const passing = result.states.slice(0, discovered).filter(Boolean).length;
  $('progress').value = passing;
  $('progressLabel').textContent = `${passing} / ${rules.length} ${t('passed')}`;
  $('summaryMeta').textContent = `${discovered} / ${rules.length} ${t('unlocked')}`;
  $('charCount').textContent = `${characterCount(input.value)} ${t(characterCount(input.value) === 1 ? 'char' : 'chars')}`;
  $('ruleNumber').textContent = won ? t('complete') : `${t('rule')} ${active + 1} ${t('of')} ${rules.length}`;
  $('ruleNumber').classList.toggle('complete', won);
  $('ruleTitle').textContent = won ? t('passes') : rules[active].text;
  $('ruleDetail').textContent = won ? `${characterCount(input.value)} ${t(characterCount(input.value) === 1 ? 'char' : 'chars')} · Σ ${digitSum(input.value)} · A–Z ${uppercaseCount(input.value)}` : rules[active].detail(input.value);
  $('hintText').textContent = rules[active].hint;
  $('hint').hidden = won;
  $('insertTools').hidden = discovered < 11 || won;
  document.querySelectorAll('[data-after]').forEach(button => { button.hidden = discovered < Number(button.dataset.after); });
  $('ruleList').replaceChildren(...rules.slice(0, discovered).map((rule, index) => {
    const item = document.createElement('li');
    item.className = `rule-item ${result.states[index] ? 'passed' : 'failed'}${index === active && !won ? ' current' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'rule-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = result.states[index] ? '✓' : '○';
    const text = document.createElement('span');
    const status = document.createElement('span');
    status.className = 'sr-only';
    status.textContent = `${result.states[index] ? t('statusPass') : t('statusFail')}: `;
    text.append(status, `${index + 1}. ${rule.text}`);
    item.append(icon, text);
    return item;
  }));
  if (result.won && !won) win();
  else if (active !== previousActive && !won) $('announcer').textContent = `${t('rule')} ${active + 1}. ${rules[active].text}`;
}

function update() {
  if (won) return;
  if (input.value && startedAt === null) {
    startedAt = performance.now();
    timer = setInterval(() => { $('timer').textContent = formatTime(performance.now() - startedAt); }, 500);
  }
  input.style.height = 'auto';
  input.style.height = `${Math.min(Math.max(input.scrollHeight, 130), 250)}px`;
  render();
}

function win() {
  won = true;
  clearInterval(timer);
  const elapsed = Math.max(1, performance.now() - (startedAt ?? performance.now()));
  $('timer').textContent = formatTime(elapsed);
  if (best === null || elapsed < best) {
    best = elapsed;
    try { localStorage.setItem('password-game-best-time', String(best)); } catch { /* Optional record. */ }
  }
  renderBest();
  input.readOnly = true;
  $('victoryPassword').textContent = input.value;
  $('victory').classList.add('visible');
  $('announcer').textContent = t('won');
  render();
  launchConfetti();
  $('victoryTitle').focus({ preventScroll: true });
  $('victory').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
}

function reset() {
  clearInterval(timer);
  clearTimeout(copyTimer);
  stopConfetti();
  discovered = 1;
  active = -1;
  won = false;
  startedAt = null;
  input.readOnly = false;
  input.value = '';
  input.style.height = '';
  $('timer').textContent = '00:00';
  $('victory').classList.remove('visible');
  $('victoryPassword').textContent = '';
  $('copyButton').textContent = t('copy');
  $('copyStatus').textContent = '';
  $('rulebook').open = false;
  render();
  input.focus();
}

async function copySolution() {
  let copied = false;
  try { await navigator.clipboard.writeText(input.value); copied = true; }
  catch {
    input.focus();
    input.select();
    try { copied = document.execCommand('copy'); } catch { /* Manual copy remains available. */ }
  }
  $('copyButton').textContent = copied ? t('copied') : t('copy');
  $('copyStatus').textContent = copied ? t('copied') : t('copyFailed');
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => { $('copyButton').textContent = t('copy'); }, 1800);
}

input.addEventListener('input', event => { if (!event.isComposing) update(); });
input.addEventListener('compositionend', update);
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language)));
document.querySelectorAll('[data-insert]').forEach(button => button.addEventListener('click', () => {
  if (won) return;
  const symbol = button.dataset.insert;
  if (input.value.length - (input.selectionEnd - input.selectionStart) + symbol.length > MAX_INPUT) {
    $('announcer').textContent = t('limit');
    return;
  }
  input.setRangeText(symbol, input.selectionStart, input.selectionEnd, 'end');
  input.focus();
  update();
}));
$('resetButton').addEventListener('click', () => {
  if (input.value && !won) $('resetDialog').showModal();
  else reset();
});
$('resetConfirm').addEventListener('click', () => { $('resetDialog').close(); reset(); });
$('resetCancel').addEventListener('click', () => $('resetDialog').close());
$('playAgainButton').addEventListener('click', reset);
$('copyButton').addEventListener('click', copySolution);

// Confetti is decorative and never required for winning.
const canvas = $('confetti');
const context = canvas.getContext('2d');
let frame = null;
function stopConfetti() {
  cancelAnimationFrame(frame);
  frame = null;
  context?.clearRect(0, 0, canvas.width, canvas.height);
}
function launchConfetti() {
  if (!context || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  stopConfetti();
  const width = innerWidth, height = innerHeight;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const particles = Array.from({ length: 90 }, () => ({ x: Math.random() * width, y: -Math.random() * height, speed: 90 + Math.random() * 130, color: ['#ffcf70', '#7ef3b2', '#9f91ff'][Math.floor(Math.random() * 3)] }));
  const start = performance.now();
  let last = start;
  const draw = now => {
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      particle.y += particle.speed * Math.min(now - last, 50) / 1000;
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, 5, 9);
    }
    last = now;
    if (now - start < 3500) frame = requestAnimationFrame(draw);
    else stopConfetti();
  };
  frame = requestAnimationFrame(draw);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopConfetti(); });
setLanguage(language);
