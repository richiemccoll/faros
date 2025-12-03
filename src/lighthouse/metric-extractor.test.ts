import { MetricExtractor, MetricExtractionError, LIGHTHOUSE_AUDIT_IDS, createMetricExtractor } from './metric-extractor'
import type { Result } from 'lighthouse'

const createMockLighthouseResult = (overrides: Partial<Result> = {}): Result =>
  ({
    lighthouseVersion: '13.0.0',
    userAgent: 'Mozilla/5.0 Test',
    environment: {},
    fetchTime: '2023-12-03T10:00:00.000Z',
    requestedUrl: 'https://example.com',
    finalDisplayedUrl: 'https://example.com',
    audits: {
      [LIGHTHOUSE_AUDIT_IDS.LCP]: {
        id: LIGHTHOUSE_AUDIT_IDS.LCP,
        title: 'Largest Contentful Paint',
        score: 1,
        numericValue: 1200,
        displayValue: '1.2 s',
        details: undefined,
      },
      [LIGHTHOUSE_AUDIT_IDS.CLS]: {
        id: LIGHTHOUSE_AUDIT_IDS.CLS,
        title: 'Cumulative Layout Shift',
        score: 1,
        numericValue: 0.05,
        displayValue: '0.05',
        details: undefined,
      },
      [LIGHTHOUSE_AUDIT_IDS.FID]: {
        id: LIGHTHOUSE_AUDIT_IDS.FID,
        title: 'Max Potential First Input Delay',
        score: 1,
        numericValue: 50,
        displayValue: '50 ms',
        details: undefined,
      },
      [LIGHTHOUSE_AUDIT_IDS.TBT]: {
        id: LIGHTHOUSE_AUDIT_IDS.TBT,
        title: 'Total Blocking Time',
        score: 1,
        numericValue: 100,
        displayValue: '100 ms',
        details: undefined,
      },
      [LIGHTHOUSE_AUDIT_IDS.FCP]: {
        id: LIGHTHOUSE_AUDIT_IDS.FCP,
        title: 'First Contentful Paint',
        score: 1,
        numericValue: 800,
        displayValue: '0.8 s',
        details: undefined,
      },
    },
    categories: {
      performance: {
        id: 'performance',
        title: 'Performance',
        score: 0.95,
        auditRefs: [],
      },
    },
    configSettings: {},
    timing: { total: 1000 },
    ...overrides,
  }) as Result

