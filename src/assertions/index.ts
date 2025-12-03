/**
 * Assertions engine module
 * Handles metric threshold evaluation and assertion reporting
 */

export { AssertionEngine, createAssertionEngine } from './engine'
export type { AssertionContext, AssertionEngineEvents } from './engine'

export { AssertionConfigResolver, createAssertionConfigResolver } from './config-resolver'

export { MetricEvaluator, createMetricEvaluator } from './evaluators/metric-evaluator'
export { DeltaEvaluator, createDeltaEvaluator, InMemoryBaselineProvider } from './evaluators/delta-evaluator'
export type { BaselineProvider, BaselineContext } from './evaluators/delta-evaluator'

export type { AssertionConfig, AssertionReport, AssertionResult, DeltaAssertions } from '../core/types/assertions'
export type { MetricThresholds } from '../core/types/metrics'
