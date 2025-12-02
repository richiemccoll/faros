import { ZodError } from 'zod'
import { PerfConfig, PerfConfigSchema } from './types'

/**
 * Validates a configuration object against the schema
 * @param config Raw configuration object to validate
 * @returns Validated and normalized PerfConfig
 * @throws ConfigValidationError if validation fails
 */
export function validateConfig(config: unknown): PerfConfig {
  try {
    return PerfConfigSchema.parse(config)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ConfigValidationError('Configuration validation failed', error.issues)
    }
    throw error
  }
}

/**
 * Custom error class for configuration validation failures
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: ZodError['issues'],
  ) {
    super(message)
    this.name = 'ConfigValidationError'
  }

  /**
   * Returns a human-readable summary of all validation errors
   */
  getErrorSummary(): string {
    return this.validationErrors
      .map((err) => {
        const path = err.path.map(String).join('.')
        return `${path ? `${path}: ` : ''}${err.message}`
      })
      .join('\n')
  }
}

export function createDefaultConfig(): PerfConfig {
  return {
    targets: [
      {
        id: 'homepage',
        url: 'http://localhost:3000',
        name: 'Homepage',
        tags: ['critical'],
      },
    ],
    defaultProfile: 'default',
    concurrency: 1,
    maxRetries: 2,
    timeout: 30000,
    plugins: [],
  }
}

// Placeholder for Phase 1, step 3 - full config loading
export function loadConfig(): void {
  // TODO: Implement config file loading with env/CLI overrides
}
