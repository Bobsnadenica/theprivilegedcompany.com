// The same rules power both languages. No player input is stored or sent anywhere.
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
export const characters = value => Array.from(segmenter.segment(value), part => part.segment);
export const characterCount = value => characters(value).length;
export const uppercaseCount = value => (value.match(/[A-Z]/g) || []).length;
export const digitSum = value => (value.match(/[0-9]/g) || []).reduce((sum, digit) => sum + Number(digit), 0);
export const emojiCount = value => characters(value).filter(char => /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3/u.test(char)).length;
export const MAX_INPUT = 1024; // UTF-16 units, matching the native textarea maxlength.

export function isPrime(number) {
  if (!Number.isInteger(number) || number < 2) return false;
  for (let divisor = 2; divisor * divisor <= number; divisor++) {
    if (number % divisor === 0) return false;
  }
  return true;
}

export function additionMatches(value) {
  // Boundaries prevent a false match inside 1008+7=15 or 8+7=150.
  return Array.from(value.matchAll(/(?<![0-9+\-=])(\d{1,3})\+(\d{1,3})=(\d{1,4})(?![0-9+\-=])/g))
    .some(([, left, right, total]) => Number(left) + Number(right) === Number(total));
}

export function largestInteger(value) {
  return (value.match(/(?<![\d-])\d+/g) || []).reduce((largest, number) => {
    const integer = BigInt(number);
    return largest === null || integer > largest ? integer : largest;
  }, null);
}

