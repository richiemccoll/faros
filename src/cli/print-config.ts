/* eslint-disable no-console */

import { ConfigLoadError, ConfigValidationError } from '../core/config/errors'
import { loadConfig, ProfileRef } from '../core'
import { ProfileRegistry } from '../lighthouse'
import type { BaseArgs, PrintConfigArgs } from './types'
import type { CommandModule } from 'yargs'

export const printConfigCommand: CommandModule<BaseArgs, PrintConfigArgs> = {
  command: 'print-config',
  describe: 'Show the resolved and validated configuration',
  builder: (yargs) => {
    return yargs.option('format', {
      alias: 'f',
      type: 'string',
      choices: ['json'] as const,
      default: 'json',
      describe: 'Output format for the configuration',
    })
  },
  handler: async (argv) => {
    try {
      const config = await loadConfig({
        cwd: process.cwd(),
        configPath: argv.config,
      })

      const profileRegistry = new ProfileRegistry(config.profiles || {})
      const resolvedProfiles: Record<string, ProfileRef> = {}
      const profileIds = new Set([config.defaultProfile])

      config.targets.forEach((target) => {
        if (target.profile) {
          profileIds.add(target.profile)
        }
      })

      profileIds.forEach((profileId) => {
        try {
          resolvedProfiles[profileId] = profileRegistry.getProfile(profileId)
        } catch (error) {
          console.error(`❌ Failed to resolve profile "${profileId}":`, (error as Error).message)
        }
      })

      const output = {
        ...config,
        _resolvedProfiles: resolvedProfiles,
      }

      console.log(JSON.stringify(output, null, 2))

      if (!argv.quiet) {
        console.error('✅ Configuration is valid')
      }
    } catch (error) {
      if (error instanceof ConfigLoadError) {
        console.error('❌ Failed to load configuration:')
        console.error(error.message)
        process.exit(1)
      } else if (error instanceof ConfigValidationError) {
        console.error('❌ Configuration validation failed:')
        console.error(error.getErrorSummary())
        process.exit(1)
      } else {
        console.error('❌ Unexpected error:', error)
        process.exit(1)
      }
    }
  },
}
