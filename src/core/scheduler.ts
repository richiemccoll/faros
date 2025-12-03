import { EventEmitter } from 'events'
import { Task, LighthouseResult } from './types/execution'
import { logger } from '../logger'

export interface SchedulerEvents {
  taskStart: (task: Task) => void
  taskComplete: (result: LighthouseResult) => void
  taskFailed: (task: Task, error: Error, willRetry: boolean) => void
  taskRetry: (task: Task, attempt: number) => void
  queueEmpty: () => void
  allTasksComplete: (results: LighthouseResult[]) => void
}

export interface SchedulerConfig {
  concurrency: number
  maxRetries: number
  timeout?: number // Optional timeout per task in ms
}

/**
 * Task scheduler with concurrency and retry handling
 */
export class Scheduler extends EventEmitter {
  private config: SchedulerConfig
  private queue: Task[] = []
  private activeTasks = new Map<string, Task>()
  private results: LighthouseResult[] = []
  private retryCount = new Map<string, number>()
  private isRunning = false
  private taskHandler?: (task: Task) => Promise<LighthouseResult>

  constructor(config: SchedulerConfig) {
    super()
    this.config = config
  }

  setTaskHandler(handler: (task: Task) => Promise<LighthouseResult>): void {
    this.taskHandler = handler
  }

  addTasks(tasks: Task[]): void {
    this.queue.push(...tasks)
    this.processQueue()
  }

  addTask(task: Task): void {
    this.queue.push(task)
    this.processQueue()
  }

  async run(): Promise<LighthouseResult[]> {
    if (this.isRunning) {
      throw new Error('Scheduler is already running')
    }

    if (!this.taskHandler) {
      throw new Error('Task handler must be set before running scheduler')
    }

    this.isRunning = true
    this.results = []
    this.retryCount.clear()

    return new Promise((resolve, reject) => {
      this.once('allTasksComplete', resolve)
      this.once('error', reject)
      this.processQueue()
    })
  }

  stop(): void {
    this.isRunning = false
    this.queue.length = 0
    this.activeTasks.clear()
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      queueSize: this.queue.length,
      activeTasks: this.activeTasks.size,
      completedTasks: this.results.length,
    }
  }

  private async processQueue(): Promise<void> {
    if (!this.isRunning || !this.taskHandler) {
      return
    }

    // Process tasks while we have capacity and tasks in queue
    while (this.activeTasks.size < this.config.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!
      this.activeTasks.set(task.id, task)

      // Process task asynchronously
      this.processTask(task).catch((error) => {
        logger.error(`Unexpected error processing task ${task.id}:`, error)
        this.emit('error', error)
      })
    }

    // Check if we're done
    if (this.queue.length === 0 && this.activeTasks.size === 0) {
      this.emit('queueEmpty')
      if (this.isRunning) {
        this.isRunning = false
        this.emit('allTasksComplete', this.results)
      }
    }
  }

  private async processTask(task: Task): Promise<void> {
    const currentAttempt = this.retryCount.get(task.id) || 0
    const updatedTask = { ...task, attempt: currentAttempt + 1 }

    this.emit('taskStart', updatedTask)

    try {
      const result = await this.executeWithTimeout(updatedTask)

      // Task completed successfully
      this.activeTasks.delete(task.id)
      this.results.push(result)
      this.emit('taskComplete', result)
    } catch (error) {
      const taskError = error instanceof Error ? error : new Error(String(error))
      const willRetry = currentAttempt < this.config.maxRetries

      this.emit('taskFailed', updatedTask, taskError, willRetry)

      if (willRetry) {
        // Schedule retry
        this.retryCount.set(task.id, currentAttempt + 1)
        this.emit('taskRetry', task, currentAttempt + 1)

        // Remove from active tasks and add back to queue
        this.activeTasks.delete(task.id)
        this.queue.push(task)
      } else {
        // Max retries exceeded - task failed permanently
        this.activeTasks.delete(task.id)

        const failedResult: LighthouseResult = {
          taskId: task.id,
          target: task.target,
          profile: task.profile,
          metrics: {}, // Empty metrics for failed task
          duration: 0,
          timestamp: new Date(),
          error: taskError.message,
        }
        this.results.push(failedResult)
      }
    }

    await this.processQueue()
  }

  private async executeWithTimeout(task: Task): Promise<LighthouseResult> {
    if (!this.taskHandler) {
      throw new Error('Task handler not set')
    }

    if (this.config.timeout) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Task ${task.id} timed out after ${this.config.timeout}ms`))
        }, this.config.timeout)

        this.taskHandler!(task)
          .then((result) => {
            clearTimeout(timer)
            resolve(result)
          })
          .catch((error) => {
            clearTimeout(timer)
            reject(error)
          })
      })
    } else {
      return this.taskHandler(task)
    }
  }
}

export function createScheduler(config: SchedulerConfig): Scheduler {
  return new Scheduler(config)
}
