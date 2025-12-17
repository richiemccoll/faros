import { z } from 'zod'

export const BaselineTargetSchema = z.object({
  id: z.string(),
  url: z.string(),
  metrics: z.object({
    lcp: z.number().optional(),
    cls: z.number().optional(),
    fid: z.number().optional(),
    inp: z.number().optional(),
    tbt: z.number().optional(),
    fcp: z.number().optional(),
    performanceScore: z.number().optional(),
  }),
})

export type BaselineTarget = z.infer<typeof BaselineTargetSchema>

export const BaselineDataSchema = z.object({
  version: z.string(),
  generatedAt: z.string().optional(), // ISO date string
  targets: z.array(BaselineTargetSchema),
})

export type BaselineData = z.infer<typeof BaselineDataSchema>

export const BaselineConfigSchema = z
  .object({
    file: z.string().optional(), // path to baseline JSON file
    data: BaselineDataSchema.optional(), // inline baseline object
    matchBy: z.enum(['id', 'url']).default('id'), // how to match targets to baseline
  })
  .refine((config) => !!(config.file || config.data), {
    message: 'baseline.file or baseline.data is required',
    path: ['baseline'],
  })

export type BaselineConfig = z.infer<typeof BaselineConfigSchema>
