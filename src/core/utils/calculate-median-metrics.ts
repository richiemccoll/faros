import type { NormalizedMetrics } from '../types/metrics'

/**
 * Calculate median metrics from an array of metric results
 */
export function calculateMedianMetrics(results: NormalizedMetrics[]): NormalizedMetrics {
  if (results.length === 0) {
    return {}
  }

  if (results.length === 1) {
    return results[0] || {}
  }

  const medianMetrics: NormalizedMetrics = {}

  const allKeys = new Set<keyof NormalizedMetrics>()

  results.forEach((result) => {
    Object.keys(result).forEach((key) => allKeys.add(key as keyof NormalizedMetrics))
  })

  for (const metricKey of allKeys) {
    const validValues = results
      .map((result) => result[metricKey])
      .filter((value): value is number => typeof value === 'number')

    if (validValues.length > 0) {
      medianMetrics[metricKey] = calculateMedian(validValues)
    }
  }

  return medianMetrics
}

/**
 * Calculate median of an array of numbers
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    throw new Error('Cannot calculate median of empty array')
  }

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    // Even number of values - return average of two middle values
    const left = sorted[middle - 1]
    const right = sorted[middle]
    if (left === undefined || right === undefined) {
      throw new Error('Invalid array indices')
    }
    return (left + right) / 2
  } else {
    // Odd number of values - return middle value
    const value = sorted[middle]
    if (value === undefined) {
      throw new Error('Invalid array index')
    }
    return value
  }
}
