/**
 * Стеммер русского языка по алгоритму Snowball
 * (https://snowballstem.org/algorithms/russian/stemmer.html):
 * «сортировкой», «сортировка», «сортировки» → «сортировк».
 *
 * Свой код вместо библиотеки: готовые порты Snowball весят сотни килобайт,
 * потому что содержат все языки сразу. Совпадение с эталонной реализацией
 * проверяет модульный тест на словах из ТЗ и каталога.
 *
 * Области слова: RV — после первой гласной; R2 — после второй пары
 * «гласная, затем согласная». Все окончания ищутся внутри RV, из подходящих
 * берётся самое длинное; если его условие не выполнено, шаг не срабатывает.
 */

const VOWELS = new Set(['а', 'е', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я']);

interface Ending {
  suffix: string;
  /** Группа 1: окончание отрезается, только если перед ним «а» или «я» (они остаются). */
  afterAOrYa: boolean;
}

/** Список окончаний от длинных к коротким. */
function among(group1: readonly string[], group2: readonly string[] = []): Ending[] {
  return [...group1.map((suffix) => ({ suffix, afterAOrYa: true })), ...group2.map((suffix) => ({ suffix, afterAOrYa: false }))].sort(
    (a, b) => b.suffix.length - a.suffix.length,
  );
}

const PERFECTIVE_GERUND = among(['в', 'вши', 'вшись'], ['ив', 'ивши', 'ившись', 'ыв', 'ывши', 'ывшись']);
const ADJECTIVE = among(
  [],
  ['ее', 'ие', 'ые', 'ое', 'ими', 'ыми', 'ей', 'ий', 'ый', 'ой', 'ем', 'им', 'ым', 'ом', 'его', 'ого', 'ему', 'ому', 'их', 'ых', 'ую', 'юю', 'ая', 'яя', 'ою', 'ею'],
);
const PARTICIPLE = among(['ем', 'нн', 'вш', 'ющ', 'щ'], ['ивш', 'ывш', 'ующ']);
const REFLEXIVE = among([], ['ся', 'сь']);
const VERB = among(
  ['ла', 'на', 'ете', 'йте', 'ли', 'й', 'л', 'ем', 'н', 'ло', 'но', 'ет', 'ют', 'ны', 'ть', 'ешь', 'нно'],
  ['ила', 'ыла', 'ена', 'ейте', 'уйте', 'ите', 'или', 'ыли', 'ей', 'уй', 'ил', 'ыл', 'им', 'ым', 'ен', 'ило', 'ыло', 'ено', 'ят', 'ует', 'уют', 'ит', 'ыт', 'ены', 'ить', 'ыть', 'ишь', 'ую', 'ю'],
);
const NOUN = among(
  [],
  ['а', 'ев', 'ов', 'ие', 'ье', 'е', 'иями', 'ями', 'ами', 'еи', 'ии', 'и', 'ией', 'ей', 'ой', 'ий', 'й', 'иям', 'ям', 'ием', 'ем', 'ам', 'ом', 'о', 'у', 'ах', 'иях', 'ях', 'ы', 'ь', 'ию', 'ью', 'ю', 'ия', 'ья', 'я'],
);
const DERIVATIONAL = among([], ['ост', 'ость']);
const TIDY_UP = among([], ['ейш', 'ейше', 'н', 'ь']);

function isVowel(char: string | undefined): boolean {
  return char !== undefined && VOWELS.has(char);
}

/** Начало областей RV и R2 (индекс первой буквы области; длина слова — область пустая). */
function regions(word: string): { rv: number; r2: number } {
  const end = word.length;
  let i = 0;
  while (i < end && !isVowel(word[i])) i++;
  if (i >= end) return { rv: end, r2: end };
  const rv = i + 1;
  i = rv;
  while (i < end && isVowel(word[i])) i++;
  if (i >= end) return { rv, r2: end };
  i++;
  while (i < end && !isVowel(word[i])) i++;
  if (i >= end) return { rv, r2: end };
  i++;
  while (i < end && isVowel(word[i])) i++;
  if (i >= end) return { rv, r2: end };
  return { rv, r2: i + 1 };
}

/** Самое длинное окончание из списка, целиком лежащее не левее limit. */
function longest(word: string, limit: number, endings: readonly Ending[]): Ending | null {
  for (const ending of endings) {
    if (word.length - ending.suffix.length >= limit && word.endsWith(ending.suffix)) return ending;
  }
  return null;
}

/** Отрезает окончание из списка; null — окончания нет или не выполнено его условие. */
function cut(word: string, limit: number, endings: readonly Ending[]): string | null {
  const ending = longest(word, limit, endings);
  if (!ending) return null;
  const start = word.length - ending.suffix.length;
  if (ending.afterAOrYa) {
    const before = word[start - 1];
    if (start - 1 < limit || (before !== 'а' && before !== 'я')) return null;
  }
  return word.slice(0, start);
}

function cutAdjectival(word: string, rv: number): string | null {
  const withoutAdjective = cut(word, rv, ADJECTIVE);
  if (withoutAdjective === null) return null;
  return cut(withoutAdjective, rv, PARTICIPLE) ?? withoutAdjective;
}

/** Основа слова. Слово должно быть в нижнем регистре; «ё» считается как «е». */
export function stemRussian(input: string): string {
  let word = input.replace(/ё/g, 'е');
  const { rv, r2 } = regions(word);

  // Шаг 1: деепричастие совершенного вида — или возвратная частица и
  // окончание прилагательного (причастия), глагола или существительного.
  const gerund = cut(word, rv, PERFECTIVE_GERUND);
  if (gerund !== null) {
    word = gerund;
  } else {
    word = cut(word, rv, REFLEXIVE) ?? word;
    word = cutAdjectival(word, rv) ?? cut(word, rv, VERB) ?? cut(word, rv, NOUN) ?? word;
  }

  // Шаг 2: конечное «и».
  if (word.endsWith('и') && word.length - 1 >= rv) word = word.slice(0, -1);

  // Шаг 3: словообразовательный суффикс «ост(ь)» — только целиком в R2.
  const derivational = longest(word, rv, DERIVATIONAL);
  if (derivational && word.length - derivational.suffix.length >= r2) word = word.slice(0, -derivational.suffix.length);

  // Шаг 4: превосходная степень, двойное «н», мягкий знак.
  const tidy = longest(word, rv, TIDY_UP);
  const undoubleN = (value: string) => (value.endsWith('нн') && value.length - 2 >= rv ? value.slice(0, -1) : value);
  if (tidy?.suffix === 'ейш' || tidy?.suffix === 'ейше') word = undoubleN(word.slice(0, -tidy.suffix.length));
  else if (tidy?.suffix === 'н') word = undoubleN(word);
  else if (tidy?.suffix === 'ь') word = word.slice(0, -1);

  return word;
}
