import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 2222,
    proxy: {
      '/api': {
        target: 'http://172.26.246.87:2221',
        changeOrigin: true,
      },
    },
  },
})
