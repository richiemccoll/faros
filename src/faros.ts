import { createRunner } from './core/runner'
import type { PerfConfig, Target, RunSummary, Task, MetricThresholds } from './core/types'
import type { RunOptions, RunOptionsAdvanced } from './api'
import { randomUUID } from 'crypto'

/**
 * Examples:
 * ```ts
 * // Simple usage
 * const result = await run({ targets: 'https://example.com' })
 *
 * // Multiple targets with assertions
 * const result = await run({
 *   targets: ['https://example.com', 'https://github.com'],
 *   profile: 'mobile',
 *   assertions: { lcp: { max: 2500 }, performanceScore: { min: 80 } }
 * })
 *
 * // With progress callbacks
 * const result = await run({
 *   targets: 'https://example.com',
 *   onTaskComplete: (result) => console.log('Completed:', result.target.url)
 * })
 * ```
 */
export async function run(options: RunOptions | RunOptionsAdvanced): Promise<RunSummary> {
  const config = convertOptionsToConfig(options)

  const runner = createRunner(config, { quiet: options.quiet })

  setupCallbacks(runner, options)

  try {
    const summary = await runner.run()
    return summary
  } finally {
    await runner.stop()
  }
}

/**
 * Create a Target object from a URL string
 */
export function createTarget(url: string, options: Partial<Target> = {}): Target {
  const urlObj = new URL(url)
  const defaultName = urlObj.hostname + urlObj.pathname

  return {
    id: options.id || randomUUID(),
    name: options.name || defaultName,
    url,
    tags: options.tags || [],
    ...options,
  }
}

/**
 * Create multiple targets from URL strings
 */
export function createTargets(urls: string[], options: Partial<Target> = {}): Target[] {
  return urls.map((url) => createTarget(url, options))
}

/**
 * Validate and convert options to PerfConfig
 */
export function validateConfig(options: RunOptions | RunOptionsAdvanced): PerfConfig {
  return convertOptionsToConfig(options)
}

/**
 * Convert simplified options to full PerfConfig
 */
function convertOptionsToConfig(options: RunOptions | RunOptionsAdvanced): PerfConfig {
  // Check if this is already a full config (has targets array with Target objects)
  if ('targets' in options && Array.isArray(options.targets) && options.targets.length > 0) {
    const firstTarget = options.targets[0]
    if (typeof firstTarget === 'object' && 'id' in firstTarget && 'url' in firstTarget) {
      // This looks like RunOptionsAdvanced with Target objects
      return options as PerfConfig
    }
  }

  const runOptions = options as RunOptions

  // Convert targets to Target objects
  let targets: Target[]
  if (typeof runOptions.targets === 'string') {
    targets = [createTarget(runOptions.targets)]
  } else if (Array.isArray(runOptions.targets)) {
    targets = runOptions.targets.map((target) => (typeof target === 'string' ? createTarget(target) : target))
  } else {
    targets = [runOptions.targets as Target]
  }

  const config: PerfConfig = {
    targets,
    defaultProfile: runOptions.profile || 'default',
    concurrency: runOptions.concurrency || 1,
    maxRetries: runOptions.maxRetries || 2,
    timeout: runOptions.timeout || 30000,
    plugins: [],
  }

  if (runOptions.assertions) {
    const metrics: Partial<MetricThresholds> = {}

    // Convert simple assertions to metrics format
    const assertions = runOptions.assertions
    if (assertions.performanceScore) {
      metrics.performanceScore = assertions.performanceScore
    }
    if (assertions.lcp) {
      metrics.lcp = assertions.lcp
    }
    if (assertions.cls) {
      metrics.cls = assertions.cls
    }
    if (assertions.fid) {
      metrics.fid = assertions.fid
    }
    if (assertions.inp) {
      metrics.inp = assertions.inp
    }
    if (assertions.tbt) {
      metrics.tbt = assertions.tbt
    }
    if (assertions.fcp) {
      metrics.fcp = assertions.fcp
    }

    config.assertions = { metrics }
  }

  // Add output config if needed
  if (runOptions.includeRawLighthouse) {
    config.output = {
      dir: './perf-results',
      formats: ['cli'],
      includeRawLighthouse: true,
    }
  }

  return config
}

/**
 * Set up event callbacks from options
 */
function setupCallbacks(runner: ReturnType<typeof createRunner>, options: RunOptions | RunOptionsAdvanced): void {
  if ('onStart' in options && options.onStart) {
    runner.on('runStart', options.onStart)
  }

  if ('onTaskStart' in options && options.onTaskStart) {
    runner.on('taskStart', options.onTaskStart)
  }

  if ('onTaskComplete' in options && options.onTaskComplete) {
    runner.on('taskComplete', options.onTaskComplete)
  }

  if ('onTaskFailed' in options && options.onTaskFailed) {
    runner.on('taskFailed', (task: Task, error: Error) => {
      options.onTaskFailed!(task, error)
    })
  }

  if ('onComplete' in options && options.onComplete) {
    runner.on('runComplete', options.onComplete)
  }
}
