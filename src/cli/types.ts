/**
 * CLI command definitions and interfaces
 */

export interface BaseArgs {
  config?: string
  verbose?: boolean
  quiet?: boolean
}

export interface PrintConfigArgs extends BaseArgs {
  format?: string
}
