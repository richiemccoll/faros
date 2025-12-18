import lighthouse from 'lighthouse'
import fs from 'node:fs/promises'
import CDP from 'chrome-remote-interface'
import { CDPCookie } from '../core/utils/merge-auth-config'

async function setCookiesViaCDP(port: number, cookies: Array<CDPCookie>) {
  try {
    const client = await CDP({ port })
    const { Network } = client

    await Network.enable()

    for (const cookie of cookies) {
      await Network.setCookie({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure !== false,
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite,
        expires: cookie.expires,
      })
    }

    await client.close()
  } catch (error) {
    console.error('[lighthouse-worker] Failed to set cookies:', error)
    // Don't fail the entire run if cookies can't be set - just log the error
  }
}

async function main() {
  try {
    const resultFile = process.argv[2]
    if (!resultFile) {
      throw new Error('Result file path (argv[2]) is required')
    }

    const targetUrl = process.env.LH_TARGET_URL
    const flagsJson = process.env.LH_FLAGS
    const configJson = process.env.LH_CONFIG
    const authCookiesJson = process.env.LH_AUTH_COOKIES

    if (!targetUrl) {
      throw new Error('LH_TARGET_URL env var is required')
    }

    const flags = flagsJson ? JSON.parse(flagsJson) : {}
    const lighthouseConfig = configJson ? JSON.parse(configJson) : {}
    const authCookies = authCookiesJson ? JSON.parse(authCookiesJson) : []

    // Set cookies before running Lighthouse if auth cookies are provided
    if (authCookies.length > 0 && flags.port) {
      await setCookiesViaCDP(flags.port, authCookies)
    }

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
