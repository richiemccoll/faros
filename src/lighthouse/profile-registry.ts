import type { ProfileRef } from '../core/types'
import { builtInProfiles } from './profiles'

export class ProfileRegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileRegistryError'
  }
}

export class ProfileRegistry {
  private profiles = new Map<string, ProfileRef>()

  constructor(customProfiles: Record<string, ProfileRef> = {}) {
    Object.values(builtInProfiles).forEach((profile) => {
      this.profiles.set(profile.id, profile)
    })

    // Override with custom profiles
    Object.values(customProfiles).forEach((profile) => {
      this.profiles.set(profile.id, profile)
    })
  }

  getProfile(id: string): ProfileRef {
    const resolved = this.resolveProfile(id, new Set())
    if (!resolved) {
      throw new ProfileRegistryError(`Profile not found: ${id}`)
    }
    return resolved
  }

  hasProfile(id: string): boolean {
    return this.profiles.has(id)
  }

  listProfiles(): ProfileRef[] {
    return Array.from(this.profiles.values())
  }

  private resolveProfile(id: string, visiting: Set<string>): ProfileRef | null {
    if (visiting.has(id)) {
      throw new ProfileRegistryError(`Circular dependency detected: ${Array.from(visiting).join(' -> ')} -> ${id}`)
    }

    const profile = this.profiles.get(id)
    if (!profile) {
      return null
    }

    if (!profile.extends) {
      return profile
    }

    visiting.add(id)
    const baseProfile = this.resolveProfile(profile.extends, visiting)
    visiting.delete(id)

    if (!baseProfile) {
      throw new ProfileRegistryError(`Base profile not found: ${profile.extends} (extended by ${id})`)
    }

    // Merge base profile with current profile (deep merge lighthouse config)
    return {
      ...baseProfile,
      ...profile,
      lighthouseConfig: this.deepMerge(baseProfile.lighthouseConfig || {}, profile.lighthouseConfig || {}),
    }
  }

  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target }

    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(
          (target[key] as Record<string, unknown>) || {},
          source[key] as Record<string, unknown>,
        )
      } else {
        result[key] = source[key]
      }
    }

    return result
  }
}
