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
import type { Target, ProfileRef, AuthConfig } from '../core/types'
import { resolveAuthHeaders, resolveAuthCookies } from '../core/utils/resolve-auth'
import { authConfigToLighthouseHeaders, authConfigToCDPCookies, CDPCookie } from '../core/utils/merge-auth-config'
import { ChromePool } from './chrome-pool'

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
  private chromePool: ChromePool
  private tempDir: string
  private options: Required<LaunchOptions>

  constructor(options: LaunchOptions = {}, poolSize?: number) {
    this.options = {
      headless: options.headless ?? true,
      chromeFlags: ['--no-sandbox', '--disable-dev-shm-usage'],
      logLevel: 'error',
      tempDir: path.join(os.tmpdir(), 'faros-lighthouse'),
      timeout: 60000, // Default 60 seconds to match PerfConfig default
      ...options,
    }

    this.tempDir = this.options.tempDir
    this.ensureTempDir()

    // default to 3 instances in the pool or match concurrency
    this.chromePool = new ChromePool({
      poolSize: poolSize || 3,
      headless: this.options.headless,
      chromeFlags: this.options.chromeFlags,
      logLevel: this.options.logLevel,
    })
  }

  async launchChrome(): Promise<void> {
    await this.chromePool.initialize()
  }

  /**
   * Run Lighthouse audit on a target with a specific profile
   */
  async run(target: Target, profile: ProfileRef, authConfig?: AuthConfig): Promise<LighthouseResult> {
    // Acquire a Chrome instance from the pool
    const chrome = await this.chromePool.acquireChrome()

    try {
      let lighthouseHeaders: Record<string, string> | undefined
      let cdpCookies: Array<CDPCookie> | undefined

      if (authConfig) {
        const resolvedAuthConfig = {
          headers: authConfig.headers ? resolveAuthHeaders(authConfig.headers) : undefined,
          cookies: authConfig.cookies ? resolveAuthCookies(authConfig.cookies) : undefined,
        }

        lighthouseHeaders = authConfigToLighthouseHeaders(resolvedAuthConfig)
        cdpCookies = authConfigToCDPCookies(resolvedAuthConfig)
      }

      const lighthouseConfig = this.buildLighthouseConfig(profile, lighthouseHeaders)
      const flags = {
        logLevel: this.options.logLevel,
        output: ['json' as const, 'html' as const],
        port: chrome.port,
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
            LH_AUTH_COOKIES: cdpCookies ? JSON.stringify(cdpCookies) : undefined,
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
    } finally {
      this.chromePool.releaseChrome(chrome)
    }
  }

  async kill(): Promise<void> {
    await this.chromePool.cleanup()
  }

  async cleanup(): Promise<void> {
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
  private buildLighthouseConfig(profile: ProfileRef, extraHeaders?: Record<string, string>): Record<string, unknown> {
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
        extraHeaders: extraHeaders,
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

export function createLighthouseLauncher(options?: LaunchOptions, concurrency?: number): LighthouseLauncher {
  return new LighthouseLauncher(options, concurrency)
}
