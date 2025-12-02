import { describe, it, expect } from '@jest/globals'
import { validateConfig, createDefaultConfig, ConfigValidationError } from './config'

describe('PerfConfig validation', () => {
  it('should validate a correct configuration', () => {
    const config = createDefaultConfig()
    const result = validateConfig(config)

    expect(result).toBeDefined()
    expect(result.targets).toHaveLength(1)
    expect(result.targets[0]?.id).toBe('homepage')
    expect(result.defaultProfile).toBe('default')
    expect(result.concurrency).toBe(1)
  })

  it('should reject configuration with missing targets', () => {
    const invalidConfig = {
      targets: [],
      defaultProfile: 'default',
    }

    expect(() => validateConfig(invalidConfig)).toThrow(ConfigValidationError)
  })

  it('should reject configuration with invalid URL', () => {
    const invalidConfig = {
      targets: [
        {
          id: 'test',
          url: 'not-a-valid-url',
          name: 'Test',
        },
      ],
    }

    expect(() => validateConfig(invalidConfig)).toThrow(ConfigValidationError)
  })

  it('should apply defaults correctly', () => {
    const minimalConfig = {
      targets: [
        {
          id: 'test',
          url: 'https://example.com',
        },
      ],
    }

    const result = validateConfig(minimalConfig)

    expect(result.concurrency).toBe(1)
    expect(result.maxRetries).toBe(2)
    expect(result.timeout).toBe(30000)
    expect(result.plugins).toEqual([])
    expect(result.targets[0]?.tags).toEqual([])
  })

  it('should handle assertion configuration', () => {
    const configWithAssertions = {
      targets: [
        {
          id: 'test',
          url: 'https://example.com',
          tags: [] as string[],
        },
      ],
      assertions: {
        metrics: {
          lcp: { max: 2500 },
          performanceScore: { min: 90 },
        },
        tags: {
          critical: {
            lcp: { max: 2000 },
          },
        },
      },
    }

    const result = validateConfig(configWithAssertions)

    expect(result.assertions?.metrics?.lcp?.max).toBe(2500)
    expect(result.assertions?.metrics?.performanceScore?.min).toBe(90)
    expect(result.assertions?.tags?.critical?.lcp?.max).toBe(2000)
  })
})
