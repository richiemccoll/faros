#!/usr/bin/env node

/**
 * Lighthouse Worker - Child process script for isolated Lighthouse execution
 *
 * This script runs in a separate Node.js process to execute Lighthouse audits
 * with complete isolation from the main process.
 *
 * Usage: node lighthouse-worker.js <task-json> <output-file>
 */

import lighthouse, { type Result } from 'lighthouse'
import { launch, type LaunchedChrome } from 'chrome-launcher'
import * as fs from 'fs'
import type { Target } from '../core/types'
import { ProfileRegistry } from './profile-registry'
import { deepMergeMutable } from '../core/utils/deep-merge'
// import { chromeTracker } from './chrome-tracker'

interface WorkerTask {
  id: string
  target: Target
  profile: string // Profile ID to lookup in registry
  config: {
    headless?: boolean
    chromeFlags?: string[]
    logLevel?: 'silent' | 'error' | 'info' | 'verbose'
  }
}

interface WorkerResult {
  id: string
  success: boolean
  result?: {
    lhr: Result
    report: string
    artifacts?: Record<string, unknown>
  }
  error?: string
  metadata: {
    duration: number
    peakMemory: number
    chromeVersion?: string
    lighthouseVersion: string
  }
}

class LighthouseWorker {
  private chrome: LaunchedChrome | null = null
  private profileRegistry = new ProfileRegistry()
  private workerId: string

  constructor() {
    this.workerId = `worker-${process.pid}-${Date.now()}`
  }

  async execute(task: WorkerTask): Promise<WorkerResult> {
    console.log('Execute method started')
    const startTime = Date.now()

    try {
      console.log('About to build lighthouse config')
      console.log('About to launch Chrome')
      // Launch Chrome using same pattern as LighthouseLauncher with additional stability flags
      const defaultFlags = [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI,VizDisplayCompositor',
        '--disable-ipc-flooding-protection',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-domain-reliability',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run',
      ]
      const baseFlags = task.config?.chromeFlags || defaultFlags
      const chromeFlags = task.config?.headless !== false ? [...baseFlags, '--headless'] : baseFlags

      this.chrome = await launch({
        chromeFlags,
        logLevel: task.config?.logLevel || 'error',
      })

      // Track Chrome process for cleanup
      // if (this.chrome.pid) {
      //   chromeTracker.trackProcess(
      //     { pid: this.chrome.pid, port: this.chrome.port },
      //     this.workerId,
      //     '', // userDataDir not available from chrome-launcher
      //   )
      // }

      // Build Lighthouse config from profile
      const lighthouseConfig = this.buildLighthouseConfig(task.profile)

      // Run Lighthouse
      const runnerResult = await lighthouse(
        task.target.url,
        {
          logLevel: task.config?.logLevel || 'error',
          output: ['json', 'html'],
          port: this.chrome.port,
        },
        lighthouseConfig,
      )

      if (!runnerResult) {
        throw new Error('Lighthouse returned null result')
      }

      const duration = Date.now() - startTime
      const memoryUsage = process.memoryUsage()

      return {
        id: task.id,
        success: true,
        result: {
          lhr: runnerResult.lhr,
          report: runnerResult.report as string,
          // Skip artifacts to reduce payload size
          artifacts: {},
        },
        metadata: {
          duration,
          peakMemory: memoryUsage.heapUsed,
          chromeVersion: 'unknown',
          lighthouseVersion: 'unknown',
        },
      }
    } catch (error) {
      return {
        id: task.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          duration: Date.now() - startTime,
          peakMemory: process.memoryUsage().heapUsed,
          lighthouseVersion: 'unknown',
        },
      }
    } finally {
      await this.cleanup()
    }
  }

  private buildLighthouseConfig(profileId: string): Record<string, unknown> {
    console.log('Building config for profile:', profileId)
    const resolvedProfile = this.profileRegistry.getProfile(profileId)
    console.log('Resolved profile:', JSON.stringify(resolvedProfile, null, 2))
    const profileSettings = resolvedProfile.lighthouseConfig?.settings as Record<string, unknown>
    console.log('Profile settings:', JSON.stringify(profileSettings, null, 2))

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
    if (resolvedProfile.lighthouseConfig) {
      deepMergeMutable(config, resolvedProfile.lighthouseConfig)
    }

    return config
  }

  async cleanup(): Promise<void> {
    if (this.chrome) {
      const chromePid = this.chrome.pid
      try {
        // Try graceful shutdown first
        await this.chrome.kill()
        // Give Chrome a brief moment to shut down gracefully
        await new Promise((resolve) => setTimeout(resolve, 200))

        // Verify Chrome process is actually dead
        if (chromePid && this.isProcessRunning(chromePid)) {
          process.stderr.write(`Chrome process ${chromePid} still running, force killing...\n`)
          process.kill(chromePid, 'SIGKILL')
        }

        // Untrack the process
        // if (chromePid) {
        //   chromeTracker.untrackProcess(chromePid)
        // }
      } catch (error) {
        // If graceful shutdown fails, try force kill by PID
        if (chromePid && this.isProcessRunning(chromePid)) {
          try {
            process.kill(chromePid, 'SIGKILL')
            // chromeTracker.untrackProcess(chromePid)
          } catch {
            // Chrome process might already be dead
            // if (chromePid) {
            //   chromeTracker.untrackProcess(chromePid)
            // }
          }
        }
      }
      this.chrome = null
    }
  }

  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0) // Signal 0 tests if process exists
      return true
    } catch {
      return false
    }
  }
}

