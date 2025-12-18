/**
 * Resolves environment variable references in strings
 * Supports ${VAR_NAME} syntax
 */
export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    const envValue = process.env[varName]

    if (envValue === undefined) {
      throw new Error(`Environment variable "${varName}" is not defined (referenced in auth configuration)`)
    }

    return envValue
  })
}

/**
 * Resolves environment variables in auth headers
 */
export function resolveAuthHeaders(headers: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {}

  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = resolveEnvVars(value)
  }

  return resolved
}

/**
 * Resolves environment variables in auth cookies
 */
export function resolveAuthCookies<T extends { name: string; value: string }>(cookies: T[]): T[] {
  return cookies.map((cookie) => ({
    ...cookie,
    name: resolveEnvVars(cookie.name),
    value: resolveEnvVars(cookie.value),
  }))
}

/**
 * Validates that all required environment variables are available
 * without resolving them (for early validation)
 */
export function validateEnvVarReferences(value: string): string[] {
  const matches = value.matchAll(/\$\{([^}]+)\}/g)
  const missingVars: string[] = []

  for (const match of matches) {
    const varName = match[1]!
    if (process.env[varName] === undefined) {
      missingVars.push(varName)
    }
  }

  return missingVars
}

/**
 * Validates that all environment variables referenced in auth config are available
 */
export function validateAuthEnvVars(authConfig: {
  headers?: Record<string, string>
  cookies?: Array<{ name: string; value: string }>
}): { valid: boolean; missingVars: string[] } {
  const missingVars: string[] = []

  // Check headers
  if (authConfig.headers) {
    for (const value of Object.values(authConfig.headers)) {
      missingVars.push(...validateEnvVarReferences(value))
    }
  }

  // Check cookies
  if (authConfig.cookies) {
    for (const cookie of authConfig.cookies) {
      missingVars.push(...validateEnvVarReferences(cookie.name))
      missingVars.push(...validateEnvVarReferences(cookie.value))
    }
  }

  // Remove duplicates
  const uniqueMissingVars = [...new Set(missingVars)]

  return {
    valid: uniqueMissingVars.length === 0,
    missingVars: uniqueMissingVars,
  }
}
