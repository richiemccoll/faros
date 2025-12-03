import { launch, LaunchedChrome } from 'chrome-launcher'
import lighthouse, { type Result } from 'lighthouse'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { logger } from '../logger'
import { deepMergeMutable } from '../core/utils/deep-merge'
import type { Target, ProfileRef } from '../core/types'

interface LighthouseSettings {
  emulatedFormFactor?: 'desktop' | 'mobile' | 'none'
  throttling?: {
    rttMs: number
    throughputKbps: number
    cpuSlowdownMultiplier: number
  }
  onlyCategories?: string[]
  skipAudits?: string[]
}

export interface LighthouseResult {
  lhr: Result
  report: string
  artifacts?: Record<string, unknown>
}

export interface LaunchOptions {
  headless?: boolean
  chromeFlags?: string[]
  logLevel?: 'silent' | 'error' | 'info' | 'verbose'
  tempDir?: string
}

export class LighthouseLauncher {
  private chrome: LaunchedChrome | null = null
  private tempDir: string
  private options: Required<LaunchOptions>

  constructor(options: LaunchOptions = {}) {
    this.options = {
      headless: true,
      chromeFlags: ['--no-sandbox', '--disable-dev-shm-usage'],
      logLevel: 'error',
      tempDir: path.join(os.tmpdir(), 'faros-lighthouse'),
      ...options,
    }

    this.tempDir = this.options.tempDir
    this.ensureTempDir()
  }

  async launchChrome(): Promise<void> {
    if (this.chrome) {
      return // Already launched
    }

    try {
      this.chrome = await launch({
        chromeFlags: this.options.chromeFlags,
        logLevel: this.options.logLevel,
      })
    } catch (error) {
      throw new Error(`Failed to launch Chrome: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Run Lighthouse audit on a target with a specific profile
   */
  async run(target: Target, profile: ProfileRef): Promise<LighthouseResult> {
    if (!this.chrome) {
      await this.launchChrome()
    }

    const lighthouseConfig = this.buildLighthouseConfig(profile)
    const flags = {
      logLevel: this.options.logLevel,
      output: ['json' as const, 'html' as const],
      port: this.chrome!.port,
    }

    try {
      const runnerResult = await lighthouse(target.url, flags, lighthouseConfig)

      if (!runnerResult) {
        throw new Error('Lighthouse returned null result')
      }

      return {
        lhr: runnerResult.lhr,
        report: runnerResult.report as string,
        artifacts: runnerResult.artifacts as unknown as Record<string, unknown>,
      }
    } catch (error) {
      throw new Error(
        `Lighthouse audit failed for ${target.url}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async kill(): Promise<void> {
    if (this.chrome) {
      await this.chrome.kill()
      this.chrome = null
    }
  }

  async cleanup(): Promise<void> {
    // Kill Chrome process first
    await this.kill()

    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true })
      }
    } catch (error) {
      // Log but don't throw - cleanup is best effort
      logger.warn(`Failed to cleanup temp directory: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Convert ProfileRef to Lighthouse configuration format
   */
  private buildLighthouseConfig(profile: ProfileRef): Record<string, unknown> {
    const profileSettings = profile.lighthouseConfig?.settings as LighthouseSettings | undefined

    // Start with default Lighthouse config structure
    const config = {
      extends: 'lighthouse:default',
      settings: {
        maxWaitForFcp: 30000,
        maxWaitForLoad: 45000,
        formFactor: profileSettings?.emulatedFormFactor || 'desktop',
        throttling: profileSettings?.throttling || {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
        screenEmulation: {
          mobile: profileSettings?.emulatedFormFactor === 'mobile',
          width: profileSettings?.emulatedFormFactor === 'mobile' ? 375 : 1350,
          height: profileSettings?.emulatedFormFactor === 'mobile' ? 667 : 940,
          deviceScaleFactor: profileSettings?.emulatedFormFactor === 'mobile' ? 2 : 1,
        },
      },
    }

    // Deep merge profile-specific settings
    if (profile.lighthouseConfig) {
      deepMergeMutable(config, profile.lighthouseConfig)
    }

    return config
  }

  private ensureTempDir(): void {
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true })
      }
    } catch (error) {
      throw new Error(`Failed to create temp directory: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export function createLighthouseLauncher(options?: LaunchOptions): LighthouseLauncher {
  return new LighthouseLauncher(options)
}
