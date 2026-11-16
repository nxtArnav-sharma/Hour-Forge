import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main')
    }
  },
  build: {
    target: 'node22',
    outDir: 'dist/main',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: [
        /^node:/,
        'electron',
        'path',
        'fs',
        'fs/promises',
        'os',
        'child_process',
        'events',
        'http',
        'https',
        'net',
        'crypto',
        'stream',
        'ws'
      ]
    }
  }
});

