import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Geliştirmede /api istekleri FastAPI'ye proxy'lenir; uygulama kodunda backend adresi yazılmaz (D-038).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
