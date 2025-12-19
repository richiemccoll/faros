import { JSONReporter, type JSONReport } from './json-reporter'
import { RunSummary } from '../../core/types/reporting'
import { TaskResult } from '../report-collector'

// Mock task result fixture for testing
const createMockTaskResult = (overrides: Partial<TaskResult['task']> = {}): TaskResult => ({
  task: {
    id: 'test-task',
    target: {
      id: 'home',
      url: 'https://example.com',
      name: 'Home Page',
      tags: ['critical', 'homepage'],
    },
    profile: { id: 'desktop' },
    attempt: 1,
    createdAt: new Date(),
    logicalTaskId: 'home_desktop',
    runIndex: 0,
    ...overrides,
  },
  lighthouseResult: {
    taskId: 'test-task',
    target: {
      id: 'home',
      url: 'https://example.com',
      name: 'Home Page',
      tags: ['critical', 'homepage'],
    },
    profile: { id: 'desktop' },
    metrics: {
      lcp: 2100,
      cls: 0.05,
      fcp: 1200,
      performanceScore: 85,
    },
    raw: {
      /* mock lighthouse data */
    },
    duration: 5000,
    timestamp: new Date(),
  },
  assertionReport: {
    taskId: 'test-task',
    target: {
      id: 'home',
      url: 'https://example.com',
      name: 'Home Page',
      tags: ['critical', 'homepage'],
    },
    results: [
      {
        metric: 'lcp',
        passed: true,
        actual: 2100,
        expected: { max: 2500 },
      },
      {
        metric: 'cls',
        passed: true,
        actual: 0.05,
        expected: { max: 0.1 },
      },
    ],
    passed: true,
    failureCount: 0,
  },
  startTime: new Date('2023-12-01T10:00:00Z'),
  endTime: new Date('2023-12-01T10:00:05Z'),
})

const createMockFailedTaskResult = (): TaskResult => ({
  task: {
    id: 'slow-page',
    target: {
      id: 'product',
      url: 'https://example.com/product',
      name: 'Product Page',
      tags: ['ecommerce'],
    },
    profile: { id: 'mobile' },
    attempt: 1,
    createdAt: new Date(),
    logicalTaskId: 'product_mobile',
    runIndex: 0,
  },
  lighthouseResult: {
    taskId: 'slow-page',
    target: {
      id: 'product',
      url: 'https://example.com/product',
      name: 'Product Page',
      tags: ['ecommerce'],
    },
    profile: { id: 'mobile' },
    metrics: {
      lcp: 4200,
      cls: 0.15,
      performanceScore: 45,
    },
    raw: {
      /* mock lighthouse data */
    },
    duration: 8000,
    timestamp: new Date(),
  },
  assertionReport: {
    taskId: 'slow-page',
    target: {
      id: 'product',
      url: 'https://example.com/product',
      name: 'Product Page',
      tags: ['ecommerce'],
    },
    results: [
      {
        metric: 'lcp',
        passed: false,
        actual: 4200,
        expected: { max: 2500 },
        delta: {
          baseline: 3800,
          change: 400,
          changePct: 10.5,
        },
      },
      {
        metric: 'cls',
        passed: false,
        actual: 0.15,
        expected: { max: 0.1 },
      },
    ],
    passed: false,
    failureCount: 2,
  },
  startTime: new Date('2023-12-01T10:01:00Z'),
  endTime: new Date('2023-12-01T10:01:08Z'),
})

const createMockErrorTaskResult = (): TaskResult => ({
  task: {
    id: 'error-page',
    target: {
      id: 'broken',
      url: 'https://example.com/broken',
      tags: [],
    },
    profile: { id: 'desktop' },
    attempt: 1,
    createdAt: new Date(),
    logicalTaskId: 'broken_desktop',
    runIndex: 0,
  },
  error: 'Network timeout after 30s',
  startTime: new Date('2023-12-01T10:02:00Z'),
})

const createMockRunSummary = (taskResults: TaskResult[]): RunSummary => {
  const completedTasks = taskResults.filter((r) => r.lighthouseResult && !r.error).length
  const failedTasks = taskResults.filter((r) => r.error || (r.assertionReport && !r.assertionReport.passed)).length
  const passed = taskResults.length > 0 && failedTasks === 0 && completedTasks === taskResults.length

  return {
    startTime: new Date('2023-12-01T10:00:00Z'),
    endTime: new Date('2023-12-01T10:05:00Z'),
    duration: 300000, // 5 minutes
    totalTasks: taskResults.length,
    completedTasks,
    failedTasks,
    passed,
    taskResults: taskResults.map((r) => ({
      task: r.task,
      lighthouseResult: r.lighthouseResult,
      assertionReport: r.assertionReport,
      error: r.error,
    })),
  }
}

