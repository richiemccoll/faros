import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['bin/run.ts'],
  format: ['esm'],
  splitting: false,
  sourcemap: false,
  clean: true,
  target: 'node18',
})
