#!/usr/bin/env node

/**
 * Lighthouse Worker - Child process script for isolated Lighthouse execution
 *
 * This script runs in a separate Node.js process to execute Lighthouse audits
 * with complete isolation from the main process.
 */

import lighthouse, { type Result } from 'lighthouse'
import { launch, type LaunchedChrome } from 'chrome-launcher'
import type { Target, ProfileRef } from '../core/types'
import { ProfileRegistry } from './profile-registry'

interface WorkerTask {
  id: string
  target: Target
  profile: ProfileRef
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

  async execute(task: WorkerTask): Promise<WorkerResult> {
    const startTime = Date.now()

    try {
      // Launch Chrome
      this.chrome = await launch({
        chromeFlags: task.config?.chromeFlags || ['--no-sandbox', '--disable-dev-shm-usage'],
        logLevel: task.config?.logLevel || 'error',
        ...(task.config?.headless !== false && {
          chromeFlags: ['--headless', ...(task.config?.chromeFlags || [])],
        }),
      })

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
          artifacts: runnerResult.artifacts as Record<string, unknown>,
        },
        metadata: {
          duration,
          peakMemory: memoryUsage.heapUsed,
          chromeVersion: this.chrome.version,
          lighthouseVersion: lighthouse.version || 'unknown',
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
          lighthouseVersion: lighthouse.version || 'unknown',
        },
      }
    } finally {
      await this.cleanup()
    }
  }

  private async cleanup(): Promise<void> {
    if (this.chrome) {
      try {
        await this.chrome.kill()
      } catch (error) {
        // Chrome might already be closed
      }
      this.chrome = null
    }
  }
}

// IPC Protocol - Listen for tasks from parent process
async function main() {
  const worker = new LighthouseWorker()

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    await worker.cleanup?.()
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    await worker.cleanup?.()
    process.exit(0)
  })

  // Read task from stdin or process arguments
  if (process.argv[2]) {
    // Task passed as command line argument
    try {
      const task: WorkerTask = JSON.parse(process.argv[2])
      const result = await worker.execute(task)

      // Output result to stdout
      console.log(JSON.stringify(result))
      process.exit(result.success ? 0 : 1)
    } catch (error) {
      console.error(
        JSON.stringify({
          success: false,
          error: `Failed to parse task: ${error instanceof Error ? error.message : String(error)}`,
        }),
      )
      process.exit(1)
    }
  } else {
    console.error('No task provided. Usage: lighthouse-worker.js <task-json>')
    process.exit(1)
  }
}

// Only run if this file is executed directly
if (process.argv[1]?.includes('lighthouse-worker')) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        success: false,
        error: `Worker failed: ${error instanceof Error ? error.message : String(error)}`,
      }),
    )
    process.exit(1)
  })
}

export { LighthouseWorker, type WorkerTask, type WorkerResult }
