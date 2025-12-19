import { describe, it, expect } from '@jest/globals'
import { CLIReporter } from './cli-reporter'
import { RunSummary } from '../../core/types/reporting'
import { TaskResult } from '../report-collector'
import { Task } from '../../core/types/execution'
import { Target } from '../../core/types/target'

describe('CLIReporter', () => {
  const createMockTarget = (url = 'https://example.com'): Target => ({
    id: 'test-target',
    url,
    name: 'Test Target',
    tags: ['test'],
  })

  const createMockTask = (url?: string): Task => ({
    id: 'task-1',
    target: createMockTarget(url),
    profile: { id: 'test-profile' },
    attempt: 1,
    createdAt: new Date(),
    logicalTaskId: 'test-target_test-profile',
    runIndex: 0,
  })

  const createMockTaskResult = (overrides: Partial<TaskResult> = {}): TaskResult => ({
    task: createMockTask(),
    lighthouseResult: {
      taskId: 'task-1',
      target: createMockTarget(),
      profile: { id: 'test-profile' },
      metrics: {
        lcp: 1500,
        cls: 0.1,
        fid: 100,
        tbt: 200,
        fcp: 1000,
        performanceScore: 85,
      },
      duration: 5000,
      timestamp: new Date(),
    },
    assertionReport: {
      taskId: 'task-1',
      target: createMockTarget(),
      results: [
        {
          metric: 'lcp',
          passed: true,
          actual: 1500,
          expected: { max: 2000 },
        },
      ],
      passed: true,
      failureCount: 0,
    },
    startTime: new Date(),
    endTime: new Date(),
    ...overrides,
  })

  const createMockRunSummary = (taskResults: TaskResult[] = []): RunSummary => ({
    startTime: new Date('2023-01-01T10:00:00Z'),
    endTime: new Date('2023-01-01T10:00:05Z'),
    duration: 5000,
    totalTasks: taskResults.length,
    completedTasks: taskResults.filter((r) => r.lighthouseResult).length,
    failedTasks: taskResults.filter((r) => r.error || (r.assertionReport && !r.assertionReport.passed)).length,
    passed: taskResults.every((r) => !r.error && (!r.assertionReport || r.assertionReport.passed)),
    taskResults,
  })

  describe('generate', () => {
    it('should generate report for empty results', () => {
      const reporter = new CLIReporter({ showColors: false })
      const summary = createMockRunSummary([])

      const output = reporter.generate(summary)

      expect(output).toContain('PASSED Performance Test Results')
      expect(output).toContain('Tasks: 0 total, 0 completed, 0 failed')
    })

    it('should generate report for passing results', () => {
      const reporter = new CLIReporter({ showColors: false })
      const taskResult = createMockTaskResult()
      const summary = createMockRunSummary([taskResult])

      const output = reporter.generate(summary)

      expect(output).toContain('PASSED Performance Test Results')
      expect(output).toContain('https://example.com')
      expect(output).toContain('PASS')
      expect(output).toContain('1500ms') // LCP
      expect(output).toContain('0.100') // CLS
      expect(output).toContain('85') // Performance Score
    })

    it('should generate report for failing results', () => {
      const reporter = new CLIReporter({ showColors: false })
      const taskResult = createMockTaskResult({
        assertionReport: {
          taskId: 'task-1',
          target: createMockTarget(),
          results: [
            {
              metric: 'lcp',
              passed: false,
              actual: 3000,
              expected: { max: 2000 },
            },
          ],
          passed: false,
          failureCount: 1,
        },
      })
      const summary = createMockRunSummary([taskResult])

      const output = reporter.generate(summary)

      expect(output).toContain('FAILED Performance Test Results')
      expect(output).toContain('FAIL')
      expect(output).toContain('Failed Tasks:')
      expect(output).toContain('lcp: 3000 > 2000')
    })

    it('should handle error results', () => {
      const reporter = new CLIReporter({ showColors: false })
      const taskResult = createMockTaskResult({
        lighthouseResult: undefined,
        assertionReport: undefined,
        error: 'Lighthouse failed to run',
      })
      const summary = createMockRunSummary([taskResult])

      const output = reporter.generate(summary)

      expect(output).toContain('ERROR')
      expect(output).toContain('Lighthouse failed to run')
    })

    it('should truncate long URLs', () => {
      const longUrl = 'https://very-long-domain-name.example.com/very/long/path/that/exceeds/the/limit'
      const reporter = new CLIReporter({ showColors: false, maxUrlLength: 30 })
      const taskResult = createMockTaskResult()
      taskResult.task = createMockTask(longUrl)
      const summary = createMockRunSummary([taskResult])

      const output = reporter.generate(summary)

      expect(output).toContain('https://very-long-domain-na...')
      expect(output).not.toContain(longUrl)
    })

    it('should show custom metrics', () => {
      const reporter = new CLIReporter({
        showColors: false,
        showMetrics: ['fcp', 'tbt'],
      })
      const taskResult = createMockTaskResult()
      const summary = createMockRunSummary([taskResult])

      const output = reporter.generate(summary)

      expect(output).toContain('FCP')
      expect(output).toContain('TBT')
      expect(output).toContain('1000ms') // FCP value
      expect(output).toContain('200ms') // TBT value
      expect(output).not.toContain('LCP') // Not in custom metrics
    })
  })

  describe('colorization', () => {
    it('should apply colors when enabled', () => {
      const reporter = new CLIReporter({ showColors: true })
      const taskResult = createMockTaskResult()
      const summary = createMockRunSummary([taskResult])

      const output = reporter.generate(summary)

      // Should contain ANSI color codes when colors enabled
      // eslint-disable-next-line no-control-regex
      expect(output).toMatch(/\x1b\[[0-9;]*m/)
    })

    it('should not apply colors when disabled', () => {
      const reporter = new CLIReporter({ showColors: false })
      const taskResult = createMockTaskResult()
      const summary = createMockRunSummary([taskResult])

      const output = reporter.generate(summary)

      // Should not contain ANSI color codes when colors disabled
      // eslint-disable-next-line no-control-regex
      expect(output).not.toMatch(/\x1b\[[0-9;]*m/)
    })
  })
})
