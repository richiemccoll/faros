import { EventEmitter } from 'events'
import { Task, LighthouseResult } from './types/execution'
import { Target, ProfileRef, PerfConfig } from './types'
import { AssertionReport } from './types/assertions'
import { RunSummary } from './types/reporting'
import { Scheduler, createScheduler, SchedulerConfig } from './scheduler'
import { LighthouseLauncher, createLighthouseLauncher } from '../lighthouse/launcher'
import { MetricExtractor, createMetricExtractor } from '../lighthouse/metric-extractor'
import { ProfileRegistry } from '../lighthouse/profile-registry'
import { AssertionEngine, createAssertionEngine, AssertionContext } from '../assertions/engine'
import { ReportCollector, TaskResult } from '../reporting/report-collector'
import { resolveBaseline, getBaselineMetrics, ResolvedBaseline } from './utils/resolve-baseline'
import { mergeAuthConfig } from './utils/merge-auth-config'
import { validateAuthEnvVars } from './utils/resolve-auth'
import { calculateMedianMetrics } from './utils/calculate-median-metrics'
import { logger } from '../logger'

export interface RunnerEvents {
  runStart: (taskCount: number) => void
  taskStart: (task: Task) => void
  taskComplete: (result: LighthouseResult, assertions: AssertionReport) => void
  taskFailed: (task: Task, error: Error, willRetry: boolean) => void
  taskRetry: (task: Task, attempt: number) => void
  runComplete: (summary: RunSummary) => void
  runError: (error: Error) => void
}

/**
 * Main runner that orchestrates the scheduler and lighthouse launcher
 */
export interface RunnerOptions {
  quiet?: boolean
}

export class Runner extends EventEmitter {
  private scheduler: Scheduler
  private lighthouseLauncher: LighthouseLauncher
  private metricExtractor: MetricExtractor
  private profileRegistry: ProfileRegistry
  private assertionEngine: AssertionEngine
  private reportCollector: ReportCollector
  private resolvedBaseline: ResolvedBaseline | null = null
  private config: PerfConfig
  private quiet: boolean
  // Track results by logical task ID for median calculation
  private logicalTaskResults = new Map<string, LighthouseResult[]>()
  private logicalTasksCompleted = new Set<string>()
  // Track which logical tasks have been started (for event emission)
  private logicalTasksStarted = new Set<string>()

  constructor(config: PerfConfig, options: RunnerOptions = {}) {
    super()
    this.config = config
    this.quiet = options.quiet ?? false

    const schedulerConfig: SchedulerConfig = {
      concurrency: config.concurrency,
      maxRetries: config.maxRetries,
      timeout: config.timeout,
    }
    this.scheduler = createScheduler(schedulerConfig)

    // Initialize lighthouse launcher in headless mode for CI/automated environments
    this.lighthouseLauncher = createLighthouseLauncher(
      {
        headless: this.config.headless, // By default, we run in headless mode for performance and CI compatibility
        logLevel: 'error', // Keep quiet during runs
        timeout: config.timeout, // Use timeout from config
      },
      config.concurrency,
    )

    this.metricExtractor = createMetricExtractor({
      includeRawData: config.output?.includeRawLighthouse ?? false,
    })

    this.profileRegistry = new ProfileRegistry(config.profiles)

    this.assertionEngine = createAssertionEngine()

    this.reportCollector = new ReportCollector()

    this.setupEventForwarding()

    this.scheduler.setTaskHandler(this.executeTask.bind(this))
  }

