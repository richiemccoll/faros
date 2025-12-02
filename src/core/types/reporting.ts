import { Task, LighthouseResult } from './execution'
import { AssertionReport } from './assertions'

// Run summary for reporting
export interface RunSummary {
  startTime: Date
  endTime: Date
  duration: number
  totalTasks: number
  completedTasks: number
  failedTasks: number
  passed: boolean
  taskResults: Array<{
    task: Task
    lighthouseResult?: LighthouseResult
    assertionReport?: AssertionReport
    error?: string
  }>
}
