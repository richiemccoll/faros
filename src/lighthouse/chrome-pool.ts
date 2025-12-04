import { launch, LaunchedChrome } from 'chrome-launcher'
import { logger } from '../logger'

export interface ChromePoolOptions {
  poolSize: number
  headless?: boolean
  chromeFlags?: string[]
  logLevel?: 'silent' | 'error' | 'info' | 'verbose'
}

interface PooledChrome {
  chrome: LaunchedChrome
  inUse: boolean
}

/**
 * Manages a pool of Chrome instances to avoid resource contention
 * when running multiple concurrent Lighthouse audits
 */
export class ChromePool {
  private pool: PooledChrome[] = []
  private options: Required<ChromePoolOptions>
  private initialized = false

  constructor(options: ChromePoolOptions) {
    this.options = {
      headless: true,
      chromeFlags: ['--no-sandbox', '--disable-dev-shm-usage'],
      logLevel: 'error',
      ...options,
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    logger.debug(`Initializing Chrome pool with ${this.options.poolSize} instances`)

    const chromeFlags = this.options.headless ? [...this.options.chromeFlags, '--headless'] : this.options.chromeFlags

    // Launch all Chrome instances in parallel
    const launchPromises = Array.from({ length: this.options.poolSize }, async () => {
      const chrome = await launch({
        chromeFlags,
        logLevel: this.options.logLevel,
      })

      return {
        chrome,
        inUse: false,
      }
    })

    this.pool = await Promise.all(launchPromises)
    this.initialized = true

    logger.debug(`Chrome pool initialized with ${this.pool.length} instances`)
  }

  /**
   * Get an available Chrome instance from the pool
   * Blocks until an instance becomes available
   */
  async acquireChrome(): Promise<LaunchedChrome> {
    if (!this.initialized) {
      await this.initialize()
    }

    // Try to find an available chrome instance
    let attempts = 0
    const maxAttempts = 100 // Prevent infinite loops

    while (attempts < maxAttempts) {
      const available = this.pool.find((pooled) => !pooled.inUse)

      if (available) {
        available.inUse = true
        logger.debug(`Acquired Chrome instance (port: ${available.chrome.port})`)
        return available.chrome
      }

      // Wait a few ticks and try again
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }

    throw new Error('No Chrome instances available in pool after maximum attempts')
  }

  releaseChrome(chrome: LaunchedChrome): void {
    const pooled = this.pool.find((p) => p.chrome.port === chrome.port)
    if (pooled) {
      pooled.inUse = false
      logger.debug(`Released Chrome instance (port: ${chrome.port})`)
    }
  }

  getAvailableCount(): number {
    return this.pool.filter((p) => !p.inUse).length
  }

  async cleanup(): Promise<void> {
    logger.debug('Cleaning up Chrome pool')

    const killPromises = this.pool.map(async (pooled) => {
      try {
        await pooled.chrome.kill()
      } catch (error) {
        logger.warn(`Failed to kill Chrome instance: ${error}`)
      }
    })

    await Promise.all(killPromises)
    this.pool = []
    this.initialized = false

    logger.debug('Chrome pool cleanup completed')
  }
}
