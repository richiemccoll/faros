import { config } from 'dotenv'
import { bgBlue, bold, red } from 'picocolors'

config()

console.log(
  bgBlue(
    `Welcome to ${bold(red('Faros'))} - Performance Testing CLI!
    
    This is a placeholder CLI. The actual CLI commands will be implemented in Phase 6.
    See docs/plan.md for the full implementation roadmap.`,
  ),
)

// TODO: Implement proper CLI commands in Phase 6
process.exit(0)
