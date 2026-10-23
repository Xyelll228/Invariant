/**
 * Компоненты, которые можно использовать в текстах тем (файлы уровней .mdx).
 * Проверка контента не пропустит неизвестный компонент: при сборке страницы
 * темы он сломал бы рендер. Сами компоненты передаются в <Content components>
 * из src/content/mdx-components.ts.
 */
export const MDX_COMPONENTS = ['Block', 'TraceSteps', 'ArrayTrace', 'ArraySimulation'] as const;
