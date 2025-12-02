import { ZodError } from 'zod'
import { PerfConfig, PerfConfigSchema } from '../types'
import { ConfigValidationError } from './errors'

/**
 * Validates a configuration object against the schema
 * @param config Raw configuration object to validate
 * @returns Validated and normalized PerfConfig
 * @throws ConfigValidationError if validation fails
 */
export default function validateConfig(config: unknown): PerfConfig {
  try {
    return PerfConfigSchema.parse(config)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ConfigValidationError('Configuration validation failed', error.issues)
    }
    throw error
  }
}