describe('JSONReporter', () => {
  describe('generate', () => {
    it('should generate valid JSON for successful run', () => {
      const taskResults = [createMockTaskResult()]
      const summary = createMockRunSummary(taskResults)

      const reporter = new JSONReporter()
      const output = reporter.generate(summary)

      const report: JSONReport = JSON.parse(output)

      expect(report.run).toMatchObject({
        startTime: '2023-12-01T10:00:00.000Z',
        endTime: '2023-12-01T10:05:00.000Z',
        duration: 300000,
        passed: true,
        totalTasks: 1,
        completedTasks: 1,
        failedTasks: 0,
      })

      expect(report.run.id).toMatch(/^run-\d+$/)

      expect(report.targets).toHaveLength(1)
      const target = report.targets[0]!

      expect(target).toMatchObject({
        id: 'test-task',
        url: 'https://example.com',
        name: 'Home Page',
        tags: ['critical', 'homepage'],
        profile: 'desktop',
        status: 'passed',
      })

      expect(target.metrics).toEqual({
        lcp: 2100,
        cls: 0.05,
        fcp: 1200,
        performanceScore: 85,
      })

      expect(target.assertions.passed).toBe(true)
      expect(target.assertions.failureCount).toBe(0)
      expect(target.assertions.results).toHaveLength(2)

      expect(report.journeys).toEqual([])
      expect(report.environments).toEqual([])

      expect(report.meta).toMatchObject({
        version: '1.0.0',
        generator: 'faros-json-reporter',
      })
      expect(report.meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should handle failed assertions with deltas', () => {
      const taskResults = [createMockFailedTaskResult()]
      const summary = createMockRunSummary(taskResults)

      const reporter = new JSONReporter()
      const output = reporter.generate(summary)
      const report: JSONReport = JSON.parse(output)

      expect(report.run.passed).toBe(false)
      expect(report.run.failedTasks).toBe(1)

      const target = report.targets[0]!
      expect(target.status).toBe('failed')
      expect(target.assertions.passed).toBe(false)
      expect(target.assertions.failureCount).toBe(2)

      const lcpResult = target.assertions.results.find((r) => r.metric === 'lcp')!
      expect(lcpResult.delta).toEqual({
        baseline: 3800,
        change: 400,
        changePct: 10.5,
      })
    })

    it('should handle task errors', () => {
      const taskResults = [createMockErrorTaskResult()]
      const summary = createMockRunSummary(taskResults)

      const reporter = new JSONReporter()
      const output = reporter.generate(summary)
      const report: JSONReport = JSON.parse(output)

      const target = report.targets[0]!
      expect(target.status).toBe('error')
      expect(target.error).toBe('Network timeout after 30s')
      expect(target.metrics).toBeUndefined()
      expect(target.assertions.results).toEqual([])
    })

    it('should handle mixed results', () => {
      const taskResults = [createMockTaskResult(), createMockFailedTaskResult(), createMockErrorTaskResult()]
      const summary = createMockRunSummary(taskResults)

      const reporter = new JSONReporter()
      const output = reporter.generate(summary)
      const report: JSONReport = JSON.parse(output)

      expect(report.run.totalTasks).toBe(3)
      expect(report.run.completedTasks).toBe(2)
      expect(report.run.failedTasks).toBe(2) // 1 failed assertion + 1 error
      expect(report.run.passed).toBe(false)

      expect(report.targets).toHaveLength(3)
      expect(report.targets[0]!.status).toBe('passed')
      expect(report.targets[1]!.status).toBe('failed')
      expect(report.targets[2]!.status).toBe('error')
    })
  })

  describe('options', () => {
    it('should include raw Lighthouse data when requested', () => {
      const taskResults = [createMockTaskResult()]
      const summary = createMockRunSummary(taskResults)

      const reporter = new JSONReporter({ includeRawLighthouse: true })
      const output = reporter.generate(summary)
      const report: JSONReport = JSON.parse(output)

      const target = report.targets[0]!
      expect(target.lighthouse).toBeDefined()
    })

    it('should exclude raw Lighthouse data by default', () => {
      const taskResults = [createMockTaskResult()]
      const summary = createMockRunSummary(taskResults)

      const reporter = new JSONReporter()
      const output = reporter.generate(summary)
      const report: JSONReport = JSON.parse(output)

      const target = report.targets[0]!
      expect(target.lighthouse).toBeUndefined()
    })

    it('should pretty print when requested', () => {
      const taskResults = [createMockTaskResult()]
      const summary = createMockRunSummary(taskResults)

      const reporter = new JSONReporter({ prettyPrint: true })
      const output = reporter.generate(summary)

      // Pretty printed JSON should contain newlines and indentation
      expect(output).toContain('\n')
      expect(output).toContain('  ')
    })

    it('should minify JSON by default', () => {
      const taskResults = [createMockTaskResult()]
      const summary = createMockRunSummary(taskResults)

      const reporter = new JSONReporter()
      const output = reporter.generate(summary)

      // Minified JSON should not contain extra whitespace
      expect(output).not.toContain('\n')
      expect(output).not.toContain('  ')
    })
  })

  describe('writeFile', () => {
    it('should write JSON to file', async () => {
      const taskResults = [createMockTaskResult()]
      const summary = createMockRunSummary(taskResults)
      const reporter = new JSONReporter()

      // Mock fs.writeFile
      const mockWriteFile = jest.fn()
      jest.doMock('fs/promises', () => ({
        writeFile: mockWriteFile,
      }))

      await reporter.writeFile(summary, '/tmp/report.json')

      expect(mockWriteFile).toHaveBeenCalledWith('/tmp/report.json', expect.any(String), 'utf-8')

      // Verify the content is valid JSON
      const content = mockWriteFile.mock.calls[0]![1] as string
      expect(() => JSON.parse(content)).not.toThrow()
    })
  })
})
