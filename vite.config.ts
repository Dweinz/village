import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // *.test.ts: headless simulation, plain Node (ADR 0001). *.test.tsx: the rendered App, in jsdom.
    projects: [
      { extends: true, test: { name: 'sim', include: ['src/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'app', include: ['src/**/*.test.tsx'], environment: 'jsdom', setupFiles: ['src/test/app-setup.tsx'] } },
    ],
  },
})
