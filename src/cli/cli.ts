import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { printConfigCommand } from './print-config'
import { runCommand } from './run'

export function createCli() {
  return yargs(hideBin(process.argv))
    .scriptName('faros')
    .usage('$0 <command> [options]')
    .option('config', {
      alias: 'c',
      type: 'string',
      describe: 'Path to configuration file',
      global: true,
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      describe: 'Enable verbose logging',
      global: true,
    })
    .option('quiet', {
      alias: 'q',
      type: 'boolean',
      describe: 'Suppress non-essential output',
      global: true,
    })
    .command(printConfigCommand)
    .command(runCommand)
    .demandCommand(1, 'You need to specify a command')
    .help()
    .alias('help', 'h')
    .version()
    .alias('version', 'V')
    .strict()
}

export async function runCli(argv?: string[]) {
  const cli = createCli()

  if (argv) {
    return cli.parse(argv)
  }

  return cli.argv
}
