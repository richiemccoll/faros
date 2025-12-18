import { z } from 'zod'
import { AuthConfigSchema } from './auth'

// Target represents a URL to test with metadata
export const TargetSchema = z.object({
  id: z.string().min(1, 'Target id is required'),
  url: z.string().url('Must be a valid URL'),
  name: z.string().optional(),
  tags: z.array(z.string()).default([]),
  profile: z.string().optional(), // Override default profile for this target
  auth: AuthConfigSchema.optional(), // Authentication configuration for this target
})

export type Target = z.infer<typeof TargetSchema>

// ProfileRef represents a Lighthouse configuration preset
export const ProfileRefSchema = z.object({
  id: z.string().min(1, 'Profile id is required'),
  name: z.string().optional(),
  lighthouseConfig: z.record(z.string(), z.unknown()).optional(), // Lighthouse config object
  extends: z.string().optional(), // Extend another profile
  auth: AuthConfigSchema.optional(), // Default authentication configuration for this profile
})

export type ProfileRef = z.infer<typeof ProfileRefSchema>
