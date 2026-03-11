import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5000,
        host: '0.0.0.0',
        strictPort: true,
        hmr: { host: 'localhost' },
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        environment: 'jsdom',
        setupFiles: './vitest.setup.ts',
        globals: true,
      },
      build: {
        chunkSizeWarningLimit: 550,
        rollupOptions: {
          output: {
            manualChunks(id) {
              const normalized = id.replace(/\\/g, '/');
              if (!normalized.includes('/node_modules/')) return undefined;

              if (normalized.includes('/react/') || normalized.includes('/react-dom/') || normalized.includes('/scheduler/')) {
                return 'vendor-react';
              }
              if (normalized.includes('/firebase/')) {
                return 'vendor-firebase';
              }
              if (
                normalized.includes('/recharts/') ||
                normalized.includes('/victory-vendor/') ||
                normalized.includes('/d3-')
              ) {
                return 'vendor-charts';
              }
              if (normalized.includes('/three/examples/')) {
                return 'vendor-three-extras';
              }
              if (normalized.includes('/three/')) {
                return 'vendor-three';
              }
              if (normalized.includes('/@pixiv/three-vrm/')) {
                return 'vendor-vrm';
              }
              if (normalized.includes('/@capacitor/')) {
                return 'vendor-capacitor';
              }
              return undefined;
            },
          },
        },
      },
    };
});
