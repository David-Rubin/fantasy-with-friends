import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // src/lib/firebase.ts builds a Firebase app at import time and throws
    // without these, so any test importing a module that reaches it would fail
    // to load — which is what happened in CI, where no .env exists. Tests then
    // needed a vi.mock('./firebase') purely to survive the import, a second way
    // of solving a problem that is better solved once, here.
    //
    // These values are never used to reach anything: they only have to be
    // well-formed enough for initializeApp and getAuth. Mocks in tests are for
    // observing behaviour, not for getting a module to load.
    //
    // VITE_USE_EMULATOR is pinned off deliberately. Vite loads .env.local in
    // test mode too, so a developer running the emulator locally would
    // otherwise have their test run try to connect to it, and behave
    // differently from CI. VITE_TAB_SCOPED_AUTH is pinned for the same reason:
    // it changes how the auth instance is built, and a developer testing
    // per-tab logins should not thereby be testing a different app than CI.
    env: {
      VITE_FIREBASE_API_KEY: 'test-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-project.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-project',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-project.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      VITE_FIREBASE_APP_ID: '1:000000000000:web:test',
      VITE_FIREBASE_MEASUREMENT_ID: 'G-TEST',
      VITE_USE_EMULATOR: 'false',
      VITE_TAB_SCOPED_AUTH: 'false',
    },
    // Cloud Function logic is covered here too — the draft rules that decide
    // turn order and completion live server-side and are worth testing directly.
    include: ['src/**/*.test.{ts,tsx}', 'functions/src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
