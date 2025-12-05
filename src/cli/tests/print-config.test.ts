/* eslint-disable no-console */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { runCli } from '../cli'

const TEST_DIR = join(process.cwd(), 'test-configs')

jest.mock('chrome-launcher', () => ({
  launch: jest.fn(),
}))

jest.mock('lighthouse', () => ({
  default: jest.fn(),
}))

jest.mock('../../lighthouse/launcher', () => {
  const mockLauncherMethods = {
    launchChrome: jest.fn(),
    run: jest.fn(),
    kill: jest.fn(),
    cleanup: jest.fn(),
  }

  mockLauncherMethods.launchChrome.mockResolvedValue(undefined as never)
  mockLauncherMethods.kill.mockResolvedValue(undefined as never)
  mockLauncherMethods.cleanup.mockResolvedValue(undefined as never)

  return {
    LighthouseLauncher: jest.fn().mockImplementation(() => mockLauncherMethods),
    createLighthouseLauncher: jest.fn().mockReturnValue(mockLauncherMethods),
    // Export the methods for test access
    __mockLauncherMethods: mockLauncherMethods,
  }
})

// Capture console output for testing
const captureOutput = () => {
  const originalLog = console.log
  const originalError = console.error
  const logs: string[] = []
  const errors: string[] = []

  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '))
  }

  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '))
  }

  return {
    getLogs: () => logs.join('\n'),
    getErrors: () => errors.join('\n'),
    restore: () => {
      console.log = originalLog
      console.error = originalError
    },
  }
}

describe('print-config command', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })

    // Create test config files
    await writeFile(
      join(TEST_DIR, 'perf.config.json'),
      JSON.stringify({
        targets: [
          {
            id: 'homepage',
            url: 'https://example.com',
          },
        ],
      }),
    )

    await writeFile(
      join(TEST_DIR, 'faros.config.custom.json'),
      JSON.stringify({
        targets: [
          {
            id: 'test-site',
            url: 'https://test.example.com',
          },
        ],
      }),
    )

    await writeFile(
      join(TEST_DIR, 'custom.perf.json'),
      JSON.stringify({
        targets: [
          {
            id: 'custom-config',
            url: 'https://custom.example.com',
          },
        ],
        concurrency: 5,
      }),
    )

    // Change to test directory
    process.chdir(TEST_DIR)
  })

  afterEach(async () => {
    // Change back to original directory
    process.chdir(join(TEST_DIR, '..'))
    await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('should print configuration in JSON format', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    const capture = captureOutput()

    try {
      await runCli(['print-config', '--quiet'])

      const output = capture.getLogs()
      const errors = capture.getErrors()

      const outputConfig = JSON.parse(output.trim())

      expect(outputConfig.targets).toHaveLength(1)
      expect(outputConfig.targets[0].id).toBe('homepage')
      expect(outputConfig.targets[0].url).toBe('https://example.com')
      expect(errors).toBe('')
    } finally {
      capture.restore()
      mockExit.mockRestore()
    }
  })

  it('should print custom configuration file', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    const capture = captureOutput()

    try {
      await runCli(['print-config', '--quiet', '--config', 'faros.config.custom.json'])

      const output = capture.getLogs()
      const errors = capture.getErrors()

      const outputConfig = JSON.parse(output.trim())

      expect(outputConfig.targets).toHaveLength(1)
      expect(outputConfig.targets[0].id).toBe('test-site')
      expect(errors).toBe('')
    } finally {
      capture.restore()
      mockExit.mockRestore()
    }
  })

  it('should handle custom performance config', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    const capture = captureOutput()

    try {
      await runCli(['print-config', '--quiet', '--config', 'custom.perf.json'])

      const output = capture.getLogs()
      const outputConfig = JSON.parse(output.trim())

      expect(outputConfig.targets[0].id).toBe('custom-config')
      expect(outputConfig.concurrency).toBe(5)
    } finally {
      capture.restore()
      mockExit.mockRestore()
    }
  })

  it('should use default config when config parameter is undefined', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    const capture = captureOutput()

    try {
      await runCli(['print-config', '--quiet'])

      const output = capture.getLogs()

      const outputConfig = JSON.parse(output.trim())
      expect(outputConfig.targets).toHaveLength(1)
      expect(outputConfig.targets[0].id).toBe('homepage')
    } finally {
      capture.restore()
      mockExit.mockRestore()
    }
  })

  it('should exit with error for invalid config file', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    const capture = captureOutput()

    try {
      await expect(runCli(['print-config', '--config', 'nonexistent-config.json'])).rejects.toThrow(
        'process.exit called',
      )

      const errors = capture.getErrors()
      expect(errors).toContain('❌ Failed to load configuration')
      expect(mockExit).toHaveBeenCalledWith(1)
    } finally {
      capture.restore()
      mockExit.mockRestore()
    }
  })

  it('should exit with error for malformed config file', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    await writeFile(join(TEST_DIR, 'malformed.json'), '{ invalid json }')

    const capture = captureOutput()

    try {
      await expect(runCli(['print-config', '--config', 'malformed.json'])).rejects.toThrow('process.exit called')

      const errors = capture.getErrors()
      expect(errors).toContain('❌ Failed to load configuration')
      expect(mockExit).toHaveBeenCalledWith(1)
    } finally {
      capture.restore()
      mockExit.mockRestore()
    }
  })
})
