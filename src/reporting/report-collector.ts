import { Task, LighthouseResult } from '../core/types/execution'
import { AssertionReport } from '../core/types/assertions'
import { RunSummary } from '../core/types/reporting'

export interface TaskResult {
  task: Task
  lighthouseResult?: LighthouseResult
  assertionReport?: AssertionReport
  error?: string
  startTime: Date
  endTime?: Date
}

/**
 * ReportCollector accumulates task results during a performance run
 * and provides methods to retrieve aggregated summaries and raw data
 */
export class ReportCollector {
  private taskResults: Map<string, TaskResult> = new Map()
  private runStartTime: Date
  private runEndTime?: Date

  constructor() {
    this.runStartTime = new Date()
  }

  addTaskResult(taskResult: TaskResult): void {
    // Only keep the latest result for each task ID (handles retries)
    this.taskResults.set(taskResult.task.id, taskResult)
  }

  completeRun(): void {
    this.runEndTime = new Date()
  }

  /**
   * Get aggregated run summary for reporting
   */
  getSummary(): RunSummary {
    const endTime = this.runEndTime || new Date()
    const duration = endTime.getTime() - this.runStartTime.getTime()

    const taskResultsArray = Array.from(this.taskResults.values())
    const completedTasks = taskResultsArray.filter((result) => result.lighthouseResult && !result.error).length

    const failedTasks = taskResultsArray.filter(
      (result) => result.error || (result.assertionReport && !result.assertionReport.passed),
    ).length

    // Run passes if all tasks completed and all assertions passed
    const passed =
      this.taskResults.size > 0 &&
      failedTasks === 0 &&
      completedTasks === this.taskResults.size &&
      taskResultsArray.every((result) => !result.assertionReport || result.assertionReport.passed)

    return {
      startTime: this.runStartTime,
      endTime,
      duration,
      totalTasks: this.taskResults.size,
      completedTasks,
      failedTasks,
      passed,
      taskResults: taskResultsArray.map((result) => ({
        task: result.task,
        lighthouseResult: result.lighthouseResult,
        assertionReport: result.assertionReport,
        error: result.error,
      })),
    }
  }

  getRawResults(): TaskResult[] {
    return Array.from(this.taskResults.values())
  }

  getFailedResults(): TaskResult[] {
    return Array.from(this.taskResults.values()).filter(
      (result) => result.error || (result.assertionReport && !result.assertionReport.passed),
    )
  }

  getPassedResults(): TaskResult[] {
    return Array.from(this.taskResults.values()).filter(
      (result) =>
        result.lighthouseResult && !result.error && (!result.assertionReport || result.assertionReport.passed),
    )
  }

  getResultsByTag(tag: string): TaskResult[] {
    return Array.from(this.taskResults.values()).filter((result) => result.task.target.tags?.includes(tag))
  }

  isEmpty(): boolean {
    return this.taskResults.size === 0
  }

  clear(): void {
    this.taskResults.clear()
    this.runStartTime = new Date()
    this.runEndTime = undefined
  }
}
