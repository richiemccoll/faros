import { z } from 'zod'

// Individual metric threshold schema
const MetricThresholdSchema = z.object({
  max: z.number().positive().optional(),
  min: z.number().positive().optional(),
})

// CLS uses non-negative values (can be 0)
const CLSThresholdSchema = z.object({
  max: z.number().nonnegative().optional(),
  min: z.number().nonnegative().optional(),
})

// Performance score uses 0-100 range
const PerformanceScoreThresholdSchema = z.object({
  max: z.number().min(0).max(100).optional(),
  min: z.number().min(0).max(100).optional(),
})

// Metric thresholds for assertions
export const MetricThresholdsSchema = z.object({
  lcp: MetricThresholdSchema.optional(),
  cls: CLSThresholdSchema.optional(),
  fid: MetricThresholdSchema.optional(),
  inp: MetricThresholdSchema.optional(),
  tbt: MetricThresholdSchema.optional(),
  fcp: MetricThresholdSchema.optional(),
  performanceScore: PerformanceScoreThresholdSchema.optional(),
})

export type MetricThresholds = z.infer<typeof MetricThresholdsSchema>

// Lighthouse result normalization
export interface NormalizedMetrics {
  lcp?: number
  cls?: number
  fid?: number
  inp?: number
  tbt?: number
  fcp?: number
  performanceScore?: number
}
