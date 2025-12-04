import { launch, LaunchedChrome } from 'chrome-launcher'
import { type Result } from 'lighthouse'
import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { logger } from '../logger'
import { deepMergeMutable } from '../core/utils/deep-merge'
import type { Target, ProfileRef } from '../core/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
  timeout?: number
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
      timeout: 60000, // Default 60 seconds to match PerfConfig default
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
        chromeFlags: this.options.headless ? [...this.options.chromeFlags, '--headless'] : this.options.chromeFlags,
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

    // The worker process will write the lighthouse report
    // into a temp file that this parent process will read and parse
    const tmpDir = path.join(os.tmpdir(), 'lh-worker')
    await mkdir(tmpDir, { recursive: true })
    const tmpFile = path.join(tmpDir, `${randomUUID()}.json`)
    const maxTimeoutMs = this.options.timeout

    // Handle both development and production paths
    let workerPath: string
    if (__dirname.includes('/dist/')) {
      // Production build - from dist/bin to dist/src/lighthouse
      workerPath = path.join(__dirname, '../src/lighthouse/lighthouse-worker')
    } else {
      // Development - same directory as this file
      workerPath = path.join(__dirname, 'lighthouse-worker')
    }

    await new Promise<void>((resolve, reject) => {
      const child = fork(workerPath, [tmpFile], {
        stdio: 'ignore', // we don't need to see worker output
        env: {
          ...process.env,
          LH_TARGET_URL: target.url,
          LH_FLAGS: JSON.stringify(flags),
          LH_CONFIG: JSON.stringify(lighthouseConfig),
        },
      })

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`Lighthouse worker timeout after ${maxTimeoutMs}ms`))
      }, maxTimeoutMs)

      child.once('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) return resolve()
        reject(new Error(`Lighthouse worker exited with code ${code}`))
      })

      child.once('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })

    const raw = await readFile(tmpFile, 'utf8')
    const parsed = JSON.parse(raw)
    void unlink(tmpFile).catch(() => {})

    return {
      lhr: parsed.lhr,
      report: parsed.report,
      artifacts: parsed.artifacts,
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
        maxWaitForFcp: 60000,
        maxWaitForLoad: 60000,
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