describe('MetricExtractor', () => {
  let extractor: MetricExtractor

  beforeEach(() => {
    extractor = new MetricExtractor()
  })

  describe('constructor', () => {
    it('should create extractor with default options', () => {
      expect(extractor).toBeInstanceOf(MetricExtractor)
    })

    it('should accept custom options', () => {
      const customExtractor = new MetricExtractor({
        includeRawData: true,
        customAuditMappings: { custom: 'test' },
      })
      expect(customExtractor).toBeInstanceOf(MetricExtractor)
    })
  })

  describe('extract', () => {
    it('should extract all core metrics from complete Lighthouse result', () => {
      const lhr = createMockLighthouseResult()
      const metrics = extractor.extract(lhr)

      expect(metrics).toEqual({
        lcp: 1200,
        cls: 0.05,
        fid: 50,
        inp: undefined, // Not in our mock data
        tbt: 100,
        fcp: 800,
        performanceScore: 95, // 0.95 * 100
      })
    })

    it('should handle missing audits gracefully', () => {
      const lhr = createMockLighthouseResult({
        audits: {
          [LIGHTHOUSE_AUDIT_IDS.LCP]: {
            id: LIGHTHOUSE_AUDIT_IDS.LCP,
            title: 'LCP',
            description: 'Largest Contentful Paint',
            score: 1,
            scoreDisplayMode: 'numeric' as const,
            numericValue: 1500,
            displayValue: '1.5 s',
            details: undefined,
          },
        },
      })

      const metrics = extractor.extract(lhr)

      expect(metrics).toEqual({
        lcp: 1500,
        cls: undefined,
        fid: undefined,
        inp: undefined,
        tbt: undefined,
        fcp: undefined,
        performanceScore: 95,
      })
    })

    it('should handle missing performance category', () => {
      const lhr = createMockLighthouseResult({
        categories: {},
      })

      const metrics = extractor.extract(lhr)
      expect(metrics.performanceScore).toBeUndefined()
    })

    it('should parse display values when numericValue is missing', () => {
      const lhr = createMockLighthouseResult({
        audits: {
          [LIGHTHOUSE_AUDIT_IDS.LCP]: {
            id: LIGHTHOUSE_AUDIT_IDS.LCP,
            title: 'LCP',
            description: 'Largest Contentful Paint',
            score: 0.5,
            scoreDisplayMode: 'numeric' as const,
            displayValue: '2.3 s',
            details: undefined,
          },
        },
      })

      const metrics = extractor.extract(lhr)
      expect(metrics.lcp).toBe(2300) // 2.3 * 1000
    })

    it('should handle non-time metrics without unit conversion', () => {
      const lhr = createMockLighthouseResult({
        audits: {
          [LIGHTHOUSE_AUDIT_IDS.CLS]: {
            id: LIGHTHOUSE_AUDIT_IDS.CLS,
            title: 'CLS',
            description: 'Cumulative Layout Shift',
            score: 1,
            scoreDisplayMode: 'numeric' as const,
            displayValue: '0.125',
            details: undefined,
          },
        },
      })

      const metrics = extractor.extract(lhr)
      expect(metrics.cls).toBe(0.125) // No unit conversion for CLS
    })

    it('should throw error for invalid Lighthouse result', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => extractor.extract(null as any)).toThrow(MetricExtractionError)
      expect(() => extractor.extract({} as Result)).toThrow(MetricExtractionError)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => extractor.extract({ audits: null } as any)).toThrow(MetricExtractionError)
    })

    it('should use custom audit mappings', () => {
      const customExtractor = new MetricExtractor({
        customAuditMappings: {
          [LIGHTHOUSE_AUDIT_IDS.LCP]: 'custom-lcp-audit',
        },
      })

      const lhr = createMockLighthouseResult({
        audits: {
          'custom-lcp-audit': {
            id: 'custom-lcp-audit',
            title: 'Custom LCP',
            description: 'Custom audit for testing',
            score: 1,
            scoreDisplayMode: 'numeric' as const,
            numericValue: 2000,
            displayValue: '2.0 s',
            details: undefined,
          },
        },
      })

      const metrics = customExtractor.extract(lhr)
      expect(metrics.lcp).toBe(2000)
    })
  })

  describe('validateMetrics', () => {
    it('should validate good metrics', () => {
      const goodMetrics = {
        lcp: 1200,
        cls: 0.05,
        fid: 50,
        tbt: 100,
        fcp: 800,
        performanceScore: 95,
      }

      expect(extractor.validateMetrics(goodMetrics)).toBe(true)
    })

    it('should reject invalid CLS values', () => {
      expect(extractor.validateMetrics({ cls: -0.1 })).toBe(false)
      expect(extractor.validateMetrics({ cls: 1.5 })).toBe(false)
    })

    it('should reject invalid performance scores', () => {
      expect(extractor.validateMetrics({ performanceScore: -10 })).toBe(false)
      expect(extractor.validateMetrics({ performanceScore: 110 })).toBe(false)
    })

    it('should reject negative time metrics', () => {
      expect(extractor.validateMetrics({ lcp: -100 })).toBe(false)
      expect(extractor.validateMetrics({ fid: -50 })).toBe(false)
      expect(extractor.validateMetrics({ tbt: -10 })).toBe(false)
    })

    it('should allow undefined values', () => {
      expect(extractor.validateMetrics({})).toBe(true)
      expect(extractor.validateMetrics({ lcp: undefined })).toBe(true)
    })
  })

  describe('createMetricExtractor', () => {
    it('should create MetricExtractor instance', () => {
      const extractor = createMetricExtractor()
      expect(extractor).toBeInstanceOf(MetricExtractor)
    })

    it('should pass options to constructor', () => {
      const options = { includeRawData: true }
      const extractor = createMetricExtractor(options)
      expect(extractor).toBeInstanceOf(MetricExtractor)
    })
  })

  describe('error handling', () => {
    it('should wrap extraction errors with context', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const badLhr = { audits: { malformed: 'data' } } as any

      try {
        extractor.extract(badLhr)
      } catch (error) {
        expect(error).toBeInstanceOf(MetricExtractionError)
        expect((error as MetricExtractionError).message).toContain('Failed to extract metrics')
      }
    })

    it('should preserve original error as cause', () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        extractor.extract(null as any)
      } catch (error) {
        expect(error).toBeInstanceOf(MetricExtractionError)
        expect((error as MetricExtractionError).message).toContain('Invalid Lighthouse result')
      }
    })
  })
})
