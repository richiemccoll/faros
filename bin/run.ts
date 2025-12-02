#!/usr/bin/env node

/* eslint-disable no-console */

import { config } from 'dotenv'
import { runCli } from '../src/cli/cli'

config()

runCli().catch((error) => {
  console.error('CLI Error:', error)
  process.exit(1)
})
