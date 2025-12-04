import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'bin/run': 'bin/run.ts',
    'src/lighthouse/lighthouse-worker': 'src/lighthouse/lighthouse-worker.ts',
  },
  format: ['esm'],
  splitting: false,
  sourcemap: false,
  clean: true,
  target: 'node18',
})
