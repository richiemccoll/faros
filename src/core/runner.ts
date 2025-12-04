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
export class Runner extends EventEmitter {
  private scheduler: Scheduler
  private lighthouseLauncher: LighthouseLauncher
  private metricExtractor: MetricExtractor
  private profileRegistry: ProfileRegistry
  private assertionEngine: AssertionEngine
  private reportCollector: ReportCollector
  private config: PerfConfig

  constructor(config: PerfConfig) {
    super()
    this.config = config

    const schedulerConfig: SchedulerConfig = {
      concurrency: config.concurrency,
      maxRetries: config.maxRetries,
      timeout: config.timeout,
    }
    this.scheduler = createScheduler(schedulerConfig)

    // Initialize lighthouse launcher in headless mode for CI/automated environments
    this.lighthouseLauncher = createLighthouseLauncher({
      headless: true, // Always run in headless mode by default for performance and CI compatibility
      logLevel: 'error', // Keep quiet during runs
      timeout: config.timeout, // Use timeout from config
    })

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
      const tasks = this.generateTasks()

      if (tasks.length === 0) {
        throw new Error('No tasks generated from configuration')
      }

      logger.info(`Starting performance test run with ${tasks.length} task(s)`)
      this.emit('runStart', tasks.length)

      this.scheduler.addTasks(tasks)
      const results = await this.scheduler.run()

      this.reportCollector.completeRun()
      const summary = this.reportCollector.getSummary()

      logger.info(`Performance test run completed. ${results.length} result(s)`)
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

      const lighthouseResult = await this.lighthouseLauncher.run(task.target, profile)

      const metrics = this.metricExtractor.extract(lighthouseResult.lhr)

      const result: LighthouseResult = {
        taskId: task.id,
        target: task.target,
        profile: task.profile,
        metrics,
        duration: Date.now() - taskStartTime.getTime(),
        timestamp: new Date(),
        raw: this.config.output?.includeRawLighthouse ? lighthouseResult.lhr : undefined,
      }

      taskResult.lighthouseResult = result
      taskResult.endTime = new Date()

      if (this.config.assertions) {
        const assertionReport = await this.evaluateAssertions(task, result)
        taskResult.assertionReport = assertionReport
      }

      this.reportCollector.addTaskResult(taskResult)

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
      const context: AssertionContext = {
        task,
        lighthouseResult,
        config: this.config.assertions!,
        baseline: undefined, // TODO: Add baseline provider support
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
   * Generate tasks from configuration targets
   */
  private generateTasks(): Task[] {
    const tasks: Task[] = []

    for (const target of this.config.targets) {
      // Determine which profile(s) to use for this target
      const profiles = this.getTargetProfiles(target)

      for (const profile of profiles) {
        const task: Task = {
          id: `${target.id}_${profile.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          target,
          profile,
          attempt: 0,
          createdAt: new Date(),
        }
        tasks.push(task)
      }
    }

    return tasks
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
      this.emit('taskStart', task)
    })

    this.scheduler.on('taskComplete', (result) => {
      this.emit('taskComplete', result)
    })

    this.scheduler.on('taskFailed', (task, error, willRetry) => {
      this.emit('taskFailed', task, error, willRetry)
    })

    this.scheduler.on('taskRetry', (task, attempt) => {
      this.emit('taskRetry', task, attempt)
    })
  }
}

export function createRunner(config: PerfConfig): Runner {
  return new Runner(config)
}
