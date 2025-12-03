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
  private taskResults: TaskResult[] = []
  private runStartTime: Date
  private runEndTime?: Date

  constructor() {
    this.runStartTime = new Date()
  }

  addTaskResult(taskResult: TaskResult): void {
    this.taskResults.push(taskResult)
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

    const completedTasks = this.taskResults.filter((result) => result.lighthouseResult && !result.error).length

    const failedTasks = this.taskResults.filter(
      (result) => result.error || (result.assertionReport && !result.assertionReport.passed),
    ).length

    // Run passes if all tasks completed and all assertions passed
    const passed =
      this.taskResults.length > 0 &&
      failedTasks === 0 &&
      completedTasks === this.taskResults.length &&
      this.taskResults.every((result) => !result.assertionReport || result.assertionReport.passed)

    return {
      startTime: this.runStartTime,
      endTime,
      duration,
      totalTasks: this.taskResults.length,
      completedTasks,
      failedTasks,
      passed,
      taskResults: this.taskResults.map((result) => ({
        task: result.task,
        lighthouseResult: result.lighthouseResult,
        assertionReport: result.assertionReport,
        error: result.error,
      })),
    }
  }

  getRawResults(): TaskResult[] {
    return [...this.taskResults]
  }

  getFailedResults(): TaskResult[] {
    return this.taskResults.filter(
      (result) => result.error || (result.assertionReport && !result.assertionReport.passed),
    )
  }

  getPassedResults(): TaskResult[] {
    return this.taskResults.filter(
      (result) =>
        result.lighthouseResult && !result.error && (!result.assertionReport || result.assertionReport.passed),
    )
  }

  getResultsByTag(tag: string): TaskResult[] {
    return this.taskResults.filter((result) => result.task.target.tags?.includes(tag))
  }

  isEmpty(): boolean {
    return this.taskResults.length === 0
  }

  clear(): void {
    this.taskResults = []
    this.runStartTime = new Date()
    this.runEndTime = undefined
  }
}
