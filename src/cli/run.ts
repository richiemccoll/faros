import type { CommandModule } from 'yargs'
import { loadConfig } from '../core/config'
import { ProfileRegistry } from '../lighthouse/profile-registry'
import { LighthouseLauncher } from '../lighthouse/launcher'
import { MetricExtractor } from '../lighthouse/metric-extractor'
import { logger } from '../logger'
import type { Target, NormalizedMetrics } from '../core/types'

interface GlobalOptions {
  config?: string
  verbose?: boolean
  quiet?: boolean
}

interface RunCommandArgs extends GlobalOptions {
  target?: string
  profile?: string
}

interface PerformanceResult {
  target: Target
  profileName: string
  metrics: NormalizedMetrics
  timestamp: string
  url: string
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

  const profileRegistry = new ProfileRegistry(config.profiles)
  const launcher = new LighthouseLauncher()
  const extractor = new MetricExtractor()

  // Ensure cleanup on process exit
  const cleanup = async () => {
    await launcher.cleanup()
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
    const targetsToRun = args.target
      ? config.targets.filter((t) => t.name === args.target || t.id === args.target)
      : config.targets

    if (targetsToRun.length === 0) {
      if (args.target) {
        logger.error(`Target "${args.target}" not found in configuration`)
        process.exit(1)
      } else {
        logger.error('No targets found in configuration')
        process.exit(1)
      }
    }

    const availableProfiles = profileRegistry.listProfiles().map((p) => p.id)
    const profilesToUse = args.profile ? availableProfiles.filter((p) => p === args.profile) : availableProfiles

    if (profilesToUse.length === 0) {
      if (args.profile) {
        logger.error(`Profile "${args.profile}" not found. Available profiles: ${availableProfiles.join(', ')}`)
        process.exit(1)
      } else {
        logger.error('No profiles available')
        process.exit(1)
      }
    }

    logger.info(`Running ${targetsToRun.length} targets with ${profilesToUse.length} profiles...`)

    const results: PerformanceResult[] = []

    // Run performance tests
    for (const target of targetsToRun) {
      if (!args.quiet) {
        logger.info(`\nTesting target: ${target.name} (${target.url})`)
      }

      for (const profileName of profilesToUse) {
        if (!args.quiet) {
          logger.info(`  Running with profile: ${profileName}`)
        }

        try {
          const profile = profileRegistry.getProfile(profileName)

          const lighthouseResult = await launcher.run(target, profile)

          const metrics = extractor.extract(lighthouseResult.lhr)

          if (!extractor.validateMetrics(metrics)) {
            logger.warn(`  Warning: Some metrics appear invalid for ${target.name} with ${profileName}`)
          }

          const result: PerformanceResult = {
            target,
            profileName,
            metrics,
            timestamp: new Date().toISOString(),
            url: lighthouseResult.lhr.finalDisplayedUrl || target.url,
          }

          results.push(result)

          if (!args.quiet) {
            displayMetrics(result)
          }
        } catch (error) {
          logger.error(`  Failed to run ${target.name} with ${profileName}:`, error)
          // Continue with other tests rather than failing completely
        }
      }
    }

    // Summary
    if (!args.quiet) {
      displaySummary(results)
    } else {
      // In quiet mode, just output JSON results
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(results, null, 2))
    }
  } catch (error) {
    logger.error('Performance test execution failed:', error)
    throw error
  } finally {
    // Always cleanup, regardless of success or failure
    await cleanup()
  }
}

function displayMetrics(result: PerformanceResult): void {
  const { metrics, target, profileName } = result

  // eslint-disable-next-line no-console
  console.log(`    Results for ${target.name} (${profileName}):`)
  // eslint-disable-next-line no-console
  console.log(`      Performance Score: ${metrics.performanceScore ?? 'N/A'}`)
  // eslint-disable-next-line no-console
  console.log(`      LCP: ${metrics.lcp ? `${metrics.lcp}ms` : 'N/A'}`)
  // eslint-disable-next-line no-console
  console.log(`      CLS: ${metrics.cls ?? 'N/A'}`)
  // eslint-disable-next-line no-console
  console.log(`      FID: ${metrics.fid ? `${metrics.fid}ms` : 'N/A'}`)
  // eslint-disable-next-line no-console
  console.log(`      INP: ${metrics.inp ? `${metrics.inp}ms` : 'N/A'}`)
  // eslint-disable-next-line no-console
  console.log(`      TBT: ${metrics.tbt ? `${metrics.tbt}ms` : 'N/A'}`)
  // eslint-disable-next-line no-console
  console.log(`      FCP: ${metrics.fcp ? `${metrics.fcp}ms` : 'N/A'}`)
}

function displaySummary(results: PerformanceResult[]): void {
  // eslint-disable-next-line no-console
  console.log(`\n🎯 Performance Test Summary`)
  // eslint-disable-next-line no-console
  console.log(`   Total tests run: ${results.length}`)

  if (results.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`   No successful results to display`)
    return
  }

  // Group by target for summary stats
  const targetGroups = new Map<string | undefined, PerformanceResult[]>()

  for (const result of results) {
    const key = result.target.name
    if (!targetGroups.has(key)) {
      targetGroups.set(key, [])
    }
    targetGroups.get(key)!.push(result)
  }

  for (const [targetName, targetResults] of Array.from(targetGroups.entries())) {
    // eslint-disable-next-line no-console
    console.log(`\n   📊 ${targetName}:`)

    for (const result of targetResults) {
      const score = result.metrics.performanceScore
      if (score) {
        const scoreIcon = score >= 90 ? '🟢' : score >= 50 ? '🟡' : '🔴'
        // eslint-disable-next-line no-console
        console.log(`     ${scoreIcon} ${result.profileName}: ${score ?? 'N/A'} (Performance Score)`)
      }
    }
  }
}
