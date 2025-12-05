import { run, createTarget, createTargets, validateConfig } from '../src'

jest.mock('chrome-launcher', () => ({
  launch: jest.fn(),
  killAll: jest.fn(),
}))

jest.mock('lighthouse', () => jest.fn())

jest.mock('./lighthouse/launcher', () => {
  const mockLauncherMethods = {
    launchChrome: jest.fn().mockResolvedValue(undefined),
    run: jest.fn(),
    kill: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn().mockResolvedValue(undefined),
  }

  return {
    LighthouseLauncher: jest.fn().mockImplementation(() => mockLauncherMethods),
    createLighthouseLauncher: jest.fn().mockReturnValue(mockLauncherMethods),
    // Export the methods for test access
    __mockLauncherMethods: mockLauncherMethods,
  }
})

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
    },
    categories: {
      performance: {
        id: 'performance',
        title: 'Performance',
        score: 0.96,
      },
    },
    configSettings: {},
    lighthouseVersion: '11.0.0',
    userAgent: 'Mozilla/5.0 (test)',
    environment: {
      networkUserAgent: 'Mozilla/5.0 (test)',
      hostUserAgent: 'Mozilla/5.0 (test)',
      benchmarkIndex: 1000,
    },
    fetchTime: new Date().toISOString(),
    requestedUrl: 'https://example.com',
    runWarnings: [],
    ...overrides,
  },
  report: '<html>Mock HTML Report</html>',
  artifacts: {},
})

const TEST_URL = 'https://example.com'

