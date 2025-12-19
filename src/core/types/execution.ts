import { Target, ProfileRef } from './target'
import { NormalizedMetrics } from './metrics'

// Task represents a single test execution unit (target + profile)
export interface Task {
  id: string
  target: Target
  profile: ProfileRef
  attempt: number
  createdAt: Date
  logicalTaskId: string
  runIndex: number // 0-based index within the logical task (0, 1, 2 for 3 runs)
}

export interface LighthouseResult {
  taskId: string
  target: Target
  profile: ProfileRef
  metrics: NormalizedMetrics
  raw?: unknown // Optional raw Lighthouse JSON
  duration: number
  timestamp: Date
  error?: string
}
