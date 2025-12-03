import lighthouse from 'lighthouse'
import fs from 'node:fs/promises'

async function main() {
  try {
    const resultFile = process.argv[2]
    if (!resultFile) {
      throw new Error('Result file path (argv[2]) is required')
    }

    const targetUrl = process.env.LH_TARGET_URL
    const flagsJson = process.env.LH_FLAGS
    const configJson = process.env.LH_CONFIG

    if (!targetUrl) {
      throw new Error('LH_TARGET_URL env var is required')
    }

    const flags = flagsJson ? JSON.parse(flagsJson) : {}
    const lighthouseConfig = configJson ? JSON.parse(configJson) : {}

    const runnerResult = await lighthouse(targetUrl, flags, lighthouseConfig)

    if (!runnerResult) {
      throw new Error('Lighthouse returned null result')
    }

    const payload = {
      lhr: runnerResult.lhr,
      report: runnerResult.report,
      artifacts: runnerResult.artifacts,
    }

    await fs.writeFile(resultFile, JSON.stringify(payload), 'utf8')
    process.exit(0)
  } catch (err) {
    console.error('[lighthouse-worker] Error:', err)
    process.exit(1)
  }
}

void main()
