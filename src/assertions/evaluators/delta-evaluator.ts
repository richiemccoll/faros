import { NormalizedMetrics } from '../../core/types/metrics'
import { DeltaAssertions, AssertionResult } from '../../core/types/assertions'
import { logger } from '../../logger'

/**
 * Baseline provider interface for extensible baseline sources
 */
export interface BaselineProvider {
  /**
   * Get baseline metrics for comparison
   * @param context - Context for baseline lookup (target info, environment, etc.)
   * @returns Baseline metrics or undefined if no baseline available
   */
  getBaseline(context: BaselineContext): Promise<Record<string, number> | undefined>
}

export interface BaselineContext {
  targetId: string
  targetUrl: string
  tags?: string[]
  environment?: string
  profile?: string
}

/**
 * Simple in-memory baseline provider for testing and simple use cases
 */
export class InMemoryBaselineProvider implements BaselineProvider {
  private baselines = new Map<string, Record<string, number>>()

  async getBaseline(context: BaselineContext): Promise<Record<string, number> | undefined> {
    const key = this.getBaselineKey(context)
    return this.baselines.get(key)
  }

  /**
   * Set a baseline for testing purposes
   */
  setBaseline(context: BaselineContext, metrics: Record<string, number>): void {
    const key = this.getBaselineKey(context)
    this.baselines.set(key, { ...metrics })
    logger.debug(`Baseline set for key: ${key}`, { metrics })
  }

  private getBaselineKey(context: BaselineContext): string {
    // Create a composite key from context
    return `${context.targetId}:${context.profile || 'default'}`
  }
}

/**
 * Evaluates metrics against baseline values using delta assertions
 *
 * Supports different delta comparison modes:
 * - deltaMaxPct: Maximum percentage increase allowed (e.g., "LCP can't increase by more than 10%")
 * - deltaMin: Minimum absolute improvement required (e.g., "Performance score must improve by at least 5 points")
 * - deltaMaxMs: Maximum millisecond increase for timing metrics (e.g., "LCP can't increase by more than 200ms")
 */
export class DeltaEvaluator {
  constructor(private baselineProvider?: BaselineProvider) {}

  /**
   * Evaluate metrics against baseline using delta assertions
   */
  async evaluate(
    metrics: NormalizedMetrics,
    baseline: Record<string, number>,
    deltaAssertions: DeltaAssertions,
    context?: BaselineContext,
  ): Promise<AssertionResult[]> {
    const results: AssertionResult[] = []

    logger.debug('Starting delta evaluation', {
      metricsCount: Object.keys(metrics).length,
      baselineMetrics: Object.keys(baseline).length,
      deltaRules: Object.keys(deltaAssertions).length,
    })

    // Get baseline from provider if not provided directly
    let effectiveBaseline = baseline
    if ((!effectiveBaseline || Object.keys(effectiveBaseline).length === 0) && this.baselineProvider && context) {
      const providerBaseline = await this.baselineProvider.getBaseline(context)
      if (providerBaseline) {
        effectiveBaseline = providerBaseline
        logger.debug('Using baseline from provider', { baseline: providerBaseline })
      }
    }

    if (!effectiveBaseline || Object.keys(effectiveBaseline).length === 0) {
      logger.debug('No baseline available for delta evaluation')
      return results
    }

    // Evaluate each metric that exists in both current and baseline
    for (const [metricName, currentValue] of Object.entries(metrics)) {
      if (currentValue === undefined) continue

      const baselineValue = effectiveBaseline[metricName]
      if (baselineValue === undefined) continue

      const deltaResult = this.evaluateMetricDelta(metricName, currentValue, baselineValue, deltaAssertions)
      if (deltaResult) {
        results.push(deltaResult)
      }
    }

    logger.debug(`Delta evaluation complete: ${results.length} delta assertions evaluated`)

    return results
  }

  /**
   * Evaluate a single metric's delta against assertions
   */
  private evaluateMetricDelta(
    metricName: string,
    currentValue: number,
    baselineValue: number,
    deltaAssertions: DeltaAssertions,
  ): AssertionResult | null {
    const change = currentValue - baselineValue
    const changePct = baselineValue !== 0 ? (change / baselineValue) * 100 : 0

    const failures: string[] = []
    let passed = true

    // Check percentage-based delta
    if (deltaAssertions.deltaMaxPct !== undefined && changePct > deltaAssertions.deltaMaxPct) {
      passed = false
      failures.push(`increased by ${changePct.toFixed(1)}% (max allowed: ${deltaAssertions.deltaMaxPct}%)`)
    }

    // Check minimum improvement requirement
    if (deltaAssertions.deltaMin !== undefined && change < deltaAssertions.deltaMin) {
      passed = false
      failures.push(`improved by ${change.toFixed(1)} (min required: ${deltaAssertions.deltaMin})`)
    }

    // Check millisecond-based delta for timing metrics
    if (deltaAssertions.deltaMaxMs !== undefined && change > deltaAssertions.deltaMaxMs) {
      passed = false
      failures.push(`increased by ${change.toFixed(1)}ms (max allowed: ${deltaAssertions.deltaMaxMs}ms)`)
    }

    // Only return a result if there were delta assertions to check
    if (
      deltaAssertions.deltaMaxPct !== undefined ||
      deltaAssertions.deltaMin !== undefined ||
      deltaAssertions.deltaMaxMs !== undefined
    ) {
      const result: AssertionResult = {
        metric: `${metricName}_delta`,
        passed,
        actual: currentValue,
        delta: {
          baseline: baselineValue,
          change,
          changePct,
        },
      }

      if (!passed) {
        result.details = `${metricName} delta violation: ${failures.join(' and ')}`
      }

      logger.debug(
        `Delta ${metricName}: ${baselineValue} → ${currentValue} (${changePct.toFixed(1)}%) -> ${passed ? 'PASS' : 'FAIL'}`,
      )

      return result
    }

    return null
  }
}

export function createDeltaEvaluator(baselineProvider?: BaselineProvider): DeltaEvaluator {
  return new DeltaEvaluator(baselineProvider)
}
