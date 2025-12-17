import type { ProfileRef } from '../core/types'

export const builtInProfiles: Record<string, ProfileRef> = {
  default: {
    id: 'default',
    name: 'Default Desktop',
    lighthouseConfig: {
      settings: {
        emulatedFormFactor: 'desktop',
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
        onlyCategories: ['performance'],
      },
    },
  },

  mobileSlow3G: {
    id: 'mobileSlow3G',
    name: 'Mobile Slow 3G',
    lighthouseConfig: {
      settings: {
        emulatedFormFactor: 'mobile',
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
        },
        onlyCategories: ['performance'],
      },
    },
  },

  desktop: {
    id: 'desktop',
    name: 'Desktop Fast',
    lighthouseConfig: {
      settings: {
        emulatedFormFactor: 'desktop',
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
      },
    },
  },

  ciMinimal: {
    id: 'ciMinimal',
    name: 'CI Minimal',
    lighthouseConfig: {
      settings: {
        emulatedFormFactor: 'desktop',
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
        onlyCategories: ['performance'],
        skipAudits: ['screenshot-thumbnails', 'final-screenshot'],
      },
    },
  },
}
