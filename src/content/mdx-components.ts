/** Соответствие имён компонентов в текстах тем и их реализаций. */
import ArraySimulationBlock from '../components/content/ArraySimulationBlock.astro';
import ArrayTraceBlock from '../components/content/ArrayTraceBlock.astro';
import Block from '../components/content/Block.astro';
import Doubling from '../components/content/Doubling.astro';
import Formula from '../components/content/Formula.astro';
import Term from '../components/content/Term.astro';
import TopicCode from '../components/content/TopicCode.astro';
import TraceSteps from '../components/content/TraceSteps.astro';
import VariantCounts from '../components/content/VariantCounts.astro';
import type { MDX_COMPONENTS } from './components.ts';

export const mdxComponents = {
  Block,
  Term,
  TopicCode,
  TraceSteps,
  ArrayTrace: ArrayTraceBlock,
  ArraySimulation: ArraySimulationBlock,
  Formula,
  Doubling,
  VariantCounts,
} satisfies Record<(typeof MDX_COMPONENTS)[number], unknown>;
