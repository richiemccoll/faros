import { deepMerge, deepMergeMutable } from './deep-merge'

describe('Deep Merge Utilities', () => {
  describe('deepMerge (immutable)', () => {
    it('should merge two objects without mutating the originals', () => {
      const target = { a: 1, b: { c: 2 } }
      const source = { b: { d: 3 }, e: 4 }
      const result = deepMerge(target, source)

      expect(result).toEqual({
        a: 1,
        b: { c: 2, d: 3 },
        e: 4,
      })

      // Original objects should not be mutated
      expect(target).toEqual({ a: 1, b: { c: 2 } })
      expect(source).toEqual({ b: { d: 3 }, e: 4 })
    })

    it('should handle nested objects correctly', () => {
      const target = {
        settings: {
          throttling: { rttMs: 40, throughputKbps: 10240 },
          formFactor: 'desktop',
        },
      }
      const source = {
        settings: {
          throttling: { cpuSlowdownMultiplier: 1 },
          onlyCategories: ['performance'],
        },
      }

      const result = deepMerge(target, source)

      expect(result).toEqual({
        settings: {
          throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
          formFactor: 'desktop',
          onlyCategories: ['performance'],
        },
      })
    })

    it('should handle arrays by replacing them', () => {
      const target = { arr: [1, 2, 3], other: 'value' }
      const source = { arr: [4, 5], other: 'updated' }
      const result = deepMerge(target, source)

      expect(result).toEqual({
        arr: [4, 5],
        other: 'updated',
      })
    })

    it('should handle null and undefined values', () => {
      const target = { a: 1, b: null, c: undefined }
      const source = { b: 2, c: 3, d: null }
      const result = deepMerge(target, source)

      expect(result).toEqual({
        a: 1,
        b: 2,
        c: 3,
        d: null,
      })
    })
  })

  describe('deepMergeMutable (mutable)', () => {
    it('should merge objects by mutating the target', () => {
      const target = { a: 1, b: { c: 2 } }
      const source = { b: { d: 3 }, e: 4 }
      const result = deepMergeMutable(target, source)

      expect(result).toBe(target) // Should return the same object reference
      expect(target).toEqual({
        a: 1,
        b: { c: 2, d: 3 },
        e: 4,
      })
    })

    it('should handle Lighthouse config merging', () => {
      const lighthouseConfig = {
        extends: 'lighthouse:default',
        settings: {
          maxWaitForFcp: 30000,
          formFactor: 'desktop',
        },
      }
      const profileConfig = {
        settings: {
          onlyCategories: ['performance'],
          throttling: { rttMs: 150 },
        },
      }

      deepMergeMutable(lighthouseConfig, profileConfig)

      expect(lighthouseConfig.settings).toEqual({
        maxWaitForFcp: 30000,
        formFactor: 'desktop',
        onlyCategories: ['performance'],
        throttling: { rttMs: 150 },
      })
    })
  })
})
