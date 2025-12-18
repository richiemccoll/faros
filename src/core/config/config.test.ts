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

    it('should accept valid auth configuration on targets', async () => {
      const configContent = {
        targets: [
          {
            id: 'authenticated-page',
            url: 'https://example.com/dashboard',
            name: 'Dashboard',
            auth: {
              headers: {
                Authorization: 'Bearer ${FAROS_AUTH_TOKEN}',
                'X-API-Key': 'test-key',
              },
              cookies: [
                {
                  name: 'session',
                  value: '${FAROS_SESSION_COOKIE}',
                  domain: 'example.com',
                  secure: true,
                },
              ],
            },
          },
        ],
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      const config = await loadConfig({ cwd: testDir })

      expect(config.targets).toHaveLength(1)
      expect(config.targets[0]?.auth?.headers?.Authorization).toBe('Bearer ${FAROS_AUTH_TOKEN}')
      expect(config.targets[0]?.auth?.cookies?.[0]?.name).toBe('session')
    })

    it('should accept valid auth configuration on profiles', async () => {
      const configContent = {
        targets: [{ id: 'test', url: 'https://example.com' }],
        profiles: {
          authenticated: {
            id: 'authenticated',
            name: 'Authenticated Profile',
            auth: {
              headers: {
                Authorization: 'Bearer profile-token',
              },
            },
          },
        },
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      const config = await loadConfig({ cwd: testDir })

      expect(config.profiles?.authenticated?.auth?.headers?.Authorization).toBe('Bearer profile-token')
    })

    it('should reject invalid auth configuration with empty cookie names', async () => {
      const configContent = {
        targets: [
          {
            id: 'test',
            url: 'https://example.com',
            auth: {
              cookies: [
                {
                  name: '', // Invalid: empty name
                  value: 'some-value',
                },
              ],
            },
          },
        ],
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      await expect(loadConfig({ cwd: testDir })).rejects.toThrow()
    })

    it('should reject invalid auth configuration with empty cookie values', async () => {
      const configContent = {
        targets: [
          {
            id: 'test',
            url: 'https://example.com',
            auth: {
              cookies: [
                {
                  name: 'session',
                  value: '', // Invalid: empty value
                },
              ],
            },
          },
        ],
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      await expect(loadConfig({ cwd: testDir })).rejects.toThrow()
    })

    it('should accept auth configuration with environment variable references', async () => {
      const configContent = {
        targets: [
          {
            id: 'test',
            url: 'https://example.com',
            auth: {
              headers: {
                Authorization: 'Bearer ${FAROS_TOKEN}',
              },
              cookies: [
                {
                  name: 'session',
                  value: '${FAROS_SESSION}',
                },
              ],
            },
          },
        ],
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      const config = await loadConfig({ cwd: testDir })

      expect(config.targets[0]?.auth?.headers?.Authorization).toBe('Bearer ${FAROS_TOKEN}')
      expect(config.targets[0]?.auth?.cookies?.[0]?.value).toBe('${FAROS_SESSION}')
    })

    it('should accept both target-level and profile-level auth configurations', async () => {
      const configContent = {
        targets: [
          {
            id: 'test',
            url: 'https://example.com',
            profile: 'authenticated',
            auth: {
              headers: {
                'X-Target-Header': 'target-value',
              },
            },
          },
        ],
        profiles: {
          authenticated: {
            id: 'authenticated',
            auth: {
              headers: {
                Authorization: 'Bearer profile-token',
              },
            },
          },
        },
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      const config = await loadConfig({ cwd: testDir })

      expect(config.targets[0]?.auth?.headers?.['X-Target-Header']).toBe('target-value')
      expect(config.profiles?.authenticated?.auth?.headers?.Authorization).toBe('Bearer profile-token')
    })

    it('should accept valid baseline file configuration', async () => {
      const configContent = {
        targets: [{ id: 'test', url: 'https://example.com' }],
        baseline: {
          file: './baseline.json',
          matchBy: 'id',
          optional: false,
        },
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      const config = await loadConfig({ cwd: testDir })

      expect(config.baseline?.file).toBe('./baseline.json')
      expect(config.baseline?.matchBy).toBe('id')
    })

    it('should accept valid baseline data configuration', async () => {
      const baselineData = {
        version: '1.0.0',
        generatedAt: '2023-01-01T00:00:00Z',
        targets: [
          {
            id: 'test',
            url: 'https://example.com',
            metrics: {
              lcp: 2500,
              cls: 0.1,
              performanceScore: 85,
            },
          },
        ],
      }

      const configContent = {
        targets: [{ id: 'test', url: 'https://example.com' }],
        baseline: {
          data: baselineData,
          matchBy: 'url',
        },
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      const config = await loadConfig({ cwd: testDir })

      expect(config.baseline?.data).toEqual(baselineData)
      expect(config.baseline?.matchBy).toBe('url')
    })

    it('should apply default values for baseline config', async () => {
      const configContent = {
        targets: [{ id: 'test', url: 'https://example.com' }],
        baseline: {
          file: './baseline.json',
        },
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      const config = await loadConfig({ cwd: testDir })

      expect(config.baseline?.matchBy).toBe('id') // default
    })

    it('should reject baseline config with neither file nor data', async () => {
      const configContent = {
        targets: [{ id: 'test', url: 'https://example.com' }],
        baseline: {
          matchBy: 'id',
        },
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      await expect(loadConfig({ cwd: testDir })).rejects.toThrow('Configuration validation failed')
    })

    it('should reject baseline config with invalid matchBy value', async () => {
      const configContent = {
        targets: [{ id: 'test', url: 'https://example.com' }],
        baseline: {
          file: './baseline.json',
          matchBy: 'invalid',
        },
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      await expect(loadConfig({ cwd: testDir })).rejects.toThrow()
    })

    it('should reject baseline data with invalid structure', async () => {
      const invalidBaselineData = {
        version: '1.0.0',
        targets: [
          {
            id: 'test',
            // Missing url
            metrics: {
              lcp: 'invalid-number', // Should be number
            },
          },
        ],
      }

      const configContent = {
        targets: [{ id: 'test', url: 'https://example.com' }],
        baseline: {
          data: invalidBaselineData,
        },
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      await expect(loadConfig({ cwd: testDir })).rejects.toThrow()
    })

    it('should accept baseline config with both file and data (should pass refinement)', async () => {
      const baselineData = {
        version: '1.0.0',
        targets: [
          {
            id: 'test',
            url: 'https://example.com',
            metrics: { lcp: 2500 },
          },
        ],
      }

      const configContent = {
        targets: [{ id: 'test', url: 'https://example.com' }],
        baseline: {
          file: './baseline.json',
          data: baselineData,
        },
      }

      await writeFile(join(testDir, 'perf.config.json'), JSON.stringify(configContent))

      const config = await loadConfig({ cwd: testDir })

      expect(config.baseline?.file).toBe('./baseline.json')
      expect(config.baseline?.data).toEqual(baselineData)
    })
  })
})
