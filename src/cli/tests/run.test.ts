/* eslint-disable no-console */
import { describe, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { runCli } from '../cli'
import { logger } from '../../logger'

const TEST_DIR = join(process.cwd(), 'test-configs-run')

jest.mock('chrome-launcher', () => ({
  launch: jest.fn(),
  killAll: jest.fn(),
}))

jest.mock('lighthouse', () => jest.fn())

jest.mock('../../lighthouse/launcher', () => {
  const mockLauncherMethods = {
    launchChrome: jest.fn(),
    run: jest.fn(),
    kill: jest.fn(),
    cleanup: jest.fn(),
  }

  mockLauncherMethods.launchChrome.mockResolvedValue(undefined as never)
  mockLauncherMethods.kill.mockResolvedValue(undefined as never)
  mockLauncherMethods.cleanup.mockResolvedValue(undefined as never)

  return {
    LighthouseLauncher: jest.fn().mockImplementation(() => mockLauncherMethods),
    createLighthouseLauncher: jest.fn().mockReturnValue(mockLauncherMethods),
    // Export the methods for test access
    __mockLauncherMethods: mockLauncherMethods,
  }
})

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

const getMockedLauncher = async () => {
  return jest.mocked(await import('../../lighthouse/launcher')) as unknown as {
    createLighthouseLauncher: jest.Mock
    __mockLauncherMethods: {
      launchChrome: jest.Mock
      run: jest.Mock
      kill: jest.Mock
      cleanup: jest.Mock
    }
  }
}

describe('run command', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })

    jest.clearAllMocks()

    const mockedLogger = jest.mocked(logger)
    mockedLogger.info.mockReset()
    mockedLogger.error.mockReset()
    mockedLogger.warn.mockReset()
    mockedLogger.debug.mockReset()

    // Setup lighthouse/launcher mock to return realistic results
    const mockLighthouseResult = createMockLighthouseResult()
    const mockedLauncher = jest.mocked(await import('../../lighthouse/launcher')) as unknown as {
      createLighthouseLauncher: jest.Mock
      __mockLauncherMethods: {
        launchChrome: jest.Mock
        run: jest.Mock
        kill: jest.Mock
        cleanup: jest.Mock
      }
    }

    mockedLauncher.__mockLauncherMethods.run.mockResolvedValue(mockLighthouseResult as never)

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
        runsPerTask: 1,
        maxRetries: 1,
        timeout: 30000,
        defaultProfile: 'desktop',
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

      expect(logs).toMatchSnapshot('run-all-targets-output')

      const mockedLauncher = await getMockedLauncher()

      expect(mockedLauncher.__mockLauncherMethods.run).toHaveBeenCalledTimes(2) // 2 targets with default profile
      expect(mockedLauncher.createLighthouseLauncher).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
          logLevel: 'error',
          timeout: 30000,
        }),
        2, // concurrency
      )
    } finally {
      capture.restore()
    }
  })

  it('should run specific target only', async () => {
    const capture = captureOutput()

    try {
      await runCli(['run', '--target', 'homepage'])

      const logs = capture.getLogs()

      expect(logs).toMatchSnapshot('run-specific-target-output')
      expect(logs).not.toContain('About Page')

      const mockedLauncher = await getMockedLauncher()
      expect(mockedLauncher.__mockLauncherMethods.run).toHaveBeenCalledTimes(1) // 1 target with default profile
      expect(mockedLauncher.createLighthouseLauncher).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
          logLevel: 'error',
          timeout: 30000,
        }),
        2, // concurrency
      )
    } finally {
      capture.restore()
    }
  })

  it('should run specific profile only', async () => {
    const capture = captureOutput()

    try {
      await runCli(['run', '--profile', 'desktop'])

      const logs = capture.getLogs()

      expect(logs).toMatchSnapshot('run-specific-profile-output')
      expect(logs).toContain('(desktop)')
      expect(logs).not.toContain('(mobile)')

      const mockedLauncher = await getMockedLauncher()
      expect(mockedLauncher.__mockLauncherMethods.run).toHaveBeenCalledTimes(2) // 2 targets × 1 profile
    } finally {
      capture.restore()
    }
  })

  it('should run specific target and profile combination', async () => {
    const capture = captureOutput()

    try {
      await runCli(['run', '--target', 'about', '--profile', 'mobile'])

      const logs = capture.getLogs()

      expect(logs).toMatchSnapshot('run-target-profile-combination-output')
      expect(logs).toContain('⏳ Running: About Page (mobile)')

      const mockedLauncher = await getMockedLauncher()
      expect(mockedLauncher.__mockLauncherMethods.run).toHaveBeenCalledTimes(1)
    } finally {
      capture.restore()
    }
  })

  it('should output JSON in when running in format json', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    const capture = captureOutput()

    try {
      await runCli(['run', '--target', 'homepage', '--profile', 'desktop', '--format', 'json', '--quiet'])

      const logs = capture.getLogs()
      const errors = capture.getErrors()

      expect(errors).toBe('')

      // In quiet mode, should output JSON - look for JSON object
      const jsonMatch = logs.match(/\{[\s\S]*\}/)
      expect(jsonMatch).toBeTruthy()
      expect(JSON.parse(jsonMatch?.[0] as string)).toMatchObject({
        run: {
          id: expect.any(String),
          startTime: expect.any(String),
          endTime: expect.any(String),
          duration: expect.any(Number),
          passed: true,
          totalTasks: 1,
          completedTasks: 1,
          failedTasks: 0,
        },
        targets: [
          {
            id: expect.any(String),
            url: 'https://example.com',
            name: 'Homepage',
            tags: ['main'],
            profile: 'desktop',
            status: 'passed',
            metrics: { lcp: 1200, cls: 0.05, fid: 50, inp: 75, tbt: 100, fcp: 800, performanceScore: 95 },
            assertions: { passed: true, failureCount: 0, results: [] },
          },
        ],
        journeys: [],
        environments: [],
        meta: { version: '1.0.0', generatedAt: expect.any(String), generator: 'faros-json-reporter' },
      })

      // Should not contain human-readable output in quiet mode (except the JSON)
      expect(logs).not.toContain('⏳ Running:')
      expect(logs).not.toContain('✓ PASSED Performance Test Results')
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
      runsPerTask: 1,
      maxRetries: 1,
      timeout: 30000,
      defaultProfile: 'desktop',
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
      const mockedLauncher = await getMockedLauncher()
      expect(mockedLauncher.__mockLauncherMethods.run).toHaveBeenCalledTimes(1)
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
        runsPerTask: 1,
        timeout: 30000,
        defaultProfile: 'desktop',
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
      // Normalize dynamic task IDs for consistent snapshots
      const normalizedLogs = logs.replace(/homepage_desktop_\d+_[a-z0-9]+/g, 'homepage_desktop_TASK_ID')
      expect(normalizedLogs).toMatchSnapshot('run-with-assertions-output')
      expect(logs).toContain('https://example.com')
      expect(logs).toContain('PASS')
      expect(logs).toContain('95')

      const mockedLauncher = await getMockedLauncher()
      expect(mockedLauncher.__mockLauncherMethods.run).toHaveBeenCalledTimes(1)
    } finally {
      capture.restore()
    }
  })
})
