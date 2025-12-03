import {
  DeltaEvaluator,
  createDeltaEvaluator,
  InMemoryBaselineProvider,
  BaselineContext,
} from '../evaluators/delta-evaluator'
import { NormalizedMetrics } from '../../core/types/metrics'
import { DeltaAssertions } from '../../core/types/assertions'

describe('DeltaEvaluator', () => {
  let evaluator: DeltaEvaluator
  let baselineProvider: InMemoryBaselineProvider

  beforeEach(() => {
    baselineProvider = new InMemoryBaselineProvider()
    evaluator = createDeltaEvaluator(baselineProvider)
  })

  describe('evaluate', () => {
    it('should pass when percentage increase is within threshold', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2200, // 10% increase from baseline of 2000
        performanceScore: 88, // 2% decrease from baseline of 90
      }

      const baseline = {
        lcp: 2000,
        performanceScore: 90,
      }

      const deltaAssertions: DeltaAssertions = {
        deltaMaxPct: 15, // Allow up to 15% increase
      }

      const results = await evaluator.evaluate(metrics, baseline, deltaAssertions)

      expect(results).toHaveLength(2)
      expect(results.every((result) => result.passed)).toBe(true)

      expect(results[0]).toMatchObject({
        metric: 'lcp_delta',
        passed: true,
        actual: 2200,
        delta: {
          baseline: 2000,
          change: 200,
          changePct: 10,
        },
      })
    })

    it('should fail when percentage increase exceeds threshold', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2400, // 20% increase from baseline of 2000
        cls: 0.12, // 20% increase from baseline of 0.1
      }

      const baseline = {
        lcp: 2000,
        cls: 0.1,
      }

      const deltaAssertions: DeltaAssertions = {
        deltaMaxPct: 15, // Only allow up to 15% increase
      }

      const results = await evaluator.evaluate(metrics, baseline, deltaAssertions)

      expect(results).toHaveLength(2)
      expect(results.every((result) => !result.passed)).toBe(true)

      expect(results[0]).toMatchObject({
        metric: 'lcp_delta',
        passed: false,
        actual: 2400,
        delta: {
          baseline: 2000,
          change: 400,
          changePct: 20,
        },
        details: expect.stringContaining('increased by 20.0%'),
      })
    })

    it('should validate minimum improvement requirements', async () => {
      const metrics: NormalizedMetrics = {
        performanceScore: 92, // Only 2 point improvement from baseline of 90
      }

      const baseline = {
        performanceScore: 90,
      }

      const deltaAssertions: DeltaAssertions = {
        deltaMin: 5, // Require at least 5 point improvement
      }

      const results = await evaluator.evaluate(metrics, baseline, deltaAssertions)

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        metric: 'performanceScore_delta',
        passed: false,
        actual: 92,
        delta: {
          baseline: 90,
          change: 2,
          changePct: expect.closeTo(2.22, 1), // Approximately 2.22%
        },
        details: expect.stringContaining('improved by 2.0 (min required: 5)'),
      })
    })

    it('should pass when improvement meets minimum requirement', async () => {
      const metrics: NormalizedMetrics = {
        performanceScore: 97, // 7 point improvement from baseline of 90
      }

      const baseline = {
        performanceScore: 90,
      }

      const deltaAssertions: DeltaAssertions = {
        deltaMin: 5, // Require at least 5 point improvement
      }

      const results = await evaluator.evaluate(metrics, baseline, deltaAssertions)

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        metric: 'performanceScore_delta',
        passed: true,
        actual: 97,
        delta: {
          baseline: 90,
          change: 7,
          changePct: expect.closeTo(7.78, 1), // Approximately 7.78%
        },
      })
    })

    it('should validate millisecond-based thresholds for timing metrics', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2300, // 300ms increase from baseline of 2000ms
        fcp: 1400, // 100ms increase from baseline of 1300ms
      }

      const baseline = {
        lcp: 2000,
        fcp: 1300,
      }

      const deltaAssertions: DeltaAssertions = {
        deltaMaxMs: 200, // Allow max 200ms increase
      }

      const results = await evaluator.evaluate(metrics, baseline, deltaAssertions)

      expect(results).toHaveLength(2)

      // LCP should fail (300ms > 200ms threshold)
      expect(results[0]).toMatchObject({
        metric: 'lcp_delta',
        passed: false,
        actual: 2300,
        details: expect.stringContaining('increased by 300.0ms (max allowed: 200ms)'),
      })

      // FCP should pass (100ms < 200ms threshold)
      expect(results[1]).toMatchObject({
        metric: 'fcp_delta',
        passed: true,
        actual: 1400,
      })
    })

    it('should handle multiple delta assertion types simultaneously', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2100, // 5% increase, 100ms increase
        performanceScore: 95, // 5.56% increase, 5 point improvement
      }

      const baseline = {
        lcp: 2000,
        performanceScore: 90,
      }

      const deltaAssertions: DeltaAssertions = {
        deltaMaxPct: 10, // Allow up to 10% increase
        deltaMin: 3, // Require at least 3 point improvement
        deltaMaxMs: 150, // Allow max 150ms increase
      }

      const results = await evaluator.evaluate(metrics, baseline, deltaAssertions)

      expect(results).toHaveLength(2)
      expect(results.every((result) => result.passed)).toBe(true)
    })

    it('should skip metrics not present in baseline', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2200,
        cls: 0.08,
        fcp: 1500,
      }

      const baseline = {
        lcp: 2000, // Only LCP in baseline
        // cls and fcp missing from baseline
      }

      const deltaAssertions: DeltaAssertions = {
        deltaMaxPct: 15,
      }

      const results = await evaluator.evaluate(metrics, baseline, deltaAssertions)

      expect(results).toHaveLength(1) // Only LCP evaluated
      expect(results[0]?.metric).toBe('lcp_delta')
    })

    it('should skip undefined metrics', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2200,
        cls: undefined, // Should be skipped
        fcp: 1500,
      }

      const baseline = {
        lcp: 2000,
        cls: 0.1,
        fcp: 1400,
      }

      const deltaAssertions: DeltaAssertions = {
        deltaMaxPct: 15,
      }

      const results = await evaluator.evaluate(metrics, baseline, deltaAssertions)

      expect(results).toHaveLength(2) // Only lcp and fcp
      expect(results.map((r) => r.metric).sort()).toEqual(['fcp_delta', 'lcp_delta'])
    })

    it('should handle zero baseline gracefully', async () => {
      const metrics: NormalizedMetrics = {
        tbt: 100, // Some positive value
      }

      const baseline = {
        tbt: 0, // Zero baseline
      }

      const deltaAssertions: DeltaAssertions = {
        deltaMaxPct: 50,
      }

      const results = await evaluator.evaluate(metrics, baseline, deltaAssertions)

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        metric: 'tbt_delta',
        actual: 100,
        delta: {
          baseline: 0,
          change: 100,
          changePct: 0, // Should handle division by zero
        },
      })
    })

    it('should return empty array when no delta assertions are configured', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2200,
      }

      const baseline = {
        lcp: 2000,
      }

      const deltaAssertions: DeltaAssertions = {
        // No delta rules configured
      }

      const results = await evaluator.evaluate(metrics, baseline, deltaAssertions)

      expect(results).toHaveLength(0)
    })

    it('should use baseline provider when baseline not provided directly', async () => {
      const context: BaselineContext = {
        targetId: 'homepage',
        targetUrl: 'https://example.com',
        profile: 'desktop',
      }

      // Set baseline in provider
      baselineProvider.setBaseline(context, {
        lcp: 2000,
        performanceScore: 90,
      })

      const metrics: NormalizedMetrics = {
        lcp: 2200,
        performanceScore: 88,
      }

      const deltaAssertions: DeltaAssertions = {
        deltaMaxPct: 15,
      }

      // Don't provide baseline directly, should use provider
      const results = await evaluator.evaluate(metrics, {}, deltaAssertions, context)

      expect(results).toHaveLength(2)
      expect(results.every((result) => result.passed)).toBe(true)
    })

    it('should return empty array when no baseline available', async () => {
      const metrics: NormalizedMetrics = {
        lcp: 2200,
      }

      const deltaAssertions: DeltaAssertions = {
        deltaMaxPct: 15,
      }

      // No baseline provided and no provider
      const evaluatorWithoutProvider = createDeltaEvaluator()
      const results = await evaluatorWithoutProvider.evaluate(metrics, {}, deltaAssertions)

      expect(results).toHaveLength(0)
    })
  })
})

