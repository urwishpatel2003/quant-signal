import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/yahoo':         'http://localhost:3001',
      '/tradier':       'http://localhost:3001',
      '/bonds':         'http://localhost:3001',
      '/international': 'http://localhost:3001',
      '/calendar':      'http://localhost:3001',
      '/api':           'http://localhost:3001',
    }
  }
})
