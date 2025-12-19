/**
 * Basic usage:
 * ```ts
 * import { run } from 'faros'
 *
 * const result = await run({
 *   targets: ['https://example.com'],
 *   profile: 'mobile'
 * })
 * ```
 */

import type { PerfConfig, Target, RunSummary, LighthouseResult, Task } from './core/types'

export interface RunOptions {
  /** URL(s) to test - can be string, string array, or Target objects */
  targets: string | string[] | Target | Target[]

  /** Profile to use for testing (default: 'default') */
  profile?: string

  /** Number of concurrent tests (default: 1) */
  concurrency?: number

  /** Maximum retries per test (default: 2) */
  maxRetries?: number

  /** Number of runs per task (default: 5) */
  runsPerTask?: number

  /** Timeout in milliseconds (default: 30000) */
  timeout?: number

  /** Performance assertions/budgets */
  assertions?:
    | {
        /** Performance score threshold (0-100) */
        performanceScore?: { min?: number; max?: number }

        /** Largest Contentful Paint in milliseconds */
        lcp?: { max?: number }

        /** Cumulative Layout Shift */
        cls?: { max?: number }

        /** First Input Delay in milliseconds */
        fid?: { max?: number }

        /** Interaction to Next Paint in milliseconds */
        inp?: { max?: number }

        /** Total Blocking Time in milliseconds */
        tbt?: { max?: number }

        /** First Contentful Paint in milliseconds */
        fcp?: { max?: number }
      }
    | {
        /** Structured assertion config with metrics and delta assertions */
        metrics?: {
          performanceScore?: { min?: number; max?: number }
          lcp?: { max?: number }
          cls?: { max?: number }
          fid?: { max?: number }
          inp?: { max?: number }
          tbt?: { max?: number }
          fcp?: { max?: number }
        }
        /** Delta-based assertions for baseline comparison */
        delta?: {
          deltaMaxPct?: number // Max % increase allowed
          deltaMin?: number // Min absolute change allowed
          deltaMaxMs?: number // Max millisecond increase for timing metrics
        }
      }

  /** Baseline configuration for regression testing */
  baseline?: PerfConfig['baseline']

  /** Progress callbacks */
  onStart?: (taskCount: number) => void
  onTaskStart?: (task: Task) => void
  onTaskComplete?: (result: LighthouseResult) => void
  onTaskFailed?: (task: Task, error: Error) => void
  onComplete?: (summary: RunSummary) => void

  /** Output options */
  includeRawLighthouse?: boolean
  quiet?: boolean
  headless?: boolean
}

/**
 * Extended options that accept full PerfConfig for advanced usage
 */
export interface RunOptionsAdvanced extends Partial<PerfConfig> {
  /** Progress callbacks */
  onStart?: (taskCount: number) => void
  onTaskStart?: (task: Task) => void
  onTaskComplete?: (result: LighthouseResult) => void
  onTaskFailed?: (task: Task, error: Error) => void
  onComplete?: (summary: RunSummary) => void
  /** Suppress non-essential output */
  quiet?: boolean
}

/**
 * Main API function
 *
 * @param options - Simple options or full config
 * @returns Promise that resolves to run summary
 */
export declare function run(options: RunOptions | RunOptionsAdvanced): Promise<RunSummary>

/**
 * Create a Target object from a URL string
 */
export declare function createTarget(url: string, options?: Partial<Target>): Target

/**
 * Create multiple targets from URL strings
 */
export declare function createTargets(urls: string[], options?: Partial<Target>): Target[]

/**
 * Validate configuration before running
 */
export declare function validateConfig(options: RunOptions | RunOptionsAdvanced): PerfConfig
