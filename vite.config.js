import { execSync } from 'node:child_process'
import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function resolveAppVersion() {
  if (process.env.VITE_COMMIT_SHA) {
    return { sha: process.env.VITE_COMMIT_SHA, ts: new Date().toISOString() }
  }
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim()
    return { sha, ts: new Date().toISOString() }
  } catch {
    return { sha: 'dev', ts: new Date().toISOString() }
  }
}

const APP_VERSION = resolveAppVersion()

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      visualEditAgent: true
    }),
    react(),
  ]
});
