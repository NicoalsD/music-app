/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview === true ? '/music-app/' : '/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Split stable vendor code into cacheable chunks.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (/node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//.test(id))
            return 'motion';
          if (/node_modules\/(@radix-ui|@floating-ui|@dnd-kit|sonner)\//.test(id))
            return 'ui-vendor';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    passWithNoTests: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/**/test-utils/**',
        'src/main.tsx',
        'src/ui/kit/**',
        'src/**/*.d.ts',
        'src/providers/musicMetadataAdapter.ts',
        'src/auth/createSpotifyAuth.ts',
        'src/player/loadSpotifySdk.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        'src/core/**': { lines: 95, branches: 95, functions: 95 },
        'src/player/**': { lines: 95, branches: 95, functions: 95 },
      },
    },
  },
}));
