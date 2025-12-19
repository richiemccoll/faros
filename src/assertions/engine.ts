import { EventEmitter } from 'events'
import { Task, LighthouseResult } from '../core/types/execution'
import { AssertionConfig, AssertionReport, AssertionResult } from '../core/types/assertions'
import { NormalizedMetrics } from '../core/types/metrics'
import { Target } from '../core/types/target'
import { logger } from '../logger'
import { MetricEvaluator, createMetricEvaluator } from './evaluators/metric-evaluator'
import { AssertionConfigResolver, createAssertionConfigResolver } from './config-resolver'
import { DeltaEvaluator, createDeltaEvaluator, BaselineProvider } from './evaluators/delta-evaluator'

export interface AssertionEngineEvents {
  evaluationStart: (taskId: string, target: Target) => void
  evaluationComplete: (report: AssertionReport) => void
  evaluationError: (taskId: string, error: Error) => void
}

export interface AssertionContext {
  task: Task
  lighthouseResult: LighthouseResult
  config: AssertionConfig
  baseline?: Record<string, number> // Optional baseline metrics for delta comparisons
}

/**
 * Main assertions engine that orchestrates metric evaluation against thresholds
 *
 * Responsibilities:
 * - Coordinate evaluation of metrics against configured thresholds
 * - Handle precedence resolution (global → tag → target overrides)
 * - Support delta-based assertions with baseline comparison
 * - Generate structured assertion reports
 */
export class AssertionEngine extends EventEmitter {
  private metricEvaluator: MetricEvaluator
  private configResolver: AssertionConfigResolver
  private deltaEvaluator: DeltaEvaluator

  constructor(baselineProvider?: BaselineProvider) {
    super()
    this.metricEvaluator = createMetricEvaluator()
    this.configResolver = createAssertionConfigResolver()
    this.deltaEvaluator = createDeltaEvaluator(baselineProvider)
  }

  /**
   * Evaluate assertions for a completed lighthouse result
   */
  async evaluate(context: AssertionContext): Promise<AssertionReport> {
    const { task, lighthouseResult, config } = context
    const taskId = task.id
    const target = task.target

    logger.debug(`Starting assertion evaluation for task ${task.target.url}`)
    this.emit('evaluationStart', taskId, target)

    try {
      const resolvedConfig = await this.resolveAssertionConfig(config, target)

      const results: AssertionResult[] = await this.evaluateMetrics(
        lighthouseResult.metrics,
        resolvedConfig,
        context.baseline,
      )

      const report: AssertionReport = {
        taskId,
        target,
        results,
        passed: results.every((result) => result.passed),
        failureCount: results.filter((result) => !result.passed).length,
      }

      logger.debug(
        `Assertion evaluation complete for task ${task.target.url}: ${report.passed ? 'PASSED' : 'FAILED'} ` +
          `(${report.results.length - report.failureCount}/${report.results.length} assertions passed)`,
      )

      this.emit('evaluationComplete', report)
      return report
    } catch (error) {
      const evaluationError = error instanceof Error ? error : new Error(String(error))
      logger.error(`Assertion evaluation failed for task ${target.url}:`, evaluationError)
      this.emit('evaluationError', taskId, evaluationError)

      // Return a failed report with error details
      return {
        taskId,
        target,
        results: [
          {
            metric: 'evaluation_error',
            passed: false,
            details: `Evaluation failed: ${evaluationError.message}`,
          },
        ],
        passed: false,
        failureCount: 1,
      }
    }
  }

  private async resolveAssertionConfig(config: AssertionConfig, target: Target): Promise<AssertionConfig> {
    return this.configResolver.resolve(config, target)
  }

  /**
   * Evaluate all metrics against resolved thresholds
   */
  private async evaluateMetrics(
    metrics: NormalizedMetrics,
    config: AssertionConfig,
    baseline?: Record<string, number>,
  ): Promise<AssertionResult[]> {
    const results: AssertionResult[] = []

    logger.debug('Evaluating metrics against thresholds')

    // Evaluate basic metric thresholds
    if (config.metrics) {
      const metricResults = await this.metricEvaluator.evaluate(metrics, config.metrics)
      results.push(...metricResults)
    }

    // Evaluate delta-based assertions if baseline and delta config are available
    if (baseline && config.delta) {
      const deltaResults = await this.deltaEvaluator.evaluate(metrics, baseline, config.delta)
      results.push(...deltaResults)
    }

    return results
  }
}

export function createAssertionEngine(baselineProvider?: BaselineProvider): AssertionEngine {
  return new AssertionEngine(baselineProvider)
}
