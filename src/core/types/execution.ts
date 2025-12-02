import { Target, ProfileRef } from './target'
import { NormalizedMetrics } from './metrics'

// Task represents a single test execution unit (target + profile)
export interface Task {
  id: string
  target: Target
  profile: ProfileRef
  attempt: number
  createdAt: Date
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
