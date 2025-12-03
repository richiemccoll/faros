/**
 * Deep merge two objects immutably
 * @param target - The base object
 * @param source - The source object to merge
 * @returns A new object with merged properties
 */
export function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }

  for (const key in source) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge((target[key] as Record<string, unknown>) || {}, source[key] as Record<string, unknown>)
    } else {
      result[key] = source[key]
    }
  }

  return result
}

/**
 * Deep merge source into target
 * @param target - The target object to modify
 * @param source - The source object to merge
 * @returns The modified target object
 */
export function deepMergeMutable(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {}
      deepMergeMutable(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>)
    } else {
      target[key] = source[key]
    }
  }
  return target
}
