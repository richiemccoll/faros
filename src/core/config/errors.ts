import { ZodError } from 'zod'

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

export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message)
    this.name = 'ConfigLoadError'
  }
}