// Main execution logic
async function main(): Promise<void> {
  console.log('Worker main function started')
  const worker = new LighthouseWorker()
  console.log('Worker instance created')

  // Handle graceful shutdown with cleanup
  const gracefulShutdown = async (signal: string) => {
    process.stderr.write(`Worker received ${signal}, cleaning up...\n`)
    try {
      await worker.cleanup()
    } catch (error) {
      process.stderr.write(`Error during cleanup: ${error}\n`)
    }
    process.exit(1)
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('uncaughtException', async (error) => {
    process.stderr.write(`Uncaught exception: ${error}\n`)
    await gracefulShutdown('uncaughtException')
  })
  process.on('unhandledRejection', async (error) => {
    process.stderr.write(`Unhandled rejection: ${error}\n`)
    await gracefulShutdown('unhandledRejection')
  })

  // Ensure cleanup on normal process exit
  process.on('exit', () => {
    // Note: In 'exit' handler we can only do synchronous cleanup
    // The async cleanup should have been called before this point
    if (worker['chrome']) {
      try {
        if (worker['chrome'].pid) {
          process.kill(worker['chrome'].pid, 'SIGKILL')
        }
      } catch {
        // Ignore errors in final cleanup
      }
    }
  })

  // Get task and output file from command line arguments
  if (process.argv[2] && process.argv[3]) {
    try {
      console.log('Parsing task arguments')
      const task: WorkerTask = JSON.parse(process.argv[2])
      console.log('Task parsed:', JSON.stringify(task, null, 2))
      const outputFile = process.argv[3]
      console.log('Starting worker execution')
      const result = await worker.execute(task)
      console.log('Worker execution completed')

      // Write result to file instead of stdout to handle large payloads
      fs.writeFileSync(outputFile, JSON.stringify(result))

      // Signal success/failure via exit code and minimal stdout message
      process.stdout.write(`{"resultFile":"${outputFile}","success":${result.success}}`)
      process.exit(result.success ? 0 : 1)
    } catch (error) {
      const errorResult = {
        success: false,
        error: `Failed to parse task: ${error instanceof Error ? error.message : String(error)}`,
      }
      process.stdout.write(JSON.stringify(errorResult))
      process.exit(1)
    }
  } else {
    const errorResult = {
      success: false,
      error: 'Task and output file path required. Usage: lighthouse-worker.js <task-json> <output-file>',
    }
    process.stdout.write(JSON.stringify(errorResult))
    process.exit(1)
  }
}

// Only run if this file is executed directly (ESM compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const errorResult = {
      success: false,
      error: `Worker failed: ${error instanceof Error ? error.message : String(error)}`,
    }
    process.stdout.write(JSON.stringify(errorResult))
    process.exit(1)
  })
}

export { LighthouseWorker, type WorkerTask, type WorkerResult }
