import type { AuthConfig } from '../types/auth'

export interface CDPCookie {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  expires?: number
}

/**
 * Merges authentication configurations with target-level auth taking precedence over profile-level auth
 */
export function mergeAuthConfig(profileAuth?: AuthConfig, targetAuth?: AuthConfig): AuthConfig | undefined {
  // If neither has auth, return undefined
  if (!profileAuth && !targetAuth) {
    return undefined
  }

  // If only one is defined, return it
  if (!profileAuth) {
    return targetAuth
  }

  if (!targetAuth) {
    return profileAuth
  }

  const merged: AuthConfig = {}

  // Merge headers - target headers override profile headers for the same key
  if (profileAuth.headers || targetAuth.headers) {
    merged.headers = {
      ...profileAuth.headers,
      ...targetAuth.headers,
    }
  }

  // Merge cookies - target cookies are appended after profile cookies
  if (profileAuth.cookies || targetAuth.cookies) {
    merged.cookies = [...(profileAuth.cookies || []), ...(targetAuth.cookies || [])]
  }

  return merged
}

export function cookiesToHeaderString(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

/**
 * Converts AuthConfig to Lighthouse extraHeaders format
 */
export function authConfigToLighthouseHeaders(authConfig: AuthConfig): Record<string, string> {
  const headers: Record<string, string> = {}

  // Add custom headers
  if (authConfig.headers) {
    Object.assign(headers, authConfig.headers)
  }

  // Convert cookies to Cookie header
  if (authConfig.cookies && authConfig.cookies.length > 0) {
    const existingCookies = headers.Cookie || headers.cookie || ''
    const newCookies = cookiesToHeaderString(authConfig.cookies)

    if (existingCookies) {
      headers.Cookie = `${existingCookies}; ${newCookies}`
    } else {
      headers.Cookie = newCookies
    }
  }

  return headers
}

/**
 * Converts AuthConfig cookies to Chrome DevTools Protocol cookie format for Network.setCookie
 */
export function authConfigToCDPCookies(authConfig: AuthConfig): Array<CDPCookie> {
  if (!authConfig.cookies) {
    return []
  }

  return authConfig.cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    secure: cookie.secure !== false, // Default to true
    httpOnly: cookie.httpOnly || false,
    sameSite: cookie.sameSite,
    expires: cookie.expires,
  }))
}
