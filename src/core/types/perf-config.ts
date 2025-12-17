import { z } from 'zod'
import { TargetSchema, ProfileRefSchema } from './target'
import { AssertionConfigSchema } from './assertions'
import { BaselineConfigSchema } from './baseline'

// Output configuration for reports
export const OutputConfigSchema = z.object({
  dir: z.string().default('./perf-results'),
  formats: z.array(z.enum(['cli', 'json', 'html', 'junit'])).default(['cli']),
  filename: z.string().optional(),
  includeRawLighthouse: z.boolean().default(false),
})

export type OutputConfig = z.infer<typeof OutputConfigSchema>

// Plugin configuration
export const PluginConfigSchema = z.object({
  name: z.string(),
  options: z.record(z.string(), z.unknown()).optional(),
})

export type PluginConfig = z.infer<typeof PluginConfigSchema>

// Main configuration object
export const PerfConfigSchema = z.object({
  targets: z.array(TargetSchema).min(1, 'At least one target is required'),
  profiles: z.record(z.string(), ProfileRefSchema).optional(),
  defaultProfile: z.string().default('default'),
  concurrency: z.number().int().positive().default(1),
  maxRetries: z.number().int().nonnegative().default(2),
  timeout: z.number().int().positive().default(60000), // 60 seconds
  assertions: AssertionConfigSchema.optional(),
  baseline: BaselineConfigSchema.optional(),
  output: OutputConfigSchema.optional(),
  plugins: z.array(PluginConfigSchema).default([]),
  lighthouseOptions: z.record(z.string(), z.unknown()).optional(), // Global Lighthouse options
})

export type PerfConfig = z.infer<typeof PerfConfigSchema>
