import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { resolveEnvVars, resolveAuthHeaders, resolveAuthCookies, validateAuthEnvVars } from './resolve-auth'

describe('resolve auth', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Create a fresh environment for each test
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('resolveEnvVars', () => {
    it('should resolve single environment variable', () => {
      process.env.TEST_TOKEN = 'secret123'

      const result = resolveEnvVars('Bearer ${TEST_TOKEN}')

      expect(result).toBe('Bearer secret123')
    })

    it('should resolve multiple environment variables', () => {
      process.env.AUTH_TYPE = 'Bearer'
      process.env.AUTH_TOKEN = 'token456'

      const result = resolveEnvVars('${AUTH_TYPE} ${AUTH_TOKEN}')

      expect(result).toBe('Bearer token456')
    })

    it('should return original string if no variables', () => {
      const result = resolveEnvVars('static-value')

      expect(result).toBe('static-value')
    })

    it('should throw error for undefined environment variable', () => {
      expect(() => {
        resolveEnvVars('Bearer ${UNDEFINED_VAR}')
      }).toThrow('Environment variable "UNDEFINED_VAR" is not defined')
    })
  })

  describe('resolveAuthHeaders', () => {
    it('should resolve all header values', () => {
      process.env.API_KEY = 'key123'
      process.env.AUTH_TOKEN = 'token456'

      const headers = {
        Authorization: 'Bearer ${AUTH_TOKEN}',
        'X-API-Key': '${API_KEY}',
        'Static-Header': 'static-value',
      }

      const result = resolveAuthHeaders(headers)

      expect(result).toEqual({
        Authorization: 'Bearer token456',
        'X-API-Key': 'key123',
        'Static-Header': 'static-value',
      })
    })

    it('should handle empty headers object', () => {
      const result = resolveAuthHeaders({})

      expect(result).toEqual({})
    })
  })

  describe('resolveAuthCookies', () => {
    it('should resolve cookie name and value variables', () => {
      process.env.COOKIE_NAME = 'session'
      process.env.COOKIE_VALUE = 'abc123'

      const cookies = [
        {
          name: '${COOKIE_NAME}',
          value: '${COOKIE_VALUE}',
          domain: 'example.com',
          path: '/',
          secure: true,
          httpOnly: false,
        },
      ]

      const result = resolveAuthCookies(cookies)

      expect(result).toEqual([
        {
          name: 'session',
          value: 'abc123',
          domain: 'example.com',
          path: '/',
          secure: true,
          httpOnly: false,
        },
      ])
    })

    it('should handle multiple cookies', () => {
      process.env.SESSION_TOKEN = 'session123'
      process.env.CSRF_TOKEN = 'csrf456'

      const cookies = [
        { name: 'session', value: '${SESSION_TOKEN}', path: '/', secure: true, httpOnly: false },
        { name: 'csrf', value: '${CSRF_TOKEN}', path: '/', secure: true, httpOnly: false },
      ]

      const result = resolveAuthCookies(cookies)

      expect(result).toEqual([
        { name: 'session', value: 'session123', path: '/', secure: true, httpOnly: false },
        { name: 'csrf', value: 'csrf456', path: '/', secure: true, httpOnly: false },
      ])
    })
  })

  describe('validateAuthEnvVars', () => {
    it('should return valid for auth config without variables', () => {
      const authConfig = {
        headers: {
          Authorization: 'Bearer static-token',
        },
        cookies: [{ name: 'session', value: 'static-session' }],
      }

      const result = validateAuthEnvVars(authConfig)

      expect(result.valid).toBe(true)
      expect(result.missingVars).toEqual([])
    })

    it('should return valid when all referenced variables exist', () => {
      process.env.AUTH_TOKEN = 'token123'
      process.env.SESSION_VALUE = 'session456'

      const authConfig = {
        headers: {
          Authorization: 'Bearer ${AUTH_TOKEN}',
        },
        cookies: [{ name: 'session', value: '${SESSION_VALUE}' }],
      }

      const result = validateAuthEnvVars(authConfig)

      expect(result.valid).toBe(true)
      expect(result.missingVars).toEqual([])
    })

    it('should return invalid with missing variables list', () => {
      const authConfig = {
        headers: {
          Authorization: 'Bearer ${MISSING_TOKEN}',
          'X-Key': '${ANOTHER_MISSING}',
        },
        cookies: [{ name: 'session', value: '${MISSING_SESSION}' }],
      }

      const result = validateAuthEnvVars(authConfig)

      expect(result.valid).toBe(false)
      expect(result.missingVars).toEqual(['MISSING_TOKEN', 'ANOTHER_MISSING', 'MISSING_SESSION'])
    })

    it('should handle empty auth config', () => {
      const result = validateAuthEnvVars({})

      expect(result.valid).toBe(true)
      expect(result.missingVars).toEqual([])
    })

    it('should remove duplicate missing variables', () => {
      const authConfig = {
        headers: {
          Authorization: 'Bearer ${DUPLICATE_VAR}',
          'X-Key': '${DUPLICATE_VAR}',
        },
      }

      const result = validateAuthEnvVars(authConfig)

      expect(result.valid).toBe(false)
      expect(result.missingVars).toEqual(['DUPLICATE_VAR'])
    })
  })
})
