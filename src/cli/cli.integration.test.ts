import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const testDir = join(__dirname, '../../tmp/cli-tests')
const cliPath = join(__dirname, '../../dist/run.js')

describe('faros CLI Integration Tests', () => {
  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should show help when no command is provided', async () => {
    try {
      await execFileAsync('node', [cliPath], { cwd: testDir })
    } catch (error: unknown) {
      const execError = error as { code: number; stderr: string }
      expect(execError.code).toBe(1)
      expect(execError.stderr).toContain('You need to specify a command')
    }
  })

  it('should show help with --help flag', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, '--help'], {
      cwd: testDir,
    })

    expect(stdout).toContain('faros <command> [options]')
    expect(stdout).toContain('print-config')
    expect(stdout).toContain('Show the resolved and validated configuration')
  })

  it('should show version with --version flag', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, '--version'], {
      cwd: testDir,
    })

    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  describe('print-config command', () => {
    it('should output valid config in JSON format', async () => {
      const config = {
        targets: [
          {
            id: 'test-site',
            url: 'https://example.com',
            tags: [],
          },
        ],
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(config, null, 2))

      const { stdout, stderr } = await execFileAsync('node', [cliPath, 'print-config'], { cwd: testDir })

      // Parse the JSON output (success message is in stderr)
      const outputConfig = JSON.parse(stdout.trim())

      expect(outputConfig.targets).toHaveLength(1)
      expect(outputConfig.targets[0].id).toBe('test-site')
      expect(outputConfig.targets[0].url).toBe('https://example.com')

      // Check that defaults were applied
      expect(outputConfig.concurrency).toBe(1)
      expect(outputConfig.maxRetries).toBe(2)

      // Check success message
      expect(stderr).toContain('✅ Configuration is valid')
    })

    it('should load config from custom path', async () => {
      const config = {
        targets: [
          {
            id: 'custom-config',
            url: 'https://custom.example.com',
            tags: [],
          },
        ],
        concurrency: 5,
      }

      const customConfigPath = join(testDir, 'custom.perf.json')
      await writeFile(customConfigPath, JSON.stringify(config, null, 2))

      const { stdout } = await execFileAsync('node', [cliPath, 'print-config', '--config', 'custom.perf.json'], {
        cwd: testDir,
      })

      const outputConfig = JSON.parse(stdout.trim())

      expect(outputConfig.targets[0].id).toBe('custom-config')
      expect(outputConfig.concurrency).toBe(5)
    })

    it('should handle missing config file gracefully', async () => {
      const { stdout, stderr } = await execFileAsync('node', [cliPath, 'print-config'], { cwd: testDir })

      // Should use default config
      const outputConfig = JSON.parse(stdout.trim())
      expect(outputConfig.targets).toHaveLength(1)
      expect(outputConfig.targets[0].id).toBe('homepage')
      expect(stderr).toContain('✅ Configuration is valid')
    })

    it('should exit with error code 1 for invalid config', async () => {
      const invalidConfig = {
        targets: [], // Invalid: empty array
        concurrency: -1, // Invalid: negative number
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(invalidConfig, null, 2))

      try {
        await execFileAsync('node', [cliPath, 'print-config'], { cwd: testDir })
        throw new Error('Should have failed')
      } catch (error: unknown) {
        const execError = error as { code: number; stderr: string }
        expect(execError.code).toBe(1)
        expect(execError.stderr).toContain('❌ Configuration validation failed:')
        expect(execError.stderr).toContain('At least one target is required')
        expect(execError.stderr).toContain('Too small')
      }
    })

    it('should exit with error code 1 for malformed JSON', async () => {
      await writeFile(join(testDir, 'perf.config.json'), '{ invalid json }')

      try {
        await execFileAsync('node', [cliPath, 'print-config'], { cwd: testDir })
        throw new Error('Should have failed')
      } catch (error: unknown) {
        const execError = error as { code: number; stderr: string }
        expect(execError.code).toBe(1)
        expect(execError.stderr).toContain('❌ Failed to load configuration:')
      }
    })

    it('should suppress success message with --quiet flag', async () => {
      const config = {
        targets: [
          {
            id: 'quiet-test',
            url: 'https://quiet.example.com',
            tags: [],
          },
        ],
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(config, null, 2))

      const { stdout, stderr } = await execFileAsync('node', [cliPath, 'print-config', '--quiet'], { cwd: testDir })

      const outputConfig = JSON.parse(stdout)
      expect(outputConfig.targets[0].id).toBe('quiet-test')
      expect(stderr).not.toContain('✅ Configuration is valid')
    })

    it('should apply environment variables', async () => {
      const config = {
        targets: [
          {
            id: 'env-test',
            url: 'https://env.example.com',
            tags: [],
          },
        ],
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(config, null, 2))

      const { stdout } = await execFileAsync('node', [cliPath, 'print-config'], {
        cwd: testDir,
        env: {
          ...process.env,
          PERF_CONCURRENCY: '8',
          PERF_TIMEOUT: '45000',
        },
      })

      const outputConfig = JSON.parse(stdout.trim())
      expect(outputConfig.concurrency).toBe(8)
      expect(outputConfig.timeout).toBe(45000)
    })
  })
})
