import { RunSummary } from '../../core/types/reporting'
import { NormalizedMetrics } from '../../core/types/metrics'
import { AssertionResult } from '../../core/types/assertions'

export interface JSONReporterOptions {
  includeRawLighthouse?: boolean
  prettyPrint?: boolean
}

/**
 * JSON schema for machine-readable performance test reports
 */
export interface JSONReport {
  // Run metadata
  run: {
    id: string
    startTime: string // ISO string
    endTime: string // ISO string
    duration: number // milliseconds
    passed: boolean
    totalTasks: number
    completedTasks: number
    failedTasks: number
  }

  // Per-target results with assertions and deltas
  targets: Array<{
    id: string
    url: string
    name?: string
    tags?: string[]
    profile: string
    status: 'passed' | 'failed' | 'error'
    error?: string

    // Core performance metrics
    metrics?: NormalizedMetrics

    // Assertion results with deltas
    assertions: {
      passed: boolean
      failureCount: number
      results: Array<{
        metric: string
        passed: boolean
        actual?: number
        expected?: {
          min?: number
          max?: number
        }
        // Delta information for baseline comparison
        delta?: {
          baseline?: number
          change: number
          changePct: number
        }
        details?: string
      }>
    }

    // Raw Lighthouse result (optional, can be large)
    lighthouse?: unknown
  }>

  // Future extension points (empty for now but ready for Phase 7)
  journeys: Array<{
    id: string
    name?: string
    steps: string[] // target IDs
    metrics?: NormalizedMetrics
    assertions?: {
      passed: boolean
      results: AssertionResult[]
    }
  }>

  // Future extension points (empty for now but ready for Phase 7)
  environments: Array<{
    name: string
    targets: string[] // target IDs in this environment
    comparisons?: Array<{
      baseline: string
      current: string
      deltas: Record<string, number>
    }>
  }>

  // Metadata
  meta: {
    version: string
    generatedAt: string // ISO string
    generator: string
  }
}

/**
 * JSON Reporter that outputs machine-readable performance results
 * Designed for CI tools, dashboards, and automated processing
 */
export class JSONReporter {
  private options: Required<JSONReporterOptions>

  constructor(options: JSONReporterOptions = {}) {
    this.options = {
      includeRawLighthouse: options.includeRawLighthouse ?? false,
      prettyPrint: options.prettyPrint ?? false,
    }
  }

  generate(summary: RunSummary): string {
    const report = this.createReport(summary)

    if (this.options.prettyPrint) {
      return JSON.stringify(report, null, 2)
    }

    return JSON.stringify(report)
  }

  async writeFile(summary: RunSummary, filePath: string): Promise<void> {
    const fs = await import('fs/promises')
    const content = this.generate(summary)
    await fs.writeFile(filePath, content, 'utf-8')
  }

  private createReport(summary: RunSummary): JSONReport {
    // Generate a simple run ID based on timestamp
    const runId = `run-${summary.startTime.getTime()}`

    return {
      run: {
        id: runId,
        startTime: summary.startTime.toISOString(),
        endTime: summary.endTime.toISOString(),
        duration: summary.duration,
        passed: summary.passed,
        totalTasks: summary.totalTasks,
        completedTasks: summary.completedTasks,
        failedTasks: summary.failedTasks,
      },

      targets: summary.taskResults.map((taskResult) => {
        const { task, lighthouseResult, assertionReport, error } = taskResult

        // Determine status
        let status: 'passed' | 'failed' | 'error'
        if (error) {
          status = 'error'
        } else if (assertionReport && !assertionReport.passed) {
          status = 'failed'
        } else {
          status = 'passed'
        }

        const targetReport: JSONReport['targets'][0] = {
          id: task.id,
          url: task.target.url,
          name: task.target.name,
          tags: task.target.tags,
          profile: task.profile.id,
          status,
          error,

          // Include metrics if available
          metrics: lighthouseResult?.metrics,

          // Include assertion results
          assertions: {
            passed: assertionReport?.passed ?? true,
            failureCount: assertionReport?.failureCount ?? 0,
            results: assertionReport?.results ?? [],
          },
        }

        // Include raw Lighthouse data if requested
        if (this.options.includeRawLighthouse && lighthouseResult?.raw) {
          targetReport.lighthouse = lighthouseResult.raw
        }

        return targetReport
      }),

      // Empty for now
      journeys: [],

      // Empty for now
      environments: [],

      meta: {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        generator: 'faros-json-reporter',
      },
    }
  }
}
