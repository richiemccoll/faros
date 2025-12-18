import { describe, it, expect } from '@jest/globals'
import {
  mergeAuthConfig,
  cookiesToHeaderString,
  authConfigToLighthouseHeaders,
  authConfigToCDPCookies,
} from './merge-auth-config'
import type { AuthConfig } from '../types/auth'

describe('mergeAuthConfig', () => {
  it('should return undefined when both configs are undefined', () => {
    const result = mergeAuthConfig(undefined, undefined)

    expect(result).toBeUndefined()
  })

  it('should return target config when profile config is undefined', () => {
    const targetAuth: AuthConfig = {
      headers: { Authorization: 'Bearer token' },
    }

    const result = mergeAuthConfig(undefined, targetAuth)

    expect(result).toEqual(targetAuth)
  })

  it('should return profile config when target config is undefined', () => {
    const profileAuth: AuthConfig = {
      headers: { 'X-Profile-Key': 'profile-value' },
    }

    const result = mergeAuthConfig(profileAuth, undefined)

    expect(result).toEqual(profileAuth)
  })

  it('should merge headers with target taking precedence', () => {
    const profileAuth: AuthConfig = {
      headers: {
        Authorization: 'Bearer profile-token',
        'X-Profile-Key': 'profile-value',
      },
    }

    const targetAuth: AuthConfig = {
      headers: {
        Authorization: 'Bearer target-token',
        'X-Target-Key': 'target-value',
      },
    }

    const result = mergeAuthConfig(profileAuth, targetAuth)

    expect(result?.headers).toEqual({
      Authorization: 'Bearer target-token', // target overrides
      'X-Profile-Key': 'profile-value',
      'X-Target-Key': 'target-value',
    })
  })

  it('should append target cookies after profile cookies', () => {
    const profileAuth: AuthConfig = {
      cookies: [{ name: 'profile-session', value: 'profile-value', path: '/', secure: true, httpOnly: false }],
    }

    const targetAuth: AuthConfig = {
      cookies: [{ name: 'target-session', value: 'target-value', path: '/', secure: true, httpOnly: false }],
    }

    const result = mergeAuthConfig(profileAuth, targetAuth)

    expect(result?.cookies).toEqual([
      { name: 'profile-session', value: 'profile-value', path: '/', secure: true, httpOnly: false },
      { name: 'target-session', value: 'target-value', path: '/', secure: true, httpOnly: false },
    ])
  })

  it('should merge both headers and cookies', () => {
    const profileAuth: AuthConfig = {
      headers: { 'X-Profile': 'value' },
      cookies: [{ name: 'profile-cookie', value: 'value1', path: '/', secure: true, httpOnly: false }],
    }

    const targetAuth: AuthConfig = {
      headers: { 'X-Target': 'value' },
      cookies: [{ name: 'target-cookie', value: 'value2', path: '/', secure: true, httpOnly: false }],
    }

    const result = mergeAuthConfig(profileAuth, targetAuth)

    expect(result?.headers).toEqual({
      'X-Profile': 'value',
      'X-Target': 'value',
    })
    expect(result?.cookies).toHaveLength(2)
  })
})

describe('cookiesToHeaderString', () => {
  it('should convert single cookie to header string', () => {
    const cookies = [{ name: 'session', value: 'abc123' }]

    const result = cookiesToHeaderString(cookies)

    expect(result).toBe('session=abc123')
  })

  it('should convert multiple cookies to header string', () => {
    const cookies = [
      { name: 'session', value: 'abc123' },
      { name: 'csrf', value: 'def456' },
    ]

    const result = cookiesToHeaderString(cookies)

    expect(result).toBe('session=abc123; csrf=def456')
  })

  it('should handle empty cookies array', () => {
    const result = cookiesToHeaderString([])

    expect(result).toBe('')
  })
})

describe('authConfigToLighthouseHeaders', () => {
  it('should convert headers only', () => {
    const authConfig: AuthConfig = {
      headers: {
        Authorization: 'Bearer token123',
        'X-API-Key': 'key456',
      },
    }

    const result = authConfigToLighthouseHeaders(authConfig)

    expect(result).toEqual({
      Authorization: 'Bearer token123',
      'X-API-Key': 'key456',
    })
  })

  it('should convert cookies to Cookie header', () => {
    const authConfig: AuthConfig = {
      cookies: [
        { name: 'session', value: 'abc123', path: '/', secure: true, httpOnly: false },
        { name: 'csrf', value: 'def456', path: '/', secure: true, httpOnly: false },
      ],
    }

    const result = authConfigToLighthouseHeaders(authConfig)

    expect(result).toEqual({
      Cookie: 'session=abc123; csrf=def456',
    })
  })

  it('should merge with existing Cookie header', () => {
    const authConfig: AuthConfig = {
      headers: {
        Cookie: 'existing=value',
      },
      cookies: [{ name: 'new', value: 'value', path: '/', secure: true, httpOnly: false }],
    }

    const result = authConfigToLighthouseHeaders(authConfig)

    expect(result).toEqual({
      Cookie: 'existing=value; new=value',
    })
  })

  it('should handle empty auth config', () => {
    const result = authConfigToLighthouseHeaders({})

    expect(result).toEqual({})
  })
})

describe('authConfigToCDPCookies', () => {
  it('should convert auth cookies to CDP format', () => {
    const authConfig: AuthConfig = {
      cookies: [
        {
          name: 'session',
          value: 'abc123',
          domain: 'example.com',
          path: '/app',
          secure: false,
          httpOnly: true,
          sameSite: 'Strict' as const,
          expires: 1640995200,
        },
      ],
    }

    const result = authConfigToCDPCookies(authConfig)

    expect(result).toEqual([
      {
        name: 'session',
        value: 'abc123',
        domain: 'example.com',
        path: '/app',
        secure: false,
        httpOnly: true,
        sameSite: 'Strict',
        expires: 1640995200,
      },
    ])
  })

  it('should apply default values for optional fields', () => {
    const authConfig: AuthConfig = {
      cookies: [
        {
          name: 'simple',
          value: 'value',
          path: '/',
          secure: true,
          httpOnly: false,
        },
      ],
    }

    const result = authConfigToCDPCookies(authConfig)

    expect(result).toEqual([
      {
        name: 'simple',
        value: 'value',
        domain: undefined,
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: undefined,
        expires: undefined,
      },
    ])
  })

  it('should handle no cookies', () => {
    const authConfig: AuthConfig = {
      headers: { Authorization: 'Bearer token' },
    }

    const result = authConfigToCDPCookies(authConfig)

    expect(result).toEqual([])
  })

  it('should return empty array for empty auth config', () => {
    const result = authConfigToCDPCookies({})

    expect(result).toEqual([])
  })
})
