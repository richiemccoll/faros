import { AssertionConfigResolver, createAssertionConfigResolver } from './config-resolver'
import { AssertionConfig } from '../core/types/assertions'
import { Target } from '../core/types/target'

describe('AssertionConfigResolver', () => {
  let resolver: AssertionConfigResolver

  beforeEach(() => {
    resolver = createAssertionConfigResolver()
  })

  describe('resolve', () => {
    it('should return base config when no overrides exist', () => {
      const config: AssertionConfig = {
        metrics: {
          lcp: { max: 2500 },
          performanceScore: { min: 90 },
        },
      }

      const target: Target = {
        id: 'homepage',
        url: 'https://example.com',
        name: 'Homepage',
        tags: [],
      }

      const resolved = resolver.resolve(config, target)

      expect(resolved.metrics).toEqual(config.metrics)
    })

    it('should apply tag-based overrides', () => {
      const config: AssertionConfig = {
        metrics: {
          lcp: { max: 2500 },
          performanceScore: { min: 90 },
        },
        tags: {
          critical: {
            lcp: { max: 2000 }, // Stricter for critical pages
            cls: { max: 0.05 }, // New threshold
          },
        },
      }

      const target: Target = {
        id: 'homepage',
        url: 'https://example.com',
        name: 'Homepage',
        tags: ['critical'],
      }

      const resolved = resolver.resolve(config, target)

      expect(resolved.metrics).toEqual({
        lcp: { max: 2000 }, // Overridden by critical tag
        performanceScore: { min: 90 }, // From base
        cls: { max: 0.05 }, // Added by critical tag
      })
    })

    it('should apply target-specific overrides with highest priority', () => {
      const config: AssertionConfig = {
        metrics: {
          lcp: { max: 2500 },
          performanceScore: { min: 90 },
        },
        tags: {
          critical: {
            lcp: { max: 2000 },
          },
        },
        targets: {
          homepage: {
            lcp: { max: 1800 }, // Even stricter for this specific target
            fcp: { max: 1500 }, // New threshold
          },
        },
      }

      const target: Target = {
        id: 'homepage',
        url: 'https://example.com',
        name: 'Homepage',
        tags: ['critical'],
      }

      const resolved = resolver.resolve(config, target)

      expect(resolved.metrics).toEqual({
        lcp: { max: 1800 }, // Overridden by target-specific (highest priority)
        performanceScore: { min: 90 }, // From base
        fcp: { max: 1500 }, // Added by target-specific
      })
    })

    it('should apply multiple tag overrides in order', () => {
      const config: AssertionConfig = {
        metrics: {
          lcp: { max: 2500 },
        },
        tags: {
          critical: {
            lcp: { max: 2000 },
            cls: { max: 0.1 },
          },
          mobile: {
            lcp: { max: 3000 }, // Relaxed for mobile
            cls: { max: 0.05 }, // Stricter for mobile
          },
        },
      }

      const target: Target = {
        id: 'homepage',
        url: 'https://example.com',
        name: 'Homepage',
        tags: ['critical', 'mobile'], // Mobile tag applied after critical
      }

      const resolved = resolver.resolve(config, target)

      expect(resolved.metrics).toEqual({
        lcp: { max: 3000 }, // Mobile override wins (applied later)
        cls: { max: 0.05 }, // Mobile override wins (applied later)
      })
    })

    it('should handle partial threshold overrides', () => {
      const config: AssertionConfig = {
        metrics: {
          lcp: { min: 1000, max: 2500 },
        },
        tags: {
          critical: {
            lcp: { max: 2000 }, // Only override max, keep min from base
          },
        },
      }

      const target: Target = {
        id: 'homepage',
        url: 'https://example.com',
        name: 'Homepage',
        tags: ['critical'],
      }

      const resolved = resolver.resolve(config, target)

      expect(resolved.metrics).toEqual({
        lcp: { min: 1000, max: 2000 }, // Min from base, max from tag override
      })
    })

    it('should handle target with no tags', () => {
      const config: AssertionConfig = {
        metrics: {
          lcp: { max: 2500 },
        },
        tags: {
          critical: {
            lcp: { max: 2000 },
          },
        },
      }

      const target: Target = {
        id: 'homepage',
        url: 'https://example.com',
        name: 'Homepage',
        tags: [], // No tags
      }

      const resolved = resolver.resolve(config, target)

      expect(resolved.metrics).toEqual({
        lcp: { max: 2500 }, // Base config unchanged
      })
    })

    it('should handle config with no base metrics', () => {
      const config: AssertionConfig = {
        tags: {
          critical: {
            lcp: { max: 2000 },
          },
        },
      }

      const target: Target = {
        id: 'homepage',
        url: 'https://example.com',
        name: 'Homepage',
        tags: ['critical'],
      }

      const resolved = resolver.resolve(config, target)

      expect(resolved.metrics).toEqual({
        lcp: { max: 2000 }, // Only from tag override
      })
    })

    it('should preserve other config properties', () => {
      const config: AssertionConfig = {
        metrics: {
          lcp: { max: 2500 },
        },
        delta: {
          deltaMaxPct: 10,
        },
      }

      const target: Target = {
        id: 'homepage',
        url: 'https://example.com',
        name: 'Homepage',
        tags: [],
      }

      const resolved = resolver.resolve(config, target)

      expect(resolved.delta).toEqual(config.delta)
      expect(resolved.metrics).toEqual(config.metrics)
    })

    it('should handle non-existent tag gracefully', () => {
      const config: AssertionConfig = {
        metrics: {
          lcp: { max: 2500 },
        },
        tags: {
          critical: {
            lcp: { max: 2000 },
          },
        },
      }

      const target: Target = {
        id: 'homepage',
        url: 'https://example.com',
        name: 'Homepage',
        tags: ['nonexistent'],
      }

      const resolved = resolver.resolve(config, target)

      expect(resolved.metrics).toEqual({
        lcp: { max: 2500 }, // Base config unchanged
      })
    })

    it('should handle non-existent target gracefully', () => {
      const config: AssertionConfig = {
        metrics: {
          lcp: { max: 2500 },
        },
        targets: {
          other: {
            lcp: { max: 2000 },
          },
        },
      }

      const target: Target = {
        id: 'homepage',
        url: 'https://example.com',
        name: 'Homepage',
        tags: [],
      }

      const resolved = resolver.resolve(config, target)

      expect(resolved.metrics).toEqual({
        lcp: { max: 2500 }, // Base config unchanged
      })
    })
  })
})
