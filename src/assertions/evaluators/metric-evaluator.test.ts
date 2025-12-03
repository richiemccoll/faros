import { MetricEvaluator, createMetricEvaluator } from '../evaluators/metric-evaluator'
import { NormalizedMetrics, MetricThresholds } from '../../core/types/metrics'

describe('MetricEvaluator', () => {
  let evaluator: MetricEvaluator

  beforeEach(() => {
    evaluator = createMetricEvaluator()
  })

  describe('evaluate', () => {
    it('should pass when all metrics are within thresholds', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2000,
        cls: 0.05,
        fcp: 1500,
        performanceScore: 95,
      }

      const thresholds: MetricThresholds = {
        lcp: { max: 2500 },
        cls: { max: 0.1 },
        fcp: { max: 1800 },
        performanceScore: { min: 90 },
      }

      const results = await evaluator.evaluate(metrics, thresholds)

      expect(results).toHaveLength(4)
      expect(results.every((result) => result.passed)).toBe(true)

      expect(results[0]).toMatchObject({
        metric: 'lcp',
        passed: true,
        actual: 2000,
        expected: { max: 2500 },
      })
    })

    it('should fail when metrics exceed maximum thresholds', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 3000,
        cls: 0.15,
      }

      const thresholds: MetricThresholds = {
        lcp: { max: 2500 },
        cls: { max: 0.1 },
      }

      const results = await evaluator.evaluate(metrics, thresholds)

      expect(results).toHaveLength(2)
      expect(results.every((result) => !result.passed)).toBe(true)

      expect(results[0]).toMatchObject({
        metric: 'lcp',
        passed: false,
        actual: 3000,
        expected: { max: 2500 },
        details: expect.stringContaining('above maximum threshold'),
      })

      expect(results[1]).toMatchObject({
        metric: 'cls',
        passed: false,
        actual: 0.15,
        expected: { max: 0.1 },
        details: expect.stringContaining('above maximum threshold'),
      })
    })

    it('should fail when metrics are below minimum thresholds', async () => {
      const metrics: NormalizedMetrics = {
        performanceScore: 75,
      }

      const thresholds: MetricThresholds = {
        performanceScore: { min: 90 },
      }

      const results = await evaluator.evaluate(metrics, thresholds)

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        metric: 'performanceScore',
        passed: false,
        actual: 75,
        expected: { min: 90 },
        details: expect.stringContaining('below minimum threshold'),
      })
    })

    it('should handle mixed min/max thresholds correctly', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2200, // Should pass (between 2000-2500)
      }

      const thresholds: MetricThresholds = {
        lcp: { min: 2000, max: 2500 },
      }

      const results = await evaluator.evaluate(metrics, thresholds)

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        metric: 'lcp',
        passed: true,
        actual: 2200,
        expected: { min: 2000, max: 2500 },
      })
    })

    it('should fail when metric violates both min and max', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 1500, // Below min of 2000
      }

      const thresholds: MetricThresholds = {
        lcp: { min: 2000, max: 2500 },
      }

      const results = await evaluator.evaluate(metrics, thresholds)

      expect(results[0]).toMatchObject({
        metric: 'lcp',
        passed: false,
        actual: 1500,
        details: expect.stringContaining('below minimum threshold'),
      })
    })

    it('should skip metrics that are undefined', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2000,
        cls: undefined, // Should be skipped
        fcp: 1500,
      }

      const thresholds: MetricThresholds = {
        lcp: { max: 2500 },
        cls: { max: 0.1 }, // This won't be evaluated
        fcp: { max: 1800 },
      }

      const results = await evaluator.evaluate(metrics, thresholds)

      expect(results).toHaveLength(2) // Only lcp and fcp
      expect(results.map((r) => r.metric)).toEqual(['lcp', 'fcp'])
    })

    it('should skip thresholds that are not configured', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2000,
        cls: 0.05,
        fcp: 1500,
      }

      const thresholds: MetricThresholds = {
        lcp: { max: 2500 },
        // cls and fcp thresholds not configured
      }

      const results = await evaluator.evaluate(metrics, thresholds)

      expect(results).toHaveLength(1) // Only lcp
      expect(results[0]?.metric).toBe('lcp')
    })

    it('should handle all supported metrics', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2000,
        cls: 0.05,
        fid: 80,
        inp: 150,
        tbt: 100,
        fcp: 1200,
        performanceScore: 95,
      }

      const thresholds: MetricThresholds = {
        lcp: { max: 2500 },
        cls: { max: 0.1 },
        fid: { max: 100 },
        inp: { max: 200 },
        tbt: { max: 200 },
        fcp: { max: 1800 },
        performanceScore: { min: 90 },
      }

      const results = await evaluator.evaluate(metrics, thresholds)

      expect(results).toHaveLength(7)
      expect(results.every((result) => result.passed)).toBe(true)

      const metricNames = results.map((r) => r.metric).sort()
      expect(metricNames).toEqual(['cls', 'fcp', 'fid', 'inp', 'lcp', 'performanceScore', 'tbt'])
    })

    it('should return empty array when no thresholds match metrics', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2000,
      }

      const thresholds: MetricThresholds = {
        cls: { max: 0.1 }, // Different metric
      }

      const results = await evaluator.evaluate(metrics, thresholds)

      expect(results).toHaveLength(0)
    })
  })
})