const vowels = value => new Set((value.toLowerCase().match(/[aeiou]/g) || [])).size;
const includes = (value, word) => value.toLowerCase().includes(word);
const colors = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'pink', 'black', 'white', 'teal', 'gold', 'silver'];
const planets = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const foods = ['pizza', 'sushi', 'taco', 'burger', 'pasta', 'ramen', 'salad', 'cookie', 'cake', 'bread', 'cheese', 'waffle'];
const weather = ['rain', 'sun', 'storm', 'snow', 'fog', 'wind', 'hail', 'cloud', 'mist', 'thunder'];
const movies = ['matrix', 'shrek', 'inception', 'avatar', 'titanic', 'rocky', 'frozen', 'batman', 'dune', 'interstellar'];
const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function createRules(language = 'en', year = new Date().getFullYear()) {
  const bg = language === 'bg';
  const t = (en, bulgarian) => bg ? bulgarian : en;
  const count = (n, target, en, bulgarian) => `${n} / ${target} ${t(en, bulgarian)}`;
  const rule = (en, bulgarian, check, hintEn, hintBg, detail) => ({
    text: t(en, bulgarian), check, hint: t(hintEn, hintBg),
    detail: detail || (value => check(value) ? t('Requirement met.', 'Правилото е изпълнено.') : t('Not quite yet. A hint is here if you need it.', 'Още малко. При нужда отворете подсказката.'))
  });
  const wordRule = (en, bulgarian, words) => rule(en, bulgarian,
    value => words.some(word => includes(value, word)),
    `Accepted English words: ${words.join(', ')}. Words may overlap.`,
    `Приемат се думите на английски: ${words.join(', ')}. Думите могат да се застъпват.`,
    value => { const found = words.find(word => includes(value, word)); return found ? `${t('Found', 'Намерено')}: ${found}` : t('Use an English word. Open the hint for the full list.', 'Използвайте дума на английски. Пълният списък е в подсказката.'); });
  return [
    rule('Use at least 8 characters.', 'Използвайте поне 8 символа.', value => characterCount(value) >= 8,
      'A visible character counts once, including a joined emoji.', 'Всеки видим символ се брои веднъж, включително съставните емоджита.', value => count(characterCount(value), 8, 'characters', 'символа')),
    rule('Do not use whitespace.', 'Не използвайте интервали, табулации или нови редове.', value => !/\s/.test(value),
      'Remove spaces, tabs and line breaks. Words can run together.', 'Премахнете интервалите, табулациите и новите редове. Думите могат да са слети.'),
    rule('Include lowercase and uppercase English letters.', 'Включете малки и главни английски букви.', value => /[a-z]/.test(value) && /[A-Z]/.test(value),
      'Use at least one a–z and one A–Z.', 'Добавете поне една буква от a–z и една от A–Z.'),
    rule('Include at least one digit.', 'Включете поне една цифра.', value => /\d/.test(value),
      'Any digit from 0 to 9 counts.', 'Всяка цифра от 0 до 9 се брои.'),
    rule('Include a symbol.', 'Включете специален знак.', value => /[!@#$%^&*?+=._-]/.test(value),
      'Choose from ! @ # $ % ^ & * ? + = . _ -', 'Изберете от ! @ # $ % ^ & * ? + = . _ -'),
    rule('Make the 3rd character an English vowel.', 'Третият символ трябва да е английска гласна.', value => /^[aeiou]$/i.test(characters(value)[2] || ''),
      'Count from the start: 1, 2, then a, e, i, o or u.', 'Бройте от началото: 1, 2, после a, e, i, o или u.', value => `${t('3rd character', 'Трети символ')}: ${characters(value)[2] || '—'}`),
    rule('Make the 7th character !, @, #, $, %, ^, &, * or ?.', 'Седмият символ трябва да е !, @, #, $, %, ^, &, * или ?.', value => /^[!@#$%^&*?]$/.test(characters(value)[6] || ''),
      'Edit the seventh position; adding a symbol at the end may not help.', 'Променете седмата позиция. Знак в края невинаги помага.', value => `${t('7th character', 'Седми символ')}: ${characters(value)[6] || '—'}`),
    wordRule('Include “cat”.', 'Включете „cat“.', ['cat']),
    wordRule('Include a color in English.', 'Включете цвят на английски.', colors),
    rule(`Include the year ${year}.`, `Включете годината ${year}.`, value => value.includes(String(year)),
      `Keep all four digits together: ${year}. The year stays fixed for this round.`, `Запишете четирите цифри заедно: ${year}. Годината остава същата до края на тази игра.`),
    rule('Include an emoji.', 'Включете емоджи.', value => emojiCount(value) >= 1,
      'Use your emoji keyboard or the 😺 button. A family or flag counts as one.', 'Използвайте клавиатурата за емоджита или бутона 😺. Семейство или знаме се брои за едно.', value => `${emojiCount(value)} ${t('emoji', emojiCount(value) === 1 ? 'емоджи' : 'емоджита')}`),
    rule('Include both “bacon” and “chicken”.', 'Включете и „bacon“, и „chicken“.', value => includes(value, 'bacon') && includes(value, 'chicken'),
      'Use both English words. Capitals do not matter here.', 'Добавете и двете английски думи. Тук няма значение дали буквите са малки или главни.'),
    wordRule('Name a planet in English.', 'Назовете планета на английски.', planets),
    rule('Use at least 3 different English vowels.', 'Използвайте поне 3 различни английски гласни.', value => vowels(value) >= 3,
      'Choose three different letters from a, e, i, o, u. Repeats do not add new vowels.', 'Изберете три различни букви от a, e, i, o, u. Повторенията не добавят нова гласна.', value => count(vowels(value), 3, 'different vowels', 'различни гласни')),
    rule('Include a lowercase Greek letter.', 'Включете малка гръцка буква.', value => /[α-ω]/u.test(value),
      'Try α, β or γ. The α button inserts a Greek alpha.', 'Опитайте α, β или γ. Бутонът α добавя гръцката буква алфа.'),
    wordRule('Include a food word in English.', 'Включете храна на английски.', foods),
    wordRule('Include “coffee” or “tea”.', 'Включете „coffee“ или „tea“.', ['coffee', 'tea']),
    wordRule('Include a weather word in English.', 'Включете дума за времето на английски.', weather),
    wordRule('Mention a movie title in English.', 'Включете заглавие на филм на английски.', movies),
    wordRule('Include laughter: “haha” or “lol”.', 'Добавете смях: „haha“ или „lol“.', ['haha', 'lol']),
    wordRule('Include a weekday in English.', 'Включете ден от седмицата на английски.', weekdays),
    rule('Include a hashtag made of English letters.', 'Включете хаштаг с английски букви.', value => /#[a-z]+/i.test(value),
      'Use # followed by letters, for example #hello.', 'Добавете # и английски букви, например #hello.'),
    rule('Include the uppercase signal “SOS”.', 'Включете сигнала „SOS“ с главни букви.', value => value.includes('SOS'),
      'All three letters must be uppercase.', 'И трите букви трябва да са главни.'),
    rule('Include an uppercase Roman numeral.', 'Включете римска цифра с главна буква.', value => /[IVXLCDM]/.test(value),
      'Any one of I, V, X, L, C, D or M works.', 'Всяка от буквите I, V, X, L, C, D или M върши работа.'),
    rule('Include $, €, £ or ¥.', 'Включете $, €, £ или ¥.', value => /[$€£¥]/u.test(value),
      'One currency symbol is enough. The € button can help.', 'Един валутен знак е достатъчен. Бутонът € може да помогне.'),
    wordRule('Include “www.”.', 'Включете „www.“.', ['www.']),
    rule('Include a doubled lowercase English letter.', 'Включете две еднакви малки английски букви една до друга.', value => /([a-z])\1/.test(value),
      'For example, ee in coffee. The letters must be adjacent.', 'Например ee в coffee. Буквите трябва да са една до друга.'),
    rule('Use exactly two emoji.', 'Използвайте точно две емоджита.', value => emojiCount(value) === 2,
      'Two visible emoji, not three. A joined family, skin tone or flag still counts as one.', 'Две видими емоджита, не три. Семейство, емоджи с цвят на кожата или знаме се брои за едно.', value => count(emojiCount(value), 2, 'emoji', 'емоджита')),
    wordRule('Include “rules”.', 'Включете „rules“.', ['rules']),
    rule('Include a correct addition, such as 8+7=15.', 'Включете вярно равенство със събиране, например 8+7=15.', additionMatches,
      'Use a+b=c with no spaces. Each added number has 1–3 digits. Separate the equation from other numbers with a letter or #.', 'Използвайте a+b=c без интервали. Всяко събираемо има 1–3 цифри. Отделете равенството от други числа с буква или #.'),
    rule('Include “404”.', 'Включете „404“.', value => value.includes('404'),
      'Three digits together. Error not found.', 'Трите цифри трябва да са една до друга. Грешката не е намерена.'),
    rule('Include a whole number greater than 9000.', 'Включете цяло число, по-голямо от 9000.', value => (largestInteger(value) ?? 0n) > 9000n,
      'Keep its digits together. 9000 itself is not enough.', 'Запишете цифрите му заедно. Самото 9000 не е достатъчно.', value => `${t('Largest digit group', 'Най-голяма група цифри')}: ${largestInteger(value) ?? '—'}`),
    rule('Include a 3-letter English palindrome.', 'Включете палиндром от 3 английски букви.', value => /([a-z])[a-z]\1/i.test(value),
      'Three letters that read the same backwards, such as eve or aba.', 'Три букви, които се четат еднакво и наобратно, например eve или aba.'),
    rule('Start and end with the same English letter.', 'Започнете и завършете с една и съща английска буква.', value => {
      const chars = characters(value);
      return chars.length > 1 && /^[a-z]$/i.test(chars[0]) && chars[0].toLowerCase() === chars.at(-1).toLowerCase();
    }, 'A and a count as the same letter here.', 'Тук A и a се броят за една и съща буква.', value => { const chars = characters(value); return `${t('First', 'Първи')}: ${chars[0] || '—'} · ${t('Last', 'Последен')}: ${chars.at(-1) || '—'}`; }),
    rule('Use exactly 8 uppercase English letters.', 'Използвайте точно 8 главни английски букви.', value => uppercaseCount(value) === 8,
      'SOS already uses three. Change the case of other letters without removing needed words.', 'SOS вече използва три. Заменяйте малки букви с главни или обратно, без да премахвате нужните думи.', value => count(uppercaseCount(value), 8, 'uppercase letters', 'главни букви')),
    rule('Make all the digits add up to exactly 69.', 'Сборът на всички цифри трябва да е точно 69.', value => digitSum(value) === 69,
      'Add individual digits: 404 contributes 8. The year and every digit in the equation count too. Try changing the large number.', 'Събирайте отделните цифри: 404 добавя 8. Годината и всички цифри в равенството също се броят. Опитайте да промените голямото число.', value => count(digitSum(value), 69, 'digit sum', 'сбор на цифрите')),
    rule('Finish with a prime number of characters.', 'Броят на символите трябва да е просто число.', value => isPrime(characterCount(value)),
      'A prime has only two divisors: 1 and itself. Add lowercase filler before the last letter. Nearby primes: 113, 127, 131, 137, 139, 149.', 'Простото число има само два делителя: 1 и себе си. Добавете малки букви преди последната. Близки прости числа: 113, 127, 131, 137, 139, 149.', value => `${characterCount(value)} ${t('characters', 'символа')} · ${isPrime(characterCount(value)) ? t('prime ✓', 'просто число ✓') : t('not prime', 'не е просто число')}`)
  ];
}

export function evaluateGame(value, rules, discovered = 1) {
  const states = rules.map(rule => value.length <= MAX_INPUT && rule.check(value));
  let visible = Math.max(1, Math.min(rules.length, discovered));
  while (visible < rules.length && states.slice(0, visible).every(Boolean)) visible++;
  const invalid = states.slice(0, visible).findIndex(state => !state);
  return { states, visible, active: invalid < 0 ? visible - 1 : invalid, won: states.every(Boolean) };
}

// Constructive proof used by the regression check, never displayed as a hint.
export function buildWinningSolution(year = new Date().getFullYear()) {
  const largeNumbers = new Map();
  for (let number = 9001; number <= 9999; number++) {
    largeNumbers.set(digitSum(String(number)), number);
  }
  for (let left = 1; left <= 99; left++) {
    for (let right = 1; right <= 99; right++) {
      const equation = `${left}+${right}=${left + right}`;
      const number = largeNumbers.get(69 - digitSum(String(year)) - 8 - digitSum(equation));
      if (number === undefined) continue;
      const core = `abaxyz!ABCDEcatgreen${year}😺baconchickenvenusαsushicoffeefogshreklolmonday#winningSOS$www.🎵rules${equation}#404#${number}`;
      let solution = `${core}a`;
      while (!isPrime(characterCount(solution))) solution = `${solution.slice(0, -1)}xa`;
      if (evaluateGame(solution, createRules('en', year)).won) return solution;
    }
  }
  throw new Error(`No verified solution for ${year}`);
}
