import { PerfConfig } from '../types'
import { readFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import validateConfig from './validate'
import { ConfigLoadError } from './errors'

function createDefaultConfig(): PerfConfig {
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

export interface LoadConfigOptions {
  cwd?: string
  configPath?: string
  envPrefix?: string
  cliArgs?: Record<string, unknown>
}

/**
 * Loads configuration from multiple sources with proper precedence:
 * 1. Default config (lowest priority)
 * 2. Config file (perf.config.{js,cjs,mjs,ts,json})
 * 3. Environment variables
 * 4. CLI arguments (highest priority)
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<PerfConfig> {
  const { cwd = process.cwd(), configPath, envPrefix = 'PERF_', cliArgs = {} } = options

  let config: Partial<PerfConfig> = createDefaultConfig()

  try {
    const fileConfig = await loadConfigFile(cwd, configPath)
    if (fileConfig) {
      config = mergeConfig(
        config as Record<string, unknown>,
        fileConfig as Record<string, unknown>,
      ) as Partial<PerfConfig>
    }
  } catch (error) {
    throw new ConfigLoadError(`Failed to load config file: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    const envConfig = loadConfigFromEnv(envPrefix)
    if (Object.keys(envConfig).length > 0) {
      config = mergeConfig(
        config as Record<string, unknown>,
        envConfig as Record<string, unknown>,
      ) as Partial<PerfConfig>
    }
  } catch (error) {
    throw new ConfigLoadError(
      `Failed to load config from environment: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (Object.keys(cliArgs).length > 0) {
    config = mergeConfig(config as Record<string, unknown>, cliArgs) as Partial<PerfConfig>
  }

  return validateConfig(config)
}
/**
 * Loads configuration from a file, supporting multiple formats
 */
async function loadConfigFile(cwd: string, configPath?: string): Promise<Partial<PerfConfig> | null> {
  const configFilenames = ['perf.config.js', 'perf.config.cjs', 'perf.config.mjs', 'perf.config.ts', 'perf.config.json']

  let targetPath: string | null = null

  if (configPath) {
    // Use explicit path if provided
    targetPath = resolve(cwd, configPath)
  } else {
    // Search for config files in order
    for (const filename of configFilenames) {
      const filePath = join(cwd, filename)
      try {
        await access(filePath)
        targetPath = filePath
        break
      } catch {
        // File doesn't exist, continue searching
      }
    }
  }

  if (!targetPath) {
    return null
  }

  try {
    if (targetPath.endsWith('.json')) {
      const content = await readFile(targetPath, 'utf-8')
      return JSON.parse(content) as Partial<PerfConfig>
    } else {
      // Load JS/TS config using dynamic import
      const configModule = await import(targetPath)
      return configModule.default || configModule
    }
  } catch (error) {
    throw new Error(
      `Failed to load config file ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function loadConfigFromEnv(prefix: string): Partial<PerfConfig> {
  const config: Record<string, unknown> = {}

  // Map environment variables to config properties
  const envMappings = {
    [`${prefix}CONCURRENCY`]: 'concurrency',
    [`${prefix}MAX_RETRIES`]: 'maxRetries',
    [`${prefix}TIMEOUT`]: 'timeout',
    [`${prefix}DEFAULT_PROFILE`]: 'defaultProfile',
    [`${prefix}OUTPUT_DIR`]: 'output.dir',
    [`${prefix}OUTPUT_FORMATS`]: 'output.formats',
  }

  Object.entries(envMappings).forEach(([envVar, configPath]) => {
    const value = process.env[envVar]
    if (value !== undefined) {
      setNestedValue(config, configPath, parseEnvValue(value))
    }
  })

  return config as Partial<PerfConfig>
}

/**
 * Parses environment variable values to appropriate types
 */
function parseEnvValue(value: string): unknown {
  // Try to parse as number
  if (/^\d+$/.test(value)) {
    return parseInt(value, 10)
  }

  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false
  // Try to parse as JSON array/object
  if (value.startsWith('[') || value.startsWith('{')) {
    try {
      return JSON.parse(value)
    } catch {
      // Fall through to string
    }
  }

  // Return as string
  return value
}

/**
 * Sets a nested value in an object using dot notation
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let current = obj

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!key) continue

    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }

  const finalKey = keys[keys.length - 1]
  if (finalKey) {
    current[finalKey] = value
  }
}

/**
 * Deep merges two configuration objects, with the second taking precedence
 */
function mergeConfig(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base }

  Object.entries(override).forEach(([key, value]) => {
    if (value === undefined) return

    if (
      key in result &&
      typeof result[key] === 'object' &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = mergeConfig(result[key] as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  })

  return result
}
