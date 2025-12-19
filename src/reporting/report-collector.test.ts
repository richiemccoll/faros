import { describe, it, expect, beforeEach } from '@jest/globals'
import { ReportCollector, TaskResult } from './report-collector'
import { Task, LighthouseResult } from '../core/types/execution'
import { AssertionReport } from '../core/types/assertions'
import { Target } from '../core/types/target'
import { NormalizedMetrics } from '../core/types/metrics'

describe('ReportCollector', () => {
  let collector: ReportCollector

  beforeEach(() => {
    collector = new ReportCollector()
  })

  const createMockTarget = (): Target => ({
    id: 'test-target',
    url: 'https://example.com',
    name: 'Test Target',
    tags: ['test', 'example'],
  })

  const createMockTask = (): Task => ({
    id: 'task-1',
    target: createMockTarget(),
    profile: { id: 'test-profile' },
    attempt: 1,
    createdAt: new Date(),
    logicalTaskId: 'test-target_test-profile',
    runIndex: 0,
  })

  const createMockMetrics = (): NormalizedMetrics => ({
    lcp: 1500,
    cls: 0.1,
    fid: 100,
    tbt: 200,
    fcp: 1000,
    performanceScore: 85,
  })

  const createMockLighthouseResult = (): LighthouseResult => ({
    taskId: 'task-1',
    target: createMockTarget(),
    profile: { id: 'test-profile' },
    metrics: createMockMetrics(),
    duration: 5000,
    timestamp: new Date(),
  })

  const createMockAssertionReport = (passed: boolean): AssertionReport => ({
    taskId: 'task-1',
    target: createMockTarget(),
    results: [
      {
        metric: 'lcp',
        passed,
        actual: 1500,
        expected: { max: 2000 },
      },
    ],
    passed,
    failureCount: passed ? 0 : 1,
  })

  it('should start empty', () => {
    expect(collector.isEmpty()).toBe(true)
    expect(collector.getRawResults()).toHaveLength(0)
  })

  it('should add task results', () => {
    const taskResult: TaskResult = {
      task: createMockTask(),
      lighthouseResult: createMockLighthouseResult(),
      assertionReport: createMockAssertionReport(true),
      startTime: new Date(),
      endTime: new Date(),
    }

    collector.addTaskResult(taskResult)

    expect(collector.isEmpty()).toBe(false)
    expect(collector.getRawResults()).toHaveLength(1)
  })

  it('should generate correct run summary for passing results', () => {
    const taskResult: TaskResult = {
      task: createMockTask(),
      lighthouseResult: createMockLighthouseResult(),
      assertionReport: createMockAssertionReport(true),
      startTime: new Date(),
      endTime: new Date(),
    }

    collector.addTaskResult(taskResult)
    collector.completeRun()

    const summary = collector.getSummary()

    expect(summary.totalTasks).toBe(1)
    expect(summary.completedTasks).toBe(1)
    expect(summary.failedTasks).toBe(0)
    expect(summary.passed).toBe(true)
    expect(summary.taskResults).toHaveLength(1)
  })

  it('should generate correct run summary for failing results', () => {
    const taskResult: TaskResult = {
      task: createMockTask(),
      lighthouseResult: createMockLighthouseResult(),
      assertionReport: createMockAssertionReport(false),
      startTime: new Date(),
      endTime: new Date(),
    }

    collector.addTaskResult(taskResult)
    collector.completeRun()

    const summary = collector.getSummary()

    expect(summary.totalTasks).toBe(1)
    expect(summary.completedTasks).toBe(1)
    expect(summary.failedTasks).toBe(1)
    expect(summary.passed).toBe(false)
  })

  it('should handle error results', () => {
    const taskResult: TaskResult = {
      task: createMockTask(),
      error: 'Lighthouse failed',
      startTime: new Date(),
      endTime: new Date(),
    }

    collector.addTaskResult(taskResult)

    const summary = collector.getSummary()
    const failedResults = collector.getFailedResults()

    expect(summary.failedTasks).toBe(1)
    expect(summary.completedTasks).toBe(0)
    expect(summary.passed).toBe(false)
    expect(failedResults).toHaveLength(1)
  })

  it('should filter results by tag', () => {
    const target1 = { ...createMockTarget(), id: 'target-1', tags: ['home', 'critical'] }
    const target2 = { ...createMockTarget(), id: 'target-2', tags: ['checkout', 'critical'] }

    const taskResult1: TaskResult = {
      task: { ...createMockTask(), id: 'task-1', target: target1 },
      lighthouseResult: { ...createMockLighthouseResult(), taskId: 'task-1', target: target1 },
      startTime: new Date(),
    }

    const taskResult2: TaskResult = {
      task: { ...createMockTask(), id: 'task-2', target: target2 },
      lighthouseResult: { ...createMockLighthouseResult(), taskId: 'task-2', target: target2 },
      startTime: new Date(),
    }

    collector.addTaskResult(taskResult1)
    collector.addTaskResult(taskResult2)

    const criticalResults = collector.getResultsByTag('critical')
    const homeResults = collector.getResultsByTag('home')

    expect(criticalResults).toHaveLength(2)
    expect(homeResults).toHaveLength(1)
  })

  it('should clear results', () => {
    const taskResult: TaskResult = {
      task: createMockTask(),
      lighthouseResult: createMockLighthouseResult(),
      startTime: new Date(),
    }

    collector.addTaskResult(taskResult)
    expect(collector.isEmpty()).toBe(false)

    collector.clear()
    expect(collector.isEmpty()).toBe(true)
  })

  it('should deduplicate retried tasks by keeping only the latest result', () => {
    const task = createMockTask()

    // First attempt - failed
    const firstAttempt: TaskResult = {
      task: { ...task, attempt: 1 },
      error: 'First attempt failed',
      startTime: new Date(Date.now() - 2000),
      endTime: new Date(Date.now() - 1000),
    }

    // Second attempt - also failed
    const secondAttempt: TaskResult = {
      task: { ...task, attempt: 2 },
      error: 'Second attempt failed',
      startTime: new Date(Date.now() - 1000),
      endTime: new Date(Date.now() - 500),
    }

    // Third attempt - successful
    const thirdAttempt: TaskResult = {
      task: { ...task, attempt: 3 },
      lighthouseResult: createMockLighthouseResult(),
      startTime: new Date(Date.now() - 500),
      endTime: new Date(),
    }

    // Add all attempts
    collector.addTaskResult(firstAttempt)
    collector.addTaskResult(secondAttempt)
    collector.addTaskResult(thirdAttempt)

    // Should only have one result (the latest one)
    const results = collector.getRawResults()
    expect(results).toHaveLength(1)

    const result = results[0]!
    expect(result.task.attempt).toBe(3)
    expect(result.lighthouseResult).toBeDefined()
    expect(result.error).toBeUndefined()

    // Summary should reflect only the latest result
    const summary = collector.getSummary()
    expect(summary.totalTasks).toBe(1)
    expect(summary.completedTasks).toBe(1)
    expect(summary.failedTasks).toBe(0)
    expect(summary.passed).toBe(true)
  })
})
