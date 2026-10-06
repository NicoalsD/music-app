/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/music-app/' : '/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: {
    globals: true,
    passWithNoTests: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/test-utils/**', 'src/main.tsx', 'src/**/*.d.ts', 'src/providers/musicMetadataAdapter.ts', 'src/auth/createSpotifyAuth.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        'src/core/**': { lines: 95, branches: 95, functions: 95 },
        'src/player/**': { lines: 95, branches: 95, functions: 95 },
      },
    },
  },
}));
