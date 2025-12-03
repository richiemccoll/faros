import { EventEmitter } from 'events'
import { Task, LighthouseResult } from './types/execution'
import { Target, ProfileRef, PerfConfig } from './types'
import { Scheduler, createScheduler, SchedulerConfig } from './scheduler'
import { LighthouseLauncher, createLighthouseLauncher } from '../lighthouse/launcher'
import { MetricExtractor, createMetricExtractor } from '../lighthouse/metric-extractor'
import { ProfileRegistry } from '../lighthouse/profile-registry'
import { logger } from '../logger'

export interface RunnerEvents {
  runStart: (taskCount: number) => void
  taskStart: (task: Task) => void
  taskComplete: (result: LighthouseResult) => void
  taskFailed: (task: Task, error: Error, willRetry: boolean) => void
  taskRetry: (task: Task, attempt: number) => void
  runComplete: (results: LighthouseResult[]) => void
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
    })

    this.metricExtractor = createMetricExtractor({
      includeRawData: config.output?.includeRawLighthouse ?? false,
    })

    this.profileRegistry = new ProfileRegistry(config.profiles)

    this.setupEventForwarding()

    this.scheduler.setTaskHandler(this.executeTask.bind(this))
  }

  /**
   * Run performance tests for all targets
   */
  async run(): Promise<LighthouseResult[]> {
    try {
      const tasks = this.generateTasks()

      if (tasks.length === 0) {
        throw new Error('No tasks generated from configuration')
      }

      logger.info(`Starting performance test run with ${tasks.length} task(s)`)
      this.emit('runStart', tasks.length)

      this.scheduler.addTasks(tasks)
      const results = await this.scheduler.run()

      logger.info(`Performance test run completed. ${results.length} result(s)`)
      this.emit('runComplete', results)

      return results
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

  private async executeTask(task: Task): Promise<LighthouseResult> {
    const startTime = Date.now()

    try {
      const profile = this.profileRegistry.getProfile(task.profile.id)

      const lighthouseResult = await this.lighthouseLauncher.run(task.target, profile)

      const metrics = this.metricExtractor.extract(lighthouseResult.lhr)

      const result: LighthouseResult = {
        taskId: task.id,
        target: task.target,
        profile: task.profile,
        metrics,
        duration: Date.now() - startTime,
        timestamp: new Date(),
        raw: this.config.output?.includeRawLighthouse ? lighthouseResult.lhr : undefined,
      }

      return result
    } catch (error) {
      throw new Error(
        `Failed to execute task ${task.id} (${task.target.url} with ${task.profile.id}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
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
