import { calculateMedianMetrics } from './calculate-median-metrics'
import type { NormalizedMetrics } from '../types/metrics'

describe('calculateMedianMetrics', () => {
  const createMetrics = (overrides: Partial<NormalizedMetrics> = {}): NormalizedMetrics => ({
    lcp: 1000,
    cls: 0.1,
    fid: 50,
    tbt: 100,
    fcp: 800,
    performanceScore: 90,
    ...overrides,
  })

  it('should return empty object for empty array', () => {
    expect(calculateMedianMetrics([])).toEqual({})
  })

  it('should return the single result for array with one element', () => {
    const metrics = createMetrics()
    expect(calculateMedianMetrics([metrics])).toEqual(metrics)
  })

  it('should calculate median for odd number of results', () => {
    const results = [
      createMetrics({ lcp: 1000, performanceScore: 85 }),
      createMetrics({ lcp: 1200, performanceScore: 90 }),
      createMetrics({ lcp: 1400, performanceScore: 95 }),
    ]

    const median = calculateMedianMetrics(results)

    expect(median.lcp).toBe(1200)
    expect(median.performanceScore).toBe(90)
    expect(median.cls).toBe(0.1)
  })

  it('should calculate median for even number of results', () => {
    const results = [
      createMetrics({ lcp: 1000, performanceScore: 80 }),
      createMetrics({ lcp: 1200, performanceScore: 85 }),
      createMetrics({ lcp: 1400, performanceScore: 90 }),
      createMetrics({ lcp: 1600, performanceScore: 95 }),
    ]

    const median = calculateMedianMetrics(results)

    expect(median.lcp).toBe(1300) // (1200 + 1400) / 2
    expect(median.performanceScore).toBe(87.5) // (85 + 90) / 2
    expect(median.cls).toBe(0.1)
  })

  it('should handle undefined values gracefully', () => {
    const results = [
      createMetrics({ lcp: 1000, cls: undefined }),
      createMetrics({ lcp: 1200, cls: 0.1 }),
      createMetrics({ lcp: 1400, cls: 0.2 }),
    ]

    const median = calculateMedianMetrics(results)

    expect(median.lcp).toBe(1200)
    expect(median.cls).toBeCloseTo(0.15, 5) // median of [0.1, 0.2]
  })

  it('should handle mixed undefined values', () => {
    const results = [
      { lcp: 1000, performanceScore: undefined },
      { lcp: undefined, performanceScore: 90 },
      { lcp: 1400, performanceScore: 95 },
    ]

    const median = calculateMedianMetrics(results)

    expect(median.lcp).toBe(1200) // median of [1000, 1400]
    expect(median.performanceScore).toBe(92.5) // median of [90, 95]
  })

  it('should handle results with different metric keys', () => {
    const results = [
      { lcp: 1000, cls: 0.1 },
      { lcp: 1200, fcp: 800 },
      { performanceScore: 90, cls: 0.2 },
    ]

    const median = calculateMedianMetrics(results)

    expect(median.lcp).toBe(1100) // median of [1000, 1200]
    expect(median.cls).toBeCloseTo(0.15, 5) // median of [0.1, 0.2]
    expect(median.fcp).toBe(800) // only one value
    expect(median.performanceScore).toBe(90) // only one value
  })

  it('should handle CLS decimal precision correctly', () => {
    const results = [createMetrics({ cls: 0.05 }), createMetrics({ cls: 0.1 }), createMetrics({ cls: 0.15 })]

    const median = calculateMedianMetrics(results)

    expect(median.cls).toBe(0.1)
  })
})
