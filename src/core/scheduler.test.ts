import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { Scheduler, SchedulerConfig } from './scheduler'
import { Task, LighthouseResult } from './types/execution'
import { Target } from './types'

describe('Scheduler', () => {
  let scheduler: Scheduler
  let mockTaskHandler: jest.MockedFunction<(task: Task) => Promise<LighthouseResult>>
  let config: SchedulerConfig

  const createMockTask = (id: string = 'test-task'): Task => ({
    id,
    target: {
      id: 'test-target',
      url: 'https://example.com',
      name: 'Test Target',
    } as Target,
    profile: { id: 'test-profile' },
    attempt: 1,
    createdAt: new Date(),
  })

  const createMockResult = (taskId: string = 'test-task'): LighthouseResult => ({
    taskId,
    target: {
      id: 'test-target',
      url: 'https://example.com',
      name: 'Test Target',
    } as Target,
    profile: { id: 'test-profile' },
    metrics: {
      lcp: 1000,
      cls: 0.1,
      fid: 100,
      tbt: 200,
      fcp: 800,
      performanceScore: 95,
    },
    duration: 5000,
    timestamp: new Date(),
  })

  beforeEach(() => {
    config = {
      concurrency: 2,
      maxRetries: 1,
      timeout: 30000,
    }
    scheduler = new Scheduler(config)
    mockTaskHandler = jest.fn() as jest.MockedFunction<(task: Task) => Promise<LighthouseResult>>
    scheduler.setTaskHandler(mockTaskHandler)
  })

  describe('constructor and configuration', () => {
    it('should initialize with provided config', () => {
      const status = scheduler.getStatus()
      expect(status.isRunning).toBe(false)
      expect(status.queueSize).toBe(0)
      expect(status.activeTasks).toBe(0)
      expect(status.completedTasks).toBe(0)
    })

    it('should set task handler', () => {
      const handler = jest.fn() as jest.MockedFunction<(task: Task) => Promise<LighthouseResult>>
      scheduler.setTaskHandler(handler)
      // Handler is set internally, no direct way to test but ensures no errors
      expect(() => scheduler.setTaskHandler(handler)).not.toThrow()
    })
  })

  describe('task management', () => {
    it('should add single task to queue', () => {
      const task = createMockTask()
      scheduler.addTask(task)

      const status = scheduler.getStatus()
      expect(status.queueSize).toBe(1)
    })

    it('should add multiple tasks to queue', () => {
      const tasks = [createMockTask('task-1'), createMockTask('task-2'), createMockTask('task-3')]
      scheduler.addTasks(tasks)

      const status = scheduler.getStatus()
      expect(status.queueSize).toBe(3)
    })
  })

  describe('execution flow', () => {
    it('should throw error if run without task handler', async () => {
      const newScheduler = new Scheduler(config)
      await expect(newScheduler.run()).rejects.toThrow('Task handler must be set before running scheduler')
    })

    it('should throw error if already running', async () => {
      mockTaskHandler.mockImplementation(() => new Promise(() => {})) // Never resolves

      // Add a task so the scheduler doesn't complete immediately
      scheduler.addTask(createMockTask())
      scheduler.run() // Start but don't wait

      await expect(scheduler.run()).rejects.toThrow('Scheduler is already running')

      scheduler.stop() // Clean up
    })

    it('should execute single task successfully', async () => {
      const task = createMockTask()
      const result = createMockResult()

      mockTaskHandler.mockResolvedValue(result)
      scheduler.addTask(task)

      const results = await scheduler.run()

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual(result)
      expect(mockTaskHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: task.id,
          attempt: 1,
        }),
      )
    })

    it('should execute multiple tasks with concurrency limit', async () => {
      const tasks = [createMockTask('task-1'), createMockTask('task-2'), createMockTask('task-3')]

      let concurrentCalls = 0
      let maxConcurrentCalls = 0

      mockTaskHandler.mockImplementation(async () => {
        concurrentCalls++
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls)

        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10))

        concurrentCalls--
        return createMockResult()
      })

      scheduler.addTasks(tasks)
      const results = await scheduler.run()

      expect(results).toHaveLength(3)
      expect(maxConcurrentCalls).toBeLessThanOrEqual(config.concurrency)
    })
  })

  describe('retry logic', () => {
    it('should retry failed task up to maxRetries', async () => {
      const task = createMockTask()
      const result = createMockResult()

      let callCount = 0
      mockTaskHandler.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          throw new Error('First attempt failed')
        }
        return result
      })

      scheduler.addTask(task)
      const results = await scheduler.run()

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual(result)
      expect(mockTaskHandler).toHaveBeenCalledTimes(2)

      // Check that retry had correct attempt number
      expect(mockTaskHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ attempt: 1 }))
      expect(mockTaskHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ attempt: 2 }))
    })

    it('should fail task after exceeding maxRetries', async () => {
      const task = createMockTask()

      mockTaskHandler.mockRejectedValue(new Error('Task always fails'))

      scheduler.addTask(task)
      const results = await scheduler.run()

      expect(results).toHaveLength(1)
      expect(results[0]?.metrics).toEqual({}) // Failed task has empty metrics
      expect(mockTaskHandler).toHaveBeenCalledTimes(config.maxRetries + 1) // Initial + retries
    })
  })

  describe('event emissions', () => {
    it('should emit taskStart event', async () => {
      const task = createMockTask()
      const result = createMockResult()

      mockTaskHandler.mockResolvedValue(result)

      const taskStartSpy = jest.fn()
      scheduler.on('taskStart', taskStartSpy)

      scheduler.addTask(task)
      await scheduler.run()

      expect(taskStartSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: task.id,
          attempt: 1,
        }),
      )
    })

    it('should emit taskComplete event', async () => {
      const task = createMockTask()
      const result = createMockResult()

      mockTaskHandler.mockResolvedValue(result)

      const taskCompleteSpy = jest.fn()
      scheduler.on('taskComplete', taskCompleteSpy)

      scheduler.addTask(task)
      await scheduler.run()

      expect(taskCompleteSpy).toHaveBeenCalledWith(result)
    })

    it('should emit taskFailed event on failure', async () => {
      const task = createMockTask()
      const error = new Error('Task failed')

      mockTaskHandler.mockRejectedValue(error)

      const taskFailedSpy = jest.fn()
      scheduler.on('taskFailed', taskFailedSpy)

      scheduler.addTask(task)
      await scheduler.run()

      expect(taskFailedSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: task.id }),
        error,
        true, // willRetry = true for first failure
      )
    })

    it('should emit taskRetry event', async () => {
      const task = createMockTask()
      const result = createMockResult()

      let callCount = 0
      mockTaskHandler.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          throw new Error('First attempt failed')
        }
        return result
      })

      const taskRetrySpy = jest.fn()
      scheduler.on('taskRetry', taskRetrySpy)

      scheduler.addTask(task)
      await scheduler.run()

      expect(taskRetrySpy).toHaveBeenCalledWith(task, 1)
    })

    it('should emit allTasksComplete event', async () => {
      const task = createMockTask()
      const result = createMockResult()

      mockTaskHandler.mockResolvedValue(result)

      const allCompleteType = jest.fn()
      scheduler.on('allTasksComplete', allCompleteType)

      scheduler.addTask(task)
      await scheduler.run()

      expect(allCompleteType).toHaveBeenCalledWith([result])
    })
  })

  describe('stop functionality', () => {
    it('should stop scheduler and clear state', () => {
      const tasks = [createMockTask('task-1'), createMockTask('task-2')]
      scheduler.addTasks(tasks)

      scheduler.stop()

      const status = scheduler.getStatus()
      expect(status.isRunning).toBe(false)
      expect(status.queueSize).toBe(0)
      expect(status.activeTasks).toBe(0)
    })
  })

  describe('timeout handling', () => {
    it('should timeout tasks that exceed configured timeout', async () => {
      const configWithTimeout: SchedulerConfig = {
        ...config,
        timeout: 100, // 100ms timeout
      }
      const schedulerWithTimeout = new Scheduler(configWithTimeout)

      // Mock handler that takes longer than timeout
      const slowHandler = jest
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200))) as jest.MockedFunction<
        (task: Task) => Promise<LighthouseResult>
      >
      schedulerWithTimeout.setTaskHandler(slowHandler)

      const task = createMockTask()
      schedulerWithTimeout.addTask(task)

      const results = await schedulerWithTimeout.run()

      expect(results).toHaveLength(1)
      expect(results[0]?.metrics).toEqual({}) // Failed due to timeout
    })
  })
})