describe('InMemoryBaselineProvider', () => {
  let provider: InMemoryBaselineProvider

  beforeEach(() => {
    provider = new InMemoryBaselineProvider()
  })

  describe('setBaseline and getBaseline', () => {
    it('should store and retrieve baselines by context key', async () => {
      const context: BaselineContext = {
        targetId: 'homepage',
        targetUrl: 'https://example.com',
        profile: 'desktop',
      }

      const baseline = {
        lcp: 2000,
        performanceScore: 90,
      }

      provider.setBaseline(context, baseline)
      const retrieved = await provider.getBaseline(context)

      expect(retrieved).toEqual(baseline)
    })

    it('should return undefined for non-existent baseline', async () => {
      const context: BaselineContext = {
        targetId: 'nonexistent',
        targetUrl: 'https://example.com',
        profile: 'mobile',
      }

      const baseline = await provider.getBaseline(context)

      expect(baseline).toBeUndefined()
    })

    it('should differentiate baselines by target and profile', async () => {
      const context1: BaselineContext = {
        targetId: 'homepage',
        targetUrl: 'https://example.com',
        profile: 'desktop',
      }

      const context2: BaselineContext = {
        targetId: 'homepage',
        targetUrl: 'https://example.com',
        profile: 'mobile',
      }

      provider.setBaseline(context1, { lcp: 2000 })
      provider.setBaseline(context2, { lcp: 3000 })

      const baseline1 = await provider.getBaseline(context1)
      const baseline2 = await provider.getBaseline(context2)

      expect(baseline1).toEqual({ lcp: 2000 })
      expect(baseline2).toEqual({ lcp: 3000 })
    })
  })
})
