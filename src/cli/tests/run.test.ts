/* eslint-disable no-console */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { runCli } from '../cli'
import { logger } from '../../logger'
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'

const TEST_DIR = join(process.cwd(), 'test-configs-run')

// Mock chrome-launcher - return a mock chrome instance
jest.mock('chrome-launcher', () => ({
  launch: jest.fn(),
}))

// Mock lighthouse - return realistic lighthouse result structure
jest.mock('lighthouse', () => jest.fn())

// Mock logger to capture its output
jest.mock('../../logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}))

// Capture console and logger output for testing
const captureOutput = () => {
  const originalLog = console.log
  const originalError = console.error
  const logs: string[] = []
  const errors: string[] = []

  const mockedLogger = jest.mocked(logger)

  // Clear existing mock calls
  mockedLogger.info.mockClear()
  mockedLogger.error.mockClear()
  mockedLogger.warn.mockClear()
  mockedLogger.debug.mockClear()

  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '))
  }

  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '))
  }

  jest.spyOn(mockedLogger, 'info').mockImplementation((message: unknown, ...args: unknown[]) => {
    logs.push([message, ...args].map(String).join(' '))
    return undefined as never
  })

  jest.spyOn(mockedLogger, 'error').mockImplementation((message: unknown, ...args: unknown[]) => {
    errors.push([message, ...args].map(String).join(' '))
    return undefined as never
  })

  jest.spyOn(mockedLogger, 'warn').mockImplementation((message: unknown, ...args: unknown[]) => {
    logs.push([message, ...args].map(String).join(' '))
    return undefined as never
  })

  jest.spyOn(mockedLogger, 'debug').mockImplementation((message: unknown, ...args: unknown[]) => {
    logs.push([message, ...args].map(String).join(' '))
    return undefined as never
  })

  return {
    getLogs: () => logs.join('\n'),
    getErrors: () => errors.join('\n'),
    restore: () => {
      console.log = originalLog
      console.error = originalError

      mockedLogger.info.mockReset()
      mockedLogger.error.mockReset()
      mockedLogger.warn.mockReset()
      mockedLogger.debug.mockReset()
    },
  }
}

const createMockLighthouseResult = (overrides = {}) => ({
  lhr: {
    finalDisplayedUrl: 'https://example.com',
    audits: {
      'largest-contentful-paint': {
        id: 'largest-contentful-paint',
        numericValue: 1200,
        score: 0.95,
        displayValue: '1.2 s',
      },
      'cumulative-layout-shift': {
        id: 'cumulative-layout-shift',
        numericValue: 0.05,
        score: 0.98,
        displayValue: '0.05',
      },
      'first-contentful-paint': {
        id: 'first-contentful-paint',
        numericValue: 800,
        score: 0.97,
        displayValue: '0.8 s',
      },
      'total-blocking-time': {
        id: 'total-blocking-time',
        numericValue: 100,
        score: 0.92,
        displayValue: '100 ms',
      },
      'max-potential-fid': {
        id: 'max-potential-fid',
        numericValue: 50,
        score: 0.99,
        displayValue: '50 ms',
      },
      'interaction-to-next-paint': {
        id: 'interaction-to-next-paint',
        numericValue: 75,
        score: 0.96,
        displayValue: '75 ms',
      },
    },
    categories: {
      performance: {
        id: 'performance',
        score: 0.95,
      },
    },
    ...overrides,
  },
  report: '<html>Mock Lighthouse Report</html>',
})

