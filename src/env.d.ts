interface ImportMetaEnv {
  /** Номер pull request, если собирается превью правки. */
  readonly PUBLIC_PREVIEW_PR?: string;
  /** Репозиторий на GitHub в виде «владелец/имя». */
  readonly PUBLIC_REPOSITORY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
