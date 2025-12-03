import { AssertionConfig } from '../core/types/assertions'
import { MetricThresholds } from '../core/types/metrics'
import { Target } from '../core/types/target'
import { logger } from '../logger'

/**
 * Resolves assertion configuration with proper precedence:
 * 1. Start with global config.metrics
 * 2. Apply tag-based overrides (config.tags)
 * 3. Apply target-specific overrides (config.targets)
 *
 * Later overrides take precedence and merge deeply with earlier configs.
 */
export class AssertionConfigResolver {
  /**
   * Resolve final assertion config for a specific target
   */
  resolve(config: AssertionConfig, target: Target): AssertionConfig {
    logger.debug(`Resolving assertion config for target ${target.id}`)

    let resolvedMetrics: MetricThresholds = { ...config.metrics }

    // Apply tag-based overrides
    if (config.tags && target.tags) {
      for (const tag of target.tags) {
        const tagOverrides = config.tags[tag]
        if (tagOverrides) {
          logger.debug(`Applying tag-based override for tag: ${tag}`)
          resolvedMetrics = this.mergeMetricThresholds(resolvedMetrics, tagOverrides)
        }
      }
    }

    // Apply target-specific overrides (highest priority)
    if (config.targets) {
      const targetOverrides = config.targets[target.id]
      if (targetOverrides) {
        logger.debug(`Applying target-specific override for target: ${target.id}`)
        resolvedMetrics = this.mergeMetricThresholds(resolvedMetrics, targetOverrides)
      }
    }

    const resolved: AssertionConfig = {
      ...config,
      metrics: resolvedMetrics,
    }

    logger.debug('Config resolution complete')

    return resolved
  }

  /**
   * Deep merge metric thresholds with override taking precedence
   */
  private mergeMetricThresholds(base: MetricThresholds, override: MetricThresholds): MetricThresholds {
    const merged: MetricThresholds = { ...base }

    // Merge each metric threshold, with override values taking precedence
    if (override.lcp) {
      merged.lcp = { ...merged.lcp, ...override.lcp }
    }

    if (override.cls) {
      merged.cls = { ...merged.cls, ...override.cls }
    }

    if (override.fid) {
      merged.fid = { ...merged.fid, ...override.fid }
    }

    if (override.inp) {
      merged.inp = { ...merged.inp, ...override.inp }
    }

    if (override.tbt) {
      merged.tbt = { ...merged.tbt, ...override.tbt }
    }

    if (override.fcp) {
      merged.fcp = { ...merged.fcp, ...override.fcp }
    }

    if (override.performanceScore) {
      merged.performanceScore = { ...merged.performanceScore, ...override.performanceScore }
    }

    return merged
  }
}

export function createAssertionConfigResolver(): AssertionConfigResolver {
  return new AssertionConfigResolver()
}
