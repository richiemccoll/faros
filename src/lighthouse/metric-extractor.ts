import type { Result } from 'lighthouse'
import type { NormalizedMetrics } from '../core/types'

/**
 * Lighthouse audit IDs for Core Web Vitals and performance metrics
 */
export const LIGHTHOUSE_AUDIT_IDS = {
  LCP: 'largest-contentful-paint',
  CLS: 'cumulative-layout-shift',
  FID: 'max-potential-fid',
  INP: 'interaction-to-next-paint',
  TBT: 'total-blocking-time',
  FCP: 'first-contentful-paint',
} as const

export const LIGHTHOUSE_PERFORMANCE_CATEGORY = 'performance'

export interface MetricExtractionOptions {
  /** Whether to include raw Lighthouse data in results */
  includeRawData?: boolean
  customAuditMappings?: Record<string, string>
}

export class MetricExtractionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message)
    this.name = 'MetricExtractionError'
  }
}

export class MetricExtractor {
  private options: Required<MetricExtractionOptions>

  constructor(options: MetricExtractionOptions = {}) {
    this.options = {
      includeRawData: false,
      customAuditMappings: {},
      ...options,
    }
  }

  extract(lhr: Result): NormalizedMetrics {
    try {
      if (!lhr || !lhr.audits) {
        throw new MetricExtractionError('Invalid Lighthouse result: missing audits data')
      }

      const metrics: NormalizedMetrics = {}

      // Extract Core Web Vitals
      metrics.lcp = this.extractMetricValue(lhr, LIGHTHOUSE_AUDIT_IDS.LCP)
      metrics.cls = this.extractMetricValue(lhr, LIGHTHOUSE_AUDIT_IDS.CLS)
      metrics.fid = this.extractMetricValue(lhr, LIGHTHOUSE_AUDIT_IDS.FID)
      metrics.inp = this.extractMetricValue(lhr, LIGHTHOUSE_AUDIT_IDS.INP)
      metrics.tbt = this.extractMetricValue(lhr, LIGHTHOUSE_AUDIT_IDS.TBT)
      metrics.fcp = this.extractMetricValue(lhr, LIGHTHOUSE_AUDIT_IDS.FCP)

      metrics.performanceScore = this.extractPerformanceScore(lhr)

      return metrics
    } catch (error) {
      throw new MetricExtractionError(
        `Failed to extract metrics from Lighthouse result: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      )
    }
  }

  private extractMetricValue(lhr: Result, auditId: string): number | undefined {
    const mappedAuditId = this.options.customAuditMappings[auditId] || auditId
    const audit = lhr.audits[mappedAuditId]

    if (!audit) {
      // Audit not found - this is normal for some metrics
      return undefined
    }

    // Lighthouse audits can have different value formats
    if (typeof audit.numericValue === 'number') {
      return audit.numericValue
    }

    if (typeof audit.displayValue === 'string') {
      // Try to parse numeric value from display string (e.g., "1.2 s" -> 1200)
      const numericMatch = audit.displayValue.match(/^([\d.]+)/)

      if (numericMatch && numericMatch[1]) {
        let value = parseFloat(numericMatch[1])

        // Convert time units to milliseconds if needed
        if (audit.displayValue.includes(' s')) {
          value *= 1000 // seconds to milliseconds
        }

        return value
      }
    }

    return undefined
  }

  private extractPerformanceScore(lhr: Result): number | undefined {
    if (!lhr.categories || !lhr.categories[LIGHTHOUSE_PERFORMANCE_CATEGORY]) {
      return undefined
    }

    const performanceCategory = lhr.categories[LIGHTHOUSE_PERFORMANCE_CATEGORY]

    if (typeof performanceCategory.score === 'number') {
      // Lighthouse scores are 0-1, convert to 0-100
      return Math.round(performanceCategory.score * 100)
    }

    return undefined
  }

  validateMetrics(metrics: NormalizedMetrics): boolean {
    if (metrics.cls !== undefined && (metrics.cls < 0 || metrics.cls > 1)) {
      return false // CLS should be 0-1
    }

    if (metrics.performanceScore !== undefined && (metrics.performanceScore < 0 || metrics.performanceScore > 100)) {
      return false // Performance score should be 0-100
    }

    // Time-based metrics should be positive
    const timeMetrics = [metrics.lcp, metrics.fid, metrics.inp, metrics.tbt, metrics.fcp]
    for (const metric of timeMetrics) {
      if (metric !== undefined && metric < 0) {
        return false
      }
    }

    return true
  }
}

export function createMetricExtractor(options?: MetricExtractionOptions): MetricExtractor {
  return new MetricExtractor(options)
}