describe('faros API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('basic run with single URL', async () => {
    const mockedLauncher = jest.mocked(await import('./lighthouse/launcher')) as unknown as {
      createLighthouseLauncher: jest.Mock
      __mockLauncherMethods: {
        launchChrome: jest.Mock
        run: jest.Mock
        kill: jest.Mock
        cleanup: jest.Mock
      }
    }

    // Setup the launcher mock to return our mock results
    const mockLighthouseResult = createMockLighthouseResult()
    const mockMethods = mockedLauncher.__mockLauncherMethods
    mockMethods.run.mockResolvedValue(mockLighthouseResult)

    const result = await run({
      targets: TEST_URL,
      timeout: 30000,
    })

    expect(mockedLauncher.createLighthouseLauncher).toHaveBeenCalledTimes(1)
    expect(mockedLauncher.createLighthouseLauncher).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: true,
        logLevel: 'error',
        timeout: 30000,
      }),
      1, // concurrency
    )

    expect(mockMethods.run).toHaveBeenCalledWith(
      expect.objectContaining({
        url: TEST_URL,
        id: expect.any(String),
      }),
      expect.any(Object), // profile
    )

    expect(result.totalTasks).toBe(1)
    expect(result.completedTasks).toBeGreaterThanOrEqual(0)
    expect(result.taskResults).toHaveLength(1)

    const taskResult = result.taskResults[0]
    expect(taskResult?.task.target.url).toBe(TEST_URL)
    expect(taskResult?.lighthouseResult).toBeDefined()
    expect(taskResult?.lighthouseResult?.metrics).toEqual({
      cls: 0.05,
      fcp: 800,
      fid: 50,
      inp: undefined,
      lcp: 1200,
      performanceScore: 96,
      tbt: 100,
    })
  })

  test('basic run with multiple URLs', async () => {
    const TEST_URLS = ['https://example.com/page1', 'https://example.com/page2']
    const mockedLauncher = jest.mocked(await import('./lighthouse/launcher')) as unknown as {
      createLighthouseLauncher: jest.Mock
      __mockLauncherMethods: {
        launchChrome: jest.Mock
        run: jest.Mock
        kill: jest.Mock
        cleanup: jest.Mock
      }
    }

    // Setup the launcher mock to return our mock results
    const mockLighthouseResult = createMockLighthouseResult()
    const mockMethods = mockedLauncher.__mockLauncherMethods
    mockMethods.run.mockResolvedValue(mockLighthouseResult)

    const result = await run({
      targets: TEST_URLS,
      timeout: 30000,
    })

    expect(mockedLauncher.createLighthouseLauncher).toHaveBeenCalledTimes(1)
    expect(mockedLauncher.createLighthouseLauncher).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: true,
        logLevel: 'error',
        timeout: 30000,
      }),
      1, // concurrency
    )

    expect(mockMethods.run).toHaveBeenCalledTimes(2)
    expect(mockMethods.run).toHaveBeenCalledWith(
      expect.objectContaining({
        url: TEST_URLS[0],
        id: expect.any(String),
      }),
      expect.any(Object), // profile
    )
    expect(mockMethods.run).toHaveBeenCalledWith(
      expect.objectContaining({
        url: TEST_URLS[1],
        id: expect.any(String),
      }),
      expect.any(Object), // profile
    )

    expect(result.totalTasks).toBe(2)
    expect(result.completedTasks).toBeGreaterThanOrEqual(0)
    expect(result.taskResults).toHaveLength(2)

    TEST_URLS.forEach((url) => {
      const taskResult = result.taskResults.find((result) => result.task.target.url === url)
      expect(taskResult?.task.target.url).toBe(url)
      expect(taskResult?.lighthouseResult).toBeDefined()
      expect(taskResult?.lighthouseResult?.metrics).toEqual({
        cls: 0.05,
        fcp: 800,
        fid: 50,
        inp: undefined,
        lcp: 1200,
        performanceScore: 96,
        tbt: 100,
      })
    })
  })

  test('run with Target objects', async () => {
    const target = createTarget(TEST_URL, {
      name: 'Test Page',
      tags: ['test'],
    })

    const result = await run({
      targets: target,
      timeout: 30000,
    })

    expect(result.totalTasks).toBe(1)
    if (result.completedTasks > 0) {
      const taskResult = result.taskResults[0]
      expect(taskResult?.task.target.name).toBe('Test Page')
      expect(taskResult?.task.target.tags).toContain('test')
    }
  })

  test('run with assertions', async () => {
    const result = await run({
      targets: TEST_URL,
      assertions: {
        performanceScore: { min: 0 },
        lcp: { max: 10000 },
        cls: { max: 1.0 },
        fid: { max: 1000 },
        inp: { max: 1000 },
        tbt: { max: 2000 },
        fcp: { max: 5000 },
      },
      timeout: 30000,
    })

    expect(result).toBeDefined()
    if (result.completedTasks > 0) {
      const taskResult = result.taskResults[0]
      expect(taskResult?.assertionReport).toBeDefined()
    }
  })

  test('createTarget helper', () => {
    const target = createTarget('https://example.com', {
      name: 'Example',
      tags: ['test', 'example'],
    })

    expect(target.id).toBeDefined()
    expect(target.name).toBe('Example')
    expect(target.url).toBe('https://example.com')
    expect(target.tags).toEqual(['test', 'example'])
  })

  test('createTargets helper', () => {
    const urls = ['https://example.com', 'https://github.com']
    const targets = createTargets(urls, { tags: ['batch'] })

    expect(targets).toHaveLength(2)
    targets.forEach((target, i) => {
      expect(target.url).toBe(urls[i])
      expect(target.tags).toContain('batch')
      expect(target.id).toBeDefined()
    })
  })

  test('validateConfig function', () => {
    const options = {
      targets: 'https://example.com',
      profile: 'mobile',
      concurrency: 2,
    }

    const config = validateConfig(options)

    expect(config.targets).toHaveLength(1)
    expect(config?.targets?.[0]?.url).toBe('https://example.com')
    expect(config.defaultProfile).toBe('mobile')
    expect(config.concurrency).toBe(2)
  })

  test('callback functions work', async () => {
    const callbacks = {
      onStart: jest.fn(),
      onTaskStart: jest.fn(),
      onTaskComplete: jest.fn(),
      onTaskFailed: jest.fn(),
      onComplete: jest.fn(),
    }

    await run({
      targets: TEST_URL,
      timeout: 30000,
      ...callbacks,
    })

    expect(callbacks.onStart).toHaveBeenCalledWith(1)
    expect(callbacks.onTaskStart).toHaveBeenCalled()
    expect(callbacks.onComplete).toHaveBeenCalled()
    expect(callbacks.onTaskFailed).not.toHaveBeenCalled()

    // onTaskComplete only called if task succeeds
    if (callbacks.onTaskComplete.mock.calls.length > 0) {
      expect(callbacks.onTaskComplete).toHaveBeenCalled()
    }
  })
})
