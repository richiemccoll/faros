/* eslint-disable no-console */

import { ConfigLoadError, ConfigValidationError } from '../core/config/errors'
import { loadConfig } from '../core'
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

      console.log(JSON.stringify(config, null, 2))

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
