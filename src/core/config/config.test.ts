import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { loadConfig } from '.'
import { ConfigLoadError } from './errors'

const testDir = join(__dirname, '../../tmp/config-tests')

describe('Config loader', () => {
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

  describe('loadConfig', () => {
    it('should load default config when no config file exists', async () => {
      const config = await loadConfig({ cwd: testDir })

      expect(config).toBeDefined()
      expect(config.targets).toHaveLength(1)
      expect(config.targets[0]?.id).toBe('homepage')
      expect(config.concurrency).toBe(1)
    })

    it('should load and validate JSON config file', async () => {
      const configContent = {
        targets: [
          {
            id: 'test-page',
            url: 'https://example.com/test',
            name: 'Test Page',
            tags: ['test'],
          },
        ],
        concurrency: 2,
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent, null, 2))

      const config = await loadConfig({ cwd: testDir })

      expect(config.targets).toHaveLength(1)
      expect(config.targets[0]?.id).toBe('test-page')
      expect(config.concurrency).toBe(2)
    })

    it('should load JS config file', async () => {
      const configContent = `
        module.exports = {
          targets: [{
            id: 'js-test',
            url: 'https://example.com/js',
            tags: []
          }],
          concurrency: 3
        }
      `

      await writeFile(join(testDir, 'perf.config.js'), configContent)

      const config = await loadConfig({ cwd: testDir })

      expect(config.targets[0]?.id).toBe('js-test')
      expect(config.concurrency).toBe(3)
    })

    it('should prefer explicit config path over discovery', async () => {
      // Create default config
      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify({ concurrency: 1 }))

      // Create custom config
      const customConfigPath = join(testDir, 'custom.config.json')
      await writeFile(customConfigPath, JSON.stringify({ concurrency: 5 }))

      const config = await loadConfig({
        cwd: testDir,
        configPath: 'custom.config.json',
      })

      expect(config.concurrency).toBe(5)
    })

    it('should throw ConfigLoadError for invalid JSON', async () => {
      await writeFile(join(testDir, 'perf.config.json'), 'invalid json')

      await expect(loadConfig({ cwd: testDir })).rejects.toThrow(ConfigLoadError)
    })

    it('should apply environment variable overrides', async () => {
      // Set up environment variables
      process.env.PERF_CONCURRENCY = '4'
      process.env.PERF_TIMEOUT = '60000'

      try {
        const config = await loadConfig({ cwd: testDir })

        expect(config.concurrency).toBe(4)
        expect(config.timeout).toBe(60000)
      } finally {
        // Clean up
        delete process.env.PERF_CONCURRENCY
        delete process.env.PERF_TIMEOUT
      }
    })

    it('should apply CLI argument overrides with highest priority', async () => {
      // Create file config
      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify({ concurrency: 2 }))

      // Set env var
      process.env.PERF_CONCURRENCY = '3'

      try {
        const config = await loadConfig({
          cwd: testDir,
          cliArgs: { concurrency: 5 },
        })

        // CLI args should win
        expect(config.concurrency).toBe(5)
      } finally {
        delete process.env.PERF_CONCURRENCY
      }
    })

    it('should handle nested configuration merging', async () => {
      const fileConfig = {
        output: {
          dir: './file-results',
          formats: ['json'],
        },
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(fileConfig))

      const config = await loadConfig({
        cwd: testDir,
        cliArgs: {
          output: {
            formats: ['cli', 'html'],
          },
        },
      })

      expect(config.output?.dir).toBe('./file-results') // From file
      expect(config.output?.formats).toEqual(['cli', 'html']) // From CLI override
    })

    it('should validate final merged configuration', async () => {
      const invalidConfig = {
        targets: [], // Invalid: empty targets array
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(invalidConfig))

      await expect(loadConfig({ cwd: testDir })).rejects.toThrow()
    })
  })
})
