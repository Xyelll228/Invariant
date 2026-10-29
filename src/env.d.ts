interface ImportMetaEnv {
  /** Номер pull request, если собирается превью правки. */
  readonly PUBLIC_PREVIEW_PR?: string;
  /** Репозиторий на GitHub в виде «владелец/имя». */
  readonly PUBLIC_REPOSITORY?: string;
  /** «1» — показывать черновики тем: сборка для автопроверок. В превью правок черновики видны всегда. */
  readonly PUBLIC_SHOW_DRAFTS?: string;
  /** Дата сборки ГГГГ-ММ-ДД для отметки «проверено автоматически»; по умолчанию — сегодня. */
  readonly PUBLIC_BUILD_DATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    /**
     * Тема и уровень страницы, которую собирает Astro. Их читают компоненты
     * текста темы: блок (свернуть ли доказательство, кнопка «Нашёл ошибку»)
     * и код темы.
     */
    topic?: {
      id: string;
      title: string;
      level: 'fundament' | 'base' | 'depth';
      /** Папка темы относительно content/ru. */
      dir: string;
      /** Адреса темы и текущего уровня без base: к ним ведут заметки и свои карточки. */
      topicPath?: string;
      levelPath?: string;
      /** Задания уровня, которые стоят после блоков: id блока → задания. */
      byBlock?: Record<string, import('./lib/learning/question-types.ts').PreparedQuestion[]>;
      /** Тема для островов с заданиями. */
      context?: import('./lib/learning/question-types.ts').TopicContext;
      /** base сайта и адрес песочницы — для островов с заданиями. */
      base?: string;
      runnerUrl?: string;
    };
  }
}
