import { NormalizedMetrics, MetricThresholds } from '../../core/types/metrics'
import { AssertionResult } from '../../core/types/assertions'
import { logger } from '../../logger'

/**
 * Evaluates individual metric values against configured thresholds
 *
 * Supports all core Web Vitals and Lighthouse metrics:
 * - LCP (Largest Contentful Paint)
 * - CLS (Cumulative Layout Shift)
 * - FID (First Input Delay)
 * - INP (Interaction to Next Paint)
 * - TBT (Total Blocking Time)
 * - FCP (First Contentful Paint)
 * - Performance Score (0-100)
 */
export class MetricEvaluator {
  /**
   * Evaluate all configured metrics against their thresholds
   */
  async evaluate(metrics: NormalizedMetrics, thresholds: MetricThresholds): Promise<AssertionResult[]> {
    const results: AssertionResult[] = []

    // Evaluate each metric that has both a value and configured threshold
    if (metrics.lcp !== undefined && thresholds.lcp) {
      results.push(this.evaluateMetric('lcp', metrics.lcp, thresholds.lcp))
    }

    if (metrics.cls !== undefined && thresholds.cls) {
      results.push(this.evaluateMetric('cls', metrics.cls, thresholds.cls))
    }

    if (metrics.fid !== undefined && thresholds.fid) {
      results.push(this.evaluateMetric('fid', metrics.fid, thresholds.fid))
    }

    if (metrics.inp !== undefined && thresholds.inp) {
      results.push(this.evaluateMetric('inp', metrics.inp, thresholds.inp))
    }

    if (metrics.tbt !== undefined && thresholds.tbt) {
      results.push(this.evaluateMetric('tbt', metrics.tbt, thresholds.tbt))
    }

    if (metrics.fcp !== undefined && thresholds.fcp) {
      results.push(this.evaluateMetric('fcp', metrics.fcp, thresholds.fcp))
    }

    if (metrics.performanceScore !== undefined && thresholds.performanceScore) {
      results.push(this.evaluateMetric('performanceScore', metrics.performanceScore, thresholds.performanceScore))
    }

    logger.debug(`Metric evaluation complete: ${results.length} metrics evaluated`)

    return results
  }

  /**
   * Evaluate a single metric against min/max thresholds
   */
  private evaluateMetric(
    metricName: string,
    actualValue: number,
    threshold: { min?: number; max?: number },
  ): AssertionResult {
    const failures: string[] = []
    let passed = true

    // Check minimum threshold
    if (threshold.min !== undefined && actualValue < threshold.min) {
      passed = false
      failures.push(`below minimum threshold of ${threshold.min}`)
    }

    // Check maximum threshold
    if (threshold.max !== undefined && actualValue > threshold.max) {
      passed = false
      failures.push(`above maximum threshold of ${threshold.max}`)
    }

    const result: AssertionResult = {
      metric: metricName,
      passed,
      actual: actualValue,
      expected: {
        min: threshold.min,
        max: threshold.max,
      },
    }

    // Add details for failures
    if (!passed) {
      result.details = `${metricName} = ${actualValue} is ${failures.join(' and ')}`
    }

    logger.debug(`Metric ${metricName}: ${actualValue} -> ${passed ? 'PASS' : 'FAIL'}`, {
      actual: actualValue,
      expected: threshold,
      passed,
    })

    return result
  }
}

export function createMetricEvaluator(): MetricEvaluator {
  return new MetricEvaluator()
}
