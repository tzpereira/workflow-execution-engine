/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The UI imports the engine's JSON Schemas directly (schemas/*.json) rather than
// hand-copying field lists — the @schemas alias points at the repo's canonical
// schema directory, and server.fs.allow lets Vite read it in dev (REQ-UI-01:
// the UI validates against the exact files the Go engine does).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@schemas': fileURLToPath(new URL('../schemas', import.meta.url)),
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
