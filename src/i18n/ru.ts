/**
 * Строки интерфейса на русском. Казахский и английский словари
 * появятся в волне 6 с теми же ключами.
 */
export const ru = {
  'site.name': 'Инвариант',
  'site.description':
    'Открытое приложение для глубокого изучения алгоритмов и структур данных, баз данных и SQL, C и C++, Python и математики для информатики.',

  'nav.skip': 'Перейти к содержанию',
  'nav.main': 'Основная навигация',
  'nav.home': 'Главная',
  'nav.catalog': 'Каталог',
  'nav.search': 'Поиск',
  'nav.glossary': 'Глоссарий',
  'nav.prototypes': 'Прототипы',
  'nav.about': 'О проекте',

  'theme.button': 'Тема: {name}',
  'theme.system': 'как в системе',
  'theme.light': 'светлая',
  'theme.dark': 'тёмная',

  'preview.banner': 'Превью правки № {pr}. Это не основная версия сайта.',

  'update.ready': 'Вышла новая версия приложения. Она включится при следующем открытии.',
  'update.apply': 'Обновить сейчас',

  'footer.license': 'Код — MIT, учебный контент — CC BY-SA 4.0.',
  'footer.source': 'Исходный код на GitHub',

  'status.ready': 'готово',
  'status.next': 'в работе',

  'notFound.title': 'Страница не найдена',
  'notFound.text': 'Такой страницы нет. Возможно, адрес набран с ошибкой или страницу перенесли.',
  'notFound.home': 'На главную',
} as const;

export type MessageKey = keyof typeof ru;
