import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 2222,
    host: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:2221',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
