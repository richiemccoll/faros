/**
 * Chrome Process Tracker - Global utility to track and cleanup Chrome instances
 *
 * This utility ensures all Chrome processes launched by Lighthouse workers
 * are properly tracked and cleaned up, even in concurrent scenarios.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { logger } from '../logger'

export interface ChromeInstance {
  pid: number
  workerId: string
  port: number
  userDataDir: string
  startTime: number
}

class ChromeTracker {
  private static instance: ChromeTracker
  private trackedProcesses = new Map<number, ChromeInstance>()
  private trackingFile: string

  constructor() {
    this.trackingFile = path.join(os.tmpdir(), 'faros-chrome-tracker.json')
    this.loadTrackedProcesses()
    this.setupCleanupHandlers()
  }

  static getInstance(): ChromeTracker {
    if (!ChromeTracker.instance) {
      ChromeTracker.instance = new ChromeTracker()
    }
    return ChromeTracker.instance
  }

  /**
   * Register a Chrome process for tracking
   */
  trackProcess(chrome: { pid: number; port: number }, workerId: string, userDataDir: string): void {
    if (!chrome.pid) return

    const instance: ChromeInstance = {
      pid: chrome.pid,
      workerId,
      port: chrome.port,
      userDataDir,
      startTime: Date.now(),
    }

    this.trackedProcesses.set(chrome.pid, instance)
    this.saveTrackedProcesses()

    logger.debug(`Tracking Chrome process ${chrome.pid} for worker ${workerId}`)
  }

  /**
   * Unregister a Chrome process from tracking
   */
  untrackProcess(pid: number): void {
    if (this.trackedProcesses.has(pid)) {
      this.trackedProcesses.delete(pid)
      this.saveTrackedProcesses()
      logger.debug(`Stopped tracking Chrome process ${pid}`)
    }
  }

  /**
   * Kill a specific Chrome process
   */
  async killProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<boolean> {
    try {
      if (!this.isProcessRunning(pid)) {
        this.untrackProcess(pid)
        return true
      }

      process.kill(pid, signal)

      // Wait a bit and check if it's dead
      await new Promise((resolve) => setTimeout(resolve, 500))

      if (this.isProcessRunning(pid) && signal === 'SIGTERM') {
        // Try SIGKILL if SIGTERM didn't work
        return this.killProcess(pid, 'SIGKILL')
      }

      this.untrackProcess(pid)
      return !this.isProcessRunning(pid)
    } catch (error) {
      // Process might already be dead
      this.untrackProcess(pid)
      return true
    }
  }

  /**
   * Kill all tracked Chrome processes
   */
  async killAllTrackedProcesses(): Promise<void> {
    const pids = Array.from(this.trackedProcesses.keys())

    if (pids.length === 0) {
      return
    }

    logger.info(`Killing ${pids.length} tracked Chrome processes`)

    const killPromises = pids.map(async (pid) => {
      const instance = this.trackedProcesses.get(pid)
      if (instance) {
        logger.debug(`Killing Chrome process ${pid} (worker: ${instance.workerId})`)
        return this.killProcess(pid)
      }
    })

    await Promise.all(killPromises)

    // Clear the tracking file
    this.trackedProcesses.clear()
    this.saveTrackedProcesses()
  }

  /**
   * Kill all Chrome processes on the system (nuclear option)
   */
  async killAllChromeProcesses(): Promise<void> {
    try {
      // First try tracked processes
      await this.killAllTrackedProcesses()

      // Then use system commands to kill any remaining Chrome processes
      const { spawn } = await import('child_process')

      // Kill all Chrome processes
      const killChrome = spawn('killall', ['-KILL', 'Google Chrome'], { stdio: 'ignore' })
      await new Promise((resolve) => {
        killChrome.on('close', resolve)
        setTimeout(resolve, 2000) // Timeout after 2 seconds
      })

      logger.info('Completed system-wide Chrome process cleanup')
    } catch (error) {
      logger.warn('Error during Chrome process cleanup:', error)
    }
  }

  /**
   * Clean up stale processes (processes that have been running too long)
   */
  async cleanupStaleProcesses(maxAgeMs: number = 300000): Promise<void> {
    // 5 minutes default
    const now = Date.now()
    const staleProcesses: number[] = []

    this.trackedProcesses.forEach((instance, pid) => {
      const age = now - instance.startTime
      if (age > maxAgeMs) {
        staleProcesses.push(pid)
      }
    })

    if (staleProcesses.length > 0) {
      logger.warn(`Found ${staleProcesses.length} stale Chrome processes, cleaning up...`)
      await Promise.all(staleProcesses.map((pid) => this.killProcess(pid)))
    }
  }

  /**
   * Get current tracked processes
   */
  getTrackedProcesses(): ChromeInstance[] {
    return Array.from(this.trackedProcesses.values())
  }

  /**
   * Check if a process is running
   */
  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0) // Signal 0 tests if process exists
      return true
    } catch {
      return false
    }
  }

  /**
   * Load tracked processes from file
   */
  private loadTrackedProcesses(): void {
    try {
      if (fs.existsSync(this.trackingFile)) {
        const data = fs.readFileSync(this.trackingFile, 'utf8')
        const processes = JSON.parse(data) as ChromeInstance[]

        // Only load processes that are still running
        for (const instance of processes) {
          if (this.isProcessRunning(instance.pid)) {
            this.trackedProcesses.set(instance.pid, instance)
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to load tracked Chrome processes:', error)
    }
  }

  /**
   * Save tracked processes to file
   */
  private saveTrackedProcesses(): void {
    try {
      const processes = Array.from(this.trackedProcesses.values())
      fs.writeFileSync(this.trackingFile, JSON.stringify(processes, null, 2))
    } catch (error) {
      logger.warn('Failed to save tracked Chrome processes:', error)
    }
  }

  /**
   * Setup cleanup handlers for various exit scenarios
   */
  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      await this.killAllTrackedProcesses()
    }

    // Handle various exit scenarios
    process.on('exit', () => {
      // Synchronous cleanup only in exit handler
      try {
        const pids = Array.from(this.trackedProcesses.keys())
        pids.forEach((pid) => {
          try {
            process.kill(pid, 'SIGKILL')
          } catch {
            // Ignore errors
          }
        })

        // Clean up tracking file
        if (fs.existsSync(this.trackingFile)) {
          fs.unlinkSync(this.trackingFile)
        }
      } catch {
        // Ignore errors in exit handler
      }
    })

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('uncaughtException', cleanup)
    process.on('unhandledRejection', cleanup)
  }
}

// Export singleton instance
export const chromeTracker = ChromeTracker.getInstance()

// Export utility functions
export async function killAllChromeProcesses(): Promise<void> {
  return chromeTracker.killAllChromeProcesses()
}

export async function cleanupStaleProcesses(): Promise<void> {
  return chromeTracker.cleanupStaleProcesses()
}

/**
 * Synchronously kill all tracked Chrome processes (for use in exit handlers)
 */
export function killAllChromeProcessesSync(): void {
  try {
    const pids = Array.from(chromeTracker.getTrackedProcesses().map((p) => p.pid))
    pids.forEach((pid) => {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Ignore errors
      }
    })
  } catch {
    // Ignore errors in sync cleanup
  }
}
