import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { BaselineData, BaselineConfig, BaselineDataSchema } from '../types/baseline'
import { NormalizedMetrics } from '../types/metrics'

export interface ResolvedBaseline {
  data: BaselineData
  index: Map<string, NormalizedMetrics>
}

export class BaselineResolutionError extends Error {
  constructor(
    message: string,
    public cause?: Error,
  ) {
    super(message)
    this.name = 'BaselineResolutionError'
  }
}

/**
 * Resolve baseline configuration to validated data and target index
 */
export async function resolveBaseline(baselineConfig: BaselineConfig, cwd?: string): Promise<ResolvedBaseline | null> {
  try {
    let baselineData: BaselineData

    // Use inline data if provided
    if (baselineConfig.data) {
      baselineData = validateBaselineData(baselineConfig.data)
    }
    // Load from file if provided
    else if (baselineConfig.file) {
      baselineData = await loadBaselineFromFile(baselineConfig.file, cwd)
    }
    // This should not happen due to schema validation, but handle gracefully
    else {
      throw new BaselineResolutionError('No baseline source provided (neither file nor data)')
    }

    const index = createBaselineIndex(baselineData, baselineConfig.matchBy ?? 'id')

    return {
      data: baselineData,
      index,
    }
  } catch (error) {
    // Don't fail if we can't resolve the baseline file/data
    return null
  }
}

export function getBaselineMetrics(
  baseline: ResolvedBaseline | null,
  targetId: string,
  targetUrl: string,
  matchBy: 'id' | 'url' = 'id',
): NormalizedMetrics | undefined {
  if (!baseline) {
    return undefined
  }

  const key = matchBy === 'id' ? targetId : targetUrl
  return baseline.index.get(key)
}

async function loadBaselineFromFile(filePath: string, cwd?: string): Promise<BaselineData> {
  try {
    const resolvedPath = cwd ? resolve(cwd, filePath) : resolve(filePath)

    const fileContent = await readFile(resolvedPath, 'utf-8')

    const parsed = JSON.parse(fileContent)
    return validateBaselineData(parsed)
  } catch (error) {
    throw new BaselineResolutionError(
      `Failed to load baseline file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    )
  }
}

function validateBaselineData(data: unknown): BaselineData {
  try {
    return BaselineDataSchema.parse(data)
  } catch (error) {
    throw new BaselineResolutionError(
      `Invalid baseline data format: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    )
  }
}

function createBaselineIndex(baselineData: BaselineData, matchBy: 'id' | 'url'): Map<string, NormalizedMetrics> {
  const index = new Map<string, NormalizedMetrics>()

  for (const target of baselineData.targets) {
    const key = matchBy === 'id' ? target.id : target.url

    if (index.has(key)) {
      continue
    }

    index.set(key, target.metrics)
  }

  return index
}
