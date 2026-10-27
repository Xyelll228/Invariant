/**
 * Каталог для страниц сайта: файлы каталога читаются при сборке через Vite.
 * Скрипты проверки читают те же файлы с диска (scripts/check-content.ts).
 */
import catalogMarkdown from '../../docs/catalog.md?raw';
import modulesYaml from '../../content/modules.yaml?raw';
import topicsYaml from '../../content/topics.yaml?raw';
import { modulesById, parseCatalog, topicsById } from './catalog.ts';
import { sectionFolders } from './paths.ts';

export const catalog = parseCatalog(catalogMarkdown, modulesYaml, topicsYaml);
export const catalogModules = modulesById(catalog);
export const catalogTopics = topicsById(catalog);
export const folders = sectionFolders(catalog);
