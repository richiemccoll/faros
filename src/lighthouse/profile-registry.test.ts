import { describe, it, expect } from '@jest/globals'
import { ProfileRegistry, ProfileRegistryError } from './profile-registry'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ProfileRegistry', () => {
  it('should load built-in profiles by default', () => {
    const registry = new ProfileRegistry()

    expect(registry.hasProfile('default')).toBe(true)
    expect(registry.hasProfile('mobileSlow3G')).toBe(true)
    expect(registry.hasProfile('desktop')).toBe(true)
    expect(registry.hasProfile('ciMinimal')).toBe(true)
  })

  it('should return built-in profile correctly', () => {
    const registry = new ProfileRegistry()
    const profile = registry.getProfile('mobileSlow3G')

    expect(profile.id).toBe('mobileSlow3G')
    expect(profile.name).toBe('Mobile Slow 3G')
    expect((profile.lighthouseConfig?.settings as any)?.emulatedFormFactor).toBe('mobile')
  })

  it('should allow custom profiles to override built-ins', () => {
    const customProfiles = {
      desktop: {
        id: 'desktop',
        name: 'Custom Desktop',
        lighthouseConfig: {
          settings: {
            emulatedFormFactor: 'desktop',
            customSetting: 'test',
          },
        },
      },
    }

    const registry = new ProfileRegistry(customProfiles)
    const profile = registry.getProfile('desktop')

    expect(profile.name).toBe('Custom Desktop')
    expect((profile.lighthouseConfig?.settings as any)?.customSetting).toBe('test')
  })

  it('should resolve profile inheritance', () => {
    const customProfiles = {
      myMobile: {
        id: 'myMobile',
        name: 'My Mobile Profile',
        extends: 'mobileSlow3G',
        lighthouseConfig: {
          settings: {
            customThrottle: 'slow',
          },
        },
      },
    }

    const registry = new ProfileRegistry(customProfiles)
    const profile = registry.getProfile('myMobile')

    expect(profile.name).toBe('My Mobile Profile')
    expect((profile.lighthouseConfig?.settings as any)?.emulatedFormFactor).toBe('mobile')
    expect((profile.lighthouseConfig?.settings as any)?.customThrottle).toBe('slow')
  })

  it('should throw error for missing profile', () => {
    const registry = new ProfileRegistry()

    expect(() => registry.getProfile('nonexistent')).toThrow(ProfileRegistryError)
    expect(() => registry.getProfile('nonexistent')).toThrow('Profile not found: nonexistent')
  })

  it('should detect circular dependencies', () => {
    const customProfiles = {
      profile1: {
        id: 'profile1',
        extends: 'profile2',
      },
      profile2: {
        id: 'profile2',
        extends: 'profile1',
      },
    }

    const registry = new ProfileRegistry(customProfiles)

    expect(() => registry.getProfile('profile1')).toThrow(ProfileRegistryError)
    expect(() => registry.getProfile('profile1')).toThrow('Circular dependency detected')
  })

  it('should throw error for missing base profile', () => {
    const customProfiles = {
      invalid: {
        id: 'invalid',
        extends: 'nonexistent',
      },
    }

    const registry = new ProfileRegistry(customProfiles)

    expect(() => registry.getProfile('invalid')).toThrow(ProfileRegistryError)
    expect(() => registry.getProfile('invalid')).toThrow('Base profile not found: nonexistent')
  })

  it('should list all available profiles', () => {
    const registry = new ProfileRegistry()
    const profiles = registry.listProfiles()

    expect(profiles).toHaveLength(4)
    expect(profiles.map((p) => p.id)).toContain('default')
    expect(profiles.map((p) => p.id)).toContain('mobileSlow3G')
    expect(profiles.map((p) => p.id)).toContain('desktop')
    expect(profiles.map((p) => p.id)).toContain('ciMinimal')
  })
})
