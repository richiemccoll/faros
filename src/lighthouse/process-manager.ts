import { spawn, type ChildProcess } from 'child_process'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { Task, LighthouseResult } from '../core/types/execution'
import { logger } from '../logger'
import { killAllChromeProcesses, killAllChromeProcessesSync } from './chrome-tracker'

// Get __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface ProcessConfig {
  maxConcurrency: number
  processTimeout: number
  workerScript?: string
  logLevel?: 'silent' | 'error' | 'info' | 'verbose'
}

interface ProcessInfo {
  process: ChildProcess
  task: Task
  startTime: number
  promise: Promise<LighthouseResult>
  resolve: (result: LighthouseResult) => void
  reject: (error: Error) => void
}

/**
 * ProcessManager - Manages child processes for Lighthouse execution
 *
 * Provides true concurrency by spawning separate Node.js processes
 * for each Lighthouse task, avoiding shared state issues.
 */
export class ProcessManager {
  private config: ProcessConfig
  private activeProcesses = new Map<string, ProcessInfo>()
  private workerScriptPath: string

  constructor(config: ProcessConfig) {
    this.config = config
    this.workerScriptPath = config.workerScript || path.resolve(__dirname, './worker.ts')
    this.setupCleanupHandlers()
  }

  /**
   * Execute a task in a child process
   */
  async execute(task: Task): Promise<LighthouseResult> {
    // Wait if we're at max concurrency
    await this.waitForSlot()

    return new Promise<LighthouseResult>((resolve, reject) => {
      const processInfo: Partial<ProcessInfo> = {
        task,
        startTime: Date.now(),
        resolve,
        reject,
      }

      // Build worker task
      const workerTask = {
        id: task.id,
        target: task.target,
        profile: task.profile,
        config: {
          logLevel: this.config.logLevel || 'error',
          headless: true,
          chromeFlags: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
      }

      // Create temporary file for result output
      const outputFile = path.join(os.tmpdir(), `lighthouse-result-${task.id}-${Date.now()}.json`)

      logger.debug(`Spawning worker process for task ${task.id}`)

      // Spawn child process with worker task and output file as arguments using tsx
      const childProcess = spawn('npx', ['tsx', this.workerScriptPath, JSON.stringify(workerTask), outputFile], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' },
        cwd: process.cwd(),
      })

      processInfo.process = childProcess
      processInfo.promise = new Promise<LighthouseResult>((res, rej) => {
        processInfo.resolve = res
        processInfo.reject = rej
      })

      this.activeProcesses.set(task.id, processInfo as ProcessInfo)

      // Handle process communication
      let stdoutOutput = ''
      let errorOutput = ''

      childProcess.stdout?.on('data', (data) => {
        stdoutOutput += data.toString()
      })

      childProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString()
      })

      childProcess.on('close', (code) => {
        this.activeProcesses.delete(task.id)
        logger.debug(`Worker process for task ${task.id} exited with code ${code}`)

        // Clean up function
        const cleanup = () => {
          try {
            if (fs.existsSync(outputFile)) {
              fs.unlinkSync(outputFile)
            }
          } catch (cleanupError) {
            logger.warn(`Failed to cleanup temp file ${outputFile}:`, cleanupError)
          }
        }

        if (code === 0) {
          try {
            // Parse the minimal stdout response first
            let stdoutResult
            try {
              stdoutResult = JSON.parse(stdoutOutput.trim())
            } catch (stdoutParseError) {
              throw new Error(`Failed to parse stdout response: ${stdoutParseError}`)
            }

            if (!stdoutResult.success) {
              throw new Error(stdoutResult.error || 'Worker reported failure')
            }

            // Read the result from the output file
            if (!fs.existsSync(outputFile)) {
              throw new Error(`Result file not found: ${outputFile}`)
            }

            const resultContent = fs.readFileSync(outputFile, 'utf8')
            const workerResult = JSON.parse(resultContent)

            if (workerResult.success && workerResult.result) {
              // Convert worker result to LighthouseResult format
              const lighthouseResult: LighthouseResult = {
                taskId: task.id,
                target: task.target,
                profile: task.profile,
                metrics: {}, // Will be populated by metric extractor in Runner
                duration: workerResult.metadata.duration,
                timestamp: new Date(),
                raw: workerResult.result.lhr,
              }
              cleanup()
              resolve(lighthouseResult)
            } else {
              cleanup()
              reject(new Error(workerResult.error || 'Lighthouse execution failed'))
            }
          } catch (parseError) {
            cleanup()
            reject(new Error(`Failed to parse worker result: ${parseError}`))
          }
        } else {
          cleanup()
          reject(new Error(`Worker process exited with code ${code}: ${errorOutput || 'Unknown error'}`))
        }
      })

      childProcess.on('error', (error) => {
        this.activeProcesses.delete(task.id)
        logger.error(`Failed to spawn worker process for task ${task.id}:`, error)

        // Clean up temp file
        try {
          if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile)
          }
        } catch (cleanupError) {
          logger.warn(`Failed to cleanup temp file ${outputFile}:`, cleanupError)
        }

        reject(new Error(`Failed to spawn worker process: ${error.message}`))
      })

      // Set timeout
      const timeout = setTimeout(() => {
        logger.warn(`Task ${task.id} timed out after ${this.config.processTimeout}ms`)
        childProcess.kill('SIGTERM')
        this.activeProcesses.delete(task.id)

        // Clean up temp file
        try {
          if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile)
          }
        } catch (cleanupError) {
          logger.warn(`Failed to cleanup temp file ${outputFile}:`, cleanupError)
        }

        reject(new Error(`Task ${task.id} timed out after ${this.config.processTimeout}ms`))
      }, this.config.processTimeout)

      childProcess.on('close', () => {
        clearTimeout(timeout)
      })
    })
  }

  /**
   * Wait for an available process slot
   */
  private async waitForSlot(): Promise<void> {
    while (this.activeProcesses.size >= this.config.maxConcurrency) {
      // Wait for any process to complete
      const promises = Array.from(this.activeProcesses.values()).map((p) => p.promise)
      await Promise.race(promises.map((p) => p.catch(() => undefined)))
    }
  }

  /**
   * Get current active process count
   */
  getActiveCount(): number {
    return this.activeProcesses.size
  }

  /**
   * Kill all active processes
   */
  async killAll(): Promise<void> {
    const killPromises = Array.from(this.activeProcesses.values()).map(async (processInfo) => {
      return new Promise<void>((resolve) => {
        processInfo.process.on('close', () => resolve())
        processInfo.process.kill('SIGTERM')

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!processInfo.process.killed) {
            processInfo.process.kill('SIGKILL')
          }
          resolve()
        }, 5000)
      })
    })

    await Promise.all(killPromises)
    this.activeProcesses.clear()
  }

  /**
   * Get process manager statistics
   */
  getStats() {
    return {
      activeProcesses: this.activeProcesses.size,
      maxConcurrency: this.config.maxConcurrency,
      processTimeout: this.config.processTimeout,
      workerScript: this.workerScriptPath,
    }
  }

  /**
   * Setup cleanup handlers to kill Chrome processes on exit
   */
  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      try {
        await this.killAll()
        await killAllChromeProcesses()
      } catch (error) {
        logger.warn('Error during ProcessManager cleanup:', error)
      }
    }

    // Don't add multiple handlers
    if (!process.listenerCount('exit')) {
      process.on('exit', () => {
        // Synchronous cleanup only
        try {
          const pids = Array.from(this.activeProcesses.values())
            .map((p) => p.process.pid)
            .filter(Boolean)
          pids.forEach((pid) => {
            try {
              if (pid) process.kill(pid, 'SIGKILL')
            } catch {
              // Ignore errors
            }
          })

          // Also kill Chrome processes synchronously
          killAllChromeProcessesSync()
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
}

/**
 * Factory function to create ProcessManager with default config
 */
export function createProcessManager(overrides: Partial<ProcessConfig> = {}): ProcessManager {
  const defaultConfig: ProcessConfig = {
    maxConcurrency: Math.min(3, os.cpus().length), // Default to 3 or CPU count
    processTimeout: 60000, // 1 minute per task
    logLevel: 'error',
  }

  return new ProcessManager({ ...defaultConfig, ...overrides })
}
