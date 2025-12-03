/* eslint-disable no-console */
import type { CommandModule } from 'yargs'
import { loadConfig } from '../../core/config'
import { createRunner } from '../../core/runner'
import { CLIReporter } from '../../reporting'
import { logger } from '../../logger'
import type { PerfConfig, LighthouseResult, Task, RunSummary } from '../../core/types'

interface GlobalOptions {
  config?: string
  verbose?: boolean
  quiet?: boolean
}

interface RunCommandArgs extends GlobalOptions {
  target?: string
  profile?: string
}

export const runCommand: CommandModule<GlobalOptions, RunCommandArgs> = {
  command: 'run',
  describe: 'Run performance tests on configured targets',
  builder: (yargs) => {
    return yargs
      .option('target', {
        type: 'string',
        describe: 'Run only the specified target (by name)',
      })
      .option('profile', {
        type: 'string',
        describe: 'Use only the specified profile (by name)',
      })
      .example('$0 run', 'Run all targets with all profiles')
      .example('$0 run --target homepage', 'Run only the homepage target')
      .example('$0 run --profile mobile', 'Run all targets with mobile profile only')
      .example('$0 run --target homepage --profile desktop', 'Run homepage with desktop profile only')
  },
  handler: async (argv) => {
    try {
      await runPerformanceTests(argv)
    } catch (error) {
      logger.error('Performance test run failed:', error)
      process.exit(1)
    }
  },
}

async function runPerformanceTests(args: RunCommandArgs): Promise<void> {
  logger.info('Loading configuration...')
  const config = await loadConfig({
    configPath: args.config,
  })

  if (!args.quiet) {
    logger.info(
      `Loaded config with ${config.targets.length} targets and ${Object.keys(config.profiles || {}).length} custom profiles`,
    )
  }

  // Filter targets and profiles based on CLI arguments
  const filteredConfig = filterConfig(config, args)

  if (filteredConfig.targets.length === 0) {
    if (args.target) {
      logger.error(`Target "${args.target}" not found in configuration`)
      process.exit(1)
    } else {
      logger.error('No targets found in configuration')
      process.exit(1)
    }
  }

  const runner = createRunner(filteredConfig)

  // Ensure cleanup on process exit
  const cleanup = async () => {
    await runner.stop()
  }

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, cleaning up...')
    await cleanup()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, cleaning up...')
    await cleanup()
    process.exit(0)
  })

  try {
    // Set up event handlers for progress reporting
    setupProgressHandlers(runner, args.quiet)

    logger.info(`Running ${filteredConfig.targets.length} targets with concurrency ${filteredConfig.concurrency}...`)

    const runSummary = await runner.run()

    if (!args.quiet) {
      const cliReporter = new CLIReporter({
        showColors: true,
        showMetrics: ['lcp', 'cls', 'fid', 'tbt', 'fcp', 'inp', 'performanceScore'],
      })
      cliReporter.print(runSummary)
    } else {
      // In quiet mode, output JSON results
      console.log(JSON.stringify(runSummary, null, 2))
    }

    // Exit with error code if any tasks failed (but not in test environment)
    if (!runSummary.passed && process.env.NODE_ENV !== 'test') {
      process.exit(1)
    }
  } catch (error) {
    logger.error('Performance test execution failed:', error)
    throw error
  } finally {
    // Always cleanup, regardless of success or failure
    await cleanup()
  }
}

/**
 * Filter configuration based on CLI arguments
 */
function filterConfig(config: PerfConfig, args: RunCommandArgs): PerfConfig {
  const targetsToRun = args.target
    ? config.targets.filter((t) => t.name === args.target || t.id === args.target)
    : config.targets

  // For profile filtering, we need to update the target's profile field or use defaultProfile
  const filteredConfig: PerfConfig = {
    ...config,
    targets: targetsToRun.map((target) => ({
      ...target,
      // If CLI specifies a profile, use that; otherwise keep target's profile or use default
      profile: args.profile || target.profile || config.defaultProfile,
    })),
  }

  return filteredConfig
}

/**
 * Set up progress handlers for the runner
 */
function setupProgressHandlers(runner: ReturnType<typeof createRunner>, quiet?: boolean): void {
  if (quiet) return

  let taskCount = 0
  let completedTasks = 0
  let failedTasks = 0

  runner.on('runStart', (taskCount: number) => {
    logger.info(`🚀 Starting ${taskCount} performance test(s)`)
  })

  runner.on('taskStart', (task: Task) => {
    taskCount++
    logger.info(`⏳ Running: ${task.target.name || task.target.id} (${task.profile.id})`)
  })

  runner.on('taskComplete', (result: LighthouseResult) => {
    completedTasks++
    const score = result.metrics.performanceScore
    const scoreIcon = score && score >= 90 ? '🟢' : score && score >= 50 ? '🟡' : '🔴'
    logger.info(`✅ Completed: ${result.target.name || result.target.id} ${scoreIcon} Score: ${score ?? 'N/A'}`)
  })

  runner.on('taskFailed', (task: Task, error: Error, willRetry: boolean) => {
    if (!willRetry) {
      failedTasks++
    }
    logger.error(`❌ ${willRetry ? 'Retrying' : 'Failed'}: ${task.target.name || task.target.id} - ${error.message}`)
  })

  runner.on('taskRetry', (task: Task, attempt: number) => {
    logger.info(`🔄 Retry ${attempt}: ${task.target.name || task.target.id}`)
  })

  runner.on('runComplete', (summary: RunSummary) => {
    logger.info(`🏁 Performance tests completed: ${summary.completedTasks} passed, ${summary.failedTasks} failed`)
  })
}
