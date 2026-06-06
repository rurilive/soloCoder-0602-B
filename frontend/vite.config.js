import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 2222,
    proxy: {
      '/api': {
        target: 'http://localhost:2221',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:2221',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
