import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as {
  version: string;
};

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The sandbox preview proxies through a host we cannot know up front.
    allowedHosts: true,
    cors: true,
    hmr: {
      clientPort: 443,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('lamejs')) return 'codec';
          return undefined;
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