  /**
   * Run performance tests for all targets
   */
  async run(): Promise<RunSummary> {
    try {
      // Clear logical task tracking state
      this.logicalTaskResults.clear()
      this.logicalTasksCompleted.clear()
      this.logicalTasksStarted.clear()

      if (this.config.baseline) {
        this.resolvedBaseline = await resolveBaseline(this.config.baseline, process.cwd())

        if (this.resolvedBaseline) {
          if (!this.quiet) {
            logger.info(`📊 Loaded baseline file - version:${this.resolvedBaseline.data.version})`)
          }
        }
      }

      const tasksByProfile = this.generateTasksByProfile()

      if (tasksByProfile.size === 0) {
        throw new Error('No tasks generated from configuration')
      }
      // Calculate total logical tasks (user-visle task count)
      const logicalTaskIds = new Set<string>()

      Array.from(tasksByProfile.values()).forEach((tasks) => {
        tasks.forEach((task) => logicalTaskIds.add(task.logicalTaskId))
      })

      const totalLogicalTasks = logicalTaskIds.size

      if (!this.quiet) {
        logger.info(
          `Starting performance test run with ${totalLogicalTasks} task(s) across ${tasksByProfile.size} profile(s)`,
        )
      }
      this.emit('runStart', totalLogicalTasks)

      // Execute tasks sequentially by profile, but in parallel within each profile
      for (const [profileId, tasks] of tasksByProfile) {
        if (!this.quiet) {
          logger.info(`🔧 Starting profile: ${profileId} (${tasks.length} task(s))`)
        }

        // Reset scheduler for this profile group
        this.scheduler.stop()
        this.scheduler.addTasks(tasks)

        await this.scheduler.run()

        if (!this.quiet) {
          logger.info(`✅ Completed profile: ${profileId}`)
        }
      }

      this.reportCollector.completeRun()
      const summary = this.reportCollector.getSummary()

      if (!this.quiet) {
        logger.info(`🏁 Performance test run completed. ${totalLogicalTasks} task(s) processed`)
      }
      this.emit('runComplete', summary)

      return summary
    } catch (error) {
      const runError = error instanceof Error ? error : new Error(String(error))
      logger.error('Performance test run failed:', runError)
      this.emit('runError', runError)
      throw runError
    }
  }

  async stop(): Promise<void> {
    this.scheduler.stop()
    await this.lighthouseLauncher.cleanup()
  }

  getRunSummary(): RunSummary {
    return this.reportCollector.getSummary()
  }

  getReportCollector(): ReportCollector {
    return this.reportCollector
  }

