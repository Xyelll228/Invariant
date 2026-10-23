/** Соответствие имён компонентов в текстах тем и их реализаций. */
import ArraySimulationBlock from '../components/content/ArraySimulationBlock.astro';
import ArrayTraceBlock from '../components/content/ArrayTraceBlock.astro';
import Block from '../components/content/Block.astro';
import TraceSteps from '../components/content/TraceSteps.astro';
import type { MDX_COMPONENTS } from './components.ts';

export const mdxComponents = {
  Block,
  TraceSteps,
  ArrayTrace: ArrayTraceBlock,
  ArraySimulation: ArraySimulationBlock,
} satisfies Record<(typeof MDX_COMPONENTS)[number], unknown>;