describe('run command', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })

    jest.clearAllMocks()

    const mockedLogger = jest.mocked(logger)
    mockedLogger.info.mockReset()
    mockedLogger.error.mockReset()
    mockedLogger.warn.mockReset()
    mockedLogger.debug.mockReset()

    // Setup chrome-launcher mock to return a valid chrome instance
    jest.mocked(launch).mockResolvedValue({
      port: 9222,
      kill: jest.fn(),
    } as never)

    // Setup lighthouse mock to return realistic results
    const mockLighthouseResult = createMockLighthouseResult()
    jest.mocked(lighthouse).mockResolvedValue(mockLighthouseResult as never)

    await writeFile(
      join(TEST_DIR, 'perf.config.json'),
      JSON.stringify({
        targets: [
          {
            id: 'homepage',
            name: 'Homepage',
            url: 'https://example.com',
            tags: ['main'],
          },
          {
            id: 'about',
            name: 'About Page',
            url: 'https://example.com/about',
            tags: ['secondary'],
          },
        ],
        profiles: {
          custom: {
            id: 'custom',
            extends: 'default',
          },
          mobile: {
            id: 'mobile',
            extends: 'mobileSlow3G',
          },
        },
        concurrency: 2,
        maxRetries: 1,
        timeout: 30000,
        defaultProfile: 'desktop',
        plugins: [],
        output: {
          dir: './test-results',
          formats: ['cli'],
          includeRawLighthouse: false,
        },
      }),
    )

    process.chdir(TEST_DIR)
  })

  afterEach(async () => {
    process.chdir(join(TEST_DIR, '..'))
    await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('should run performance tests on all targets with all profiles', async () => {
    const capture = captureOutput()

    try {
      await runCli(['run'])

      const logs = capture.getLogs()
      const errors = capture.getErrors()

      expect(errors).toBe('')
      expect(logs).toContain('Loading configuration...')
      expect(logs).toContain('Running 2 targets with concurrency 2...')
      expect(logs).toContain('🚀 Starting 2 performance test(s)') // 2 targets with default profile
      expect(logs).toContain('⏳ Running: Homepage')
      expect(logs).toContain('⏳ Running: About Page')
      expect(logs).toContain('✅ Completed: Homepage')
      expect(logs).toContain('✅ Completed: About Page')
      expect(logs).toContain('🏁 Performance tests completed:')
      expect(logs).toContain('🎯 Performance Test Summary')
      expect(logs).toContain('Total tests run: 2')

      expect(jest.mocked(lighthouse)).toHaveBeenCalledTimes(2) // 2 targets with default profile
      expect(jest.mocked(launch)).toHaveBeenCalledTimes(2) // Chrome launched per task for our Runner
    } finally {
      capture.restore()
    }
  })

  it('should run specific target only', async () => {
    const capture = captureOutput()

    try {
      await runCli(['run', '--target', 'homepage'])

      const logs = capture.getLogs()

      expect(logs).toContain('Running 1 targets with concurrency 2...')
      expect(logs).toContain('🚀 Starting 1 performance test(s)') // Only 1 task for homepage with default profile
      expect(logs).toContain('⏳ Running: Homepage')
      expect(logs).not.toContain('About Page')
      expect(logs).toContain('Total tests run: 1')

      expect(jest.mocked(lighthouse)).toHaveBeenCalledTimes(1) // 1 target with default profile
    } finally {
      capture.restore()
    }
  })

  it('should run specific profile only', async () => {
    const capture = captureOutput()

    try {
      await runCli(['run', '--profile', 'desktop'])

      const logs = capture.getLogs()

      expect(logs).toContain('Running 2 targets with concurrency 2...')
      expect(logs).toContain('🚀 Starting 2 performance test(s)') // 2 targets with desktop profile
      expect(logs).toContain('(desktop)')
      expect(logs).not.toContain('(mobile)')
      expect(logs).toContain('Total tests run: 2')

      expect(jest.mocked(lighthouse)).toHaveBeenCalledTimes(2) // 2 targets × 1 profile
    } finally {
      capture.restore()
    }
  })

  it('should run specific target and profile combination', async () => {
    const capture = captureOutput()

    try {
      await runCli(['run', '--target', 'about', '--profile', 'mobile'])

      const logs = capture.getLogs()

      expect(logs).toContain('Running 1 targets with concurrency 2...')
      expect(logs).toContain('🚀 Starting 1 performance test(s)')
      expect(logs).toContain('⏳ Running: About Page (mobile)')
      expect(logs).toContain('Total tests run: 1')

      expect(jest.mocked(lighthouse)).toHaveBeenCalledTimes(1)
    } finally {
      capture.restore()
    }
  })

  it('should output JSON in quiet mode', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    const capture = captureOutput()

    try {
      await runCli(['run', '--target', 'homepage', '--profile', 'desktop', '--quiet'])

      const logs = capture.getLogs()
      const errors = capture.getErrors()

      expect(errors).toBe('')

      // In quiet mode, should output JSON - look for JSON array
      const jsonMatch = logs.match(/\[[\s\S]*\]/)
      expect(jsonMatch).toBeTruthy()

      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0])
        expect(Array.isArray(results)).toBe(true)
        expect(results).toHaveLength(1)

        const result = results[0]
        expect(result).toMatchObject({
          target: expect.objectContaining({
            id: 'homepage',
            name: 'Homepage',
            url: 'https://example.com',
          }),
          profileName: 'desktop',
          metrics: expect.objectContaining({
            performanceScore: 95,
            lcp: 1200,
            cls: 0.05,
          }),
          timestamp: expect.any(String),
          url: 'https://example.com',
        })
      }

      // Should not contain human-readable output in quiet mode (except the JSON)
      expect(logs).not.toContain('⏳ Running:')
      expect(logs).not.toContain('🎯 Performance Test Summary')
    } finally {
      capture.restore()
      mockExit.mockRestore()
    }
  })

  it('should handle non-existent target error', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    const capture = captureOutput()

    try {
      await expect(runCli(['run', '--target', 'non-existent'])).rejects.toThrow('process.exit called')

      const errors = capture.getErrors()
      expect(errors).toContain('Target "non-existent" not found in configuration')
      expect(mockExit).toHaveBeenCalledWith(1)
    } finally {
      capture.restore()
      mockExit.mockRestore()
    }
  })

  it('should handle non-existent profile by trying to run it', async () => {
    const capture = captureOutput()

    try {
      await runCli(['run', '--profile', 'non-existent'])

      const logs = capture.getLogs()

      // Should try to run with non-existent profile but fail during execution
      expect(logs).toContain('Running 2 targets with concurrency 2...')
      expect(logs).toContain('⏳ Running: Homepage (non-existent)')
      expect(logs).toContain('⏳ Running: About Page (non-existent)')
      // Tasks will fail and retry because the profile doesn't exist
      expect(logs).toContain('🔄 Retry')
    } finally {
      capture.restore()
    }
  })

  it('should handle lighthouse execution errors and continue with other tests', async () => {
    // Make lighthouse fail for the first call but succeed for others
    jest
      .mocked(lighthouse)
      .mockRejectedValueOnce(new Error('Chrome launch failed') as never)
      .mockResolvedValue(createMockLighthouseResult() as never)

    const capture = captureOutput()

    try {
      await runCli(['run', '--profile', 'desktop'])

      const logs = capture.getLogs()
      const errors = capture.getErrors()

      // Should continue with other tests after failure
      expect(errors).toContain('❌ Retrying: Homepage')
      expect(errors).toContain('Lighthouse audit failed for https://example.com: Chrome launch failed')
      expect(logs).toContain('About Page')
      expect(logs).toContain('✅ Completed: About Page')
      expect(logs).toContain('Total tests run: 2') // Both tasks eventually succeeded after retry

      expect(jest.mocked(lighthouse)).toHaveBeenCalledTimes(3) // Initial failure + 2 retries
    } finally {
      capture.restore()
    }
  })

  it('should handle metrics extraction correctly', async () => {
    const capture = captureOutput()

    try {
      await runCli(['run', '--target', 'homepage', '--profile', 'desktop'])

      const logs = capture.getLogs()

      // Should complete without errors and show performance score
      expect(logs).toContain('✅ Completed: Homepage')
      expect(logs).toContain('Score: 95')
      expect(logs).not.toContain('Warning')
    } finally {
      capture.restore()
    }
  })

  it('should use custom config file path', async () => {
    const customConfig = {
      targets: [
        {
          id: 'custom-target',
          name: 'Custom Target',
          url: 'https://custom.example.com',
          tags: ['custom'],
        },
      ],
      concurrency: 1,
      maxRetries: 1,
      timeout: 30000,
      defaultProfile: 'desktop',
      plugins: [],
      output: {
        dir: './custom-results',
        formats: ['cli'],
        includeRawLighthouse: false,
      },
    }

    await writeFile(join(TEST_DIR, 'custom.config.json'), JSON.stringify(customConfig))

    const capture = captureOutput()

    try {
      await runCli(['run', '--config', 'custom.config.json', '--target', 'custom-target', '--profile', 'desktop'])

      const logs = capture.getLogs()

      expect(logs).toContain('⏳ Running: Custom Target (desktop)')
      expect(jest.mocked(lighthouse)).toHaveBeenCalledTimes(1)
    } finally {
      capture.restore()
    }
  })

  it('should handle empty targets configuration', async () => {
    await writeFile(
      join(TEST_DIR, 'empty.config.json'),
      JSON.stringify({
        targets: [],
      }),
    )

    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    const capture = captureOutput()

    try {
      await expect(runCli(['run', '--config', 'empty.config.json'])).rejects.toThrow('process.exit called')

      const errors = capture.getErrors()
      // The error comes from validation which throws ConfigValidationError
      expect(errors).toContain('Performance test run failed')
      expect(mockExit).toHaveBeenCalledWith(1)
    } finally {
      capture.restore()
      mockExit.mockRestore()
    }
  })

  it('should display proper summary with multiple targets and scores', async () => {
    // Setup lighthouse to return different performance scores for different targets
    const goodResult = createMockLighthouseResult({
      categories: { performance: { score: 0.95 } }, // Good score
    })
    const poorResult = createMockLighthouseResult({
      categories: { performance: { score: 0.45 } }, // Poor score
    })

    jest
      .mocked(lighthouse)
      .mockResolvedValueOnce(goodResult as never) // Homepage
      .mockResolvedValueOnce(poorResult as never) // About page

    const capture = captureOutput()

    try {
      await runCli(['run', '--profile', 'desktop'])

      const logs = capture.getLogs()

      expect(logs).toContain('📊 Homepage:')
      expect(logs).toContain('📊 About Page:')
      expect(logs).toContain('Profile: desktop')
      expect(logs).toContain('🟢 Performance: 95') // Good score (>=90)
      expect(logs).toContain('🔴 Performance: 45') // Bad score (<50)
      expect(logs).toContain('🟢 LCP: 1200ms') // From mock data
      expect(logs).toContain('🟢 CLS: 0.05') // From mock data
      expect(logs).toContain('🟢 FCP: 800ms') // From mock data
    } finally {
      capture.restore()
    }
  })

  it('should run assertions when configured and include assertion results', async () => {
    // Create a config with assertions
    await writeFile(
      join(TEST_DIR, 'perf-with-assertions.config.json'),
      JSON.stringify({
        targets: [
          {
            id: 'homepage',
            name: 'Homepage',
            url: 'https://example.com',
            tags: ['main'],
          },
        ],
        profiles: {
          desktop: {
            id: 'desktop',
            extends: 'default',
          },
        },
        concurrency: 1,
        maxRetries: 1,
        timeout: 30000,
        defaultProfile: 'desktop',
        plugins: [],
        output: {
          dir: './test-results',
          formats: ['cli'],
          includeRawLighthouse: false,
        },
        assertions: {
          global: {
            metrics: {
              lcp: { max: 2000 }, // Should pass (mock returns 1200ms)
              cls: { max: 0.1 }, // Should pass (mock returns 0.05)
              performanceScore: { min: 90 }, // Should pass (mock returns 95)
            },
          },
          byTag: {
            main: {
              metrics: {
                fcp: { max: 1000 }, // Should pass (mock returns 800ms)
              },
            },
          },
        },
      }),
    )

    const capture = captureOutput()

    try {
      await runCli(['run', '--config', 'perf-with-assertions.config.json'])

      const logs = capture.getLogs()
      const errors = capture.getErrors()

      // Should run successfully
      expect(errors).toBe('')
      expect(logs).toContain('Loading configuration...')
      expect(logs).toContain('Running 1 targets with concurrency 1...')
      expect(logs).toContain('🚀 Starting 1 performance test(s)')
      expect(logs).toContain('⏳ Running: Homepage')
      expect(logs).toContain('✅ Completed: Homepage')
      expect(logs).toContain('🏁 Performance tests completed:')

      // Should include assertion results in output
      expect(logs).toContain('📊 Homepage:')
      expect(logs).toContain('Profile: desktop')

      // Should show metrics (these come from our mock lighthouse result)
      expect(logs).toContain('🟢 LCP: 1200ms')
      expect(logs).toContain('🟢 CLS: 0.05')
      expect(logs).toContain('🟢 Performance: 95')
      expect(logs).toContain('🟢 FCP: 800ms')

      expect(jest.mocked(lighthouse)).toHaveBeenCalledTimes(1)
      expect(jest.mocked(launch)).toHaveBeenCalledTimes(1)
    } finally {
      capture.restore()
    }
  })
})