  private async executeTask(task: Task): Promise<LighthouseResult> {
    const taskStartTime = new Date()

    const taskResult: TaskResult = {
      task,
      startTime: taskStartTime,
    }

    try {
      const profile = this.profileRegistry.getProfile(task.profile.id)

      const mergedAuthConfig = mergeAuthConfig(profile.auth, task.target.auth)

      // Validate environment variables if auth config is present
      if (mergedAuthConfig) {
        const authEnvVars = validateAuthEnvVars(mergedAuthConfig)

        if (!authEnvVars.valid) {
          throw new Error(
            `Missing required environment variables for authentication: ${authEnvVars.missingVars.join(', ')}`,
          )
        }
      }

      const lighthouseResult = await this.lighthouseLauncher.run(task.target, profile, mergedAuthConfig)

      const metrics = this.metricExtractor.extract(lighthouseResult.lhr)

      // Validate that we got usable metrics - if not, treat as a failure to trigger retry
      if (!this.metricExtractor.validateMetrics(metrics) || metrics.performanceScore === undefined) {
        throw new Error('no usable metrics (N/A result)')
      }

      const result: LighthouseResult = {
        taskId: task.id,
        target: task.target,
        profile: task.profile,
        metrics,
        duration: Date.now() - taskStartTime.getTime(),
        timestamp: new Date(),
        raw: this.config.output?.includeRawLighthouse ? lighthouseResult.lhr : undefined,
      }

      if (!this.logicalTaskResults.has(task.logicalTaskId)) {
        this.logicalTaskResults.set(task.logicalTaskId, [])
      }

      this.logicalTaskResults.get(task.logicalTaskId)!.push(result)

      // Check if all runs for this logical task are complete
      const allResults = this.logicalTaskResults.get(task.logicalTaskId)!
      if (allResults.length === this.config.runsPerTask && !this.logicalTasksCompleted.has(task.logicalTaskId)) {
        // All runs complete - calculate median and emit
        this.logicalTasksCompleted.add(task.logicalTaskId)

        const medianMetrics = calculateMedianMetrics(allResults.map((r) => r.metrics))
        const durations = allResults.map((r) => r.duration).sort((a, b) => a - b)
        const medianDuration =
          durations.length % 2 === 0
            ? (durations[durations.length / 2 - 1]! + durations[durations.length / 2]!) / 2
            : durations[Math.floor(durations.length / 2)]!

        // Create median result using the logical task ID as the task ID
        const medianResult: LighthouseResult = {
          taskId: task.logicalTaskId,
          target: task.target,
          profile: task.profile,
          metrics: medianMetrics,
          duration: medianDuration,
          timestamp: new Date(), // Use current timestamp for final result
          raw: this.config.output?.includeRawLighthouse ? allResults[0]?.raw : undefined,
        }

        taskResult.lighthouseResult = medianResult
        taskResult.endTime = new Date()

        let assertionReport: AssertionReport | undefined

        if (this.config.assertions) {
          assertionReport = await this.evaluateAssertions(task, medianResult)
          taskResult.assertionReport = assertionReport
        }

        this.reportCollector.addTaskResult(taskResult)

        // Emit the logical task completion event
        this.emit('taskComplete', medianResult, assertionReport || ({} as AssertionReport))

        // Return the median result so the scheduler reports completion
        return medianResult
      }

      // Return the individual result if the logical task isn't complete yet
      return result
    } catch (error) {
      taskResult.error = error instanceof Error ? error.message : String(error)
      taskResult.endTime = new Date()

      this.reportCollector.addTaskResult(taskResult)

      throw new Error(
        `Failed to execute task ${task.id} (${task.target.url} with ${task.profile.id}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  /**
   * Evaluate assertions for a completed task and emit assertion events
   */
  private async evaluateAssertions(
    task: Task,
    lighthouseResult: LighthouseResult,
  ): Promise<AssertionReport | undefined> {
    try {
      const baselineMetrics = getBaselineMetrics(
        this.resolvedBaseline,
        task.target.id,
        task.target.url,
        this.config.baseline?.matchBy ?? 'id',
      )

      const baselineRecord = baselineMetrics
        ? (Object.fromEntries(
            Object.entries(baselineMetrics).filter(([_, value]) => typeof value === 'number'),
          ) as Record<string, number>)
        : undefined

      const context: AssertionContext = {
        task,
        lighthouseResult,
        config: this.config.assertions!,
        baseline: baselineRecord,
      }

      const assertionReport = await this.assertionEngine.evaluate(context)

      logger.debug(
        `Assertions evaluated for task ${task.id}: ${assertionReport.passed ? 'PASSED' : 'FAILED'} ` +
          `(${assertionReport.results.length - assertionReport.failureCount}/${assertionReport.results.length} passed)`,
      )

      return assertionReport
    } catch (error) {
      logger.error(`Assertion evaluation failed for task ${task.id}:`, error)
      // Don't throw - we want the lighthouse result to still be available even if assertions fail
      return undefined
    }
  }

  /**
   * Generate tasks from configuration targets, grouped by profile
   */
  private generateTasksByProfile(): Map<string, Task[]> {
    const tasksByProfile = new Map<string, Task[]>()

    for (const target of this.config.targets) {
      // Determine which profile(s) to use for this target
      const profiles = this.getTargetProfiles(target)

      for (const profile of profiles) {
        // Create a logical task ID for grouping multiple runs
        const logicalTaskId = `${target.id}_${profile.id}`
        const timestamp = Date.now()

        // Create multiple tasks for each target+profile combination
        for (let runIndex = 0; runIndex < this.config.runsPerTask; runIndex++) {
          const task: Task = {
            id: `${logicalTaskId}_${timestamp}_${runIndex}_${Math.random().toString(36).substr(2, 9)}`,
            target,
            profile,
            attempt: 0,
            createdAt: new Date(),
            logicalTaskId,
            runIndex,
          }

          // Group tasks by profile ID
          if (!tasksByProfile.has(profile.id)) {
            tasksByProfile.set(profile.id, [])
          }
          tasksByProfile.get(profile.id)!.push(task)
        }
      }
    }

    return tasksByProfile
  }

  /**
   * Get profiles to use for a target
   */
  private getTargetProfiles(target: Target): ProfileRef[] {
    // If target has specific profile, use that
    if (target.profile) {
      return [{ id: target.profile }]
    }

    return [{ id: this.config.defaultProfile }]
  }

  /**
   * Set up event forwarding from scheduler to runner
   */
  private setupEventForwarding(): void {
    this.scheduler.on('taskStart', (task) => {
      // Only emit taskStart for the first run of each logical task
      if (!this.logicalTasksStarted.has(task.logicalTaskId)) {
        this.logicalTasksStarted.add(task.logicalTaskId)
        // Create a representative task for the logical task
        const logicalTask = {
          ...task,
          id: task.logicalTaskId, // Use logical ID for user-facing events
        }
        this.emit('taskStart', logicalTask)
      }
    })

    this.scheduler.on('taskComplete', () => {
      // taskComplete events for logical tasks are emitted directly from executeTask
      // We don't need to forward individual run completions to avoid duplicates
    })

    this.scheduler.on('taskFailed', (task, error, willRetry) => {
      // Only emit failure events for logical task failures
      // For now, we'll emit all failures but could be refined
      this.emit('taskFailed', task, error, willRetry)
    })

    this.scheduler.on('taskRetry', (task, attempt) => {
      // Only emit retry events for the first run of logical tasks
      if (task.runIndex === 0) {
        this.emit('taskRetry', task, attempt)
      }
    })
  }
}

export function createRunner(config: PerfConfig, options?: RunnerOptions): Runner {
  return new Runner(config, options)
}
