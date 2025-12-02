import { z } from 'zod'
import { MetricThresholdsSchema } from './metrics'
import { Target } from './target'

// Delta-based assertions for baseline comparison
export const DeltaAssertionsSchema = z.object({
  deltaMaxPct: z.number().positive().optional(), // Max % increase allowed
  deltaMin: z.number().optional(), // Min absolute change allowed
  deltaMaxMs: z.number().positive().optional(), // Max millisecond increase for timing metrics
})

export type DeltaAssertions = z.infer<typeof DeltaAssertionsSchema>

// AssertionConfig defines thresholds and rules per target/tag
export const AssertionConfigSchema = z.object({
  metrics: MetricThresholdsSchema.optional(),
  delta: DeltaAssertionsSchema.optional(),
  tags: z.record(z.string(), MetricThresholdsSchema).optional(), // Tag-based overrides
  targets: z.record(z.string(), MetricThresholdsSchema).optional(), // Target-specific overrides
})

export type AssertionConfig = z.infer<typeof AssertionConfigSchema>

// Assertion results
export interface AssertionResult {
  metric: string
  passed: boolean
  actual?: number
  expected?: { min?: number; max?: number }
  delta?: {
    baseline?: number
    change: number
    changePct: number
  }
  details?: string
}

export interface AssertionReport {
  taskId: string
  target: Target
  results: AssertionResult[]
  passed: boolean
  failureCount: number
}
