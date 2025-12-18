import { z } from 'zod'

export const CookieSchema = z.object({
  name: z.string().min(1, 'Cookie name is required'),
  value: z.string().min(1, 'Cookie value is required'),
  domain: z.string().optional(),
  path: z.string().default('/'),
  secure: z.boolean().default(true),
  httpOnly: z.boolean().default(false),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
  expires: z.number().optional(), // Unix timestamp
})

export type Cookie = z.infer<typeof CookieSchema>

/**
 * Authentication configuration for targets and profiles
 */
export const AuthConfigSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  cookies: z.array(CookieSchema).optional(),
})

export type AuthConfig = z.infer<typeof AuthConfigSchema>
