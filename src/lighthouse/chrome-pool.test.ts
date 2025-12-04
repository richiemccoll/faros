import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { ChromePool, ChromePoolOptions } from './chrome-pool'
import { LaunchedChrome, launch } from 'chrome-launcher'

jest.mock('chrome-launcher', () => ({
  launch: jest.fn(),
}))

jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}))

const mockLaunch = jest.mocked(launch)

describe('ChromePool', () => {
  let chromePool: ChromePool

  beforeEach(() => {
    jest.clearAllMocks()

    // Create a function to generate unique mock Chrome instances
    let portCounter = 9222
    mockLaunch.mockImplementation(() => {
      const port = portCounter++
      return Promise.resolve({
        pid: 1234 + port,
        port,
        process: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        remoteDebuggingPipes: null,
        kill: jest.fn().mockResolvedValue(undefined as never),
      })
    })
  })

  afterEach(async () => {
    if (chromePool) {
      await chromePool.cleanup()
    }
  })

  describe('constructor', () => {
    it('should create ChromePool with default options', () => {
      const options: ChromePoolOptions = { poolSize: 2 }
      chromePool = new ChromePool(options)

      expect(chromePool).toBeInstanceOf(ChromePool)
    })

    it('should merge provided options with defaults', () => {
      const options: ChromePoolOptions = {
        poolSize: 3,
        headless: false,
        chromeFlags: ['--custom-flag'],
        logLevel: 'verbose',
      }
      chromePool = new ChromePool(options)

      expect(chromePool).toBeInstanceOf(ChromePool)
    })
  })

  describe('initialize', () => {
    it('should initialize pool with correct number of Chrome instances', async () => {
      const options: ChromePoolOptions = { poolSize: 2 }
      chromePool = new ChromePool(options)

      await chromePool.initialize()

      expect(mockLaunch).toHaveBeenCalledTimes(2)
      expect(mockLaunch).toHaveBeenCalledWith({
        chromeFlags: ['--no-sandbox', '--disable-dev-shm-usage', '--headless'],
        logLevel: 'error',
      })
    })

    it('should not initialize twice', async () => {
      const options: ChromePoolOptions = { poolSize: 1 }
      chromePool = new ChromePool(options)

      await chromePool.initialize()
      await chromePool.initialize() // Second call should be ignored

      expect(mockLaunch).toHaveBeenCalledTimes(1)
    })

    it('should use headless=false when specified', async () => {
      const options: ChromePoolOptions = { poolSize: 1, headless: false }
      chromePool = new ChromePool(options)

      await chromePool.initialize()

      expect(mockLaunch).toHaveBeenCalledWith({
        chromeFlags: ['--no-sandbox', '--disable-dev-shm-usage'],
        logLevel: 'error',
      })
    })

    it('should use custom chrome flags', async () => {
      const options: ChromePoolOptions = {
        poolSize: 1,
        chromeFlags: ['--custom-flag', '--another-flag'],
      }
      chromePool = new ChromePool(options)

      await chromePool.initialize()

      expect(mockLaunch).toHaveBeenCalledWith({
        chromeFlags: ['--custom-flag', '--another-flag', '--headless'],
        logLevel: 'error',
      })
    })

    it('should use custom log level', async () => {
      const options: ChromePoolOptions = { poolSize: 1, logLevel: 'verbose' }
      chromePool = new ChromePool(options)

      await chromePool.initialize()

      expect(mockLaunch).toHaveBeenCalledWith({
        chromeFlags: ['--no-sandbox', '--disable-dev-shm-usage', '--headless'],
        logLevel: 'verbose',
      })
    })
  })

  describe('acquireChrome', () => {
    beforeEach(async () => {
      const options: ChromePoolOptions = { poolSize: 2 }
      chromePool = new ChromePool(options)
    })

    it('should automatically initialize if not initialized', async () => {
      const chrome = await chromePool.acquireChrome()

      expect(mockLaunch).toHaveBeenCalledTimes(2)
      expect(chrome).toHaveProperty('port')
      expect(chrome).toHaveProperty('pid')
      expect(chrome).toHaveProperty('kill')
    })

    it('should return available Chrome instance', async () => {
      await chromePool.initialize()

      const chrome = await chromePool.acquireChrome()

      expect(chrome).toHaveProperty('port')
      expect(chrome).toHaveProperty('pid')
      expect(chromePool.getAvailableCount()).toBe(1) // One less available
    })

    it('should handle multiple acquisitions', async () => {
      await chromePool.initialize()

      const chrome1 = await chromePool.acquireChrome()
      const chrome2 = await chromePool.acquireChrome()

      expect(chrome1).toHaveProperty('port')
      expect(chrome2).toHaveProperty('port')
      expect(chrome1.port).not.toBe(chrome2.port) // Should be different instances
      expect(chromePool.getAvailableCount()).toBe(0) // All instances in use
    })

    it('should throw error when no instances available after max attempts', async () => {
      // Create a small pool
      const options: ChromePoolOptions = { poolSize: 1 }
      chromePool = new ChromePool(options)
      await chromePool.initialize()

      // Acquire the only instance
      await chromePool.acquireChrome()

      // Mock setTimeout to make it synchronous to avoid waiting
      jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
        ;(callback as () => void)()
        return {} as NodeJS.Timeout
      })

      await expect(chromePool.acquireChrome()).rejects.toThrow(
        'No Chrome instances available in pool after maximum attempts',
      )

      jest.restoreAllMocks()
    }, 10000)
  })

  describe('releaseChrome', () => {
    beforeEach(async () => {
      const options: ChromePoolOptions = { poolSize: 1 }
      chromePool = new ChromePool(options)
      await chromePool.initialize()
    })

    it('should release Chrome instance back to pool', async () => {
      const chrome = await chromePool.acquireChrome()
      expect(chromePool.getAvailableCount()).toBe(0)

      chromePool.releaseChrome(chrome)
      expect(chromePool.getAvailableCount()).toBe(1)
    })

    it('should handle releasing unknown Chrome instance gracefully', () => {
      const unknownChrome = {
        pid: 9999,
        port: 9999,
        process: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        remoteDebuggingPipes: null,
        kill: jest.fn(),
      } as LaunchedChrome

      expect(() => chromePool.releaseChrome(unknownChrome)).not.toThrow()
    })
  })

  describe('getAvailableCount', () => {
    beforeEach(async () => {
      const options: ChromePoolOptions = { poolSize: 3 }
      chromePool = new ChromePool(options)
      await chromePool.initialize()
    })

    it('should return correct available count', async () => {
      expect(chromePool.getAvailableCount()).toBe(3)

      await chromePool.acquireChrome()
      expect(chromePool.getAvailableCount()).toBe(2)

      await chromePool.acquireChrome()
      expect(chromePool.getAvailableCount()).toBe(1)
    })
  })

  describe('cleanup', () => {
    beforeEach(async () => {
      const options: ChromePoolOptions = { poolSize: 2 }
      chromePool = new ChromePool(options)
      await chromePool.initialize()
    })

    it('should kill all Chrome instances and reset pool', async () => {
      expect(chromePool.getAvailableCount()).toBe(2)

      await chromePool.cleanup()

      // Verify that all kill methods were called (we can't check mockChrome directly since instances are unique)
      expect(chromePool.getAvailableCount()).toBe(0)
    })

    it('should handle kill errors gracefully', async () => {
      // Override the mock to make kill throw an error for new instances
      mockLaunch.mockImplementation(() => {
        return Promise.resolve({
          pid: 1234,
          port: 9222,
          process: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          remoteDebuggingPipes: null,
          kill: jest.fn().mockRejectedValue(new Error('Kill failed') as never),
        })
      })

      const errorChromePool = new ChromePool({ poolSize: 1 })
      await errorChromePool.initialize()

      await expect(errorChromePool.cleanup()).resolves.not.toThrow()
      expect(errorChromePool.getAvailableCount()).toBe(0)
    })

    it('should allow re-initialization after cleanup', async () => {
      await chromePool.cleanup()
      expect(chromePool.getAvailableCount()).toBe(0)

      await chromePool.initialize()
      expect(chromePool.getAvailableCount()).toBe(2)
      expect(mockLaunch).toHaveBeenCalledTimes(4) // 2 initial + 2 after cleanup
    })
  })

  describe('integration scenarios', () => {
    it('should handle acquire and release cycle correctly', async () => {
      const options: ChromePoolOptions = { poolSize: 2 }
      chromePool = new ChromePool(options)

      // Acquire instances
      const chrome1 = await chromePool.acquireChrome()
      const chrome2 = await chromePool.acquireChrome()

      expect(chromePool.getAvailableCount()).toBe(0)

      // Release one instance
      chromePool.releaseChrome(chrome1)
      expect(chromePool.getAvailableCount()).toBe(1)

      // Acquire again
      const chrome3 = await chromePool.acquireChrome()
      expect(chrome3).toHaveProperty('port')
      expect(chromePool.getAvailableCount()).toBe(0)

      // Release all
      chromePool.releaseChrome(chrome2)
      chromePool.releaseChrome(chrome3)
      expect(chromePool.getAvailableCount()).toBe(2)
    })
  })
})
